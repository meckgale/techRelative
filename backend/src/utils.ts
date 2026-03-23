const regionAliases: Record<string, string> = {
  USA: "United States",
  Britain: "Great Britain",
};

/**
 * Splits comma-separated region strings into individual parts,
 * normalizes common aliases, and removes duplicates.
 */
export function normalizeRegions(
  regions: (string | null | undefined)[]
): string[] {
  return [
    ...new Set(
      (regions.filter((r) => r && r !== "null") as string[])
        .flatMap((r) => r.split(",").map((s) => s.trim()))
        .map((r) => regionAliases[r] || r)
    ),
  ];
}
