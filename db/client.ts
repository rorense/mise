import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrate';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    const pending = (async () => {
      const database = await SQLite.openDatabaseAsync('mise.db');
      await runMigrations(database);
      return database;
    })();
    // Never memoise a failure. A cached rejected promise would make every later
    // getDatabase() call fail for the lifetime of the process, so a single
    // transient open/migrate error would need an app restart to clear.
    pending.catch(() => {
      if (dbPromise === pending) dbPromise = null;
    });
    dbPromise = pending;
  }
  return dbPromise;
}

export async function resetDatabaseForTests(): Promise<void> {
  dbPromise = null;
  await SQLite.deleteDatabaseAsync('mise.db');
}
