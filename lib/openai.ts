import { fetchWithTimeout, LLM_TIMEOUT_MS } from '@/lib/http';
import { contentToText, type LlmContentPart, type LlmOptions } from '@/lib/llm';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
};

type OpenAiPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function toParts(parts: LlmContentPart[]): OpenAiPart[] {
  return parts.map((part) =>
    part.type === 'image'
      ? {
          type: 'image_url' as const,
          image_url: { url: `data:${part.mediaType};base64,${part.base64}` },
        }
      : { type: 'text' as const, text: part.text }
  );
}

export async function chatCompletion(
  apiKey: string,
  messages: ChatMessage[],
  options?: LlmOptions
): Promise<string> {
  const model = options?.model ?? 'gpt-4o';
  const temperature = options?.temperature ?? 0.4;
  const body = messages.map((message) => {
    // The system turn takes a plain string; only user turns carry images.
    if (typeof message.content === 'string' || message.role === 'system') {
      return { role: message.role, content: contentToText(message.content) };
    }
    return { role: message.role, content: toParts(message.content) };
  });
  const res = await fetchWithTimeout(
    OPENAI_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: body,
      }),
    },
    options?.timeoutMs ?? LLM_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty content');
  return content.trim();
}
