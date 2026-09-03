import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '@/db/client';
import { newId } from '@/lib/id';
import type {
  CookLog,
  Ingredient,
  IngredientAmountMode,
  RecipeAdjustment,
  RecipeAdjustmentStatus,
  RecipeAdjustmentSuggestion,
  Recipe,
  RecipeVersion,
  RecipeListItem,
  SourceType,
  Step,
} from '@/types/recipe';
import type * as SQLite from 'expo-sqlite';

type RecipeRow = {
  id: string;
  title: string;
  source_url: string;
  source_type: SourceType;
  main_image_uri: string | null;
  base_servings: number;
  last_servings: number | null;
  is_favorite: number;
  want_to_cook: number;
  is_archived: number;
  cuisine: string | null;
  created_at: string;
  updated_at: string;
};

type IngredientRow = {
  id: string;
  recipe_id: string;
  quantity: number;
  unit: string | null;
  name: string;
  notes: string | null;
  scalable: number;
  amount_mode: IngredientAmountMode;
  is_section_heading: number;
  sort_order: number;
};

type StepRow = {
  id: string;
  recipe_id: string;
  order_idx: number;
  instruction: string;
  scalable_quantities_json: string;
};

type CookLogRow = {
  id: string;
  recipe_id: string;
  cooked_at: string;
  photo_uri: string | null;
  notes: string | null;
  rating: number | null;
  created_at: string;
};

type RecipeAdjustmentRow = {
  id: string;
  recipe_id: string;
  cook_log_id: string;
  status: RecipeAdjustmentStatus;
  suggestions_json: string;
  created_at: string;
  applied_at: string | null;
};

type RecipeVersionRow = {
  id: string;
  recipe_id: string;
  label: string;
  snapshot_json: string;
  created_at: string;
};

type QueuedAiActionType = 'cook_log_adjustment';

type QueuedAiActionRow = {
  id: string;
  action_type: QueuedAiActionType;
  payload_json: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
};

function mapIngredient(r: IngredientRow): Ingredient {
  return {
    id: r.id,
    quantity: r.quantity,
    unit: r.unit,
    name: r.name,
    notes: r.notes ?? undefined,
    scalable: r.scalable !== 0,
    amountMode: r.amount_mode ?? 'exact',
    isSectionHeading: r.is_section_heading === 1,
    sortOrder: r.sort_order,
  };
}

function mapStep(r: StepRow): Step {
  let scalableQuantities: Step['scalableQuantities'] = [];
  try {
    scalableQuantities = JSON.parse(r.scalable_quantities_json) ?? [];
  } catch {
    scalableQuantities = [];
  }
  return {
    id: r.id,
    order: r.order_idx,
    instruction: r.instruction,
    scalableQuantities,
  };
}

function mapCookLog(r: CookLogRow): CookLog {
  return {
    id: r.id,
    recipeId: r.recipe_id,
    cookedAt: r.cooked_at,
    photoUri: r.photo_uri ?? undefined,
    notes: r.notes ?? undefined,
    rating: r.rating ?? undefined,
    createdAt: r.created_at,
  };
}

function parseRecipeAdjustmentSuggestions(
  json: string
): RecipeAdjustmentSuggestion[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as RecipeAdjustmentSuggestion[]) : [];
  } catch {
    return [];
  }
}

function mapRecipeAdjustment(r: RecipeAdjustmentRow): RecipeAdjustment {
  return {
    id: r.id,
    recipeId: r.recipe_id,
    cookLogId: r.cook_log_id,
    status: r.status,
    suggestions: parseRecipeAdjustmentSuggestions(r.suggestions_json),
    createdAt: r.created_at,
    appliedAt: r.applied_at ?? undefined,
  };
}

function mapRecipeVersion(r: RecipeVersionRow): RecipeVersion {
  return {
    id: r.id,
    recipeId: r.recipe_id,
    label: r.label,
    snapshotJson: r.snapshot_json,
    createdAt: r.created_at,
  };
}

async function loadTagsForRecipe(
  db: SQLite.SQLiteDatabase,
  recipeId: string
): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT t.name as name FROM recipe_tags rt
     JOIN tags t ON t.id = rt.tag_id
     WHERE rt.recipe_id = ?
     ORDER BY t.name COLLATE NOCASE`,
    [recipeId]
  );
  return rows.map((r) => r.name);
}

/** SQLite's default host-parameter ceiling is 999; stay well inside it. */
const SQL_PARAM_CHUNK = 500;

/** Snapshots kept per recipe before the oldest are dropped. */
const MAX_VERSIONS_PER_RECIPE = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Batched counterpart to loadTagsForRecipe. The library list previously ran one
 * tag query per card, so a 200-recipe library cost 201 round trips per render.
 */
async function loadTagsForRecipes(
  db: SQLite.SQLiteDatabase,
  recipeIds: string[]
): Promise<Map<string, string[]>> {
  const byRecipe = new Map<string, string[]>();
  for (const ids of chunk(recipeIds, SQL_PARAM_CHUNK)) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ recipe_id: string; name: string }>(
      `SELECT rt.recipe_id as recipe_id, t.name as name
       FROM recipe_tags rt
       JOIN tags t ON t.id = rt.tag_id
       WHERE rt.recipe_id IN (${placeholders})
       ORDER BY t.name COLLATE NOCASE`,
      ids
    );
    for (const row of rows) {
      const existing = byRecipe.get(row.recipe_id);
      if (existing) existing.push(row.name);
      else byRecipe.set(row.recipe_id, [row.name]);
    }
  }
  return byRecipe;
}

/** Step text for many recipes at once, for the `mins<n` search filter. */
async function loadStepInstructionsForRecipes(
  db: SQLite.SQLiteDatabase,
  recipeIds: string[]
): Promise<Map<string, string[]>> {
  const byRecipe = new Map<string, string[]>();
  for (const ids of chunk(recipeIds, SQL_PARAM_CHUNK)) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ recipe_id: string; instruction: string }>(
      `SELECT recipe_id, instruction
       FROM steps
       WHERE recipe_id IN (${placeholders})
       ORDER BY order_idx, id`,
      ids
    );
    for (const row of rows) {
      const existing = byRecipe.get(row.recipe_id);
      if (existing) existing.push(row.instruction);
      else byRecipe.set(row.recipe_id, [row.instruction]);
    }
  }
  return byRecipe;
}

/**
 * Drops tags no recipe references any more. Without this the filter list keeps
 * showing tags whose last recipe was deleted.
 */
async function deleteOrphanTags(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync(
    `DELETE FROM tags
     WHERE NOT EXISTS (
       SELECT 1 FROM recipe_tags rt WHERE rt.tag_id = tags.id
     )`
  );
}

function toDraft(recipe: Recipe): Omit<Recipe, 'cookLogs'> {
  const { cookLogs: _cookLogs, ...draft } = recipe;
  return draft;
}

async function isUriReferenced(
  db: SQLite.SQLiteDatabase,
  uri: string
): Promise<boolean> {
  const recipeMain = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM recipes WHERE main_image_uri = ?',
    [uri]
  );
  const cookPhoto = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM cook_logs WHERE photo_uri = ?',
    [uri]
  );
  return (recipeMain?.c ?? 0) > 0 || (cookPhoto?.c ?? 0) > 0;
}

async function deleteUriIfUnreferenced(
  db: SQLite.SQLiteDatabase,
  uri: string | null | undefined
): Promise<void> {
  if (!uri) return;
  const stillReferenced = await isUriReferenced(db, uri);
  if (stillReferenced) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri);
    }
  } catch {
    /* ignore */
  }
}

type PendingVersionSnapshot = {
  id: string;
  recipeId: string;
  label: string;
  snapshotJson: string;
  createdAt: string;
};

/**
 * Reads the current recipe so a snapshot can be written later. Deliberately
 * separate from the write: reads go through the shared connection, and calling
 * this from inside an exclusive transaction (which owns its own connection)
 * would read across connections.
 */
async function buildRecipeVersionSnapshot(
  recipeId: string,
  label: string
): Promise<PendingVersionSnapshot | null> {
  const currentRecipe = await getRecipeById(recipeId);
  if (!currentRecipe) return null;
  return {
    id: newId(),
    recipeId,
    label,
    snapshotJson: JSON.stringify(toDraft(currentRecipe)),
    createdAt: new Date().toISOString(),
  };
}

async function writeRecipeVersionSnapshot(
  db: SQLite.SQLiteDatabase,
  snapshot: PendingVersionSnapshot
): Promise<void> {
  const { id: versionId, recipeId, label } = snapshot;
  await db.runAsync(
    `INSERT INTO recipe_versions (id, recipe_id, label, snapshot_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [versionId, recipeId, label, snapshot.snapshotJson, snapshot.createdAt]
  );
  // Every save, archive, restore and applied adjustment writes a full snapshot.
  // Unpruned, a frequently-tweaked recipe accumulates dozens of copies of
  // itself, all of which also land in every backup.
  await db.runAsync(
    `DELETE FROM recipe_versions
     WHERE recipe_id = ?
       AND id NOT IN (
         SELECT id FROM recipe_versions
         WHERE recipe_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?
       )`,
    [recipeId, recipeId, MAX_VERSIONS_PER_RECIPE]
  );
}

export async function getRecipeById(id: string): Promise<Recipe | null> {
  const db = await getDatabase();
  const r = await db.getFirstAsync<RecipeRow>(
    'SELECT * FROM recipes WHERE id = ?',
    [id]
  );
  if (!r) return null;
  const ingRows = await db.getAllAsync<IngredientRow>(
    'SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY sort_order, id',
    [id]
  );
  const stepRows = await db.getAllAsync<StepRow>(
    'SELECT * FROM steps WHERE recipe_id = ? ORDER BY order_idx, id',
    [id]
  );
  const logs = await db.getAllAsync<CookLogRow>(
    'SELECT * FROM cook_logs WHERE recipe_id = ? ORDER BY cooked_at DESC, created_at DESC',
    [id]
  );
  const tags = await loadTagsForRecipe(db, id);
  return {
    id: r.id,
    title: r.title,
    sourceUrl: r.source_url,
    sourceType: r.source_type,
    mainImageUri: r.main_image_uri ?? undefined,
    baseServings: r.base_servings,
    isFavorite: r.is_favorite === 1,
    wantToCook: r.want_to_cook === 1,
    isArchived: r.is_archived === 1,
    cuisine: r.cuisine ?? undefined,
    ingredients: ingRows.map(mapIngredient),
    steps: stepRows.map(mapStep),
    tags,
    cookLogs: logs.map(mapCookLog),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type LibrarySort =
  | 'recent_added'
  | 'recent_cooked'
  | 'most_cooked'
  | 'title';

export type LibraryFilter =
  | { type: 'none' }
  | { type: 'tag'; tag: string }
  | { type: 'cuisine'; cuisine: string }
  | { type: 'recently_cooked' }
  | { type: 'never_cooked' }
  | { type: 'favorite' }
  | { type: 'want_to_cook' }
  | { type: 'archived' };

export function getLibraryOrderBy(sort: LibrarySort): string {
  const pinned = 'r.is_favorite DESC, r.want_to_cook DESC';
  if (sort === 'recent_added') {
    return `${pinned}, r.updated_at DESC`;
  }
  if (sort === 'title') {
    return `${pinned}, r.title COLLATE NOCASE ASC`;
  }
  if (sort === 'most_cooked') {
    return `${pinned}, cook_count DESC, r.updated_at DESC`;
  }
  return `${pinned}, (last_cooked_at IS NULL) ASC, last_cooked_at DESC, r.updated_at DESC`;
}

export type SearchMinutesFilter = {
  op: '<' | '<=' | '>' | '>=' | '=';
  value: number;
};

export type ParsedSearchQuery = {
  textTerms: string[];
  includeIngredients: string[];
  excludeIngredients: string[];
  includeTags: string[];
  excludeTags: string[];
  includeCuisine: string[];
  excludeCuisine: string[];
  flags: {
    favorite?: boolean;
    wantToCook?: boolean;
    archived?: boolean;
    cooked?: boolean;
  };
  minutes?: SearchMinutesFilter;
};

function tokenizeSearchQuery(raw: string): string[] {
  const tokens = raw.match(/"([^"]+)"|\S+/g) ?? [];
  return tokens.map((token) =>
    token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token
  );
}

function parseMinutesFilter(token: string): SearchMinutesFilter | undefined {
  const match = token.match(/^mins?(<=|>=|=|<|>)(\d+)$/i);
  if (!match) return undefined;
  return {
    op: match[1] as SearchMinutesFilter['op'],
    value: Number(match[2]),
  };
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const parsed: ParsedSearchQuery = {
    textTerms: [],
    includeIngredients: [],
    excludeIngredients: [],
    includeTags: [],
    excludeTags: [],
    includeCuisine: [],
    excludeCuisine: [],
    flags: {},
  };
  for (const token of tokenizeSearchQuery(query.trim())) {
    const lower = token.toLowerCase();
    const minutes = parseMinutesFilter(lower);
    if (minutes) {
      parsed.minutes = minutes;
      continue;
    }
    if (lower.startsWith('has:')) {
      const value = token.slice(4).trim();
      if (value) parsed.includeIngredients.push(value);
      continue;
    }
    if (lower.startsWith('no:')) {
      const value = token.slice(3).trim();
      if (value) parsed.excludeIngredients.push(value);
      continue;
    }
    if (lower.startsWith('tag:')) {
      const value = token.slice(4).trim();
      if (value) parsed.includeTags.push(value);
      continue;
    }
    if (lower.startsWith('-tag:')) {
      const value = token.slice(5).trim();
      if (value) parsed.excludeTags.push(value);
      continue;
    }
    if (lower.startsWith('cuisine:')) {
      const value = token.slice(8).trim();
      if (value) parsed.includeCuisine.push(value);
      continue;
    }
    if (lower.startsWith('-cuisine:')) {
      const value = token.slice(9).trim();
      if (value) parsed.excludeCuisine.push(value);
      continue;
    }
    if (lower === 'is:favorite') {
      parsed.flags.favorite = true;
      continue;
    }
    if (lower === 'is:want') {
      parsed.flags.wantToCook = true;
      continue;
    }
    if (lower === 'is:archived') {
      parsed.flags.archived = true;
      continue;
    }
    if (lower === 'is:cooked') {
      parsed.flags.cooked = true;
      continue;
    }
    if (lower === 'is:uncooked') {
      parsed.flags.cooked = false;
      continue;
    }
    parsed.textTerms.push(token);
  }
  return parsed;
}

export function estimateStepMinutes(instruction: string): number {
  let total = 0;
  let lower = instruction.toLowerCase();
  const rangePattern = /(\d+)\s*-\s*(\d+)\s*(m|min|mins|minute|minutes)\b/g;
  for (const match of lower.matchAll(rangePattern)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      total += Math.round((start + end) / 2);
    }
  }
  lower = lower.replace(rangePattern, ' ');
  for (const match of lower.matchAll(/(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/g)) {
    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value)) continue;
    if (unit.startsWith('h')) {
      total += value * 60;
    } else {
      total += value;
    }
  }
  return total;
}

export async function listRecipeCards(
  query: string,
  filter: LibraryFilter,
  sort: LibrarySort
): Promise<RecipeListItem[]> {
  const db = await getDatabase();
  const parsedSearch = parseSearchQuery(query);
  const hasTextTerms = parsedSearch.textTerms.length > 0;

  let sql = `
    SELECT
      r.id,
      r.title,
      r.cuisine,
      r.is_favorite,
      r.want_to_cook,
      r.is_archived,
      r.main_image_uri,
      r.updated_at,
      COALESCE(
        r.main_image_uri,
        (SELECT photo_uri FROM cook_logs cl WHERE cl.recipe_id = r.id AND cl.photo_uri IS NOT NULL ORDER BY cl.cooked_at DESC, cl.created_at DESC LIMIT 1)
      ) AS hero_uri,
      (SELECT COUNT(*) FROM cook_logs cl2 WHERE cl2.recipe_id = r.id) AS cook_count,
      (SELECT MAX(cooked_at) FROM cook_logs cl3 WHERE cl3.recipe_id = r.id) AS last_cooked_at
    FROM recipes r
    WHERE 1 = 1
  `;
  const params: (string | number)[] = [];

  // An explicit is:archived token wins over the chip default. Applying both
  // produced `is_archived = 0 AND is_archived = 1`, so the search operator
  // could never match anything.
  if (parsedSearch.flags.archived !== undefined) {
    sql += ` AND r.is_archived = ?`;
    params.push(parsedSearch.flags.archived ? 1 : 0);
  } else if (filter.type === 'archived') {
    sql += ` AND r.is_archived = 1`;
  } else {
    sql += ` AND r.is_archived = 0`;
  }

  if (hasTextTerms) {
    for (const term of parsedSearch.textTerms) {
      const q = `%${term.trim().toLowerCase()}%`;
      sql += ` AND (
        lower(r.title) LIKE ?
        OR lower(ifnull(r.cuisine,'')) LIKE ?
        OR EXISTS (SELECT 1 FROM ingredients i WHERE i.recipe_id = r.id AND lower(i.name) LIKE ?)
        OR EXISTS (
          SELECT 1 FROM recipe_tags rt2 JOIN tags t2 ON t2.id = rt2.tag_id
          WHERE rt2.recipe_id = r.id AND lower(t2.name) LIKE ?
        )
      )`;
      params.push(q, q, q, q);
    }
  }

  for (const term of parsedSearch.includeIngredients) {
    sql += ` AND EXISTS (
      SELECT 1 FROM ingredients i2
      WHERE i2.recipe_id = r.id AND lower(i2.name) LIKE ?
    )`;
    params.push(`%${term.toLowerCase()}%`);
  }
  for (const term of parsedSearch.excludeIngredients) {
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM ingredients i3
      WHERE i3.recipe_id = r.id AND lower(i3.name) LIKE ?
    )`;
    params.push(`%${term.toLowerCase()}%`);
  }
  for (const tag of parsedSearch.includeTags) {
    sql += ` AND EXISTS (
      SELECT 1 FROM recipe_tags rt4 JOIN tags t4 ON t4.id = rt4.tag_id
      WHERE rt4.recipe_id = r.id AND lower(t4.name) LIKE ?
    )`;
    params.push(`%${tag.toLowerCase()}%`);
  }
  for (const tag of parsedSearch.excludeTags) {
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM recipe_tags rt5 JOIN tags t5 ON t5.id = rt5.tag_id
      WHERE rt5.recipe_id = r.id AND lower(t5.name) LIKE ?
    )`;
    params.push(`%${tag.toLowerCase()}%`);
  }
  for (const cuisine of parsedSearch.includeCuisine) {
    sql += ` AND lower(ifnull(r.cuisine, '')) LIKE ?`;
    params.push(`%${cuisine.toLowerCase()}%`);
  }
  for (const cuisine of parsedSearch.excludeCuisine) {
    sql += ` AND lower(ifnull(r.cuisine, '')) NOT LIKE ?`;
    params.push(`%${cuisine.toLowerCase()}%`);
  }
  if (parsedSearch.flags.favorite) {
    sql += ` AND r.is_favorite = 1`;
  }
  if (parsedSearch.flags.wantToCook) {
    sql += ` AND r.want_to_cook = 1`;
  }
  if (parsedSearch.flags.cooked === true) {
    sql += ` AND EXISTS (SELECT 1 FROM cook_logs c6 WHERE c6.recipe_id = r.id)`;
  } else if (parsedSearch.flags.cooked === false) {
    sql += ` AND NOT EXISTS (SELECT 1 FROM cook_logs c7 WHERE c7.recipe_id = r.id)`;
  }

  if (filter.type === 'tag') {
    sql += ` AND EXISTS (
      SELECT 1 FROM recipe_tags rt3 JOIN tags t3 ON t3.id = rt3.tag_id
      WHERE rt3.recipe_id = r.id AND t3.name = ?
    )`;
    params.push(filter.tag);
  } else if (filter.type === 'cuisine') {
    sql += ` AND r.cuisine = ?`;
    params.push(filter.cuisine);
  } else if (filter.type === 'recently_cooked') {
    sql += ` AND EXISTS (SELECT 1 FROM cook_logs c4 WHERE c4.recipe_id = r.id)`;
  } else if (filter.type === 'never_cooked') {
    sql += ` AND NOT EXISTS (SELECT 1 FROM cook_logs c5 WHERE c5.recipe_id = r.id)`;
  } else if (filter.type === 'favorite') {
    sql += ` AND r.is_favorite = 1`;
  } else if (filter.type === 'want_to_cook') {
    sql += ` AND r.want_to_cook = 1`;
  }
  sql += ` ORDER BY ${getLibraryOrderBy(sort)}`;

  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    cuisine: string | null;
    is_favorite: number;
    want_to_cook: number;
    is_archived: number;
    main_image_uri: string | null;
    updated_at: string;
    hero_uri: string | null;
    cook_count: number;
    last_cooked_at: string | null;
  }>(sql, params);

  let filteredRows = rows;
  if (parsedSearch.minutes) {
    const stepsByRecipe = await loadStepInstructionsForRecipes(
      db,
      rows.map((row) => row.id)
    );
    const kept: typeof rows = [];
    for (const row of rows) {
      const minutes = (stepsByRecipe.get(row.id) ?? []).reduce(
        (acc, instruction) => acc + estimateStepMinutes(instruction),
        0
      );
      const value = parsedSearch.minutes.value;
      const pass =
        parsedSearch.minutes.op === '<'
          ? minutes < value
          : parsedSearch.minutes.op === '<='
            ? minutes <= value
          : parsedSearch.minutes.op === '>'
            ? minutes > value
            : parsedSearch.minutes.op === '>='
              ? minutes >= value
              : minutes === value;
      if (pass) kept.push(row);
    }
    filteredRows = kept;
  }

  const tagsByRecipe = await loadTagsForRecipes(
    db,
    filteredRows.map((row) => row.id)
  );
  return filteredRows.map((row) => ({
    id: row.id,
    title: row.title,
    cuisine: row.cuisine ?? undefined,
    heroUri: row.hero_uri ?? undefined,
    mainImageUri: row.main_image_uri ?? undefined,
    cookCount: row.cook_count,
    isFavorite: row.is_favorite === 1,
    wantToCook: row.want_to_cook === 1,
    isArchived: row.is_archived === 1,
    lastCookedAt: row.last_cooked_at ?? undefined,
    updatedAt: row.updated_at,
    tags: tagsByRecipe.get(row.id) ?? [],
  }));
}

export async function getAllTags(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT
       t.name as name
     FROM tags t
     LEFT JOIN recipe_tags rt ON rt.tag_id = t.id
     LEFT JOIN recipes r ON r.id = rt.recipe_id AND r.is_archived = 0
     GROUP BY t.id, t.name
     ORDER BY
       COUNT(r.id) DESC,
       MAX(r.updated_at) DESC,
       t.name COLLATE NOCASE ASC`
  );
  return rows.map((r) => r.name);
}

export async function getAllCuisines(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ cuisine: string }>(
    `SELECT DISTINCT cuisine FROM recipes WHERE is_archived = 0 AND cuisine IS NOT NULL AND trim(cuisine) != '' ORDER BY cuisine COLLATE NOCASE`
  );
  return rows.map((r) => r.cuisine);
}

async function ensureTagIds(
  db: SQLite.SQLiteDatabase,
  names: string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM tags WHERE name = ? COLLATE NOCASE',
      [name]
    );
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const id = newId();
    await db.runAsync('INSERT INTO tags (id, name) VALUES (?, ?)', [id, name]);
    ids.push(id);
  }
  return ids;
}

export async function saveRecipe(recipe: Omit<Recipe, 'cookLogs'>): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM recipes WHERE id = ?',
    [recipe.id]
  );
  // Read the pre-edit state before the transaction opens, so the snapshot does
  // not read across connections from inside it.
  const snapshot = existing
    ? await buildRecipeVersionSnapshot(recipe.id, 'Before edit')
    : null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    if (snapshot) {
      await writeRecipeVersionSnapshot(txn, snapshot);
    }
    await txn.runAsync(
      `INSERT INTO recipes (id, title, source_url, source_type, main_image_uri, base_servings, is_favorite, want_to_cook, is_archived, cuisine, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         source_url = excluded.source_url,
         source_type = excluded.source_type,
         main_image_uri = excluded.main_image_uri,
         base_servings = excluded.base_servings,
         is_favorite = excluded.is_favorite,
         want_to_cook = excluded.want_to_cook,
         is_archived = excluded.is_archived,
         cuisine = excluded.cuisine,
         updated_at = excluded.updated_at`,
      [
        recipe.id,
        recipe.title,
        recipe.sourceUrl,
        recipe.sourceType,
        recipe.mainImageUri ?? null,
        recipe.baseServings,
        recipe.isFavorite ? 1 : 0,
        recipe.wantToCook ? 1 : 0,
        recipe.isArchived ? 1 : 0,
        recipe.cuisine ?? null,
        recipe.createdAt,
        now,
      ]
    );

    await txn.runAsync('DELETE FROM ingredients WHERE recipe_id = ?', [recipe.id]);
    await txn.runAsync('DELETE FROM steps WHERE recipe_id = ?', [recipe.id]);
    await txn.runAsync('DELETE FROM recipe_tags WHERE recipe_id = ?', [recipe.id]);

    for (const ing of recipe.ingredients) {
      await txn.runAsync(
        `INSERT INTO ingredients (id, recipe_id, quantity, unit, name, notes, scalable, amount_mode, is_section_heading, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ing.id,
          recipe.id,
          ing.quantity,
          ing.unit,
          ing.name,
          ing.notes ?? null,
          ing.scalable ? 1 : 0,
          ing.amountMode ?? 'exact',
          ing.isSectionHeading ? 1 : 0,
          ing.sortOrder,
        ]
      );
    }

    for (const st of recipe.steps) {
      await txn.runAsync(
        `INSERT INTO steps (id, recipe_id, order_idx, instruction, scalable_quantities_json)
         VALUES (?, ?, ?, ?, ?)`,
        [
          st.id,
          recipe.id,
          st.order,
          st.instruction,
          JSON.stringify(st.scalableQuantities ?? []),
        ]
      );
    }

    const tagIds = await ensureTagIds(txn, recipe.tags);
    for (const tid of tagIds) {
      await txn.runAsync(
        'INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
        [recipe.id, tid]
      );
    }
    await deleteOrphanTags(txn);

  });
}

export async function addCookLog(
  entry: CookLog,
  options?: { clearWantToCook?: boolean }
): Promise<void> {
  const db = await getDatabase();
  const clearWantToCook = options?.clearWantToCook ?? true;
  await db.runAsync(
    `INSERT INTO cook_logs (id, recipe_id, cooked_at, photo_uri, notes, rating, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.recipeId,
      entry.cookedAt,
      entry.photoUri ?? null,
      entry.notes ?? null,
      entry.rating ?? null,
      entry.createdAt,
    ]
  );
  await db.runAsync(
    clearWantToCook
      ? 'UPDATE recipes SET updated_at = ?, want_to_cook = 0 WHERE id = ?'
      : 'UPDATE recipes SET updated_at = ? WHERE id = ?',
    [new Date().toISOString(), entry.recipeId]
  );
}

export async function createRecipeAdjustment(args: {
  recipeId: string;
  cookLogId: string;
  suggestions: RecipeAdjustmentSuggestion[];
}): Promise<RecipeAdjustment | null> {
  if (args.suggestions.length === 0) return null;
  const db = await getDatabase();
  const createdAt = new Date().toISOString();
  const id = newId();
  await db.runAsync(
    `INSERT INTO recipe_adjustments (id, recipe_id, cook_log_id, status, suggestions_json, created_at, applied_at)
     VALUES (?, ?, ?, 'pending', ?, ?, NULL)`,
    [
      id,
      args.recipeId,
      args.cookLogId,
      JSON.stringify(args.suggestions),
      createdAt,
    ]
  );
  await db.runAsync('UPDATE recipes SET updated_at = ? WHERE id = ?', [
    createdAt,
    args.recipeId,
  ]);
  return {
    id,
    recipeId: args.recipeId,
    cookLogId: args.cookLogId,
    status: 'pending',
    suggestions: args.suggestions,
    createdAt,
  };
}

export async function enqueueCookLogAdjustmentTask(args: {
  recipeId: string;
  cookLogId: string;
  note: string;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO queued_ai_actions (id, action_type, payload_json, created_at, attempts, last_error)
     VALUES (?, 'cook_log_adjustment', ?, ?, 0, NULL)`,
    [newId(), JSON.stringify(args), new Date().toISOString()]
  );
}

export async function listQueuedAiActions(): Promise<QueuedAiActionRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<QueuedAiActionRow>(
    `SELECT * FROM queued_ai_actions
     ORDER BY created_at ASC`
  );
}

export async function markQueuedAiActionAttempt(
  actionId: string,
  error: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE queued_ai_actions
     SET attempts = attempts + 1, last_error = ?
     WHERE id = ?`,
    [error, actionId]
  );
}

export async function deleteQueuedAiAction(actionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM queued_ai_actions WHERE id = ?', [actionId]);
}

export async function getRecipeAdjustmentById(
  id: string
): Promise<RecipeAdjustment | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RecipeAdjustmentRow>(
    'SELECT * FROM recipe_adjustments WHERE id = ?',
    [id]
  );
  return row ? mapRecipeAdjustment(row) : null;
}

export async function listPendingRecipeAdjustments(
  recipeId: string
): Promise<RecipeAdjustment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RecipeAdjustmentRow>(
    `SELECT * FROM recipe_adjustments
     WHERE recipe_id = ? AND status = 'pending'
     ORDER BY created_at DESC`,
    [recipeId]
  );
  return rows.map(mapRecipeAdjustment);
}

export async function ignoreRecipeAdjustment(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recipe_adjustments
     SET status = 'ignored'
     WHERE id = ? AND status = 'pending'`,
    [id]
  );
}

function applySuggestionToDraft(
  draft: Omit<Recipe, 'cookLogs'>,
  suggestion: RecipeAdjustmentSuggestion
): void {
  if (suggestion.type === 'ingredient_quantity') {
    draft.ingredients = draft.ingredients.map((ing) =>
      ing.id === suggestion.ingredientId
        ? { ...ing, quantity: suggestion.nextQuantity }
        : ing
    );
    return;
  }
  if (suggestion.type === 'ingredient_amount_mode') {
    draft.ingredients = draft.ingredients.map((ing) => {
      if (ing.id !== suggestion.ingredientId) return ing;
      if (suggestion.nextAmountMode === 'to_taste') {
        return {
          ...ing,
          amountMode: 'to_taste',
          quantity: 0,
          unit: null,
          scalable: false,
          isSectionHeading: false,
        };
      }
      return {
        ...ing,
        amountMode: 'exact',
        scalable: suggestion.nextScalable,
        isSectionHeading: false,
      };
    });
    return;
  }
  draft.steps = draft.steps.map((step) =>
    step.id === suggestion.stepId
      ? { ...step, instruction: suggestion.nextInstruction }
      : step
  );
}

export async function applyRecipeAdjustment(args: {
  adjustmentId: string;
  selectedSuggestionIds: string[];
}): Promise<boolean> {
  const adjustment = await getRecipeAdjustmentById(args.adjustmentId);
  if (!adjustment || adjustment.status !== 'pending') return false;
  const recipe = await getRecipeById(adjustment.recipeId);
  if (!recipe) return false;
  const selected = adjustment.suggestions.filter((suggestion) =>
    args.selectedSuggestionIds.includes(suggestion.id)
  );

  if (selected.length === 0) {
    await ignoreRecipeAdjustment(adjustment.id);
    return true;
  }

  const { cookLogs: _cookLogs, ...draft } = recipe;
  for (const suggestion of selected) {
    applySuggestionToDraft(draft, suggestion);
  }
  await saveRecipe(draft);
  const now = new Date().toISOString();
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recipe_adjustments
     SET status = 'applied', applied_at = ?
     WHERE id = ? AND status = 'pending'`,
    [now, adjustment.id]
  );
  return true;
}

export async function listRecipeVersions(recipeId: string): Promise<RecipeVersion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RecipeVersionRow>(
    `SELECT * FROM recipe_versions
     WHERE recipe_id = ?
     ORDER BY created_at DESC`,
    [recipeId]
  );
  return rows.map(mapRecipeVersion);
}

export async function restoreRecipeVersion(versionId: string): Promise<boolean> {
  const db = await getDatabase();
  const version = await db.getFirstAsync<RecipeVersionRow>(
    'SELECT * FROM recipe_versions WHERE id = ?',
    [versionId]
  );
  if (!version) return false;
  let parsed: Omit<Recipe, 'cookLogs'>;
  try {
    parsed = JSON.parse(version.snapshot_json) as Omit<Recipe, 'cookLogs'>;
  } catch {
    return false;
  }
  await saveRecipe({ ...parsed, id: version.recipe_id });
  return true;
}

export async function deleteCookLog(id: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    recipe_id: string;
    photo_uri: string | null;
  }>('SELECT recipe_id, photo_uri FROM cook_logs WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM cook_logs WHERE id = ?', [id]);
  // The photo file is deliberately left on disk: deleting it here made undo
  // restore a row pointing at nothing. Storage cleanup reclaims it later.
  if (row) {
    await db.runAsync(
      'UPDATE recipes SET updated_at = ? WHERE id = ?',
      [new Date().toISOString(), row.recipe_id]
    );
  }
}

export async function deleteCookLogWithUndoData(
  id: string
): Promise<CookLog | null> {
  const info = await getCookLogById(id);
  if (!info) return null;
  await deleteCookLog(id);
  return info.log;
}

export async function restoreDeletedCookLog(log: CookLog): Promise<void> {
  // Undo restores the log exactly as it was; it should not also re-clear the
  // recipe's want-to-cook flag as a side effect.
  await addCookLog(log, { clearWantToCook: false });
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDatabase();
  const photos = await db.getAllAsync<{ photo_uri: string | null }>(
    'SELECT photo_uri FROM cook_logs WHERE recipe_id = ?',
    [id]
  );
  const main = await db.getFirstAsync<{ main_image_uri: string | null }>(
    'SELECT main_image_uri FROM recipes WHERE id = ?',
    [id]
  );
  await db.runAsync('DELETE FROM recipes WHERE id = ?', [id]);
  await deleteOrphanTags(db);
  for (const row of photos) {
    await deleteUriIfUnreferenced(db, row.photo_uri);
  }
  await deleteUriIfUnreferenced(db, main?.main_image_uri);
}

export async function setRecipeFlags(
  recipeId: string,
  flags: { isFavorite?: boolean; wantToCook?: boolean }
): Promise<void> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<{
    is_favorite: number;
    want_to_cook: number;
  }>('SELECT is_favorite, want_to_cook FROM recipes WHERE id = ?', [recipeId]);
  if (!current) return;

  const nextFavorite =
    flags.isFavorite === undefined ? current.is_favorite : flags.isFavorite ? 1 : 0;
  const nextWant =
    flags.wantToCook === undefined ? current.want_to_cook : flags.wantToCook ? 1 : 0;

  await db.runAsync(
    `UPDATE recipes
     SET is_favorite = ?, want_to_cook = ?, updated_at = ?
     WHERE id = ?`,
    [nextFavorite, nextWant, new Date().toISOString(), recipeId]
  );
}

export async function setRecipeTags(recipeId: string, tags: string[]): Promise<void> {
  const db = await getDatabase();
  const unique = Array.from(
    new Map(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => [tag.toLowerCase(), tag] as const)
    ).values()
  );

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM recipe_tags WHERE recipe_id = ?', [recipeId]);
    const tagIds = await ensureTagIds(txn, unique);
    for (const tagId of tagIds) {
      await txn.runAsync(
        'INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
        [recipeId, tagId]
      );
    }
    await txn.runAsync('UPDATE recipes SET updated_at = ? WHERE id = ?', [
      new Date().toISOString(),
      recipeId,
    ]);
    await deleteOrphanTags(txn);
  });
}

export async function setRecipeArchived(recipeId: string, archived: boolean): Promise<void> {
  const db = await getDatabase();
  const snapshot = await buildRecipeVersionSnapshot(
    recipeId,
    archived ? 'Before archive' : 'Before unarchive'
  );
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (snapshot) {
      await writeRecipeVersionSnapshot(txn, snapshot);
    }
    await txn.runAsync(
      `UPDATE recipes
       SET is_archived = ?, updated_at = ?
       WHERE id = ?`,
      [archived ? 1 : 0, new Date().toISOString(), recipeId]
    );
  });
}

export async function getRecipeServingsOverride(
  recipeId: string
): Promise<number | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ last_servings: number | null }>(
    'SELECT last_servings FROM recipes WHERE id = ?',
    [recipeId]
  );
  if (!row || row.last_servings === null || !Number.isFinite(row.last_servings)) {
    return undefined;
  }
  return row.last_servings;
}

export async function setRecipeServingsOverride(
  recipeId: string,
  servings: number
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recipes
     SET last_servings = ?, updated_at = ?
     WHERE id = ?`,
    [servings, new Date().toISOString(), recipeId]
  );
}

export async function setRecipeMainImage(
  recipeId: string,
  mainImageUri?: string
): Promise<void> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<{ main_image_uri: string | null }>(
    'SELECT main_image_uri FROM recipes WHERE id = ?',
    [recipeId]
  );
  if (!current) return;
  const previous = current.main_image_uri;
  await db.runAsync(
    `UPDATE recipes
     SET main_image_uri = ?, updated_at = ?
     WHERE id = ?`,
    [mainImageUri ?? null, new Date().toISOString(), recipeId]
  );
  if (previous && previous !== mainImageUri) {
    await deleteUriIfUnreferenced(db, previous);
  }
}

export async function setRecipeMainImageFromCookLog(
  recipeId: string,
  cookLogId: string
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ photo_uri: string | null }>(
    'SELECT photo_uri FROM cook_logs WHERE id = ? AND recipe_id = ?',
    [cookLogId, recipeId]
  );
  if (!row?.photo_uri) return false;
  await setRecipeMainImage(recipeId, row.photo_uri);
  return true;
}

export async function cleanupUnusedMediaFiles(): Promise<{
  deletedCount: number;
}> {
  const db = await getDatabase();
  const recipeUris = await db.getAllAsync<{ uri: string | null }>(
    'SELECT main_image_uri as uri FROM recipes WHERE main_image_uri IS NOT NULL'
  );
  const cookUris = await db.getAllAsync<{ uri: string | null }>(
    'SELECT photo_uri as uri FROM cook_logs WHERE photo_uri IS NOT NULL'
  );
  const active = new Set<string>();
  for (const row of [...recipeUris, ...cookUris]) {
    if (row.uri) active.add(row.uri);
  }

  const root = FileSystem.documentDirectory;
  if (!root) return { deletedCount: 0 };
  const candidateDirs = [`${root}cook-photos`, `${root}recipe-photos`];
  let deletedCount = 0;
  for (const dir of candidateDirs) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists || !info.isDirectory) continue;
    const names = await FileSystem.readDirectoryAsync(dir);
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    for (const name of names) {
      const uri = `${prefix}${name}`;
      if (active.has(uri)) continue;
      try {
        await FileSystem.deleteAsync(uri);
        deletedCount += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return { deletedCount };
}

export async function getCookLogById(
  id: string
): Promise<{ log: CookLog; recipeTitle: string; recipeId: string } | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    recipe_id: string;
    cooked_at: string;
    photo_uri: string | null;
    notes: string | null;
    rating: number | null;
    created_at: string;
    recipe_title: string;
  }>(
    `SELECT c.*, r.title as recipe_title
     FROM cook_logs c
     JOIN recipes r ON r.id = c.recipe_id
     WHERE c.id = ?`,
    [id]
  );
  if (!row) return null;
  return {
    recipeId: row.recipe_id,
    recipeTitle: row.recipe_title,
    log: {
      id: row.id,
      recipeId: row.recipe_id,
      cookedAt: row.cooked_at,
      photoUri: row.photo_uri ?? undefined,
      notes: row.notes ?? undefined,
      rating: row.rating ?? undefined,
      createdAt: row.created_at,
    },
  };
}

export async function createManualRecipeDraft(): Promise<Omit<Recipe, 'cookLogs'>> {
  const id = newId();
  const now = new Date().toISOString();
  return {
    id,
    title: '',
    sourceUrl: '',
    sourceType: 'manual',
    mainImageUri: undefined,
    baseServings: 4,
    isFavorite: false,
    wantToCook: true,
    isArchived: false,
    ingredients: [],
    steps: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

export type { RecipeListItem } from '@/types/recipe';
