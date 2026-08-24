import { fetchWithTimeout, WEB_TIMEOUT_MS } from '@/lib/http';
import {
  excerptHtml,
  extractJsonLdRecipe,
  formatJsonLdRecipe,
  isUsableJsonLdRecipe,
} from '@/lib/import/jsonLd';
import { extractRecipeFromImages, extractRecipeFromText } from '@/lib/import/extract';
import {
  MAX_SCAN_IMAGES,
  prepareScanImage,
  type ScanImage,
  type ScanPhoto,
} from '@/lib/import/scanImage';
import type { AiProvider } from '@/lib/secrets';
import type { Recipe, SourceType } from '@/types/recipe';

/**
 * How much page text to send alongside a complete structured block. The block
 * already holds the publisher's own ingredient and method lines, so the excerpt
 * is only there to pick up notes, tips and yield wording that schema.org has no
 * field for.
 */
const EXCERPT_WITH_STRUCTURED_DATA = 6_000;

/** With no structured block the page text is all there is, so take much more. */
const EXCERPT_WITHOUT_STRUCTURED_DATA = 20_000;

/**
 * Assembles the text an extraction runs on.
 *
 * Exported so the composition can be tested without a network round trip.
 */
export function buildUrlImportContent(html: string): string {
  const structured = extractJsonLdRecipe(html);
  const complete = isUsableJsonLdRecipe(structured);
  const excerpt = excerptHtml(
    html,
    complete ? EXCERPT_WITH_STRUCTURED_DATA : EXCERPT_WITHOUT_STRUCTURED_DATA
  );
  if (!structured) return excerpt;
  return `${formatJsonLdRecipe(structured)}

PAGE TEXT (supporting context only — use it for notes, tips and anything the block above is missing):
${excerpt}`;
}

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
  return extractRecipeFromText(provider, apiKey, {
    sourceType: 'url',
    sourceUrl: normalized,
    content: buildUrlImportContent(html),
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

export async function importFromImages(
  photos: ScanPhoto[],
  provider: AiProvider,
  apiKey: string
): Promise<Omit<Recipe, 'cookLogs'>> {
  if (photos.length === 0) {
    throw new Error('Add at least one photo.');
  }
  if (photos.length > MAX_SCAN_IMAGES) {
    throw new Error(`Up to ${MAX_SCAN_IMAGES} photos per recipe.`);
  }
  // Resizing is CPU-bound on the JS thread; sequential keeps a four-page scan
  // from locking the UI while every photo decodes at once.
  const images: ScanImage[] = [];
  for (const photo of photos) {
    images.push(
      await prepareScanImage(photo.uri, {
        width: photo.width,
        height: photo.height,
      })
    );
  }
  return extractRecipeFromImages(provider, apiKey, images);
}
