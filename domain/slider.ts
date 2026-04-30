export function normalizeServings(value: number, maxServings = 12): number {
  const safeMax = Math.max(1, Math.round(maxServings));
  return Math.min(safeMax, Math.max(1, Math.round(value)));
}

export function shouldCommitSliderTick(
  lastCommitAtMs: number,
  nowMs: number,
  minIntervalMs = 80
): boolean {
  return nowMs - lastCommitAtMs >= minIntervalMs;
}
