import {
  Button,
  Card,
  Chip,
  IconButton,
  ImageScrim,
  ModalCard,
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
import { elevation, radius, space } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
const FAB_SIZE = 56;

const QUICK_FILTERS: { label: string; filter: LibraryFilter }[] = [
  { label: 'Cooked', filter: { type: 'recently_cooked' } },
  { label: 'Favorites', filter: { type: 'favorite' } },
  { label: 'Want to cook', filter: { type: 'want_to_cook' } },
  { label: 'Never cooked', filter: { type: 'never_cooked' } },
  { label: 'Archived', filter: { type: 'archived' } },
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

  const renderCard = useCallback(
    ({ item }: { item: RecipeListItem }) => (
      <RecipeCard item={item} grid={grid} colors={colors} onPress={openRecipe} />
    ),
    [grid, colors, openRecipe]
  );

  // Memoised so the FlatList is not handed a fresh style object — and forced to
  // re-measure its content — on every keystroke.
  const listContentStyle = useMemo(
    () => ({
      paddingHorizontal: grid ? 0 : GUTTER,
      paddingBottom: insets.bottom + FAB_SIZE + space.xxxl,
    }),
    [grid, insets.bottom]
  );

  const hasActiveSearchOrFilter = query.trim().length > 0 || filter.type !== 'none';

  if (!onboardingChecked) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top + space.sm,
      }}
    >
      <View style={{ paddingHorizontal: GUTTER, gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="display" style={{ flex: 1 }}>
            Mise en
          </Text>
          <IconButton
            icon="swap-vertical-outline"
            accessibilityLabel="Sort recipes"
            accessibilityHint="Opens sort options"
            onPress={() => setSortMenu(true)}
          />
          <IconButton
            icon={grid ? 'grid-outline' : 'list-outline'}
            accessibilityLabel={grid ? 'Switch to list view' : 'Switch to grid view'}
            onPress={() => setGrid((g) => !g)}
          />
          <IconButton
            icon="settings-outline"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
          />
        </View>

        <TextField
          accessibilityLabel="Search recipes"
          accessibilityHint="Supports filters such as has:chicken, no:nuts, is:favorite and mins<30"
          icon="search"
          placeholder="Search (e.g. has:chicken no:nuts mins<30)"
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
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingVertical: space.md,
          gap: space.sm,
          alignItems: 'center',
        }}
      >
        {QUICK_FILTERS.map((f) => (
          <Chip
            key={f.filter.type}
            label={f.label}
            active={isSameFilter(filter, f.filter)}
            onPress={() => toggleFilter(f.filter)}
          />
        ))}
        <Chip
          label="More"
          icon="options-outline"
          accessibilityLabel="More filters"
          accessibilityHint="Opens tag and cuisine filters"
          active={filter.type === 'tag' || filter.type === 'cuisine'}
          onPress={() => setFilterMenu(true)}
        />
      </ScrollView>

      <FlatList
        key={grid ? 'grid' : 'list'}
        data={items}
        numColumns={grid ? 2 : 1}
        keyExtractor={(it) => it.id}
        style={{ flex: 1 }}
        columnWrapperStyle={grid ? { gap: CARD_GAP, paddingHorizontal: GUTTER } : undefined}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
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
        }
        renderItem={renderCard}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add recipe"
        onPress={() => router.push('/import')}
        android_ripple={ripple(colors.rippleOnFill, true)}
        style={({ pressed }) => [
          {
            position: 'absolute',
            right: GUTTER + space.xs,
            bottom: insets.bottom + space.xl,
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: radius.pill,
            backgroundColor: colors.primaryFill,
            alignItems: 'center',
            justifyContent: 'center',
            ...elevation(3, resolved),
          },
          pressedStyle(pressed, 0.9),
        ]}
      >
        <Ionicons name="add" size={28} color={colors.onPrimaryFill} />
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
                    minHeight: 48,
                    paddingHorizontal: space.md,
                    borderRadius: radius.sm,
                    backgroundColor: selected ? colors.primarySoft : 'transparent',
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
              label="Favorites"
              active={filter.type === 'favorite'}
              onPress={() => toggleFilter({ type: 'favorite' })}
            />
            <Chip
              label="Never cooked"
              active={filter.type === 'never_cooked'}
              onPress={() => toggleFilter({ type: 'never_cooked' })}
            />
            <Chip
              label="Want to cook"
              active={filter.type === 'want_to_cook'}
              onPress={() => toggleFilter({ type: 'want_to_cook' })}
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

/**
 * Memoised so a keystroke in the search field re-renders the list shell
 * without re-rendering every visible card.
 */
const RecipeCard = memo(function RecipeCard({
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
    <Card
      level={1}
      padded={false}
      onPress={() => onPress(item.id)}
      accessibilityLabel={describeRecipeCard(item)}
      accessibilityHint="Opens the recipe"
      style={{ flex: grid ? 0.5 : 1, marginBottom: CARD_GAP }}
    >
      {/* `aspectRatio` rather than a fixed height: a hard 170 stretched the
          photo on wide screens and at large system font scales. */}
      <View
        style={{
          aspectRatio: grid ? 1 : 16 / 10,
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

        <ImageScrim height={grid ? 84 : 104} />

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: space.md,
            paddingBottom: space.md,
          }}
        >
          <Text variant="subheading" tone="onImage" numberOfLines={2}>
            {item.title || 'Untitled'}
          </Text>
        </View>

        {item.isFavorite || item.wantToCook ? (
          <View
            style={{
              position: 'absolute',
              right: space.sm,
              top: space.sm,
              flexDirection: 'row',
              gap: space.xs,
            }}
          >
            {item.isFavorite ? (
              <PhotoBadge icon="star" color={colors.star} bg={colors.imageChrome} />
            ) : null}
            {item.wantToCook ? (
              <PhotoBadge icon="flame" color={colors.flame} bg={colors.imageChrome} />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {item.cuisine ? `${item.cuisine} · ` : ''}
          {item.cookCount === 1 ? '1 cook' : `${item.cookCount} cooks`}
        </Text>
      </View>
    </Card>
  );
});

/** Status marker floating on a recipe photo. */
function PhotoBadge({
  icon,
  color,
  bg,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}) {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: radius.pill,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={14} color={color} />
    </View>
  );
}
