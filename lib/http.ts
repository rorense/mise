/**
 * `fetch` with a deadline. React Native's fetch has no default timeout, so a
 * stalled connection leaves an import or chat spinner running forever with no
 * way back except killing the app.
 */

/** Model calls are slow by nature; give them real headroom. */
export const LLM_TIMEOUT_MS = 60_000;

/** Plain HTTP fetches should fail fast. */
export const WEB_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s. Check your connection and try again.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
