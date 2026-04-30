import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrate';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('mise.db');
      await runMigrations(database);
      return database;
    })();
  }
  return dbPromise;
}

export async function resetDatabaseForTests(): Promise<void> {
  dbPromise = null;
  await SQLite.deleteDatabaseAsync('mise.db');
}
