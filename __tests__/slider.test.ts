import { normalizeServings, shouldCommitSliderTick } from '@/domain/slider';

describe('normalizeServings', () => {
  it('clamps and rounds to valid serving range', () => {
    expect(normalizeServings(0)).toBe(1);
    expect(normalizeServings(12.9)).toBe(12);
    expect(normalizeServings(3.4)).toBe(3);
    expect(normalizeServings(3.6)).toBe(4);
  });
});

describe('shouldCommitSliderTick', () => {
  it('commits only when interval has elapsed', () => {
    expect(shouldCommitSliderTick(1000, 1050, 80)).toBe(false);
    expect(shouldCommitSliderTick(1000, 1080, 80)).toBe(true);
  });
});
