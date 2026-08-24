import {
  getAiApiKey,
  getAiEnabled,
  getAiProvider,
  type AiProvider,
} from '@/lib/secrets';

/** One place to spell each provider's name for anything user-facing. */
export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Claude',
};

export async function getActiveAiProvider(): Promise<AiProvider> {
  return getAiProvider();
}

export type AiUnavailableReason = 'disabled' | 'missing-key';

export type AiCredentials =
  | { ok: true; provider: AiProvider; apiKey: string }
  | { ok: false; reason: AiUnavailableReason; provider: AiProvider };

/**
 * Single gate for every model call. Returns credentials only when AI is
 * switched on and a key is stored for the selected provider, so callers never
 * have to re-derive either condition.
 */
export async function getAiCredentials(): Promise<AiCredentials> {
  const provider = await getAiProvider();
  if (!(await getAiEnabled())) {
    return { ok: false, reason: 'disabled', provider };
  }
  const apiKey = await getAiApiKey(provider);
  if (!apiKey) {
    return { ok: false, reason: 'missing-key', provider };
  }
  return { ok: true, provider, apiKey };
}

/**
 * Recipe import is the one place a wrong answer gets saved and cooked from
 * months later, and it is the hardest thing the app asks a model to do — read a
 * whole page, or a photograph of one, and lose nothing. Claude is used for it
 * whenever a key is stored, regardless of which provider drives chat, and the
 * chosen provider is the fallback rather than the default.
 */
export async function getImportAiCredentials(): Promise<AiCredentials> {
  const provider = await getAiProvider();
  if (!(await getAiEnabled())) {
    return { ok: false, reason: 'disabled', provider };
  }
  const anthropicKey = await getAiApiKey('anthropic');
  if (anthropicKey) {
    return { ok: true, provider: 'anthropic', apiKey: anthropicKey };
  }
  const apiKey = await getAiApiKey(provider);
  if (!apiKey) {
    return { ok: false, reason: 'missing-key', provider };
  }
  return { ok: true, provider, apiKey };
}

export function describeAiUnavailable(
  reason: AiUnavailableReason,
  provider: AiProvider
): { title: string; message: string } {
  if (reason === 'disabled') {
    return {
      title: 'AI is off',
      message: 'Turn on AI features in Settings to use this.',
    };
  }
  return {
    title: 'No API key',
    message: `Add your ${AI_PROVIDER_LABEL[provider]} API key in Settings to use this.`,
  };
}
