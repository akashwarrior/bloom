export function evenlySelectItems<T>(items: readonly T[], limit: number) {
  const safeLimit = Math.max(0, Math.trunc(limit));
  if (safeLimit === 0) return [];
  if (items.length <= safeLimit) return [...items];
  if (safeLimit === 1) return [items.at(-1)!];

  return Array.from({ length: safeLimit }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (items.length - 1)) / (safeLimit - 1),
    );
    return items[sourceIndex]!;
  });
}
