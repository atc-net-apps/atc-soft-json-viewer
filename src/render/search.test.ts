import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVEAL_LIMIT, renderSearch } from './search';
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
  const box = renderSearch(() => tree, value, delay);
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
  return { tree, box, input, press, type, search, count, current };
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

  it('shows "+" when there are more matches than it counts', () => {
    const { search, count } = setup(Array.from({ length: 10_005 }, () => 'x'));
    search('x');
    expect(count()).toBe('1 of 10,000+');
  });
});
