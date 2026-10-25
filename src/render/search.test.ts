import { afterEach, describe, expect, it, vi } from 'vitest';
import { LISTED_RESULTS, REVEAL_LIMIT, renderSearch } from './search';
import { renderTree } from './tree';

const ORDERS = {
  orders: [
    { id: 'A-1', items: [{ sku: 'X-1' }] },
    { id: 'A-2', items: [{ sku: 'X-2' }] },
    { id: 'A-3', items: [{ sku: 'X-3' }] },
  ],
};

function setup(value: unknown = ORDERS, delay = 0) {
  const tree = renderTree(value);
  const onSelect = vi.fn();
  const { element: box, results, refresh } = renderSearch(() => tree, value, { delay, onSelect });
  const input = box.querySelector('input') as HTMLInputElement;
  const press = (key: string, shiftKey = false) => input.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  const type = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };
  /** Types and presses Enter, which searches straight away. */
  const search = (text: string) => {
    type(text);
    press('Enter');
  };
  const count = () => box.querySelector('.search-count')?.textContent;
  const current = () => tree.querySelector<HTMLElement>('.current-match')?.dataset.path;
  return { tree, box, results, refresh, onSelect, input, press, type, search, count, current };
}

describe('renderSearch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the matches and goes to the first one', () => {
    const { search, count, current, tree } = setup();

    search('sku');

    expect(count()).toBe('1 of 3');
    expect(current()).toBe('$.orders[0].items[0].sku');
    expect(tree.querySelector('.current-match mark.current')?.textContent).toBe('sku');
  });

  it('unfolds every object and array that contains a match', () => {
    const { search, tree } = setup();

    search('X-3');

    const sku = tree.querySelector('.row[data-path="$.orders[2].items[0].sku"]');
    expect(sku).not.toBeNull();
    expect(sku?.closest('.branch.collapsed')).toBeNull();
  });

  it('goes to the next match with Enter and the previous with Shift+Enter, wrapping from the last to the first', () => {
    const { search, press, count, current } = setup();
    search('sku');

    press('Enter');
    expect(count()).toBe('2 of 3');
    expect(current()).toBe('$.orders[1].items[0].sku');

    press('Enter');
    press('Enter');
    expect(count()).toBe('1 of 3');

    press('Enter', true);
    expect(count()).toBe('3 of 3');
    expect(current()).toBe('$.orders[2].items[0].sku');
  });

  it('goes to the next match with the down arrow key and the previous with the up arrow key', () => {
    const { search, press, count } = setup();
    search('sku');

    press('ArrowDown');
    expect(count()).toBe('2 of 3');

    press('ArrowUp');
    press('ArrowUp');
    expect(count()).toBe('3 of 3');
  });

  it('searches the new text first when an arrow key is pressed while typing', () => {
    vi.useFakeTimers();
    const { type, press, count, current } = setup(ORDERS, 150);
    type('sku');
    vi.advanceTimersByTime(150);

    type('X-2');
    press('ArrowDown');

    expect(count()).toBe('1 of 1');
    expect(current()).toBe('$.orders[1].items[0].sku');
  });

  it('goes to the next and previous match with the arrow buttons', () => {
    const { search, box, count } = setup();
    search('sku');
    const [previous, next] = Array.from(box.querySelectorAll('button'));

    next?.click();
    expect(count()).toBe('2 of 3');
    previous?.click();
    expect(count()).toBe('1 of 3');
  });

  it('marks only the current match as current', () => {
    const { search, press, tree } = setup();
    search('sku');
    press('Enter');

    expect(tree.querySelectorAll('.current-match')).toHaveLength(1);
    expect(tree.querySelectorAll('mark.current')).toHaveLength(1);
    expect(tree.querySelectorAll('mark')).toHaveLength(3);
  });

  it('shows No matches and disables the arrow buttons when nothing matches', () => {
    const { search, count, box, tree } = setup();

    search('nothing like this');

    expect(count()).toBe('No matches');
    expect(tree.querySelector('mark')).toBeNull();
    expect(Array.from(box.querySelectorAll('button')).every((button) => button.disabled)).toBe(true);
  });

  it('clears the search with Escape', () => {
    const { search, press, input, count, tree } = setup();
    search('sku');

    press('Escape');

    expect(input.value).toBe('');
    expect(count()).toBe('');
    expect(tree.querySelector('mark, .current-match')).toBeNull();
  });

  it('searches when typing stops', () => {
    vi.useFakeTimers();
    const { type, count } = setup(ORDERS, 150);

    type('s');
    type('sk');
    expect(count()).toBe('');

    vi.advanceTimersByTime(150);
    expect(count()).toBe('1 of 3');
  });

  it('finds matches beyond the first page of a big array', () => {
    const items = Array.from({ length: 1200 }, (_, i) => ({ id: i }));
    items[1100] = { id: 1100, needle: true } as (typeof items)[number];
    const { search, count, current } = setup({ items });

    search('needle');

    expect(count()).toBe('1 of 1');
    expect(current()).toBe('$.items[1100].needle');
  });

  it(`unfolds only the first ${REVEAL_LIMIT} matches straight away, and the others when going to them`, () => {
    const items = Array.from({ length: REVEAL_LIMIT + 50 }, (_, i) => ({ tag: { name: `tag-${i}` } }));
    const { search, press, tree } = setup({ items });
    const isShown = (i: number) => tree.querySelector(`.row[data-path="$.items[${i}].tag.name"]`) !== null;

    search('tag-');

    expect(isShown(REVEAL_LIMIT - 1)).toBe(true);
    expect(isShown(REVEAL_LIMIT + 10)).toBe(false);

    for (let i = 0; i < REVEAL_LIMIT + 10; i++) {
      press('Enter');
    }
    expect(isShown(REVEAL_LIMIT + 10)).toBe(true);
  });

  describe('JSONPath queries', () => {
    const listed = (results: HTMLElement) =>
      Array.from(results.querySelectorAll('.query-result'), (item) => [
        item.querySelector('.query-path')?.textContent,
        item.querySelector('.query-value')?.textContent,
      ]);

    it('lists the results of text starting with $. with their paths and values', () => {
      const { search, results, count } = setup();

      search('$.orders[*].id');

      expect(results.hidden).toBe(false);
      expect(listed(results)).toEqual([
        ['$.orders[0].id', '"A-1"'],
        ['$.orders[1].id', '"A-2"'],
        ['$.orders[2].id', '"A-3"'],
      ]);
      expect(count()).toBe('1 of 3');
    });

    it('shows objects and arrays in the list by their size', () => {
      const { search, results } = setup();
      search('$.orders[0].*');
      expect(listed(results)).toEqual([
        ['$.orders[0].id', '"A-1"'],
        ['$.orders[0].items', '[1 item]'],
      ]);
    });

    it('selects the first result in the tree, and the next ones with Enter and the arrow keys', () => {
      const { search, press, onSelect, current } = setup();

      search('$..sku');
      expect(onSelect.mock.lastCall?.[0].dataset.path).toBe('$.orders[0].items[0].sku');
      expect(current()).toBe('$.orders[0].items[0].sku');

      press('ArrowDown');
      expect(current()).toBe('$.orders[1].items[0].sku');
      press('Enter', true);
      expect(current()).toBe('$.orders[0].items[0].sku');
    });

    it('selects a result when it is clicked in the list, and marks it there', () => {
      const { search, results, current } = setup();
      search('$..sku');

      results.querySelector<HTMLButtonElement>('.query-result[data-index="2"]')?.click();

      expect(current()).toBe('$.orders[2].items[0].sku');
      expect(results.querySelector('[aria-current="true"]')?.getAttribute('data-index')).toBe('2');
    });

    it('does not highlight text for a query', () => {
      const { search, tree } = setup();
      search('$..sku');
      expect(tree.querySelector('mark')).toBeNull();
    });

    it('says so when a query selects nothing', () => {
      const { search, count, results } = setup();
      search('$.missing');
      expect(count()).toBe('No results');
      expect(results.querySelector('.query-result')).toBeNull();
    });

    it('shows what is wrong with a query, with a caret under it', () => {
      const { search, results, count } = setup();

      search('$.orders[?@.id]');

      expect(results.querySelector('.query-error p')?.textContent).toBe('Not supported yet: filters ([?…])');
      expect(results.querySelector('.query-error pre')?.textContent).toBe('$.orders[?@.id]\n         ^');
      expect(count()).toBe('');
    });

    it('treats text such as $ref as a search, not a query', () => {
      const { search, results, tree } = setup({ $ref: '#/a' });
      search('$ref');
      expect(results.hidden).toBe(true);
      expect(tree.querySelector('mark')?.textContent).toBe('$ref');
    });

    it('hides the list again for a normal search, and with Escape', () => {
      const { search, press, results } = setup();
      search('$..sku');

      search('sku');
      expect(results.hidden).toBe(true);

      search('$..sku');
      press('Escape');
      expect(results.hidden).toBe(true);
    });

    it(`lists only the first ${LISTED_RESULTS} results, and says so`, () => {
      const { search, results, count } = setup(Array.from({ length: LISTED_RESULTS + 20 }, (_, i) => i));

      search('$[*]');

      expect(results.querySelectorAll('.query-result')).toHaveLength(LISTED_RESULTS);
      expect(results.querySelector('.query-more')?.textContent).toContain('Enter and ↓ go through all of them');
      expect(count()).toBe(`1 of ${LISTED_RESULTS + 20}`);
    });
  });

  it('searches again for the same text when asked to, and goes to the first match', () => {
    const { search, press, refresh, count, current } = setup();
    search('sku');
    press('Enter');
    expect(count()).toBe('2 of 3');

    refresh();

    expect(count()).toBe('1 of 3');
    expect(current()).toBe('$.orders[0].items[0].sku');
  });

  it('shows "+" when there are more matches than it counts', () => {
    const { search, count } = setup(Array.from({ length: 10_005 }, () => 'x'));
    search('x');
    expect(count()).toBe('1 of 10,000+');
  });
});
