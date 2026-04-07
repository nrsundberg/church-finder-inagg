const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "&",
  "of",
  "at",
  "in",
  "on",
  "to",
  "for",
  "church",
  "churches",
  "baptist",
  "community",
  "grace",
  "first",
  "second",
  "third",
  "fellowship",
  "assembly",
  "congregation",
  "christian",
]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .sort()
    .join(" ")
    .trim();
}
