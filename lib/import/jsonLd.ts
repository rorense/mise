const JSON_LD_RE =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function normalizeGraph(node: unknown): unknown[] {
  if (node === null || node === undefined) return [];
  if (Array.isArray(node)) return node.flatMap((n) => normalizeGraph(n));
  if (typeof node === 'object' && node !== null && '@graph' in node) {
    const g = (node as { '@graph'?: unknown })['@graph'];
    return Array.isArray(g) ? g : [];
  }
  return [node];
}

function asRecipe(o: unknown): Record<string, unknown> | null {
  if (!o || typeof o !== 'object') return null;
  const t = (o as { '@type'?: unknown })['@type'];
  const types = Array.isArray(t) ? t : t ? [t] : [];
  if (types.some((x) => x === 'Recipe')) return o as Record<string, unknown>;
  return null;
}

export interface JsonLdRecipeHint {
  title?: string;
  description?: string;
}

export function extractJsonLdRecipeHint(html: string): JsonLdRecipeHint | null {
  let match: RegExpExecArray | null;
  JSON_LD_RE.lastIndex = 0;
  while ((match = JSON_LD_RE.exec(html)) !== null) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw) as unknown;
      const nodes = normalizeGraph(parsed);
      for (const n of nodes) {
        const rec = asRecipe(n);
        if (!rec) continue;
        const name = rec.name;
        const title = typeof name === 'string' ? name : undefined;
        const desc = rec.description;
        const description =
          typeof desc === 'string'
            ? desc
            : desc && typeof desc === 'object' && 'value' in desc
              ? String((desc as { value?: string }).value)
              : undefined;
        return { title, description };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function excerptHtml(html: string, maxChars: number): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= maxChars) return stripped;
  return stripped.slice(0, maxChars);
}
