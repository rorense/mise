import {
  getAiApiKey,
  getAiEnabled,
  getAiProvider,
  type AiProvider,
} from '@/lib/secrets';

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
    message: `Add your ${
      provider === 'gemini' ? 'Gemini' : 'OpenAI'
    } API key in Settings to use this.`,
  };
}
