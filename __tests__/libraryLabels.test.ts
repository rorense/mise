import { formatFilterLabel, formatSortLabel } from '@/domain/libraryLabels';

describe('formatSortLabel', () => {
  it('formats known sort values for compact chips', () => {
    expect(formatSortLabel('recent_added')).toBe('Sort: recently added');
    expect(formatSortLabel('recent_cooked')).toBe('Sort: recently cooked');
    expect(formatSortLabel('most_cooked')).toBe('Sort: most cooked');
    expect(formatSortLabel('title')).toBe('Sort: A-Z');
  });
});

describe('formatFilterLabel', () => {
  it('formats filter labels consistently', () => {
    expect(formatFilterLabel({ type: 'none' })).toBe('All');
    expect(formatFilterLabel({ type: 'recently_cooked' })).toBe('Cooked');
    expect(formatFilterLabel({ type: 'never_cooked' })).toBe('Never cooked');
    expect(formatFilterLabel({ type: 'favorite' })).toBe('Favorites');
    expect(formatFilterLabel({ type: 'want_to_cook' })).toBe('Want to cook');
    expect(formatFilterLabel({ type: 'tag', tag: 'dinner' })).toBe('Tag: dinner');
    expect(formatFilterLabel({ type: 'cuisine', cuisine: 'Italian' })).toBe(
      'Cuisine: Italian'
    );
  });
});
