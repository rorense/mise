import { resolveRecipeHeroImage } from '@/domain/recipeImages';

describe('resolveRecipeHeroImage', () => {
  it('prefers main image when present', () => {
    expect(resolveRecipeHeroImage('main.jpg', 'cook.jpg')).toBe('main.jpg');
  });

  it('falls back to latest cook image when no main image', () => {
    expect(resolveRecipeHeroImage(undefined, 'cook.jpg')).toBe('cook.jpg');
  });

  it('returns undefined when neither exists', () => {
    expect(resolveRecipeHeroImage(undefined, undefined)).toBeUndefined();
  });
});
