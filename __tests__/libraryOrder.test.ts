import { getLibraryOrderBy } from '@/data/recipes';

describe('getLibraryOrderBy', () => {
  it('pins favorites first for recent added', () => {
    const orderBy = getLibraryOrderBy('recent_added');
    expect(orderBy.startsWith('r.is_favorite DESC, r.want_to_cook DESC')).toBe(true);
    expect(orderBy).toContain('r.updated_at DESC');
  });

  it('pins favorites first for title sort', () => {
    const orderBy = getLibraryOrderBy('title');
    expect(orderBy.startsWith('r.is_favorite DESC, r.want_to_cook DESC')).toBe(true);
    expect(orderBy).toContain('r.title COLLATE NOCASE ASC');
  });
});
