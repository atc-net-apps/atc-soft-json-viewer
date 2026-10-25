/**
 * A–Z for keys, the way people sort: case and accents only matter when keys are otherwise equal,
 * and numbers inside keys count as numbers, so `item2` comes before `item10`.
 */
export function compareKeys(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** An object's entries, A–Z by key when `sorted`, otherwise in the order the server sent them. */
export function objectEntries(value: object, sorted: boolean): [string, unknown][] {
  const entries = Object.entries(value);
  return sorted ? entries.sort(([a], [b]) => compareKeys(a, b)) : entries;
}
