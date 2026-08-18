import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '@/db/client';
import {
  getAppearance,
  setAppearance,
} from '@/lib/secrets';

/**
 * A photo travelling inside a backup. `path` is relative to the app's document
 * directory (`cook-photos/abc.jpg`) because the absolute prefix differs per
 * install — that prefix is exactly why a JSON-only backup could not move photos
 * between devices.
 */
export type BackupPhoto = {
  path: string;
  data: string;
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  settings: {
    appearance: 'system' | 'light' | 'dark' | null;
    unitsDisplay: 'compact';
  };
  photos?: BackupPhoto[];
  tables: {
    recipes: BackupRow[];
    ingredients: BackupRow[];
    steps: BackupRow[];
    tags: BackupRow[];
    recipe_tags: BackupRow[];
    cook_logs: BackupRow[];
    recipe_adjustments: BackupRow[];
    recipe_versions: BackupRow[];
    queued_ai_actions: BackupRow[];
  };
};

type BackupRow = Record<string, string | number | null>;

/**
 * Every table restore clears. `recipe_adjustments` must stay in this list: if it
 * is omitted, restore deletes the recipes but leaves the adjustment rows that
 * point at them, and SQLite does not re-validate foreign keys on existing rows.
 */
const TABLES = [
  'recipes',
  'ingredients',
  'steps',
  'tags',
  'recipe_tags',
  'cook_logs',
  'recipe_adjustments',
  'recipe_versions',
  'queued_ai_actions',
] as const;

export type BackupSummary = {
  exportedAt: string;
  recipes: number;
  cookLogs: number;
  photos: number;
};

const MEDIA_DIRS = ['cook-photos', 'recipe-photos'] as const;

/** `file:///…/Documents/cook-photos/x.jpg` → `cook-photos/x.jpg`. */
function toRelativeMediaPath(uri: string): string | null {
  for (const dir of MEDIA_DIRS) {
    const marker = `/${dir}/`;
    const at = uri.lastIndexOf(marker);
    if (at >= 0) {
      const name = uri.slice(at + marker.length);
      if (name && !name.includes('/')) return `${dir}/${name}`;
    }
  }
  return null;
}

async function collectPhotos(uris: (string | null)[]): Promise<BackupPhoto[]> {
  const photos: BackupPhoto[] = [];
  const seen = new Set<string>();
  for (const uri of uris) {
    if (!uri) continue;
    const path = toRelativeMediaPath(uri);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory) continue;
      photos.push({
        path,
        data: await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        }),
      });
    } catch {
      // A missing or unreadable file is skipped rather than failing the export.
    }
  }
  return photos;
}

/**
 * Writes backed-up photos into this device's document directory and returns a
 * filename → local URI map, so restored rows can be repointed at the copies
 * that now exist here rather than the paths from the old device.
 */
async function restorePhotos(photos: BackupPhoto[]): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const root = FileSystem.documentDirectory;
  if (!root || photos.length === 0) return byName;

  for (const dir of MEDIA_DIRS) {
    try {
      await FileSystem.makeDirectoryAsync(`${root}${dir}`, { intermediates: true });
    } catch {
      // Already exists.
    }
  }

  for (const photo of photos) {
    const name = photo.path.split('/').pop();
    if (!name) continue;
    const dest = `${root}${photo.path}`;
    try {
      await FileSystem.writeAsStringAsync(dest, photo.data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      byName.set(name, dest);
    } catch {
      // Leave the row pointing at its original path if the write fails.
    }
  }
  return byName;
}

/** Repoints a stored photo URI at this device's copy, when we restored one. */
function localPhotoUri(
  original: string | number | null,
  byName: Map<string, string>
): string | null {
  if (typeof original !== 'string' || !original) return null;
  const name = original.split('/').pop();
  return (name && byName.get(name)) ?? original;
}

export async function exportBackupPayload(): Promise<BackupPayload> {
  const db = await getDatabase();
  const appearance = await getAppearance();
  const [
    recipes,
    ingredients,
    steps,
    tags,
    recipeTags,
    cookLogs,
    recipeAdjustments,
    recipeVersions,
    queuedAiActions,
  ] = await Promise.all([
    db.getAllAsync<BackupRow>('SELECT * FROM recipes'),
    db.getAllAsync<BackupRow>('SELECT * FROM ingredients'),
    db.getAllAsync<BackupRow>('SELECT * FROM steps'),
    db.getAllAsync<BackupRow>('SELECT * FROM tags'),
    db.getAllAsync<BackupRow>('SELECT * FROM recipe_tags'),
    db.getAllAsync<BackupRow>('SELECT * FROM cook_logs'),
    db.getAllAsync<BackupRow>('SELECT * FROM recipe_adjustments'),
    db.getAllAsync<BackupRow>('SELECT * FROM recipe_versions'),
    db.getAllAsync<BackupRow>('SELECT * FROM queued_ai_actions'),
  ]);

  const photos = await collectPhotos([
    ...recipes.map((row) => (row.main_image_uri as string | null) ?? null),
    ...cookLogs.map((row) => (row.photo_uri as string | null) ?? null),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      appearance,
      unitsDisplay: 'compact',
    },
    photos,
    tables: {
      recipes,
      ingredients,
      steps,
      tags,
      recipe_tags: recipeTags,
      cook_logs: cookLogs,
      recipe_adjustments: recipeAdjustments,
      recipe_versions: recipeVersions,
      queued_ai_actions: queuedAiActions,
    },
  };
}

/** Count of recipes currently stored, for the "this will replace N" warning. */
export async function getStoredRecipeCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM recipes'
  );
  return row?.c ?? 0;
}

export async function exportBackupJson(): Promise<string> {
  const payload = await exportBackupPayload();
  return JSON.stringify(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBackupRows(value: unknown): value is BackupRow[] {
  return Array.isArray(value);
}

function validatePayload(value: unknown): BackupPayload {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.tables) ||
    !isRecord(value.settings)
  ) {
    throw new Error('Invalid backup file');
  }
  const tables = value.tables;
  // Tables added after the first release are optional, so backups taken by
  // earlier builds still restore.
  const recipeVersions = isBackupRows(tables.recipe_versions) ? tables.recipe_versions : [];
  const recipeAdjustments = isBackupRows(tables.recipe_adjustments)
    ? tables.recipe_adjustments
    : [];
  const queuedAiActions = isBackupRows(tables.queued_ai_actions)
    ? tables.queued_ai_actions
    : [];
  if (
    !isBackupRows(tables.recipes) ||
    !isBackupRows(tables.ingredients) ||
    !isBackupRows(tables.steps) ||
    !isBackupRows(tables.tags) ||
    !isBackupRows(tables.recipe_tags) ||
    !isBackupRows(tables.cook_logs)
  ) {
    throw new Error('Invalid backup table format');
  }
  const photos = Array.isArray(value.photos)
    ? (value.photos as unknown[]).filter(
        (photo): photo is BackupPhoto =>
          isRecord(photo) &&
          typeof photo.path === 'string' &&
          typeof photo.data === 'string'
      )
    : [];
  return {
    ...(value as BackupPayload),
    photos,
    tables: {
      recipes: tables.recipes as BackupRow[],
      ingredients: tables.ingredients as BackupRow[],
      steps: tables.steps as BackupRow[],
      tags: tables.tags as BackupRow[],
      recipe_tags: tables.recipe_tags as BackupRow[],
      cook_logs: tables.cook_logs as BackupRow[],
      recipe_adjustments: recipeAdjustments,
      recipe_versions: recipeVersions,
      queued_ai_actions: queuedAiActions,
    },
  };
}

/**
 * Validates a backup file and reports what it holds, without touching the
 * database. Restore is destructive and irreversible, so the user is shown these
 * numbers and asked to confirm before anything is deleted.
 */
export function inspectBackupJson(rawJson: string): {
  payload: BackupPayload;
  summary: BackupSummary;
} {
  const payload = validatePayload(JSON.parse(rawJson));
  return {
    payload,
    summary: {
      exportedAt:
        typeof payload.exportedAt === 'string' ? payload.exportedAt : 'unknown date',
      recipes: payload.tables.recipes.length,
      cookLogs: payload.tables.cook_logs.length,
      photos: payload.photos?.length ?? 0,
    },
  };
}

export async function restoreBackupJson(rawJson: string): Promise<void> {
  return restoreBackupPayload(validatePayload(JSON.parse(rawJson)));
}

export async function restoreBackupPayload(parsed: BackupPayload): Promise<void> {
  const db = await getDatabase();

  // `PRAGMA foreign_keys` is a documented no-op inside a transaction, so it has
  // to be set before BEGIN or it silently does nothing and constraints stay on
  // for the whole restore.
  const photosByName = await restorePhotos(parsed.photos ?? []);

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await restoreWithinTransaction(db, parsed, photosByName);
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  if (
    parsed.settings.appearance === 'light' ||
    parsed.settings.appearance === 'dark' ||
    parsed.settings.appearance === 'system'
  ) {
    await setAppearance(parsed.settings.appearance);
  }
}

async function restoreWithinTransaction(
  db: Awaited<ReturnType<typeof getDatabase>>,
  parsed: BackupPayload,
  photosByName: Map<string, string>
): Promise<void> {
  // Exclusive: restore rewrites every table, so it must not interleave with
  // another writer. SQLite has no nested transactions, and a hand-rolled
  // BEGIN IMMEDIATE would throw rather than wait.
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const table of TABLES) {
      await txn.execAsync(`DELETE FROM ${table};`);
    }

    for (const row of parsed.tables.recipes) {
      await txn.runAsync(
        `INSERT INTO recipes (id, title, source_url, source_type, main_image_uri, base_servings, last_servings, is_favorite, want_to_cook, is_archived, cuisine, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.source_url ?? '',
          row.source_type,
          localPhotoUri(row.main_image_uri ?? null, photosByName),
          row.base_servings,
          row.last_servings ?? null,
          row.is_favorite ?? 0,
          row.want_to_cook ?? 0,
          row.is_archived ?? 0,
          row.cuisine ?? null,
          row.created_at,
          row.updated_at,
        ]
      );
    }
    for (const row of parsed.tables.ingredients) {
      await txn.runAsync(
        `INSERT INTO ingredients (id, recipe_id, quantity, unit, name, notes, scalable, amount_mode, is_section_heading, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.recipe_id,
          row.quantity,
          row.unit ?? null,
          row.name,
          row.notes ?? null,
          row.scalable ?? 1,
          row.amount_mode === 'to_taste' ? 'to_taste' : 'exact',
          row.is_section_heading === 1 ? 1 : 0,
          row.sort_order ?? 0,
        ]
      );
    }
    for (const row of parsed.tables.steps) {
      await txn.runAsync(
        `INSERT INTO steps (id, recipe_id, order_idx, instruction, scalable_quantities_json)
         VALUES (?, ?, ?, ?, ?)`,
        [
          row.id,
          row.recipe_id,
          row.order_idx,
          row.instruction,
          row.scalable_quantities_json ?? '[]',
        ]
      );
    }
    for (const row of parsed.tables.tags) {
      await txn.runAsync('INSERT INTO tags (id, name) VALUES (?, ?)', [row.id, row.name]);
    }
    for (const row of parsed.tables.recipe_tags) {
      await txn.runAsync(
        'INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
        [row.recipe_id, row.tag_id]
      );
    }
    for (const row of parsed.tables.cook_logs) {
      await txn.runAsync(
        `INSERT INTO cook_logs (id, recipe_id, cooked_at, photo_uri, notes, rating, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.recipe_id,
          row.cooked_at,
          localPhotoUri(row.photo_uri ?? null, photosByName),
          row.notes ?? null,
          row.rating ?? null,
          row.created_at,
        ]
      );
    }
    for (const row of parsed.tables.recipe_adjustments) {
      await txn.runAsync(
        `INSERT INTO recipe_adjustments (id, recipe_id, cook_log_id, status, suggestions_json, created_at, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.recipe_id,
          row.cook_log_id,
          row.status === 'applied' || row.status === 'ignored' ? row.status : 'pending',
          row.suggestions_json ?? '[]',
          row.created_at,
          row.applied_at ?? null,
        ]
      );
    }
    for (const row of parsed.tables.recipe_versions) {
      await txn.runAsync(
        `INSERT INTO recipe_versions (id, recipe_id, label, snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [row.id, row.recipe_id, row.label, row.snapshot_json, row.created_at]
      );
    }
    for (const row of parsed.tables.queued_ai_actions) {
      await txn.runAsync(
        `INSERT INTO queued_ai_actions (id, action_type, payload_json, created_at, attempts, last_error)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.action_type,
          row.payload_json,
          row.created_at,
          row.attempts ?? 0,
          row.last_error ?? null,
        ]
      );
    }
  });
}
