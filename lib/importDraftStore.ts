import * as FileSystem from 'expo-file-system/legacy';
import type { Recipe } from '@/types/recipe';

type Draft = Omit<Recipe, 'cookLogs'>;

let draft: Draft | null = null;

/**
 * The in-memory draft is the fast path, but a freshly imported recipe is
 * several minutes of the user's time and an API call. Mirroring it to disk
 * means Android reclaiming the app on the preview screen no longer loses it.
 */
function draftFilePath(): string | null {
  const dir = FileSystem.cacheDirectory;
  return dir ? `${dir}import-draft.json` : null;
}

async function writeDraftFile(value: Draft | null): Promise<void> {
  const path = draftFilePath();
  if (!path) return;
  try {
    if (value === null) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } else {
      await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
    }
  } catch {
    // Persistence is best-effort; the in-memory copy still works.
  }
}

export function setImportDraft(recipe: Draft): void {
  draft = recipe;
  void writeDraftFile(recipe);
}

export function takeImportDraft(): Draft | null {
  const d = draft;
  draft = null;
  void writeDraftFile(null);
  return d;
}

/** Recovers a draft written before the process was killed. */
export async function restoreImportDraft(): Promise<Draft | null> {
  if (draft) return draft;
  const path = draftFilePath();
  if (!path) return null;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const parsed = JSON.parse(
      await FileSystem.readAsStringAsync(path)
    ) as Draft;
    if (!parsed || typeof parsed.id !== 'string') return null;
    draft = parsed;
    return parsed;
  } catch {
    return null;
  }
}
