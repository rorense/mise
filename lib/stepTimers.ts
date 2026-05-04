export type StepTimerPreset = {
  key: string;
  label: string;
  seconds: number;
};

export function extractStepTimerPresets(instruction: string): StepTimerPreset[] {
  const lower = instruction.toLowerCase();
  const presets: StepTimerPreset[] = [];
  const seen = new Set<number>();
  for (const match of lower.matchAll(/(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/g)) {
    const raw = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const seconds = unit.startsWith('h')
      ? raw * 3600
      : unit.startsWith('m')
        ? raw * 60
        : raw;
    if (seen.has(seconds)) continue;
    seen.add(seconds);
    presets.push({
      key: `${seconds}-${presets.length}`,
      label: unit.startsWith('h')
        ? `${raw}h`
        : unit.startsWith('m')
          ? `${raw}m`
          : `${raw}s`,
      seconds,
    });
  }
  return presets.slice(0, 3);
}

export function formatTimerRemaining(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
