import type { AppearanceMode } from '@/theme/colors';
import * as SecureStore from 'expo-secure-store';

const KEY_OPENAI = 'mise_openai_api_key';
const KEY_YOUTUBE = 'mise_youtube_api_key';
const KEY_APPEARANCE = 'mise_appearance';
const KEY_ONBOARDED = 'mise_onboarded';

export async function getOpenAiApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_OPENAI);
}

export async function setOpenAiApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_OPENAI, key);
}

export async function deleteOpenAiApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_OPENAI);
}

export async function getYoutubeApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_YOUTUBE);
}

export async function setYoutubeApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_YOUTUBE, key);
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
