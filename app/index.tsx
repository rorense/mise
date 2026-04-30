import {
  bulkEditRecipeTags,
  getAllCuisines,
  getAllTags,
  listRecipeCards,
  type LibraryFilter,
  type LibrarySort,
  type RecipeListItem,
} from '@/data/recipes';
import { formatSortLabel } from '@/domain/libraryLabels';
import { getOnboarded } from '@/lib/secrets';
import { useTheme } from '@/theme/ThemeContext';
import type { ThemeColors } from '@/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

export default function LibraryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('recent_added');
  const [filter, setFilter] = useState<LibraryFilter>({ type: 'none' });
  const [grid, setGrid] = useState(true);
  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [sortMenu, setSortMenu] = useState(false);
  const [filterMenu, setFilterMenu] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [bulkTagEditorOpen, setBulkTagEditorOpen] = useState(false);
  const [bulkAddTags, setBulkAddTags] = useState('');
  const [bulkRemoveTags, setBulkRemoveTags] = useState('');

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

  const reload = useCallback(async () => {
    const [t, c, rows] = await Promise.all([
      getAllTags(),
      getAllCuisines(),
      listRecipeCards(query, filter, sort),
    ]);
    setTags(t);
    setCuisines(c);
    setItems(rows);
  }, [query, filter, sort]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const renderCard = ({ item }: { item: RecipeListItem }) => (
    <Pressable
      onPress={() => {
        if (bulkMode) {
          setSelectedRecipeIds((prev) =>
            prev.includes(item.id)
              ? prev.filter((id) => id !== item.id)
              : [...prev, item.id]
          );
          return;
        }
        router.push(`/recipe/${item.id}`);
      }}
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
          {bulkMode ? (
            <View
              style={{
                position: 'absolute',
                left: 8,
                top: 8,
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: '#fff',
                backgroundColor: selectedRecipeIds.includes(item.id) ? colors.primary : '#00000066',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {selectedRecipeIds.includes(item.id) ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : null}
            </View>
          ) : null}
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
            Mise
          </Text>
          <Link href="/settings" asChild>
            <Pressable
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
            placeholder="Search title, ingredient, or tag"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={reload}
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

      <View
        style={{
          minHeight: 36,
          maxHeight: 36,
          paddingHorizontal: 14,
          gap: 8,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Chip
          label={formatSortLabel(sort)}
          active
          colors={colors}
          onPress={() => setSortMenu(true)}
        />
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
          label="Never"
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
          label="Favorites"
          active={filter.type === 'favorite'}
          colors={colors}
          onPress={() =>
            setFilter(
              filter.type === 'favorite' ? { type: 'none' } : { type: 'favorite' }
            )
          }
        />
        <Pressable
          onPress={() => setGrid((g) => !g)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            minHeight: 30,
            borderRadius: 999,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignSelf: 'flex-start',
            justifyContent: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Ionicons
            name={grid ? 'grid' : 'list'}
            size={14}
            color={colors.textPrimary}
          />
          <Text
            style={{
              fontFamily: 'DMSans_500Medium',
              fontSize: 13,
              lineHeight: 16,
              color: colors.textPrimary,
            }}
          >
            {grid ? 'Grid' : 'List'}
          </Text>
        </Pressable>
        <Chip
          label="More"
          active={
            filter.type === 'want_to_cook' ||
            filter.type === 'archived' ||
            filter.type === 'tag' ||
            filter.type === 'cuisine'
          }
          colors={colors}
          onPress={() => setFilterMenu(true)}
        />
        <Pressable
          onPress={() => {
            if (bulkMode) {
              setBulkTagEditorOpen(true);
              return;
            }
            setSelectedRecipeIds([]);
            setBulkMode(true);
          }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            minHeight: 30,
            borderRadius: 999,
            backgroundColor: bulkMode ? colors.primary + '22' : colors.surface,
            borderWidth: 1,
            borderColor: bulkMode ? colors.primary : colors.border,
            alignSelf: 'flex-start',
            justifyContent: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="pricetags-outline" size={14} color={bulkMode ? colors.primary : colors.textPrimary} />
          <Text
            style={{
              fontFamily: 'DMSans_500Medium',
              fontSize: 13,
              lineHeight: 16,
              color: bulkMode ? colors.primary : colors.textPrimary,
            }}
          >
            {bulkMode ? `Edit tags (${selectedRecipeIds.length})` : 'Bulk tags'}
          </Text>
        </Pressable>
        {bulkMode ? (
          <Pressable
            onPress={() => {
              setBulkMode(false);
              setSelectedRecipeIds([]);
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              minHeight: 30,
              borderRadius: 999,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignSelf: 'flex-start',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: 'DMSans_500Medium',
                fontSize: 13,
                lineHeight: 16,
                color: colors.textPrimary,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        ) : null}
      </View>

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
              No recipes yet
            </Text>
            <Pressable
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
          </View>
        }
        renderItem={renderCard}
      />

      <Pressable
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

      <Modal visible={sortMenu} transparent animationType="fade">
        <Pressable
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
      <Modal visible={bulkTagEditorOpen} transparent animationType="fade">
        <Pressable
          style={{
            flex: 1,
            backgroundColor: '#0006',
            justifyContent: 'center',
            padding: 20,
          }}
          onPress={() => setBulkTagEditorOpen(false)}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ fontFamily: 'Lora_700Bold', color: colors.textPrimary, fontSize: 18 }}>
              Bulk tag edit
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.textSecondary, fontSize: 13 }}>
              Selected recipes: {selectedRecipeIds.length}
            </Text>
            <TextInput
              value={bulkAddTags}
              onChangeText={setBulkAddTags}
              placeholder="Add tags (comma separated)"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: colors.textPrimary,
                fontFamily: 'DMSans_400Regular',
                fontSize: 14,
                backgroundColor: colors.background,
              }}
            />
            <TextInput
              value={bulkRemoveTags}
              onChangeText={setBulkRemoveTags}
              placeholder="Remove tags (comma separated)"
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 9,
                color: colors.textPrimary,
                fontFamily: 'DMSans_400Regular',
                fontSize: 14,
                backgroundColor: colors.background,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable onPress={() => setBulkTagEditorOpen(false)} style={{ padding: 8 }}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'DMSans_500Medium' }}>Close</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (selectedRecipeIds.length === 0) return;
                  await bulkEditRecipeTags({
                    recipeIds: selectedRecipeIds,
                    addTags: bulkAddTags.split(','),
                    removeTags: bulkRemoveTags.split(','),
                  });
                  setBulkTagEditorOpen(false);
                  setBulkAddTags('');
                  setBulkRemoveTags('');
                  setBulkMode(false);
                  setSelectedRecipeIds([]);
                  await reload();
                }}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: colors.primary,
                }}
              >
                <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold' }}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={filterMenu} transparent animationType="fade">
        <Pressable
          style={{
            flex: 1,
            backgroundColor: '#0006',
            justifyContent: 'center',
            padding: 20,
          }}
          onPress={() => setFilterMenu(false)}
        >
          <Pressable
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

function Chip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
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
