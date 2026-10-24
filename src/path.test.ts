import { describe, expect, it } from 'vitest';
import { childPath, ROOT_PATH } from './path';

describe('childPath', () => {
  it('builds paths step by step from the root', () => {
    const items = childPath(ROOT_PATH, 'items');
    const first = childPath(items, 0);
    expect(childPath(first, 'sku')).toBe('$.items[0].sku');
  });

  it.each([
    ['letters', 'name', '$.name'],
    ['camelCase', 'createdAt', '$.createdAt'],
    ['underscores and digits', '_id2', '$._id2'],
    ['non-English letters', 'størrelse', '$.størrelse'],
  ])('uses dot notation for %s', (_, key, path) => {
    expect(childPath(ROOT_PATH, key)).toBe(path);
  });

  it.each([
    ['a space', 'odd key', "$['odd key']"],
    ['a dash', 'content-type', "$['content-type']"],
    ['a leading digit', '2fa', "$['2fa']"],
    ['a dollar sign', '$ref', "$['$ref']"],
    ['a dot', 'a.b', "$['a.b']"],
    ['an empty key', '', "$['']"],
    ['a single quote', "it's", "$['it\\'s']"],
    ['a backslash', 'a\\b', "$['a\\\\b']"],
    ['a line break', 'a\nb', "$['a\\nb']"],
    ['another control character', 'a\u0001b', "$['a\\u0001b']"],
  ])('uses quoted brackets for a key with %s', (_, key, path) => {
    expect(childPath(ROOT_PATH, key)).toBe(path);
  });

  it('uses brackets for array indexes', () => {
    expect(childPath('$.matrix[2]', 10)).toBe('$.matrix[2][10]');
  });

  it('treats an object key that looks like a number as a key, not an index', () => {
    expect(childPath(ROOT_PATH, '0')).toBe("$['0']");
  });
});
