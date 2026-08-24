import { fetchWithTimeout, LLM_TIMEOUT_MS } from '@/lib/http';
import { contentToText, type LlmContentPart, type LlmOptions } from '@/lib/llm';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
/**
 * Lets the API retry a declined request on a fallback model rather than
 * handing the cook an error. Drop this header and the `fallbacks` field
 * together if you would rather not depend on a beta flag.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type AnthropicMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
};

type AnthropicBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    };

/**
 * Caller order is preserved. Claude reads an image best when it comes before
 * the text asking about it, but a multi-image turn wants each image introduced
 * by its own short label ("Image 1:", "Image 2:"), and sorting the blocks would
 * detach every label from the image it names. Ordering is the caller's job.
 */
function toBlocks(parts: LlmContentPart[]): AnthropicBlock[] {
  return parts.map((part) =>
    part.type === 'image'
      ? {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: part.mediaType,
            data: part.base64,
          },
        }
      : { type: 'text' as const, text: part.text }
  );
}

export async function anthropicCompletion(
  apiKey: string,
  messages: AnthropicMessage[],
  // `temperature` is taken for parity with the other providers and ignored:
  // current Claude models reject sampling parameters outright (HTTP 400).
  options?: LlmOptions
): Promise<string> {
  const model = options?.model ?? 'claude-opus-5';
  // The system prompt is a top-level field here, not a message role, so it can
  // only ever be text. Dropping an image silently would be worse than saying so.
  for (const message of messages) {
    if (message.role === 'system' && typeof message.content !== 'string') {
      if (message.content.some((part) => part.type === 'image')) {
        throw new Error('Claude cannot take an image in a system message');
      }
    }
  }
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => contentToText(m.content))
    .join('\n\n')
    .trim();
  const turns: {
    role: 'user' | 'assistant';
    content: string | AnthropicBlock[];
  }[] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    // A conversation must open on a user turn, and a chat history trimmed to
    // the last N messages can start mid-exchange.
    if (turns.length === 0 && message.role === 'assistant') continue;
    turns.push({
      role: message.role,
      content:
        typeof message.content === 'string'
          ? message.content
          : toBlocks(message.content),
    });
  }
  if (turns.length === 0) {
    throw new Error('Claude needs at least one user message');
  }

  const res = await fetchWithTimeout(
    ANTHROPIC_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': FALLBACK_BETA,
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        // Adaptive thinking is already the default on Opus 5; naming it keeps
        // reasoning on if `model` is ever pointed at an older Claude.
        thinking: { type: 'adaptive' },
        // Every call here blocks a spinner against a hard deadline, so buy
        // latency back with depth rather than with a smaller model. Chat sits
        // at the default; recipe extraction asks for 'high' explicitly, where
        // a wrong number costs more than a few extra seconds.
        output_config: { effort: options?.effort ?? 'medium' },
        fallbacks: 'default',
        ...(system ? { system } : {}),
        messages: turns,
      }),
    },
    options?.timeoutMs ?? LLM_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude error ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    stop_reason?: string;
  };
  // Replies interleave `thinking` blocks with `text` ones; only text is ours.
  const content = (data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim();
  if (!content) {
    if (data.stop_reason === 'refusal') {
      throw new Error('Claude declined to answer that. Try rewording it.');
    }
    throw new Error('Claude returned empty content');
  }
  return content;
}
