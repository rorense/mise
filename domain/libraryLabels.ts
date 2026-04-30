import type { LibraryFilter, LibrarySort } from '@/data/recipes';

export function formatSortLabel(sort: LibrarySort): string {
  switch (sort) {
    case 'recent_added':
      return 'Sort: recently added';
    case 'recent_cooked':
      return 'Sort: recently cooked';
    case 'most_cooked':
      return 'Sort: most cooked';
    case 'title':
      return 'Sort: A-Z';
    default:
      return 'Sort';
  }
}

export function formatFilterLabel(filter: LibraryFilter): string {
  if (filter.type === 'tag') return `Tag: ${filter.tag}`;
  if (filter.type === 'cuisine') return `Cuisine: ${filter.cuisine}`;
  if (filter.type === 'recently_cooked') return 'Cooked';
  if (filter.type === 'never_cooked') return 'Never cooked';
  return 'All';
}
