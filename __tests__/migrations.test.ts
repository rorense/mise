import type * as SQLite from 'expo-sqlite';
import { runMigrations } from '@/db/migrate';

/**
 * Drives the real migration runner against a fake database.
 *
 * The fake's one job is fidelity on a single point: `ADD COLUMN` on a column
 * that already exists throws the same "duplicate column name" SQLite does. That
 * is the failure the version-6 and version-9 guards exist to prevent, and it
 * only ever reproduces on a clean install — never on a device that already has
 * the database, which is every device the app is developed on.
 */

/** Columns a migration adds that migration 1's CREATE TABLE also declares. */
const TRACKED = ['amount_mode', 'is_section_heading'];

function createFakeDb(options: { startVersion?: number; columns?: string[] } = {}) {
  const state = {
    /** Columns currently on `ingredients`. */
    columns: new Set(options.columns ?? []),
    /** Versions written to schema_migrations, in order. */
    applied: [] as number[],
    /** Every SQL string handed to execAsync. */
    executed: [] as string[],
  };
  let maxVersion = options.startVersion ?? 0;

  const db = {
    async execAsync(sql: string): Promise<void> {
      state.executed.push(sql);

      for (const match of sql.matchAll(/ADD COLUMN (\w+)/g)) {
        const column = match[1];
        if (state.columns.has(column)) {
          throw new Error(`duplicate column name: ${column}`);
        }
        state.columns.add(column);
      }

      if (/CREATE TABLE IF NOT EXISTS ingredients/.test(sql)) {
        for (const column of TRACKED) {
          if (new RegExp(`\\b${column}\\s+(INTEGER|TEXT)`).test(sql)) {
            state.columns.add(column);
          }
        }
      }
    },
    async getFirstAsync<T>(): Promise<T> {
      return { v: maxVersion === 0 ? null : maxVersion } as T;
    },
    async getAllAsync<T>(sql: string): Promise<T[]> {
      if (!/PRAGMA table_info/.test(sql)) return [];
      return [...state.columns].map((name) => ({ name })) as T[];
    },
    async runAsync(sql: string, params: unknown[]): Promise<void> {
      if (/INSERT INTO schema_migrations/.test(sql)) {
        const version = Number(params[0]);
        state.applied.push(version);
        maxVersion = Math.max(maxVersion, version);
      }
    },
    async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
      await fn();
    },
  };

  return { db: db as unknown as SQLite.SQLiteDatabase, state };
}

const ranAddSectionHeading = (executed: string[]) =>
  executed.some((sql) => /ADD COLUMN is_section_heading/.test(sql));

const ranAddAmountMode = (executed: string[]) =>
  executed.some((sql) => /ADD COLUMN amount_mode/.test(sql));

describe('runMigrations', () => {
  it('completes on a fresh install without a duplicate-column failure', async () => {
    const { db, state } = createFakeDb();

    await expect(runMigrations(db)).resolves.toBeUndefined();

    // Migration 1 declares is_section_heading, so migration 9 must not re-add
    // it — but must still be recorded, or it retries on every later launch.
    expect(ranAddSectionHeading(state.executed)).toBe(false);
    expect(state.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(state.columns.has('is_section_heading')).toBe(true);
  });

  it('still adds amount_mode on a fresh install, since migration 1 omits it', async () => {
    const { db, state } = createFakeDb();

    await runMigrations(db);

    expect(ranAddAmountMode(state.executed)).toBe(true);
    expect(state.columns.has('amount_mode')).toBe(true);
  });

  it('runs migration 9 for real on an install that predates the column', async () => {
    const { db, state } = createFakeDb({
      startVersion: 8,
      columns: ['amount_mode'],
    });

    await runMigrations(db);

    expect(ranAddSectionHeading(state.executed)).toBe(true);
    expect(state.columns.has('is_section_heading')).toBe(true);
    expect(state.applied).toEqual([9, 10]);
  });

  it('skips migration 6 when amount_mode is already present', async () => {
    const { db, state } = createFakeDb({
      startVersion: 5,
      columns: ['amount_mode', 'is_section_heading'],
    });

    await runMigrations(db);

    expect(ranAddAmountMode(state.executed)).toBe(false);
    expect(state.applied).toContain(6);
  });

  it('does nothing when the database is already current', async () => {
    const { db, state } = createFakeDb({
      startVersion: 10,
      columns: ['amount_mode', 'is_section_heading'],
    });

    await runMigrations(db);

    expect(state.applied).toEqual([]);
  });
});
