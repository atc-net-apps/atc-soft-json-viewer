import { describe, expect, it, vi } from 'vitest';
import { enableKeyboard } from './keyboard';
import { enableSelection } from './selection';
import { renderTree, setExpanded } from './tree';

const ORDER = { orderId: 'A-1001', customer: { name: 'Contoso', address: { city: 'København' } }, items: [1, 2], paid: true };

function setup(value: unknown = ORDER, options: Parameters<typeof renderTree>[1] = {}) {
  const tree = renderTree(value, options);
  document.body.replaceChildren(tree);
  const selection = enableSelection(tree, (row) => keyboard.activate(row));
  const keyboard = enableKeyboard(tree, { select: (row) => selection.select(row) });
  tree.focus();
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    tree.dispatchEvent(event);
    return event;
  };
  const activeId = () => tree.getAttribute('aria-activedescendant');
  const active = () => (activeId() ? tree.querySelector<HTMLElement>(`#${activeId()}`)?.dataset.path : undefined);
  const row = (path: string) => tree.querySelector<HTMLElement>(`.row[data-path="${path}"]`) as HTMLElement;
  const isFolded = (path: string) => row(path).parentElement?.classList.contains('collapsed');
  return { tree, press, active, row, isFolded, selection };
}

describe('enableKeyboard', () => {
  it('makes the tree one Tab stop, with the fold buttons out of the Tab order', () => {
    const { tree } = setup();
    expect(tree.tabIndex).toBe(0);
    expect(tree.getAttribute('role')).toBe('tree');
    expect(Array.from(tree.querySelectorAll<HTMLButtonElement>('.toggle, .expand-all')).every((button) => button.tabIndex === -1)).toBe(true);
  });

  it('starts at the first line when the tree gets focus', () => {
    const { active } = setup();
    expect(active()).toBe('$');
  });

  it('moves down and up the lines you can see, and selects them', () => {
    const { press, active, row } = setup();

    press('ArrowDown');
    expect(active()).toBe('$.orderId');
    expect(row('$.orderId').getAttribute('aria-selected')).toBe('true');

    press('ArrowDown');
    expect(active()).toBe('$.customer');
    // customer is folded, so its lines are skipped.
    press('ArrowDown');
    expect(active()).toBe('$.items');

    press('ArrowUp');
    expect(active()).toBe('$.customer');
  });

  it('skips the lines of an object that was unfolded and folded again', () => {
    const { press, active, row } = setup();
    const customer = row('$.customer').parentElement as Element;
    setExpanded(customer, true);
    setExpanded(customer, false);
    press('ArrowDown');
    press('ArrowDown');

    press('ArrowDown');

    expect(active()).toBe('$.items');
  });

  it('jumps to the first and last line with Home and End', () => {
    const { press, active } = setup();
    press('End');
    expect(active()).toBe('$.paid');
    press('Home');
    expect(active()).toBe('$');
  });

  it('unfolds with the right arrow key, then goes to the first child', () => {
    const { press, active, isFolded } = setup();
    press('ArrowDown');
    press('ArrowDown');

    press('ArrowRight');
    expect(isFolded('$.customer')).toBe(false);
    expect(active()).toBe('$.customer');

    press('ArrowRight');
    expect(active()).toBe('$.customer.name');
  });

  it('goes to the parent with the left arrow key, then folds it', () => {
    const { tree, press, active, isFolded, row } = setup();
    setExpanded(row('$.customer').parentElement as Element, true);
    row('$.customer.name').click();
    tree.focus();

    press('ArrowLeft');
    expect(active()).toBe('$.customer');

    press('ArrowLeft');
    expect(isFolded('$.customer')).toBe(true);
  });

  it('folds and unfolds with Enter', () => {
    const { press, isFolded } = setup();
    press('ArrowDown');
    press('ArrowDown');

    press('Enter');
    expect(isFolded('$.customer')).toBe(false);
    press('Enter');
    expect(isFolded('$.customer')).toBe(true);
  });

  it('unfolds and folds everything inside with *', () => {
    const { press, isFolded } = setup();
    press('ArrowDown');
    press('ArrowDown');

    press('*');
    expect(isFolded('$.customer.address')).toBe(false);
    press('*');
    expect(isFolded('$.customer')).toBe(true);
  });

  it('opens the link on a line with Enter', () => {
    const { press, row, tree } = setup({ site: 'https://contoso.example' });
    const link = row('$.site').querySelector('a') as HTMLAnchorElement;
    const opened = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', opened);
    tree.focus();
    press('ArrowDown');

    press('Enter');

    expect(opened).toHaveBeenCalled();
  });

  it('shows a token or a time with Enter, as a click on it would', () => {
    const token =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjdXN0b21lci00NzExIiwiZXhwIjoxNzkyNzQ5MzAwfQ.c2ln';
    const { press, row } = setup({ token, updatedAt: 1792745700 });

    press('ArrowDown');
    press('Enter');
    expect(row('$.token').querySelector('.jwt-box')).not.toBeNull();

    press('ArrowDown');
    press('Enter');
    expect(row('$.updatedAt').querySelector('.timestamp-info')).not.toBeNull();
  });

  it('takes links, JWT chips and "Show more" out of the Tab order', () => {
    const token = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln';
    const { tree } = setup({ site: 'https://contoso.example', token, list: [1, 2, 3] }, { pageSize: 2, expandDepth: 2 });
    const controls = Array.from(tree.querySelectorAll<HTMLElement>('a, .jwt-chip, .more'));
    expect(controls).toHaveLength(3);
    expect(controls.every((control) => control.tabIndex === -1)).toBe(true);
  });

  it('keeps the keys working after "Show more" is clicked with the mouse', () => {
    const { press, active, tree } = setup(Array.from({ length: 5 }, (_, i) => i), { pageSize: 2 });
    const more = tree.querySelector('.more') as HTMLButtonElement;
    more.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    more.click();

    expect(active()).toBe('$[2]');
    press('ArrowDown');
    expect(active()).toBe('$[3]');
  });

  it('draws the next page with Enter on "Show more", and goes to its first line', () => {
    const { press, active, tree } = setup(Array.from({ length: 5 }, (_, i) => i), { pageSize: 2 });
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(tree.querySelector(`#${tree.getAttribute('aria-activedescendant')} .more`)).not.toBeNull();

    press('Enter');

    expect(active()).toBe('$[2]');
  });

  it('moves on from the line that was clicked', () => {
    const { tree, press, active, row } = setup({ a: 1, b: 2, c: 3 });

    row('$.b').click();
    tree.focus();
    press('ArrowDown');

    expect(active()).toBe('$.c');
  });

  it('goes on from a line selected some other way, such as by search', () => {
    const { press, active, row, selection } = setup({ a: 1, b: 2, c: 3 });
    selection.select(row('$.c'));
    press('ArrowUp');
    expect(active()).toBe('$.b');
  });

  it('stops scrolling the page only for the keys it uses', () => {
    const { press } = setup();
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(press('a').defaultPrevented).toBe(false);
    expect(press('ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('marks folded and unfolded lines for screen readers', () => {
    const { row } = setup();
    expect(row('$').getAttribute('aria-expanded')).toBe('true');
    expect(row('$.customer').getAttribute('aria-expanded')).toBe('false');
    expect(row('$.customer').getAttribute('role')).toBe('treeitem');
    expect(row('$.customer').getAttribute('aria-level')).toBe('2');
  });

  it('shows the outline on the current line only after a key is used', () => {
    const { tree, press } = setup();
    expect(tree.classList.contains('keyboard')).toBe(false);
    press('ArrowDown');
    expect(tree.classList.contains('keyboard')).toBe(true);
    tree.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(tree.classList.contains('keyboard')).toBe(false);
  });

  it('lets a link inside the tree handle its own keys', () => {
    const { tree } = setup({ site: 'https://contoso.example', other: 1 });
    const onKey = vi.fn();
    const link = tree.querySelector('a') as HTMLAnchorElement;
    link.addEventListener('keydown', onKey);

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(onKey).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
