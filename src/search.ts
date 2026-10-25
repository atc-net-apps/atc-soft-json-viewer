import { BigNumber } from './parse';
import { childPath, ROOT_PATH } from './path';

export type Key = string | number;

export interface Match {
  /** The keys and indexes from the root down to the matching entry. */
  keys: Key[];
  /** The same as a JSON path, for example `$.items[0].sku`. */
  path: string;
  /** Whether the term was found in the entry's key or in its value. */
  in: 'key' | 'value';
}

/** More matches than this are counted as "10,000+", so a one-letter search on a huge document stays quick. */
export const MATCH_LIMIT = 10_000;

/**
 * A case-insensitive pattern for the search term. A RegExp (not `toLowerCase`), because lowercasing
 * can change a text's length, which would put the highlights in the wrong place.
 */
export function searchPattern(term: string): RegExp {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
}

/**
 * The text the tree shows for a key or a value, without the quotes around it.
 * Search matches this text, so what is found is exactly what gets highlighted.
 */
export function displayText(value: unknown): string | null {
  if (value instanceof BigNumber) {
    return value.source;
  }
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value).slice(1, -1);
    case 'number':
    case 'boolean':
      return String(value);
    default:
      return value === null ? 'null' : null;
  }
}

/** Finds every key and value containing `term`, in document order. Objects and arrays match only by their key. */
export function findMatches(value: unknown, term: string): { matches: Match[]; limited: boolean } {
  const matches: Match[] = [];
  if (term === '') {
    return { matches, limited: false };
  }
  const pattern = searchPattern(term);
  const test = (text: string | null) => {
    pattern.lastIndex = 0;
    return text !== null && pattern.test(text);
  };

  // Iterative, so deeply nested documents cannot overflow the call stack. Children are pushed in
  // reverse, so they come off the stack in document order.
  const stack: Visit[] = [{ value, key: null, parent: null }];
  while (stack.length > 0) {
    const visit = stack.pop() as Visit;
    if (typeof visit.key === 'string' && test(displayText(visit.key))) {
      matches.push(toMatch(visit, 'key'));
    }

    const current = visit.value;
    if (current !== null && typeof current === 'object' && !(current instanceof BigNumber)) {
      const children: [Key, unknown][] = Array.isArray(current)
        ? current.map((child, index): [Key, unknown] => [index, child])
        : Object.entries(current);
      for (let i = children.length - 1; i >= 0; i--) {
        const [key, child] = children[i] as [Key, unknown];
        stack.push({ value: child, key, parent: visit });
      }
    } else if (test(displayText(current))) {
      matches.push(toMatch(visit, 'value'));
    }

    if (matches.length >= MATCH_LIMIT) {
      return { matches, limited: stack.length > 0 };
    }
  }
  return { matches, limited: false };
}

/** One entry on the way through the document. Keys and paths are only built for matches. */
interface Visit {
  value: unknown;
  key: Key | null;
  parent: Visit | null;
}

function toMatch(visit: Visit, found: Match['in']): Match {
  const keys: Key[] = [];
  for (let current: Visit | null = visit; current?.key != null; current = current.parent) {
    keys.unshift(current.key);
  }
  return { keys, path: keys.reduce<string>(childPath, ROOT_PATH), in: found };
}
