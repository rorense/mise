/**
 * `fetch` with a deadline. React Native's fetch has no default timeout, so a
 * stalled connection leaves an import or chat spinner running forever with no
 * way back except killing the app.
 */

/** Model calls are slow by nature; give them real headroom. */
export const LLM_TIMEOUT_MS = 60_000;

/**
 * Vision calls upload megabytes of image and give the model far more to reason
 * about, so they routinely outrun the text deadline. Aborting a scan at 60s
 * throws away work the user already paid for.
 */
export const VISION_TIMEOUT_MS = 120_000;

/**
 * Recipe extraction runs at raised reasoning effort over a whole page of text,
 * and is followed by an audit pass over the same material. Both routinely take
 * longer than a chat reply, and timing one out means the cook gets nothing.
 */
export const EXTRACTION_TIMEOUT_MS = 120_000;

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
