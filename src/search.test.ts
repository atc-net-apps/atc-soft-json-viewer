import { describe, expect, it } from 'vitest';
import { BigNumber } from './parse';
import { displayText, findMatches, MATCH_LIMIT, searchPattern } from './search';

const ORDER = {
  orderId: 'A-1001',
  customer: { name: 'Contoso', city: 'Aarhus' },
  items: [
    { sku: 'A-100', quantity: 2 },
    { sku: 'B-200', quantity: 1 },
  ],
  paid: true,
  note: null,
};

const paths = (value: unknown, term: string) => findMatches(value, term).matches.map((match) => `${match.in} ${match.path}`);

describe('findMatches', () => {
  it('finds keys and values in document order', () => {
    expect(paths(ORDER, 'sku')).toEqual(['key $.items[0].sku', 'key $.items[1].sku']);
    expect(paths(ORDER, 'a-1')).toEqual(['value $.orderId', 'value $.items[0].sku']);
  });

  it('ignores upper and lower case', () => {
    expect(paths(ORDER, 'CONTOSO')).toEqual(['value $.customer.name']);
  });

  it('ignores upper and lower case in letters such as Ø and Æ', () => {
    expect(paths({ city: 'København', street: 'ÆBLEVEJ' }, 'københavn')).toEqual(['value $.city']);
    expect(paths({ city: 'København', street: 'ÆBLEVEJ' }, 'æblevej')).toEqual(['value $.street']);
  });

  it('finds an object or array by its key', () => {
    expect(paths(ORDER, 'customer')).toEqual(['key $.customer']);
  });

  it.each([
    ['numbers', '1', ['value $.items[0].quantity']],
    ['booleans', 'true', ['value $.paid']],
    ['null', 'null', ['value $.note']],
  ])('finds %s as they are shown', (_, term, expected) => {
    expect(paths({ quantity: 2, items: [{ quantity: 1 }], paid: true, note: null }, term)).toEqual(expected);
  });

  it('finds big numbers by their exact digits', () => {
    expect(paths({ id: new BigNumber('9007199254740993') }, '0993')).toEqual(['value $.id']);
  });

  it('does not match the quotes around keys and strings', () => {
    expect(paths(ORDER, '"')).toEqual([]);
  });

  it('matches strings as they are shown, with escapes', () => {
    expect(paths({ text: 'line 1\nline 2' }, '1\\nline')).toEqual(['value $.text']);
  });

  it('treats special characters in the term as plain text', () => {
    expect(paths({ a: 'price (EUR)', b: 'price EUR' }, '(eur)')).toEqual(['value $.a']);
    expect(paths({ a: 'a.b', b: 'axb' }, 'a.b')).toEqual(['value $.a']);
  });

  it('gives the keys on the way to each match', () => {
    const [match] = findMatches(ORDER, 'B-200').matches;
    expect(match?.keys).toEqual(['items', 1, 'sku']);
  });

  it('finds nothing for an empty term', () => {
    expect(findMatches(ORDER, '')).toEqual({ matches: [], limited: false });
  });

  it('finds a document that is a single value', () => {
    expect(paths('hello', 'ell')).toEqual(['value $']);
  });

  it('stops counting at the limit', () => {
    const result = findMatches(Array.from({ length: MATCH_LIMIT + 5 }, () => 'x'), 'x');
    expect(result.matches).toHaveLength(MATCH_LIMIT);
    expect(result.limited).toBe(true);
  });

  it('searches deeply nested documents without running out of stack', () => {
    let deep: unknown = 'needle';
    for (let i = 0; i < 20_000; i++) {
      deep = [deep];
    }
    expect(findMatches(deep, 'needle').matches).toHaveLength(1);
  });
});

describe('displayText', () => {
  it.each([
    ['a string, without quotes', 'A-100', 'A-100'],
    ['a string with a line break, escaped', 'a\nb', 'a\\nb'],
    ['a number', 249.5, '249.5'],
    ['a big number', new BigNumber('9007199254740993'), '9007199254740993'],
    ['true', true, 'true'],
    ['null', null, 'null'],
  ])('shows %s', (_, value, text) => {
    expect(displayText(value)).toBe(text);
  });

  it('gives nothing for objects and arrays', () => {
    expect(displayText({ a: 1 })).toBeNull();
    expect(displayText([1])).toBeNull();
  });
});

describe('searchPattern', () => {
  it('finds every occurrence, ignoring case', () => {
    expect('Aa-aA'.match(searchPattern('a'))).toEqual(['A', 'a', 'a', 'A']);
  });
});
