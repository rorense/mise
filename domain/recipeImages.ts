export function resolveRecipeHeroImage(
  mainImageUri: string | undefined,
  latestCookImageUri: string | undefined
): string | undefined {
  return mainImageUri ?? latestCookImageUri;
}
