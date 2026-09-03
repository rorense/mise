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
      is_section_heading INTEGER NOT NULL DEFAULT 0,
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
  5: `
    ALTER TABLE recipes ADD COLUMN last_servings REAL;
  `,
  6: `
    ALTER TABLE ingredients ADD COLUMN amount_mode TEXT NOT NULL DEFAULT 'exact' CHECK(amount_mode IN ('exact','to_taste'));
  `,
  7: `
    CREATE TABLE IF NOT EXISTS recipe_adjustments (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      cook_log_id TEXT NOT NULL REFERENCES cook_logs(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending', 'applied', 'ignored')),
      suggestions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      applied_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_adjustments_recipe_status
      ON recipe_adjustments(recipe_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_adjustments_cook_log
      ON recipe_adjustments(cook_log_id);
  `,
  8: `
    CREATE TABLE IF NOT EXISTS recipe_versions (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_created
      ON recipe_versions(recipe_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS queued_ai_actions (
      id TEXT PRIMARY KEY NOT NULL,
      action_type TEXT NOT NULL CHECK(action_type IN ('cook_log_adjustment')),
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_queued_ai_actions_created
      ON queued_ai_actions(created_at ASC);
  `,
  9: `
    ALTER TABLE ingredients ADD COLUMN is_section_heading INTEGER NOT NULL DEFAULT 0;
  `,
  10: `
    CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag ON recipe_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_steps_recipe_order ON steps(recipe_id, order_idx);
    CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_sort ON ingredients(recipe_id, sort_order);
  `,
};

/**
 * Migrations that add a column which migration 1's `CREATE TABLE` was later
 * edited to declare. On a fresh install the baseline already has the column, so
 * the `ALTER` would fail with "duplicate column name" — these are recorded as
 * done instead of run. An install old enough to predate the column still gets
 * the real `ALTER`.
 *
 * Deleting an entry here breaks first launch on a clean install and nowhere
 * else, so it will not reproduce on any device that already has the database.
 * `__tests__/migrations.test.ts` covers both directions.
 */
const ADDS_COLUMN: Record<number, { table: string; column: string }> = {
  6: { table: 'ingredients', column: 'amount_mode' },
  9: { table: 'ingredients', column: 'is_section_heading' },
};

/** `PRAGMA` takes no bound parameters; `table` is always a literal from above. */
async function hasColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string
): Promise<boolean> {
  const columns = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`
  );
  return columns.some((entry) => entry.name === column);
}

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  // WAL lets reads proceed while a write is in flight — the right mode for a
  // read-heavy local store. Must be set outside a transaction.
  await db.execAsync('PRAGMA journal_mode = WAL;');
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
    if (version <= current) continue;

    // A guarded version's column is already present on a fresh install, so its
    // ALTER would fail. Record it as done instead of running it.
    const guard = ADDS_COLUMN[version];
    if (guard && (await hasColumn(db, guard.table, guard.column))) {
      await db.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
      current = version;
      continue;
    }

    // The DDL and its version row commit together. Without this a migration
    // that fails halfway leaves its statements applied but unrecorded, so the
    // next launch replays it and dies on "duplicate column" — permanently.
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', [
        version,
      ]);
    });
    current = version;
  }
}
