import { getDatabase } from '@/db/client';
import {
  getAppearance,
  setAppearance,
} from '@/lib/secrets';

type BackupPayload = {
  version: 1;
  exportedAt: string;
  settings: {
    appearance: 'system' | 'light' | 'dark' | null;
    unitsDisplay: 'compact';
  };
  tables: {
    recipes: BackupRow[];
    ingredients: BackupRow[];
    steps: BackupRow[];
    tags: BackupRow[];
    recipe_tags: BackupRow[];
    cook_logs: BackupRow[];
  };
};

type BackupRow = Record<string, string | number | null>;

const TABLES = ['recipes', 'ingredients', 'steps', 'tags', 'recipe_tags', 'cook_logs'] as const;

export async function exportBackupPayload(): Promise<BackupPayload> {
  const db = await getDatabase();
  const appearance = await getAppearance();
  const [recipes, ingredients, steps, tags, recipeTags, cookLogs] = await Promise.all([
    db.getAllAsync<BackupRow>('SELECT * FROM recipes'),
    db.getAllAsync<BackupRow>('SELECT * FROM ingredients'),
    db.getAllAsync<BackupRow>('SELECT * FROM steps'),
    db.getAllAsync<BackupRow>('SELECT * FROM tags'),
    db.getAllAsync<BackupRow>('SELECT * FROM recipe_tags'),
    db.getAllAsync<BackupRow>('SELECT * FROM cook_logs'),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      appearance,
      unitsDisplay: 'compact',
    },
    tables: {
      recipes,
      ingredients,
      steps,
      tags,
      recipe_tags: recipeTags,
      cook_logs: cookLogs,
    },
  };
}

export async function exportBackupJson(): Promise<string> {
  const payload = await exportBackupPayload();
  return JSON.stringify(payload, null, 2);
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
  return value as BackupPayload;
}

export async function restoreBackupJson(rawJson: string): Promise<void> {
  const parsed = validatePayload(JSON.parse(rawJson));
  const db = await getDatabase();

  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    for (const table of TABLES) {
      await db.execAsync(`DELETE FROM ${table};`);
    }

    for (const row of parsed.tables.recipes) {
      await db.runAsync(
        `INSERT INTO recipes (id, title, source_url, source_type, main_image_uri, base_servings, last_servings, is_favorite, want_to_cook, is_archived, cuisine, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.title,
          row.source_url ?? '',
          row.source_type,
          row.main_image_uri ?? null,
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
      await db.runAsync(
        `INSERT INTO ingredients (id, recipe_id, quantity, unit, name, notes, scalable, amount_mode, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.recipe_id,
          row.quantity,
          row.unit ?? null,
          row.name,
          row.notes ?? null,
          row.scalable ?? 1,
          row.amount_mode === 'to_taste' ? 'to_taste' : 'exact',
          row.sort_order ?? 0,
        ]
      );
    }
    for (const row of parsed.tables.steps) {
      await db.runAsync(
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
      await db.runAsync('INSERT INTO tags (id, name) VALUES (?, ?)', [row.id, row.name]);
    }
    for (const row of parsed.tables.recipe_tags) {
      await db.runAsync(
        'INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
        [row.recipe_id, row.tag_id]
      );
    }
    for (const row of parsed.tables.cook_logs) {
      await db.runAsync(
        `INSERT INTO cook_logs (id, recipe_id, cooked_at, photo_uri, notes, rating, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.recipe_id,
          row.cooked_at,
          row.photo_uri ?? null,
          row.notes ?? null,
          row.rating ?? null,
          row.created_at,
        ]
      );
    }
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    throw error;
  }

  if (parsed.settings.appearance === 'light' || parsed.settings.appearance === 'dark' || parsed.settings.appearance === 'system') {
    await setAppearance(parsed.settings.appearance);
  }
}
