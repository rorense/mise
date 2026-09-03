import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * The photo folders under the document directory. `data/backup.ts` walks these
 * too when collecting and restoring photos, so it reads the list from here — a
 * third media kind then only has to be added in one place.
 */
export const MEDIA_DIRS = ['cook-photos', 'recipe-photos'] as const;

export type MediaDir = (typeof MEDIA_DIRS)[number];

async function ensureMediaDir(dir: MediaDir): Promise<string> {
  const base = FileSystem.documentDirectory ?? '';
  const path = `${base}${dir}`;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
  return path;
}

/**
 * Camera and gallery images run several megabytes each and are only ever shown
 * at card or hero size, so everything is resized and re-encoded on the way in
 * rather than storing the original.
 */
async function compressAndSave(
  dir: MediaDir,
  sourceUri: string,
  destFileName: string
): Promise<string> {
  const target = await ensureMediaDir(dir);
  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: 1200 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  const dest = `${target}/${destFileName}.jpg`;
  await FileSystem.copyAsync({ from: manipulated.uri, to: dest });
  return dest;
}

export function compressAndSaveCookPhoto(
  sourceUri: string,
  destFileName: string
): Promise<string> {
  return compressAndSave('cook-photos', sourceUri, destFileName);
}

export function compressAndSaveMainRecipePhoto(
  sourceUri: string,
  destFileName: string
): Promise<string> {
  return compressAndSave('recipe-photos', sourceUri, destFileName);
}

export async function estimateAppStorageBytes(): Promise<number> {
  let total = 0;
  const root = FileSystem.documentDirectory;
  if (!root) return 0;

  async function walk(path: string): Promise<void> {
    let info: FileSystem.FileInfo;
    try {
      info = await FileSystem.getInfoAsync(path);
    } catch {
      return;
    }
    if (!info.exists) return;
    if (info.isDirectory) {
      let list: string[];
      try {
        list = await FileSystem.readDirectoryAsync(path);
      } catch {
        return;
      }
      const prefix = path.endsWith('/') ? path : `${path}/`;
      for (const name of list) {
        await walk(`${prefix}${name}`);
      }
    } else if (info.size != null) {
      total += info.size;
    }
  }

  await walk(root);
  return total;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
