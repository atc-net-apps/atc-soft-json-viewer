import { describe, expect, it } from 'vitest';
import { compareKeys, objectEntries } from './sort';

describe('compareKeys', () => {
  it('sorts numbers inside keys as numbers', () => {
    expect(['item10', 'item2', 'item1'].sort(compareKeys)).toEqual(['item1', 'item2', 'item10']);
  });

  it('puts upper and lower case together', () => {
    expect(['beta', 'Alpha', 'alpha', 'Beta'].sort(compareKeys)).toEqual(['alpha', 'Alpha', 'beta', 'Beta']);
  });

  it('sorts keys with symbols, such as $ref and _links, before letters', () => {
    expect(['name', '_links', '$ref'].sort(compareKeys)[2]).toBe('name');
  });
});

describe('objectEntries', () => {
  const ORDER = { status: 'Shipped', orderId: 'A-1001', customer: {} };

  it('keeps the order the server sent', () => {
    expect(objectEntries(ORDER, false).map(([key]) => key)).toEqual(['status', 'orderId', 'customer']);
  });

  it('sorts the keys A–Z when asked to', () => {
    expect(objectEntries(ORDER, true).map(([key]) => key)).toEqual(['customer', 'orderId', 'status']);
  });

  it('does not change the object', () => {
    objectEntries(ORDER, true);
    expect(Object.keys(ORDER)).toEqual(['status', 'orderId', 'customer']);
  });
});
