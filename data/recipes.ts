import * as FileSystem from 'expo-file-system';
import { getDatabase } from '@/db/client';
import { newId } from '@/lib/id';
import type {
  CookLog,
  Ingredient,
  Recipe,
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

function mapIngredient(r: IngredientRow): Ingredient {
  return {
    id: r.id,
    quantity: r.quantity,
    unit: r.unit,
    name: r.name,
    notes: r.notes ?? undefined,
    scalable: r.scalable !== 0,
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

async function loadTagsForRecipe(
  db: SQLite.SQLiteDatabase,
  recipeId: string
): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT t.name as name FROM recipe_tags rt
     JOIN tags t ON t.id = rt.tag_id
     WHERE rt.recipe_id = ?
     ORDER BY t.name COLLATE NOCASE`,
    recipeId
  );
  return rows.map((r) => r.name);
}

export async function getRecipeById(id: string): Promise<Recipe | null> {
  const db = await getDatabase();
  const r = await db.getFirstAsync<RecipeRow>(
    'SELECT * FROM recipes WHERE id = ?',
    id
  );
  if (!r) return null;
  const ingRows = await db.getAllAsync<IngredientRow>(
    'SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY sort_order, id',
    id
  );
  const stepRows = await db.getAllAsync<StepRow>(
    'SELECT * FROM steps WHERE recipe_id = ? ORDER BY order_idx, id',
    id
  );
  const logs = await db.getAllAsync<CookLogRow>(
    'SELECT * FROM cook_logs WHERE recipe_id = ? ORDER BY cooked_at DESC, created_at DESC',
    id
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

export async function listRecipeCards(
  query: string,
  filter: LibraryFilter,
  sort: LibrarySort
): Promise<RecipeListItem[]> {
  const db = await getDatabase();
  const q = `%${query.trim().toLowerCase()}%`;
  const hasQuery = query.trim().length > 0;

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

  if (filter.type !== 'archived') {
    sql += ` AND r.is_archived = 0`;
  } else {
    sql += ` AND r.is_archived = 1`;
  }

  if (hasQuery) {
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
  }>(sql, ...params);

  const items: RecipeListItem[] = [];
  for (const row of rows) {
    const tags = await loadTagsForRecipe(db, row.id);
    items.push({
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
      tags,
    });
  }
  return items;
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
      name
    );
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const id = newId();
    await db.runAsync('INSERT INTO tags (id, name) VALUES (?, ?)', id, name);
    ids.push(id);
  }
  return ids;
}

export async function saveRecipe(recipe: Omit<Recipe, 'cookLogs'>): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await db.runAsync(
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
      now
    );

    await db.runAsync('DELETE FROM ingredients WHERE recipe_id = ?', recipe.id);
    await db.runAsync('DELETE FROM steps WHERE recipe_id = ?', recipe.id);
    await db.runAsync('DELETE FROM recipe_tags WHERE recipe_id = ?', recipe.id);

    for (const ing of recipe.ingredients) {
      await db.runAsync(
        `INSERT INTO ingredients (id, recipe_id, quantity, unit, name, notes, scalable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ing.id,
        recipe.id,
        ing.quantity,
        ing.unit,
        ing.name,
        ing.notes ?? null,
        ing.scalable ? 1 : 0,
        ing.sortOrder
      );
    }

    for (const st of recipe.steps) {
      await db.runAsync(
        `INSERT INTO steps (id, recipe_id, order_idx, instruction, scalable_quantities_json)
         VALUES (?, ?, ?, ?, ?)`,
        st.id,
        recipe.id,
        st.order,
        st.instruction,
        JSON.stringify(st.scalableQuantities ?? [])
      );
    }

    const tagIds = await ensureTagIds(db, recipe.tags);
    for (const tid of tagIds) {
      await db.runAsync(
        'INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
        recipe.id,
        tid
      );
    }

    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

export async function addCookLog(entry: CookLog): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO cook_logs (id, recipe_id, cooked_at, photo_uri, notes, rating, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.recipeId,
    entry.cookedAt,
    entry.photoUri ?? null,
    entry.notes ?? null,
    entry.rating ?? null,
    entry.createdAt
  );
  await db.runAsync(
    'UPDATE recipes SET updated_at = ?, want_to_cook = 0 WHERE id = ?',
    new Date().toISOString(),
    entry.recipeId
  );
}

export async function deleteCookLog(id: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    recipe_id: string;
    photo_uri: string | null;
  }>('SELECT recipe_id, photo_uri FROM cook_logs WHERE id = ?', id);
  if (row?.photo_uri) {
    try {
      const info = await FileSystem.getInfoAsync(row.photo_uri);
      if (info.exists) {
        await FileSystem.deleteAsync(row.photo_uri);
      }
    } catch {
      /* ignore */
    }
  }
  await db.runAsync('DELETE FROM cook_logs WHERE id = ?', id);
  if (row) {
    await db.runAsync(
      'UPDATE recipes SET updated_at = ? WHERE id = ?',
      new Date().toISOString(),
      row.recipe_id
    );
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDatabase();
  const photos = await db.getAllAsync<{ photo_uri: string | null }>(
    'SELECT photo_uri FROM cook_logs WHERE recipe_id = ?',
    id
  );
  const main = await db.getFirstAsync<{ main_image_uri: string | null }>(
    'SELECT main_image_uri FROM recipes WHERE id = ?',
    id
  );
  for (const row of photos) {
    if (!row.photo_uri) continue;
    try {
      const info = await FileSystem.getInfoAsync(row.photo_uri);
      if (info.exists) {
        await FileSystem.deleteAsync(row.photo_uri);
      }
    } catch {
      /* ignore */
    }
  }
  if (main?.main_image_uri) {
    try {
      const info = await FileSystem.getInfoAsync(main.main_image_uri);
      if (info.exists) {
        await FileSystem.deleteAsync(main.main_image_uri);
      }
    } catch {
      /* ignore */
    }
  }
  await db.runAsync('DELETE FROM recipes WHERE id = ?', id);
}

export async function setRecipeFlags(
  recipeId: string,
  flags: { isFavorite?: boolean; wantToCook?: boolean }
): Promise<void> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<{
    is_favorite: number;
    want_to_cook: number;
  }>('SELECT is_favorite, want_to_cook FROM recipes WHERE id = ?', recipeId);
  if (!current) return;

  const nextFavorite =
    flags.isFavorite === undefined ? current.is_favorite : flags.isFavorite ? 1 : 0;
  const nextWant =
    flags.wantToCook === undefined ? current.want_to_cook : flags.wantToCook ? 1 : 0;

  await db.runAsync(
    `UPDATE recipes
     SET is_favorite = ?, want_to_cook = ?, updated_at = ?
     WHERE id = ?`,
    nextFavorite,
    nextWant,
    new Date().toISOString(),
    recipeId
  );
}

export async function setRecipeArchived(recipeId: string, archived: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recipes
     SET is_archived = ?, updated_at = ?
     WHERE id = ?`,
    archived ? 1 : 0,
    new Date().toISOString(),
    recipeId
  );
}

export async function getRecipeServingsOverride(
  recipeId: string
): Promise<number | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ last_servings: number | null }>(
    'SELECT last_servings FROM recipes WHERE id = ?',
    recipeId
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
    servings,
    new Date().toISOString(),
    recipeId
  );
}

export async function setRecipeMainImage(
  recipeId: string,
  mainImageUri?: string
): Promise<void> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<{ main_image_uri: string | null }>(
    'SELECT main_image_uri FROM recipes WHERE id = ?',
    recipeId
  );
  if (!current) return;
  const previous = current.main_image_uri;
  await db.runAsync(
    `UPDATE recipes
     SET main_image_uri = ?, updated_at = ?
     WHERE id = ?`,
    mainImageUri ?? null,
    new Date().toISOString(),
    recipeId
  );
  if (previous && previous !== mainImageUri) {
    try {
      const info = await FileSystem.getInfoAsync(previous);
      if (info.exists) {
        await FileSystem.deleteAsync(previous);
      }
    } catch {
      /* ignore */
    }
  }
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
    id
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

export async function bulkEditRecipeTags(args: {
  recipeIds: string[];
  addTags: string[];
  removeTags: string[];
}): Promise<void> {
  const db = await getDatabase();
  if (args.recipeIds.length === 0) return;
  const addTags = args.addTags.map((t) => t.trim()).filter(Boolean);
  const removeTags = new Set(args.removeTags.map((t) => t.trim().toLowerCase()).filter(Boolean));

  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const addTagIds = await ensureTagIds(db, addTags);
    for (const recipeId of args.recipeIds) {
      if (addTagIds.length > 0) {
        for (const tagId of addTagIds) {
          await db.runAsync(
            'INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)',
            recipeId,
            tagId
          );
        }
      }
      if (removeTags.size > 0) {
        const existing = await db.getAllAsync<{ tag_id: string; name: string }>(
          `SELECT rt.tag_id as tag_id, t.name as name
           FROM recipe_tags rt
           JOIN tags t ON t.id = rt.tag_id
           WHERE rt.recipe_id = ?`,
          recipeId
        );
        for (const tag of existing) {
          if (removeTags.has(tag.name.toLowerCase())) {
            await db.runAsync(
              'DELETE FROM recipe_tags WHERE recipe_id = ? AND tag_id = ?',
              recipeId,
              tag.tag_id
            );
          }
        }
      }
      await db.runAsync('UPDATE recipes SET updated_at = ? WHERE id = ?', new Date().toISOString(), recipeId);
    }
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
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
