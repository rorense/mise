import { geminiCompletion } from '@/lib/gemini';
import { chatCompletion } from '@/lib/openai';
import type { AiProvider } from '@/lib/secrets';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * Models wrap JSON in a markdown fence despite being told not to. Both callers
 * that ask for JSON — the recipe import extractor and the cook-note adjuster —
 * have to undo it, so it lives beside the call they both make rather than being
 * fixed in one path and silently missed in the other.
 */
export function cleanModelJson(raw: string): string {
  return raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
}

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
