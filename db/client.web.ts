type UnsupportedWebDatabase = {
  readonly __unsupported: 'sqlite-web-not-configured';
};

function unsupportedError(): Error {
  return new Error(
    'SQLite is not configured for web in this project. Use Android or iOS builds.'
  );
}

export function getDatabase(): Promise<UnsupportedWebDatabase> {
  return Promise.reject(unsupportedError());
}

export async function resetDatabaseForTests(): Promise<void> {
  return Promise.resolve();
}
