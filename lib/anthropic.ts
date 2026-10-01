import Anthropic from '@anthropic-ai/sdk';
import { LLM_TIMEOUT_MS } from '@/lib/http';
import type { LlmMessage } from '@/lib/llm';

const DEFAULT_MODEL = 'claude-opus-5-5';

/**
 * Claude thinks before it answers, so a long recipe extraction can take
 * noticeably longer than the other providers. The SDK enforces this itself;
 * it does not go through `fetchWithTimeout`.
 */
const CLAUDE_TIMEOUT_MS = LLM_TIMEOUT_MS * 2;

/**
 * Claude Opus 5.5 rejects sampling parameters, so the callers' `temperature`
 * is ignored here; `effort` is the control instead. Effort is set to `high`
 * because import and cook-note suggestions favour accuracy over speed.
 *
 * Non-streaming on purpose: React Native's fetch cannot read a response body
 * as a stream.
 */
export async function claudeCompletion(
  apiKey: string,
  messages: LlmMessage[],
  options?: { model?: string; temperature?: number }
): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 1 });

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
    .trim();
  const turns: Anthropic.Beta.BetaMessageParam[] = messages
    .filter((m): m is LlmMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  // The chat trims its history to the last 20 messages, which can leave an
  // assistant reply first; Claude requires the conversation to open with the user.
  while (turns.length > 0 && turns[0].role === 'assistant') turns.shift();

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: options?.model ?? DEFAULT_MODEL,
      max_tokens: 16000,
      ...(system ? { system } : {}),
      messages: turns,
      output_config: { effort: 'high' },
      // If a safety classifier declines, the API retries on a suitable
      // fallback model inside the same call instead of returning nothing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('Claude rejected the API key. Check it in Settings.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Claude is rate limiting this key. Try again in a minute.');
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Claude error ${error.status ?? ''}: ${error.message.slice(0, 400)}`);
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined this request.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude ran out of room before finishing. Try a shorter recipe.');
  }
  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  if (!text) throw new Error('Claude returned empty content');
  return text;
}
