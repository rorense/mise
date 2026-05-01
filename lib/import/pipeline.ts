import { excerptHtml, extractJsonLdRecipeHint } from '@/lib/import/jsonLd';
import { extractRecipeFromText } from '@/lib/import/extract';
import {
  extractYoutubeVideoId,
  fetchYoutubeDescription,
} from '@/lib/import/youtube';
import type { AiProvider } from '@/lib/secrets';
import type { Recipe, SourceType } from '@/types/recipe';

export async function importFromUrl(
  url: string,
  provider: AiProvider,
  apiKey: string,
  youtubeApiKey: string | null
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

  const yt = extractYoutubeVideoId(normalized);
  if (yt) {
    if (!youtubeApiKey) {
      throw new Error(
        'Add a YouTube Data API key in Settings to import videos.'
      );
    }
    const { title, description } = await fetchYoutubeDescription(
      yt,
      youtubeApiKey
    );
    const content = `${title}\n\n${description}`;
    return extractRecipeFromText(provider, apiKey, {
      sourceType: 'youtube',
      sourceUrl: normalized,
      content,
    });
  }

  const res = await fetch(normalized);
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
