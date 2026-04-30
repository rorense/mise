import { getAiProvider, type AiProvider } from '@/lib/secrets';

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const DEFAULT_PROVIDER =
  process.env.EXPO_PUBLIC_AI_PROVIDER === 'gemini' ? 'gemini' : 'openai';

export async function getActiveAiProvider(): Promise<AiProvider> {
  const persisted = await getAiProvider();
  return persisted ?? DEFAULT_PROVIDER;
}

export function getBundledAiKey(provider: AiProvider): string {
  return provider === 'gemini' ? GEMINI_KEY.trim() : OPENAI_KEY.trim();
}
