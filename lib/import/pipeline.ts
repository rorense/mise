import { fetchWithTimeout, WEB_TIMEOUT_MS } from '@/lib/http';
import { excerptHtml, extractJsonLdRecipeHint } from '@/lib/import/jsonLd';
import { extractRecipeFromText } from '@/lib/import/extract';
import type { AiProvider } from '@/lib/secrets';
import type { Recipe, SourceType } from '@/types/recipe';

export async function importFromUrl(
  url: string,
  provider: AiProvider,
  apiKey: string
): Promise<Omit<Recipe, 'cookLogs'>> {
  const normalized = url.trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error('Please enter a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only http(s) URLs are supported.');
  }

  const res = await fetchWithTimeout(normalized, {}, WEB_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`Could not download page (${res.status})`);
  }
  const html = await res.text();
  const hint = extractJsonLdRecipeHint(html);
  const excerpt = excerptHtml(html, 12000);
  const content = hint
    ? `Structured hint:\nTitle: ${hint.title ?? ''}\nDescription: ${hint.description ?? ''}\n\nPage excerpt:\n${excerpt}`
    : excerpt;
  return extractRecipeFromText(provider, apiKey, {
    sourceType: 'url',
    sourceUrl: normalized,
    content,
  });
}

export async function importFromManualText(
  text: string,
  provider: AiProvider,
  apiKey: string,
  sourceType: SourceType
): Promise<Omit<Recipe, 'cookLogs'>> {
  return extractRecipeFromText(provider, apiKey, {
    sourceType,
    sourceUrl: '',
    content: text,
  });
}
