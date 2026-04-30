export function normalizeServings(value: number): number {
  return Math.min(12, Math.max(1, Math.round(value)));
}

export function shouldCommitSliderTick(
  lastCommitAtMs: number,
  nowMs: number,
  minIntervalMs = 80
): boolean {
  return nowMs - lastCommitAtMs >= minIntervalMs;
}
