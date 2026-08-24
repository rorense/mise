import { fetchWithTimeout, LLM_TIMEOUT_MS } from '@/lib/http';
import { contentToText, type LlmContentPart, type LlmOptions } from '@/lib/llm';

const GEMINI_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
};

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function toParts(content: string | LlmContentPart[]): GeminiPart[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((part) =>
    part.type === 'image'
      ? { inlineData: { mimeType: part.mediaType, data: part.base64 } }
      : { text: part.text }
  );
}

export async function geminiCompletion(
  apiKey: string,
  messages: GeminiMessage[],
  options?: LlmOptions
): Promise<string> {
  const model = options?.model ?? 'gemini-1.5-flash';
  const temperature = options?.temperature ?? 0.4;
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => contentToText(m.content))
    .join('\n\n')
    .trim();
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toParts(m.content),
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
    options?.timeoutMs ?? LLM_TIMEOUT_MS
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
