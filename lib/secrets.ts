import type { AppearanceMode } from '@/theme/colors';
import * as SecureStore from 'expo-secure-store';
export type AiProvider = 'openai' | 'gemini' | 'anthropic';

/**
 * API keys live here — in Android's Keystore-backed SecureStore — and never in
 * the JS bundle. `EXPO_PUBLIC_*` values are inlined as literal strings at build
 * time, so anything read from `process.env` ships inside every APK you produce.
 */
const KEY_AI_API: Record<AiProvider, string> = {
  openai: 'mise_openai_api_key',
  gemini: 'mise_gemini_api_key',
  anthropic: 'mise_anthropic_api_key',
};

const KEY_APPEARANCE = 'mise_appearance';
const KEY_ONBOARDED = 'mise_onboarded';
const KEY_SEEN_STEP_DRAG_HINT = 'mise_seen_step_drag_hint';
const KEY_AI_PROVIDER = 'mise_ai_provider';
const KEY_AI_ENABLED = 'mise_ai_enabled';

export async function getAiApiKey(provider: AiProvider): Promise<string | null> {
  const value = await SecureStore.getItemAsync(KEY_AI_API[provider]);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function setAiApiKey(
  provider: AiProvider,
  key: string
): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await deleteAiApiKey(provider);
    return;
  }
  await SecureStore.setItemAsync(KEY_AI_API[provider], trimmed);
}

export async function deleteAiApiKey(provider: AiProvider): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_AI_API[provider]);
}

/**
 * Master switch for every model call — the recipe chat and cook-note
 * suggestions both read it. Defaults on; with no key stored nothing fires
 * regardless.
 */
export async function getAiEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(KEY_AI_ENABLED);
  return value !== '0';
}

export async function setAiEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_AI_ENABLED, enabled ? '1' : '0');
}

export async function getAppearance(): Promise<AppearanceMode | null> {
  const v = await SecureStore.getItemAsync(KEY_APPEARANCE);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return null;
}

export async function setAppearance(mode: AppearanceMode): Promise<void> {
  await SecureStore.setItemAsync(KEY_APPEARANCE, mode);
}

export async function getOnboarded(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEY_ONBOARDED);
  return v === '1';
}

export async function setOnboarded(done: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_ONBOARDED, done ? '1' : '0');
}

export async function getSeenStepDragHint(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(KEY_SEEN_STEP_DRAG_HINT);
  return value === '1';
}

export async function setSeenStepDragHint(seen: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_SEEN_STEP_DRAG_HINT, seen ? '1' : '0');
}

export async function getAiProvider(): Promise<AiProvider> {
  const value = await SecureStore.getItemAsync(KEY_AI_PROVIDER);
  return value === 'gemini' || value === 'anthropic' ? value : 'openai';
}

export async function setAiProvider(provider: AiProvider): Promise<void> {
  await SecureStore.setItemAsync(KEY_AI_PROVIDER, provider);
}
