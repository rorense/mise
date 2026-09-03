import type * as SQLite from 'expo-sqlite';

function unsupportedError(): Error {
  return new Error(
    'SQLite is not configured for web in this project. Use Android or iOS builds.'
  );
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  return Promise.reject(unsupportedError());
}
