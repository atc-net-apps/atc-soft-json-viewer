import { describe, expect, it } from 'vitest';
import { isQuery, query, RESULT_LIMIT } from './jsonpath';
import { BigNumber } from './parse';

// The bookstore example from RFC 9535, section 1.5.
const STORE = {
  store: {
    book: [
      { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
      { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
      { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', isbn: '0-553-21311-3', price: 8.99 },
      { category: 'fiction', author: 'J. R. R. Tolkien', title: 'The Lord of the Rings', isbn: '0-395-19395-8', price: 22.99 },
    ],
    bicycle: { color: 'red', price: 399 },
  },
};

function paths(value: unknown, expression: string): string[] {
  const outcome = query(value, expression);
  if (!outcome.ok) {
    throw new Error(outcome.message);
  }
  return outcome.results.map((result) => result.path);
}

function values(value: unknown, expression: string): unknown[] {
  const outcome = query(value, expression);
  return outcome.ok ? outcome.results.map((result) => result.value) : [];
}

describe('query', () => {
  it('selects the whole document with $', () => {
    expect(paths(STORE, '$')).toEqual(['$']);
  });

  it.each([
    ['$.store.book[0].title', ['Sayings of the Century']],
    ["$['store']['bicycle']['color']", ['red']],
    ['$["store"].bicycle["price"]', [399]],
    ['$.store.book[-1].author', ['J. R. R. Tolkien']],
    ['$.store.book[*].author', ['Nigel Rees', 'Evelyn Waugh', 'Herman Melville', 'J. R. R. Tolkien']],
    ['$..author', ['Nigel Rees', 'Evelyn Waugh', 'Herman Melville', 'J. R. R. Tolkien']],
    ['$.store.*.color', ['red']],
    ['$..book[2].title', ['Moby Dick']],
    ['$..book[-2].title', ['Moby Dick']],
    ["$..['isbn']", ['0-553-21311-3', '0-395-19395-8']],
  ])('runs %s', (expression, expected) => {
    expect(values(STORE, expression)).toEqual(expected);
  });

  it('gives each result its path in the same format as Copy path', () => {
    expect(paths(STORE, '$.store.book[*].price')).toEqual([
      '$.store.book[0].price',
      '$.store.book[1].price',
      '$.store.book[2].price',
      '$.store.book[3].price',
    ]);
    expect(paths({ 'odd key': { $ref: 1 } }, "$['odd key']['$ref']")).toEqual(["$['odd key']['$ref']"]);
  });

  it('gives each result the keys on the way to it', () => {
    const outcome = query(STORE, '$..bicycle.color');
    expect(outcome.ok && outcome.results[0]?.keys).toEqual(['store', 'bicycle', 'color']);
  });

  it("finds everything with $..*, taking each node's children in turn as RFC 9535 does", () => {
    expect(paths({ a: { b: 1 }, c: [2] }, '$..*')).toEqual(['$.a', '$.c', '$.a.b', '$.c[0]']);
  });

  it('selects nothing for names on arrays, indexes on objects and indexes out of range', () => {
    expect(paths(STORE, '$.store.book.title')).toEqual([]);
    expect(paths(STORE, '$.store[0]')).toEqual([]);
    expect(paths(STORE, '$.store.book[4]')).toEqual([]);
    expect(paths(STORE, '$.store.book[-5]')).toEqual([]);
    expect(paths(STORE, '$.store.bicycle.color.length')).toEqual([]);
  });

  it('only selects keys the object has itself', () => {
    expect(paths({}, '$.constructor')).toEqual([]);
    expect(paths({}, "$['__proto__']")).toEqual([]);
  });

  it('never looks inside big numbers', () => {
    expect(values({ id: new BigNumber('9007199254740993') }, '$..*')).toEqual([new BigNumber('9007199254740993')]);
  });

  it('accepts names with letters such as ø, and spaces around brackets and selectors', () => {
    expect(values({ by: { København: 1 } }, '$.by.København')).toEqual([1]);
    expect(values(STORE, "$.store[ 'book' ][ 0 ] .price")).toEqual([8.95]);
  });

  it.each([
    ["$['it\\'s']", "it's"],
    ['$["say \\"hi\\""]', 'say "hi"'],
    ["$['line\\nbreak']", 'line\nbreak'],
    ["$['\\u00e6']", 'æ'],
  ])('reads the escape in %s', (expression, key) => {
    expect(values({ [key]: 'found' }, expression)).toEqual(['found']);
  });

  it('stops at the limit', () => {
    const outcome = query(Array.from({ length: RESULT_LIMIT + 5 }, (_, i) => i), '$[*]');
    expect(outcome.ok && outcome.results.length).toBe(RESULT_LIMIT);
    expect(outcome.ok && outcome.limited).toBe(true);
  });

  it('handles deeply nested documents without running out of stack', () => {
    let deep: unknown = { needle: 1 };
    for (let i = 0; i < 20_000; i++) {
      deep = [deep];
    }
    expect(values(deep, '$..needle')).toEqual([1]);
  });

  describe('errors', () => {
    it.each([
      ['a filter', '$.store.book[?@.price < 10]', 'Not supported yet: filters ([?…])', 13],
      ['a slice', '$.store.book[1:3]', 'Not supported yet: slices ([start:end])', 14],
      ['a slice without a start', '$.store.book[:2]', 'Not supported yet: slices ([start:end])', 13],
      ['a union', '$.store.book[0,1]', 'Not supported yet: several selectors in one [ ] ([a, b])', 14],
      ['a missing ]', '$.store.book[0', 'Expected ]', 14],
      ['a missing quote', "$['store", "Missing closing '", 2],
      ['a dot without a name', '$.', "Expected a name or *, or use ['name'] for other keys after .", 2],
      ['a name that needs quotes', '$.odd-key', 'Unexpected "-": use .name, [\'name\'], [0] or [*]', 5],
      ['a leading zero', '$[01]', 'Expected ]', 3],
      ['minus zero', '$[-0]', 'Expected a whole number such as 0, 2 or -1', 2],
      ['an unknown escape', "$['a\\qb']", 'Unknown escape \\q', 4],
    ])('reports %s with its position', (_, expression, message, position) => {
      expect(query(STORE, expression)).toEqual({ ok: false, message, position });
    });
  });
});

describe('isQuery', () => {
  it.each(['$', '$.items', '$[0]', '$..sku', ' $.items '])('treats %s as a query', (text) => {
    expect(isQuery(text)).toBe(true);
  });

  it.each(['$ref', '$100', 'items', 'price $', ''])('treats %s as a search', (text) => {
    expect(isQuery(text)).toBe(false);
  });
});
