import {
  getAllCuisines,
  getAllTags,
  listRecipeCards,
  type LibraryFilter,
  type LibrarySort,
  type RecipeListItem,
} from '@/data/recipes';
import { getOnboarded } from '@/lib/secrets';
import { useTheme } from '@/theme/ThemeContext';
import { drainOfflineAiQueue } from '@/lib/ai/offlineQueue';
import type { ThemeColors } from '@/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const options = { headerShown: false };

const SEARCH_DEBOUNCE_MS = 300;

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

export default function LibraryScreen() {
  const { colors } = useTheme();
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

  const renderCard = useCallback(
    ({ item }: { item: RecipeListItem }) => (
      <RecipeCard item={item} grid={grid} colors={colors} onPress={openRecipe} />
    ),
    [grid, colors, openRecipe]
  );


  const hasActiveSearchOrFilter =
    query.trim().length > 0 || filter.type !== 'none';

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
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 18, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text
            style={{
              flex: 1,
              fontFamily: 'Lora_700Bold',
              fontSize: 30,
              color: colors.textPrimary,
            }}
          >
            Mise en
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sort recipes"
            accessibilityHint="Opens sort options"
            onPress={() => setSortMenu(true)}
            hitSlop={8}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              marginRight: 8,
            }}
          >
            <Ionicons name="swap-vertical-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={grid ? 'Switch to list view' : 'Switch to grid view'}
            onPress={() => setGrid((g) => !g)}
            hitSlop={8}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              marginRight: 8,
            }}
          >
            <Ionicons name={grid ? 'grid' : 'list'} size={18} color={colors.textPrimary} />
          </Pressable>
          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={8}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
            </Pressable>
          </Link>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
          }}
        >
          <Ionicons name="search" size={19} color={colors.textSecondary} />
          <TextInput
            accessibilityLabel="Search recipes"
            accessibilityHint="Supports filters such as has:chicken, no:nuts, is:favorite and mins<30"
            placeholder='Search (e.g. has:chicken no:nuts is:favorite mins<30)'
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => setDebouncedQuery(query)}
            returnKeyType="search"
            style={{
              flex: 1,
              paddingVertical: 11,
              paddingHorizontal: 8,
              fontFamily: 'DMSans_400Regular',
              color: colors.textPrimary,
            }}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 36, minHeight: 36 }}
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingBottom: 0,
          paddingTop: 0,
          gap: 8,
          alignItems: 'center',
        }}
      >
        <Chip
          label="Cooked"
          active={filter.type === 'recently_cooked'}
          colors={colors}
          onPress={() =>
            setFilter(
              filter.type === 'recently_cooked'
                ? { type: 'none' }
                : { type: 'recently_cooked' }
            )
          }
        />
        <Chip
          label="Favorites"
          active={filter.type === 'favorite'}
          colors={colors}
          onPress={() =>
            setFilter(
              filter.type === 'favorite' ? { type: 'none' } : { type: 'favorite' }
            )
          }
        />
        <Chip
          label="Want to cook"
          active={filter.type === 'want_to_cook'}
          colors={colors}
          onPress={() =>
            setFilter(
              filter.type === 'want_to_cook'
                ? { type: 'none' }
                : { type: 'want_to_cook' }
            )
          }
        />
        <Chip
          label="Never cooked"
          active={filter.type === 'never_cooked'}
          colors={colors}
          onPress={() =>
            setFilter(
              filter.type === 'never_cooked'
                ? { type: 'none' }
                : { type: 'never_cooked' }
            )
          }
        />
        <Chip
          label="Archived"
          active={filter.type === 'archived'}
          colors={colors}
          onPress={() =>
            setFilter(
              filter.type === 'archived' ? { type: 'none' } : { type: 'archived' }
            )
          }
        />
        <Chip
          label="More"
          accessibilityLabel="More filters"
          accessibilityHint="Opens tag and cuisine filters"
          active={filter.type === 'tag' || filter.type === 'cuisine'}
          colors={colors}
          onPress={() => setFilterMenu(true)}
        />
      </ScrollView>

      <FlatList
        key={grid ? 'grid' : 'list'}
        data={items}
        numColumns={grid ? 2 : 1}
        keyExtractor={(it) => it.id}
        style={{ marginTop: 4, flex: 1 }}
        columnWrapperStyle={grid ? { gap: 10, paddingHorizontal: 14 } : undefined}
        contentContainerStyle={{
          paddingHorizontal: grid ? 0 : 14,
          paddingTop: 0,
          paddingBottom: insets.bottom + 100,
        }}
        ListEmptyComponent={
          <View style={{ padding: 34, alignItems: 'center' }}>
            <Text
              style={{
                fontFamily: 'Lora_400Regular',
                fontSize: 20,
                color: colors.textSecondary,
                textAlign: 'center',
                marginBottom: 10,
              }}
            >
              {hasActiveSearchOrFilter ? 'No matching recipes' : 'No recipes yet'}
            </Text>
            {hasActiveSearchOrFilter ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search and filters"
                onPress={() => {
                  setQuery('');
                  setDebouncedQuery('');
                  setFilter({ type: 'none' });
                }}
                style={{
                  marginTop: 8,
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_700Bold' }}>
                  Clear filters
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add your first recipe"
                onPress={() => router.push('/import')}
                style={{
                  marginTop: 8,
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>
                  Add your first recipe
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={renderCard}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add recipe"
        onPress={() => router.push('/import')}
        style={{
          position: 'absolute',
          right: 22,
          bottom: insets.bottom + 22,
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal
        visible={sortMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenu(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sort menu"
          style={{
            flex: 1,
            backgroundColor: '#0006',
            justifyContent: 'center',
            padding: 20,
          }}
          onPress={() => setSortMenu(false)}
        >
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 6 }}>
            {(
              [
                ['recent_added', 'Recently added'],
                ['recent_cooked', 'Recently cooked'],
                ['most_cooked', 'Most cooked'],
                ['title', 'A-Z'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="menuitem"
                accessibilityLabel={`Sort by ${label}`}
                accessibilityState={{ selected: sort === value }}
                onPress={() => {
                  setSort(value);
                  setSortMenu(false);
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 11 }}
              >
                <Text style={{ fontFamily: 'DMSans_500Medium', color: colors.textPrimary, fontSize: 14 }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <Modal
        visible={filterMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterMenu(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          style={{
            flex: 1,
            backgroundColor: '#0006',
            justifyContent: 'center',
            padding: 20,
          }}
          onPress={() => setFilterMenu(false)}
        >
          <Pressable
            // See AppDialog: grouping would hide the filter chips inside.
            accessible={false}
            accessibilityViewIsModal
            onPress={() => undefined}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 10,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 8,
              maxHeight: '80%',
            }}
          >
            <Text style={{ fontFamily: 'Lora_700Bold', color: colors.textPrimary, fontSize: 18 }}>
              More filters
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip
                label="Favorites"
                active={filter.type === 'favorite'}
                colors={colors}
                onPress={() =>
                  setFilter(
                    filter.type === 'favorite' ? { type: 'none' } : { type: 'favorite' }
                  )
                }
              />
              <Chip
                label="Never cooked"
                active={filter.type === 'never_cooked'}
                colors={colors}
                onPress={() =>
                  setFilter(
                    filter.type === 'never_cooked'
                      ? { type: 'none' }
                      : { type: 'never_cooked' }
                  )
                }
              />
              <Chip
                label="Want to cook"
                active={filter.type === 'want_to_cook'}
                colors={colors}
                onPress={() =>
                  setFilter(
                    filter.type === 'want_to_cook'
                      ? { type: 'none' }
                      : { type: 'want_to_cook' }
                  )
                }
              />
              <Chip
                label="Archived"
                active={filter.type === 'archived'}
                colors={colors}
                onPress={() =>
                  setFilter(
                    filter.type === 'archived' ? { type: 'none' } : { type: 'archived' }
                  )
                }
              />
              {tags.map((t) => (
                <Chip
                  key={t}
                  label={`# ${t}`}
                  accessibilityLabel={`Tag ${t}`}
                  active={filter.type === 'tag' && filter.tag === t}
                  colors={colors}
                  onPress={() =>
                    setFilter(
                      filter.type === 'tag' && filter.tag === t
                        ? { type: 'none' }
                        : { type: 'tag', tag: t }
                    )
                  }
                />
              ))}
              {cuisines.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={filter.type === 'cuisine' && filter.cuisine === c}
                  colors={colors}
                  onPress={() =>
                    setFilter(
                      filter.type === 'cuisine' && filter.cuisine === c
                        ? { type: 'none' }
                        : { type: 'cuisine', cuisine: c }
                    )
                  }
                />
              ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done, close filters"
              onPress={() => setFilterMenu(false)}
              style={{
                alignSelf: 'flex-end',
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold' }}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={describeRecipeCard(item)}
        accessibilityHint="Opens the recipe"
        onPress={() => onPress(item.id)}
        style={({ pressed }) => ({
          flex: grid ? 0.5 : 1,
          marginBottom: 14,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <View
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 2,
          }}
        >
          <View style={{ height: grid ? 170 : 210, backgroundColor: colors.border }}>
            {item.heroUri ? (
              <Image
                source={{ uri: item.heroUri }}
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="restaurant-outline" size={40} color={colors.textSecondary} />
              </View>
            )}

            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: 12,
                paddingTop: 28,
                paddingBottom: 10,
                backgroundColor: '#00000066',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Lora_700Bold',
                  fontSize: 16,
                  color: '#fff',
                }}
                numberOfLines={2}
              >
                {item.title || 'Untitled'}
              </Text>
            </View>
            {(item.isFavorite || item.wantToCook) && (
              <View
                style={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  flexDirection: 'row',
                  gap: 6,
                }}
              >
                {item.isFavorite ? (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: '#00000066',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="star" size={13} color="#FFD166" />
                  </View>
                ) : null}
                {item.wantToCook ? (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: '#00000066',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="flame" size={13} color="#FF9F1C" />
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text
              style={{
                fontFamily: 'DMSans_400Regular',
                color: colors.textSecondary,
              }}
              numberOfLines={1}
            >
              {item.cuisine ? `${item.cuisine} · ` : ''}
              {item.cookCount} cooks
            </Text>
          </View>
        </View>
      </Pressable>
  );
});

function Chip({
  label,
  active,
  onPress,
  colors,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      accessibilityHint={
        accessibilityHint ?? (active ? 'Removes this filter' : 'Applies this filter')
      }
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 5,
        minHeight: 30,
        borderRadius: 999,
        backgroundColor: active ? colors.primary + '22' : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        alignSelf: 'flex-start',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: 'DMSans_500Medium',
          fontSize: 13,
          lineHeight: 16,
          color: active ? colors.primary : colors.textPrimary,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
