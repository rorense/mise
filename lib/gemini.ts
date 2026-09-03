import { fetchWithTimeout, LLM_TIMEOUT_MS } from '@/lib/http';
import type { LlmMessage } from '@/lib/llm';

const GEMINI_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

export async function geminiCompletion(
  apiKey: string,
  messages: LlmMessage[],
  options?: { model?: string; temperature?: number }
): Promise<string> {
  const model = options?.model ?? 'gemini-1.5-flash';
  const temperature = options?.temperature ?? 0.4;
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
    .trim();
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const res = await fetchWithTimeout(
    `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(systemText
          ? {
              systemInstruction: {
                parts: [{ text: systemText }],
              },
            }
          : {}),
        contents,
        generationConfig: {
          temperature,
        },
      }),
    },
    LLM_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
    }[];
  };
  const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!content) throw new Error('Gemini returned empty content');
  return content.trim();
}
