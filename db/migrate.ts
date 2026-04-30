import type * as SQLite from 'expo-sqlite';

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL CHECK(source_type IN ('url','youtube','instagram','manual')),
      base_servings REAL NOT NULL DEFAULT 4,
      cuisine TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      quantity REAL NOT NULL,
      unit TEXT,
      name TEXT NOT NULL,
      notes TEXT,
      scalable INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      order_idx INTEGER NOT NULL,
      instruction TEXT NOT NULL,
      scalable_quantities_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE IF NOT EXISTS recipe_tags (
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (recipe_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS cook_logs (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      cooked_at TEXT NOT NULL,
      photo_uri TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ingredients_recipe ON ingredients(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_steps_recipe ON steps(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_cook_logs_recipe ON cook_logs(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_updated ON recipes(updated_at);
  `,
  2: `
    ALTER TABLE recipes ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE recipes ADD COLUMN want_to_cook INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_recipes_favorite ON recipes(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_recipes_want_to_cook ON recipes(want_to_cook);
  `,
  3: `
    ALTER TABLE recipes ADD COLUMN main_image_uri TEXT;
  `,
  4: `
    ALTER TABLE recipes ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cook_logs ADD COLUMN rating INTEGER;
    CREATE INDEX IF NOT EXISTS idx_recipes_archived ON recipes(is_archived);
  `,
};

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL
    );
  `);

  const row = await db.getFirstAsync<{ v: number | null }>(
    'SELECT MAX(version) AS v FROM schema_migrations'
  );
  let current = row?.v ?? 0;

  const versions = Object.keys(MIGRATIONS)
    .map(Number)
    .sort((a, b) => a - b);

  for (const version of versions) {
    if (version > current) {
      await db.execAsync(MIGRATIONS[version]);
      await db.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', version);
      current = version;
    }
  }
}
