import {
  Button,
  Chip,
  IconButton,
  ImageScrim,
  ModalCard,
  ScreenLoading,
  SegmentedControl,
  Text,
  TextField,
} from '@/components/ui';
import { pressedStyle, ripple } from '@/components/ui/press';
import {
  getAllCuisines,
  getAllTags,
  listRecipeCards,
  type LibraryFilter,
  type LibrarySort,
  type RecipeListItem,
} from '@/data/recipes';
import { drainOfflineAiQueue } from '@/lib/ai/offlineQueue';
import { getOnboarded } from '@/lib/secrets';
import type { ThemeColors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import { control, elevation, radius, space } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const options = { headerShown: false };

const SEARCH_DEBOUNCE_MS = 300;
const GUTTER = space.lg;
const CARD_GAP = space.md;
/** Tall enough for the photo to lead, short enough to keep the grid in view. */
const LEAD_HEIGHT = 216;

/** The three filters worth one tap. Everything else lives behind "More filters". */
type QuickFilter = 'none' | 'want_to_cook' | 'favorite';
const QUICK_FILTERS: { value: QuickFilter; label: string; icon?: 'flame' }[] = [
  { value: 'none', label: 'All' },
  { value: 'want_to_cook', label: 'Want to cook', icon: 'flame' },
  { value: 'favorite', label: 'Favourites' },
];

const SORT_OPTIONS: [LibrarySort, string][] = [
  ['recent_added', 'Recently added'],
  ['recent_cooked', 'Recently cooked'],
  ['most_cooked', 'Most cooked'],
  ['title', 'A-Z'],
];

/**
 * Builds the single spoken description for a recipe card. Without this a screen
 * reader would announce the card's fragments ("chicken", "2 cooks") with no
 * indication of what they belong to.
 */
function describeRecipeCard(item: RecipeListItem): string {
  const parts = [item.title || 'Untitled'];
  if (item.cuisine) parts.push(item.cuisine);
  parts.push(item.cookCount === 1 ? 'cooked once' : `cooked ${item.cookCount} times`);
  if (item.isFavorite) parts.push('favourite');
  if (item.wantToCook) parts.push('want to cook');
  return parts.join(', ');
}

function describeCooks(count: number): string {
  return count === 0 ? 'Never cooked' : `Cooked ${count}×`;
}

/** Tapping the chip for the filter already applied clears it, so identity matters. */
function isSameFilter(a: LibraryFilter, b: LibraryFilter): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'tag' && b.type === 'tag') return a.tag === b.tag;
  if (a.type === 'cuisine' && b.type === 'cuisine') return a.cuisine === b.cuisine;
  return true;
}

export default function LibraryScreen() {
  const { colors, resolved } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('recent_added');
  const [filter, setFilter] = useState<LibraryFilter>({ type: 'none' });
  const [grid, setGrid] = useState(true);
  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [sortMenu, setSortMenu] = useState(false);
  const [filterMenu, setFilterMenu] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const reloadSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await getOnboarded();
      if (cancelled) return;
      if (!done) {
        router.replace('/onboarding');
        return;
      }
      setOnboardingChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Typing updates `query` immediately so the field stays responsive, but the
  // database work is driven by `debouncedQuery` so a burst of keystrokes costs
  // one query pass instead of one per character.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const reload = useCallback(async () => {
    const seq = ++reloadSeqRef.current;
    const [t, c, rows] = await Promise.all([
      getAllTags(),
      getAllCuisines(),
      listRecipeCards(debouncedQuery, filter, sort),
    ]);
    if (seq !== reloadSeqRef.current) return;
    setTags(t);
    setCuisines(c);
    setItems(rows);
  }, [debouncedQuery, filter, sort]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  // Deliberately separate from `reload`, with no search dependencies: draining
  // the queue can send AI requests, and that must never be triggered by typing.
  useFocusEffect(
    useCallback(() => {
      void drainOfflineAiQueue();
    }, [])
  );

  const openRecipe = useCallback(
    (recipeId: string) => router.push(`/recipe/${recipeId}`),
    [router]
  );

  const toggleFilter = useCallback((next: LibraryFilter) => {
    setFilter((current) => (isSameFilter(current, next) ? { type: 'none' } : next));
  }, []);

  // The library sorts want-to-cook recipes to the top, so the first one is the
  // most likely next meal. It gets the big card while browsing; a search or a
  // narrower filter means the user is looking for something specific instead.
  const lead = useMemo(() => {
    if (debouncedQuery.trim() || (filter.type !== 'none' && filter.type !== 'want_to_cook')) {
      return null;
    }
    return items.find((it) => it.wantToCook) ?? null;
  }, [items, debouncedQuery, filter.type]);

  const gridItems = useMemo(
    () => (lead ? items.filter((it) => it.id !== lead.id) : items),
    [items, lead]
  );

  const renderCard = useCallback(
    ({ item }: { item: RecipeListItem }) => (
      <RecipeTile item={item} grid={grid} colors={colors} onPress={openRecipe} />
    ),
    [grid, colors, openRecipe]
  );

  // Memoised so the FlatList is not handed a fresh style object — and forced to
  // re-measure its content — on every keystroke.
  const listContentStyle = useMemo(
    () => ({
      paddingHorizontal: grid ? 0 : GUTTER,
      paddingBottom: insets.bottom + control.lg + space.xxxl,
    }),
    [grid, insets.bottom]
  );

  const hasActiveSearchOrFilter = query.trim().length > 0 || filter.type !== 'none';
  const quickValue: QuickFilter | 'other' =
    filter.type === 'none' || filter.type === 'want_to_cook' || filter.type === 'favorite'
      ? filter.type
      : 'other';
  const sortLabel = SORT_OPTIONS.find(([value]) => value === sort)?.[1] ?? '';

  if (!onboardingChecked) {
    return <ScreenLoading />;
  }

  const listHeader = (
    <View style={{ paddingHorizontal: grid ? GUTTER : 0, gap: space.md, marginBottom: CARD_GAP }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${sortLabel}`}
          accessibilityHint="Opens sort options"
          onPress={() => setSortMenu(true)}
          android_ripple={ripple(colors.ripple)}
          style={({ pressed }) => [
            {
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              minHeight: control.md,
              overflow: 'hidden',
            },
            pressedStyle(pressed),
          ]}
        >
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {items.length === 1 ? '1 recipe' : `${items.length} recipes`} · {sortLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </Pressable>
        <IconButton
          icon={grid ? 'list-outline' : 'grid-outline'}
          accessibilityLabel={grid ? 'Switch to list view' : 'Switch to grid view'}
          variant="ghost"
          onPress={() => setGrid((g) => !g)}
        />
      </View>
      {lead ? <LeadCard item={lead} colors={colors} onPress={openRecipe} /> : null}
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top + space.sm,
      }}
    >
      <View style={{ paddingHorizontal: GUTTER, gap: space.md, paddingBottom: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="display" style={{ flex: 1 }}>
            Mise en
          </Text>
          <IconButton
            icon="settings-outline"
            accessibilityLabel="Settings"
            size={control.md}
            onPress={() => router.push('/settings')}
          />
        </View>

        <TextField
          accessibilityLabel="Search recipes"
          accessibilityHint="Supports filters such as has:chicken, no:nuts, is:favorite and mins<30"
          icon="search"
          placeholder="Search  has:chicken  mins<30"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => setDebouncedQuery(query)}
          returnKeyType="search"
          trailing={
            query.length > 0 ? (
              <IconButton
                icon="close-circle"
                accessibilityLabel="Clear search"
                variant="ghost"
                size={28}
                iconSize={18}
                onPress={() => {
                  setQuery('');
                  setDebouncedQuery('');
                }}
              />
            ) : undefined
          }
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <SegmentedControl
            accessibilityLabel="Quick filters"
            value={quickValue}
            onChange={(value) => {
              if (value !== 'other') setFilter({ type: value });
            }}
            options={QUICK_FILTERS}
            style={{ flex: 1 }}
          />
          <IconButton
            icon="options-outline"
            accessibilityLabel="More filters"
            accessibilityHint="Opens tag, cuisine and other filters"
            accessibilityState={{ selected: quickValue === 'other' }}
            variant={quickValue === 'other' ? 'accent' : 'surface'}
            size={control.md}
            onPress={() => setFilterMenu(true)}
          />
        </View>
      </View>

      <FlatList
        key={grid ? 'grid' : 'list'}
        data={gridItems}
        numColumns={grid ? 2 : 1}
        keyExtractor={(it) => it.id}
        style={{ flex: 1 }}
        columnWrapperStyle={grid ? { gap: CARD_GAP, paddingHorizontal: GUTTER } : undefined}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={items.length > 0 ? listHeader : null}
        ListEmptyComponent={
          lead ? null : (
            <View style={{ padding: space.xxxl, alignItems: 'center', gap: space.lg }}>
              <Ionicons
                name={hasActiveSearchOrFilter ? 'search-outline' : 'restaurant-outline'}
                size={44}
                color={colors.textSecondary}
              />
              <Text variant="heading" tone="secondary" style={{ textAlign: 'center' }}>
                {hasActiveSearchOrFilter ? 'No matching recipes' : 'No recipes yet'}
              </Text>
              {hasActiveSearchOrFilter ? (
                <Button
                  label="Clear filters"
                  variant="secondary"
                  accessibilityLabel="Clear search and filters"
                  onPress={() => {
                    setQuery('');
                    setDebouncedQuery('');
                    setFilter({ type: 'none' });
                  }}
                />
              ) : (
                <Button
                  label="Add your first recipe"
                  icon="add"
                  onPress={() => router.push('/import')}
                />
              )}
            </View>
          )
        }
        renderItem={renderCard}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add recipe"
        onPress={() => router.push('/import')}
        android_ripple={ripple(colors.rippleOnFill)}
        style={({ pressed }) => [
          {
            position: 'absolute',
            right: GUTTER,
            bottom: insets.bottom + space.lg,
            height: control.lg,
            paddingLeft: space.lg,
            paddingRight: space.xl,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            borderRadius: radius.lg,
            backgroundColor: colors.primaryFill,
            overflow: 'hidden',
            ...elevation(3, resolved),
          },
          pressedStyle(pressed, 0.9),
        ]}
      >
        <Ionicons name="add" size={24} color={colors.onPrimaryFill} />
        <Text variant="button" tone="onAccent">
          Add recipe
        </Text>
      </Pressable>

      <ModalCard
        visible={sortMenu}
        onClose={() => setSortMenu(false)}
        title="Sort by"
        dismissLabel="Close sort menu"
      >
        <View>
          {SORT_OPTIONS.map(([value, label]) => {
            const selected = sort === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="menuitem"
                accessibilityLabel={`Sort by ${label}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  setSort(value);
                  setSortMenu(false);
                }}
                android_ripple={ripple(colors.ripple)}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    minHeight: control.md,
                    paddingHorizontal: space.md,
                    borderRadius: radius.md,
                    backgroundColor: selected ? colors.primarySoft : 'transparent',
                    overflow: 'hidden',
                  },
                  pressedStyle(pressed),
                ]}
              >
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={selected ? colors.onPrimarySoft : colors.textSecondary}
                />
                <Text
                  variant="body"
                  tone={selected ? 'onAccentSoft' : 'primary'}
                  style={{ flex: 1 }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ModalCard>

      <ModalCard
        visible={filterMenu}
        onClose={() => setFilterMenu(false)}
        title="More filters"
        dismissLabel="Close filters"
        footer={
          <Button
            label="Done"
            variant="ghost"
            accessibilityLabel="Done, close filters"
            onPress={() => setFilterMenu(false)}
            style={{ alignSelf: 'flex-end' }}
          />
        }
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space.sm,
              paddingBottom: space.xs,
            }}
          >
            <Chip
              label="Recently cooked"
              active={filter.type === 'recently_cooked'}
              onPress={() => toggleFilter({ type: 'recently_cooked' })}
            />
            <Chip
              label="Never cooked"
              active={filter.type === 'never_cooked'}
              onPress={() => toggleFilter({ type: 'never_cooked' })}
            />
            <Chip
              label="Archived"
              active={filter.type === 'archived'}
              onPress={() => toggleFilter({ type: 'archived' })}
            />
            {tags.map((t) => (
              <Chip
                key={`tag-${t}`}
                label={`# ${t}`}
                accessibilityLabel={`Tag ${t}`}
                active={filter.type === 'tag' && filter.tag === t}
                onPress={() => toggleFilter({ type: 'tag', tag: t })}
              />
            ))}
            {cuisines.map((c) => (
              <Chip
                key={`cuisine-${c}`}
                label={c}
                accessibilityLabel={`Cuisine ${c}`}
                active={filter.type === 'cuisine' && filter.cuisine === c}
                onPress={() => toggleFilter({ type: 'cuisine', cuisine: c })}
              />
            ))}
          </View>
        </ScrollView>
      </ModalCard>
    </View>
  );
}

/** The next want-to-cook recipe, full width with its title on the photo. */
function LeadCard({
  item,
  colors,
  onPress,
}: {
  item: RecipeListItem;
  colors: ThemeColors;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={describeRecipeCard(item)}
      accessibilityHint="Opens the recipe"
      onPress={() => onPress(item.id)}
      android_ripple={ripple(colors.ripple)}
      style={({ pressed }) => [
        {
          height: LEAD_HEIGHT,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceMuted,
        },
        pressedStyle(pressed, 0.85),
      ]}
    >
      {item.heroUri ? (
        <Image source={{ uri: item.heroUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : null}
      <ImageScrim height={LEAD_HEIGHT * 0.65} />
      <View
        style={{
          position: 'absolute',
          left: space.lg,
          right: space.lg,
          bottom: space.lg,
          gap: space.sm,
        }}
      >
        <Text variant="heading" tone="onImage" numberOfLines={2}>
          {item.title || 'Untitled'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              paddingHorizontal: space.sm,
              paddingVertical: space.xxs,
              borderRadius: radius.pill,
              backgroundColor: colors.imageChrome,
            }}
          >
            <Ionicons name="flame" size={14} color={colors.flame} />
            <Text variant="captionStrong" tone="onImage">
              Want to cook
            </Text>
          </View>
          <Text variant="caption" tone="onImage" numberOfLines={1} style={{ flex: 1 }}>
            {item.cuisine ? `${item.cuisine} · ` : ''}
            {describeCooks(item.cookCount)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Photo on top, words underneath: titles no longer fight the picture for
 * contrast. Memoised so a keystroke in the search field re-renders the list
 * shell without re-rendering every visible tile.
 */
const RecipeTile = memo(function RecipeTile({
  item,
  grid,
  colors,
  onPress,
}: {
  item: RecipeListItem;
  grid: boolean;
  colors: ThemeColors;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={describeRecipeCard(item)}
      accessibilityHint="Opens the recipe"
      onPress={() => onPress(item.id)}
      android_ripple={ripple(colors.ripple)}
      style={({ pressed }) => [
        {
          flex: grid ? 0.5 : 1,
          marginBottom: space.xl,
          borderRadius: radius.lg,
          overflow: 'hidden',
        },
        pressedStyle(pressed, 0.85),
      ]}
    >
      {/* `aspectRatio` rather than a fixed height: a hard 170 stretched the
          photo on wide screens and at large system font scales. */}
      <View
        style={{
          aspectRatio: grid ? 1 : 16 / 10,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceMuted,
        }}
      >
        {item.heroUri ? (
          <Image
            source={{ uri: item.heroUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons
              name="restaurant-outline"
              size={grid ? 36 : 44}
              color={colors.textSecondary}
            />
          </View>
        )}
      </View>

      <View style={{ paddingTop: space.sm, paddingHorizontal: space.xxs, gap: space.xxs }}>
        <Text variant="subheading" numberOfLines={2}>
          {item.wantToCook ? (
            <Ionicons name="flame" size={15} color={colors.primary} />
          ) : null}
          {item.wantToCook ? ' ' : ''}
          {item.title || 'Untitled'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {item.cuisine ? `${item.cuisine} · ` : ''}
            {describeCooks(item.cookCount)}
          </Text>
          {item.isFavorite ? <Ionicons name="star" size={13} color={colors.star} /> : null}
        </View>
      </View>
    </Pressable>
  );
});
