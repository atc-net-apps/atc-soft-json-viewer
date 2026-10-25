import { describe, expect, it, vi } from 'vitest';
import { BigNumber } from '../parse';
import { findTable } from '../table';
import { renderNoTable, renderTable } from './table';

const ITEMS = {
  items: [
    { sku: 'A-100', quantity: 2, tags: ['red', 'sale'], image: 'https://images.contoso.example/a-100.png' },
    { sku: 'B-200', quantity: 1, tags: [], image: null, size: { width: 2, height: 3 } },
  ],
};

function setup(value: unknown = ITEMS, options: Parameters<typeof renderTable>[1] = {}) {
  const table = findTable(value);
  if (!table) {
    throw new Error('no table');
  }
  const element = renderTable(table, options);
  const headers = () => Array.from(element.querySelectorAll('th'), (th) => th.textContent);
  const cells = (row: number) =>
    Array.from(element.querySelectorAll(`tbody tr:nth-child(${row + 1}) td`), (td) => td.textContent);
  return { element, headers, cells };
}

describe('renderTable', () => {
  it('has a # column and one column per key', () => {
    const { headers } = setup();
    expect(headers()).toEqual(['#', 'sku', 'quantity', 'tags', 'image', 'size']);
  });

  it('says when the table was found elsewhere than at the selected line', () => {
    const table = findTable(ITEMS, ['items', 0, 'sku']);
    const elsewhere = findTable({ orderId: 'A-1', ...ITEMS }, ['orderId']);
    if (!table || !elsewhere) {
      throw new Error('no table');
    }

    expect(renderTable(table, { from: '$.items[0].sku' }).querySelector('.table-note')).toBeNull();
    expect(renderTable(elsewhere, { from: '$.orderId' }).querySelector('.table-note')?.textContent).toBe(
      'Nothing to show as a table in $.orderId, so this is the first list in the document.',
    );
  });

  it('says what the table is in its caption', () => {
    const { element } = setup();
    expect(element.querySelector('caption')?.textContent).toBe('$ › items · 2 rows · 5 columns');
  });

  it('shows plain values in the colours of the tree, with strings unquoted', () => {
    const { element, cells } = setup();
    expect(cells(0)).toEqual(['0', 'A-100', '2', '[2 items]', 'https://images.contoso.example/a-100.png', '']);
    expect(element.querySelector('tbody .string')?.textContent).toBe('A-100');
    expect(element.querySelector('tbody .number')?.textContent).toBe('2');
    expect(element.querySelector('tbody .null')?.textContent).toBe('null');
  });

  it('shows the size of objects and arrays, and empty ones as {} and []', () => {
    const { cells } = setup();
    expect(cells(1)).toEqual(['1', 'B-200', '1', '[]', 'null', '{2 keys}']);
  });

  it('marks cells for keys a row does not have', () => {
    const { element } = setup();
    const missing = element.querySelector('tbody tr:first-child td:last-child');
    expect(missing?.classList.contains('missing')).toBe(true);
  });

  it('opens a row, an object or an array in the tree when clicked', () => {
    const onOpen = vi.fn();
    const { element } = setup(ITEMS, { onOpen });
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('.cell-open'));

    buttons.find((button) => button.textContent === '1')?.click();
    expect(onOpen).toHaveBeenLastCalledWith(['items', 1]);

    buttons.find((button) => button.textContent === '{2 keys}')?.click();
    expect(onOpen).toHaveBeenLastCalledWith(['items', 1, 'size']);

    buttons.find((button) => button.textContent === '[2 items]')?.click();
    expect(onOpen).toHaveBeenLastCalledWith(['items', 0, 'tags']);
  });

  it('opens a list of objects in a cell as the table instead of in the tree', () => {
    const onOpen = vi.fn();
    const onTable = vi.fn();
    const { element } = setup({ orders: [{ id: 1, items: [{ sku: 'A-1' }, { sku: 'B-2' }] }] }, { onOpen, onTable });
    const items = Array.from(element.querySelectorAll<HTMLButtonElement>('.cell-open')).find(
      (button) => button.textContent === '[2 items]',
    );

    items?.click();

    expect(items?.title).toBe('Show as a table');
    expect(onTable).toHaveBeenCalledWith(['orders', 0, 'items']);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows where the table is, with buttons back up to the lists it is inside', () => {
    const onTable = vi.fn();
    const table = findTable({ orders: [{ items: [{ sku: 'A-1' }] }] }, ['orders', 0, 'items']);
    if (!table) {
      throw new Error('no table');
    }
    const element = renderTable(table, { onTable });
    const steps = Array.from(element.querySelectorAll<HTMLButtonElement>('.table-path button'));

    expect(element.querySelector('.table-path')?.textContent).toBe('$ › orders › [0] › items');
    expect(steps.map((step) => step.textContent)).toEqual(['orders']);
    expect(element.querySelector('.table-path-current')?.textContent).toBe('items');

    steps[0]?.click();
    expect(onTable).toHaveBeenCalledWith(['orders']);
  });

  it('makes $ a button when the whole document is a list of objects', () => {
    const table = findTable([{ items: [{ sku: 'A-1' }] }], [0, 'items']);
    if (!table) {
      throw new Error('no table');
    }
    const steps = Array.from(renderTable(table).querySelectorAll('.table-path button'), (step) => step.textContent);
    expect(steps).toEqual(['$']);
  });

  it('turns web addresses into links that open in a new tab', () => {
    const { element } = setup();
    const link = element.querySelector('tbody a');
    expect(link?.getAttribute('href')).toBe('https://images.contoso.example/a-100.png');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('makes no links when links are switched off', () => {
    const { element } = setup(ITEMS, { links: false });
    expect(element.querySelector('a')).toBeNull();
  });

  it('shows big numbers with their exact digits', () => {
    const { element } = setup([{ id: new BigNumber('9007199254740993') }]);
    expect(element.querySelector('.big-number')?.textContent).toBe('9007199254740993');
  });

  it('draws rows a page at a time with a "Show more" button', () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ i }));
    const { element } = setup(rows, { pageSize: 500 });
    const count = () => element.querySelectorAll('tbody tr').length;
    const more = () => element.querySelector<HTMLButtonElement>('.more');

    expect(count()).toBe(500);
    expect(more()?.textContent).toBe('Show 500 more (700 not shown)');

    more()?.click();
    more()?.click();
    expect(count()).toBe(1200);
    expect(more()).toBeNull();
  });

  it('never turns text from the page into HTML', () => {
    const { element } = setup([{ '<b>key</b>': '<img src=x onerror=alert(1)>' }]);
    expect(element.querySelector('img, b')).toBeNull();
    expect(element.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('renderNoTable', () => {
  it('explains what a table needs', () => {
    expect(renderNoTable().textContent).toContain('A table needs a list of objects');
  });
});
