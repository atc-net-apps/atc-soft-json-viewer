import { BigNumber } from './parse';
import { childPath, ROOT_PATH } from './path';
import type { Key } from './search';

export type TableRow = Record<string, unknown>;

export interface TableData {
  /** The keys from the root down to the array. */
  keys: Key[];
  /** The same as a JSON path, for example `$.orders`. */
  path: string;
  rows: TableRow[];
  /**
   * Where it was found: inside the start entry, in a list the start entry is in, or elsewhere in the
   * document because there was nothing at or around the start entry.
   */
  found: 'inside' | 'around' | 'elsewhere';
  /** How many of `keys` lead to each list of objects this table is inside, outermost first, to go back up to. */
  parents: number[];
}

/**
 * Finds the array to show as a table: a non-empty array whose items are all objects.
 * It looks inside the entry at `start` first (nearest first), then at the arrays `start` is in
 * (so selecting one value in a list still shows that list), then anywhere in the document.
 */
export function findTable(root: unknown, start: readonly Key[] = []): TableData | null {
  const startValue = valueAt(root, start);
  const inside = startValue === undefined ? null : searchFrom(startValue, start);
  if (inside) {
    return toTable(root, inside.keys, inside.rows, 'inside');
  }
  for (let length = start.length - 1; length >= 0; length--) {
    const keys = start.slice(0, length);
    const value = valueAt(root, keys);
    if (isTable(value)) {
      return toTable(root, keys, value, 'around');
    }
  }
  const elsewhere = start.length > 0 ? searchFrom(root, []) : null;
  return elsewhere && toTable(root, elsewhere.keys, elsewhere.rows, 'elsewhere');
}

/** Every key used by any row, in the order they first appear. */
export function tableColumns(rows: readonly TableRow[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return [...columns];
}

/** Breadth-first, so the table nearest to `value` wins over one nested deeper. */
function searchFrom(value: unknown, keys: readonly Key[]): { keys: readonly Key[]; rows: TableRow[] } | null {
  const queue: { value: unknown; keys: readonly Key[] }[] = [{ value, keys }];
  for (let next = 0; next < queue.length; next++) {
    const entry = queue[next] as (typeof queue)[number];
    if (isTable(entry.value)) {
      return { keys: entry.keys, rows: entry.value };
    }
    if (isContainer(entry.value)) {
      const children: [Key, unknown][] = Array.isArray(entry.value)
        ? entry.value.map((child, index): [Key, unknown] => [index, child])
        : Object.entries(entry.value);
      for (const [key, child] of children) {
        if (isContainer(child)) {
          queue.push({ value: child, keys: [...entry.keys, key] });
        }
      }
    }
  }
  return null;
}

function toTable(root: unknown, keys: readonly Key[], rows: TableRow[], found: TableData['found']): TableData {
  const parents: number[] = [];
  for (let length = 0; length < keys.length; length++) {
    if (isTable(valueAt(root, keys.slice(0, length)))) {
      parents.push(length);
    }
  }
  return { keys: [...keys], path: keys.reduce<string>(childPath, ROOT_PATH), rows, found, parents };
}

function valueAt(root: unknown, keys: readonly Key[]): unknown {
  let value = root;
  for (const key of keys) {
    // Own keys only, so a key such as "constructor" never finds something built into JavaScript.
    if (!isContainer(value) || !Object.hasOwn(value, key)) {
      return undefined;
    }
    value = (value as Record<Key, unknown>)[key];
  }
  return value;
}

/** A non-empty array whose items are all objects. */
export function isTable(value: unknown): value is TableRow[] {
  return Array.isArray(value) && value.length > 0 && value.every(isObject);
}

function isObject(value: unknown): value is TableRow {
  return isContainer(value) && !Array.isArray(value);
}

function isContainer(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !(value instanceof BigNumber);
}
