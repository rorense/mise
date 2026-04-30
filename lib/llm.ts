import { geminiCompletion } from '@/lib/gemini';
import { chatCompletion } from '@/lib/openai';
import type { AiProvider } from '@/lib/secrets';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function llmCompletion(
  provider: AiProvider,
  apiKey: string,
  messages: LlmMessage[],
  options?: { model?: string; temperature?: number }
): Promise<string> {
  if (provider === 'gemini') {
    return geminiCompletion(apiKey, messages, options);
  }
  return chatCompletion(apiKey, messages, options);
}
