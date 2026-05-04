import {
  extractStepTimerPresets,
  formatTimerRemaining,
} from '@/lib/stepTimers';

describe('extractStepTimerPresets', () => {
  it('extracts hour/minute/second timer presets', () => {
    const presets = extractStepTimerPresets(
      'Rest for 1 hour, then bake 30 min and cool 45 seconds.'
    );
    expect(presets.map((p) => p.seconds)).toEqual([3600, 1800, 45]);
    expect(presets.map((p) => p.label)).toEqual(['1h', '30m', '45s']);
  });

  it('deduplicates equal durations and limits to 3', () => {
    const presets = extractStepTimerPresets(
      'Cook 10 min, rest 10 mins, then steam 5 min, hold 2 min, finish 1 min.'
    );
    expect(presets).toHaveLength(3);
    expect(presets.map((p) => p.seconds)).toEqual([600, 300, 120]);
  });
});

describe('formatTimerRemaining', () => {
  it('formats minute:second countdown', () => {
    expect(formatTimerRemaining(90)).toBe('1:30');
    expect(formatTimerRemaining(5)).toBe('0:05');
  });

  it('formats hour:minute:second countdown', () => {
    expect(formatTimerRemaining(3665)).toBe('1:01:05');
  });
});
