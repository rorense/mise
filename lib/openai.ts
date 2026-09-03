import { fetchWithTimeout, LLM_TIMEOUT_MS } from '@/lib/http';
import type { LlmMessage } from '@/lib/llm';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function chatCompletion(
  apiKey: string,
  messages: LlmMessage[],
  options?: { model?: string; temperature?: number }
): Promise<string> {
  const model = options?.model ?? 'gpt-4o';
  const temperature = options?.temperature ?? 0.4;
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
        messages,
      }),
    },
    LLM_TIMEOUT_MS
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
