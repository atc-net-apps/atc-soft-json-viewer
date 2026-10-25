import { describe, expect, it } from 'vitest';
import { BigNumber } from './parse';
import { findTable, tableColumns } from './table';

const DOCUMENT = {
  orderId: 'A-1001',
  tags: ['red', 'sale'],
  customer: { name: 'Contoso', contacts: [{ name: 'Ann' }, { name: 'Bo' }] },
  items: [
    { sku: 'A-100', parts: [{ id: 1 }] },
    { sku: 'B-200', parts: [{ id: 2 }] },
  ],
};

describe('findTable', () => {
  it('finds the array of objects nearest to the top of the document', () => {
    const table = findTable(DOCUMENT);
    expect(table?.path).toBe('$.items');
    expect(table?.keys).toEqual(['items']);
    expect(table?.rows).toBe(DOCUMENT.items);
    expect(table?.found).toBe('inside');
  });

  it('looks inside the selected entry first', () => {
    expect(findTable(DOCUMENT, ['customer'])?.path).toBe('$.customer.contacts');
    expect(findTable(DOCUMENT, ['items', 1])?.path).toBe('$.items[1].parts');
  });

  it('shows the list a selected value is in', () => {
    const table = findTable(DOCUMENT, ['customer', 'contacts', 0, 'name']);
    expect(table?.path).toBe('$.customer.contacts');
    expect(table?.found).toBe('around');
  });

  it('looks in the whole document when there is nothing at or around the selected entry', () => {
    const table = findTable(DOCUMENT, ['orderId']);
    expect(table?.path).toBe('$.items');
    expect(table?.found).toBe('elsewhere');
  });

  it('lists the lists of objects the table is inside, to go back up to', () => {
    expect(findTable(DOCUMENT, ['items', 1, 'parts'])?.parents).toEqual([1]);
    expect(findTable([{ items: [{ id: 1 }] }], [0, 'items'])?.parents).toEqual([0]);
    expect(findTable(DOCUMENT)?.parents).toEqual([]);
  });

  it('accepts a document that is itself an array of objects', () => {
    expect(findTable([{ a: 1 }, { b: 2 }])?.path).toBe('$');
  });

  it.each([
    ['an array of plain values', { tags: ['red', 'sale'] }],
    ['an array that mixes objects and plain values', { items: [{ a: 1 }, 2] }],
    ['an array of arrays', { grid: [[1], [2]] }],
    ['an empty array', { items: [] }],
    ['an array with null in it', { items: [{ a: 1 }, null] }],
    ['a plain value', 42],
  ])('finds no table in %s', (_, value) => {
    expect(findTable(value)).toBeNull();
  });

  it('finds no table for a path that is not in the document', () => {
    expect(findTable({ constructor: 1 }, ['missing'])).toBeNull();
  });

  it('never treats a big number as an object', () => {
    expect(findTable({ ids: [new BigNumber('9007199254740993')] })).toBeNull();
  });
});

describe('tableColumns', () => {
  it('lists every key once, in the order they first appear', () => {
    expect(tableColumns([{ id: 1, name: 'Ann' }, { id: 2, email: 'bo@contoso.example' }, { name: 'Cy', id: 3 }])).toEqual([
      'id',
      'name',
      'email',
    ]);
  });

  it('gives no columns for rows without keys', () => {
    expect(tableColumns([{}, {}])).toEqual([]);
  });
});
