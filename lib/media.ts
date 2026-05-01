import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

function cookDir(): string {
  const base = FileSystem.documentDirectory ?? '';
  return `${base}cook-photos`;
}

function recipeDir(): string {
  const base = FileSystem.documentDirectory ?? '';
  return `${base}recipe-photos`;
}

export async function ensureCookPhotoDir(): Promise<string> {
  const dir = cookDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function ensureRecipePhotoDir(): Promise<string> {
  const dir = recipeDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function compressAndSaveCookPhoto(
  sourceUri: string,
  destFileName: string
): Promise<string> {
  const dir = await ensureCookPhotoDir();
  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: 1200 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  const dest = `${dir}/${destFileName}.jpg`;
  await FileSystem.copyAsync({ from: manipulated.uri, to: dest });
  return dest;
}

export async function compressAndSaveMainRecipePhoto(
  sourceUri: string,
  destFileName: string
): Promise<string> {
  const dir = await ensureRecipePhotoDir();
  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: 1200 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  const dest = `${dir}/${destFileName}.jpg`;
  await FileSystem.copyAsync({ from: manipulated.uri, to: dest });
  return dest;
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
