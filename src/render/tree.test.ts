import { describe, expect, it } from 'vitest';
import { BigNumber } from '../parse';
import {
  countLabel,
  expandToLevel,
  getRowKeys,
  getRowValue,
  isWebUrl,
  renderTree,
  revealPath,
  setExpanded,
  setExpandedDeep,
  setSearch,
} from './tree';

const row = (tree: HTMLElement, path: string) => tree.querySelector<HTMLElement>(`.row[data-path="${path}"]`);
const rowText = (tree: HTMLElement, path: string) => row(tree, path)?.textContent;
const branchOf = (tree: HTMLElement, path: string) => row(tree, path)?.closest('.branch') as HTMLElement;

describe('renderTree', () => {
  it('gives every kind of value its own style', () => {
    const tree = renderTree({ s: 'text', n: 1.5, b: true, z: null });
    expect(row(tree, '$.s')?.querySelector('.string')?.textContent).toBe('"text"');
    expect(row(tree, '$.n')?.querySelector('.number')?.textContent).toBe('1.5');
    expect(row(tree, '$.b')?.querySelector('.boolean')?.textContent).toBe('true');
    expect(row(tree, '$.z')?.querySelector('.null')?.textContent).toBe('null');
  });

  it('writes keys and commas like JSON, with no comma after the last entry', () => {
    const tree = renderTree({ a: 1, b: 2 });
    expect(rowText(tree, '$.a')).toBe('"a": 1,');
    expect(rowText(tree, '$.b')).toBe('"b": 2');
  });

  it('gives every line its JSON path, including array items', () => {
    const tree = renderTree({ items: [{ sku: 'A-1' }] }, { expandDepth: 3 });
    expect(rowText(tree, '$.items[0].sku')).toBe('"sku": "A-1"');
    expect(rowText(tree, '$.items[0]')).toContain('{');
  });

  it('shows strings with JSON escapes', () => {
    const tree = renderTree({ text: 'line 1\nline "2"' });
    expect(row(tree, '$.text')?.querySelector('.string')?.textContent).toBe('"line 1\\nline \\"2\\""');
  });

  it('shows big numbers with their exact digits', () => {
    const tree = renderTree({ ledgerId: new BigNumber('9007199254740993') });
    const number = row(tree, '$.ledgerId')?.querySelector('.number.big-number');
    expect(number?.textContent).toBe('9007199254740993');
  });

  it('draws empty objects and arrays on one line without a fold arrow', () => {
    const tree = renderTree({ o: {}, a: [] });
    expect(rowText(tree, '$.o')).toBe('"o": {},');
    expect(rowText(tree, '$.a')).toBe('"a": []');
    expect(row(tree, '$.o')?.querySelector('.toggle')).toBeNull();
  });

  it('draws a document that is a single value on one line', () => {
    expect(rowText(renderTree(42), '$')).toBe('42');
  });

  it('never turns text from the page into HTML', () => {
    const tree = renderTree({ '<img src=x onerror=alert(1)>': '<script>alert(1)</script>' });
    expect(tree.querySelector('img, script')).toBeNull();
    expect(tree.textContent).toContain('<script>alert(1)</script>');
  });

  it('indents each line by its depth', () => {
    const tree = renderTree({ a: { b: 1 } }, { expandDepth: 2 });
    expect(row(tree, '$.a.b')?.style.getPropertyValue('--depth')).toBe('2');
  });

  describe('folding', () => {
    it('unfolds the top level by default and folds deeper levels', () => {
      const tree = renderTree({ outer: { inner: 1 } });
      expect(branchOf(tree, '$').classList.contains('collapsed')).toBe(false);
      expect(branchOf(tree, '$.outer').classList.contains('collapsed')).toBe(true);
    });

    it('builds the children of a folded object only when it is first unfolded', () => {
      const tree = renderTree({ outer: { inner: 1 } });
      expect(row(tree, '$.outer.inner')).toBeNull();

      setExpanded(branchOf(tree, '$.outer'), true);
      expect(rowText(tree, '$.outer.inner')).toBe('"inner": 1');
    });

    it('folds and unfolds when the fold arrow is clicked, and keeps the children', () => {
      const tree = renderTree({ outer: { inner: 1 } });
      const toggle = row(tree, '$.outer')?.querySelector<HTMLButtonElement>('.toggle');
      const branch = branchOf(tree, '$.outer');

      toggle?.click();
      expect(branch.classList.contains('collapsed')).toBe(false);
      expect(toggle?.getAttribute('aria-expanded')).toBe('true');

      toggle?.click();
      expect(branch.classList.contains('collapsed')).toBe(true);
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      expect(row(tree, '$.outer.inner')).not.toBeNull();
    });

    it('starts fully folded when asked to', () => {
      const tree = renderTree({ a: 1 }, { expandDepth: 0 });
      expect(branchOf(tree, '$').classList.contains('collapsed')).toBe(true);
      expect(row(tree, '$.a')).toBeNull();
    });
  });

  describe('unfold everything inside', () => {
    const NESTED = { a: { b: { c: { d: 1 } } }, other: { x: 1 } };
    const expandAll = (tree: HTMLElement, path: string) => row(tree, path)?.querySelector<HTMLButtonElement>('.expand-all');
    const toggle = (tree: HTMLElement, path: string) => row(tree, path)?.querySelector<HTMLButtonElement>('.toggle');

    it('unfolds everything inside when ⇊ is clicked, and folds it all again when ⇈ is clicked', () => {
      const tree = renderTree(NESTED);

      expandAll(tree, '$.a')?.click();
      expect(rowText(tree, '$.a.b.c.d')).toBe('"d": 1');
      expect(branchOf(tree, '$.a').classList.contains('deep')).toBe(true);
      expect(expandAll(tree, '$.a')?.getAttribute('aria-label')).toBe('Fold everything inside');

      expandAll(tree, '$.a')?.click();
      expect(branchOf(tree, '$.a').classList.contains('collapsed')).toBe(true);
      expect(branchOf(tree, '$.a.b.c').classList.contains('collapsed')).toBe(true);
      expect(expandAll(tree, '$.a')?.getAttribute('aria-label')).toBe('Unfold everything inside');
    });

    it('does the same on Alt+click on the fold arrow', () => {
      const tree = renderTree(NESTED);

      toggle(tree, '$.a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));

      expect(rowText(tree, '$.a.b.c.d')).toBe('"d": 1');
      expect(branchOf(tree, '$.a').classList.contains('deep')).toBe(true);
    });

    it('switches back to ⇊ as soon as anything inside is folded again', () => {
      const tree = renderTree(NESTED);
      expandAll(tree, '$.a')?.click();

      toggle(tree, '$.a.b.c')?.click();

      expect(branchOf(tree, '$.a').classList.contains('deep')).toBe(false);
      expect(branchOf(tree, '$.a.b').classList.contains('deep')).toBe(false);
      expect(expandAll(tree, '$.a')?.getAttribute('aria-label')).toBe('Unfold everything inside');
      expect(branchOf(tree, '$.a').classList.contains('collapsed')).toBe(false);
    });

    it('says on the fold arrow what Alt+click does', () => {
      const tree = renderTree(NESTED);
      expect(toggle(tree, '$.a')?.title).toBe('Click to unfold · Alt+click to unfold everything inside');

      expandAll(tree, '$.a')?.click();
      expect(toggle(tree, '$.a')?.title).toBe('Click to fold · Alt+click to fold everything inside');
    });

    it("keeps ⇊ out of the line's text, so copying a line copies only JSON", () => {
      const tree = renderTree({ a: { b: 1 }, c: 1 }, { counts: false });
      expect(expandAll(tree, '$.a')).not.toBeNull();
      expect(rowText(tree, '$.a')).toBe('"a": { … },');
    });
  });

  describe('big objects and arrays', () => {
    it('draws children a page at a time with a "Show more" button', () => {
      const items = Array.from({ length: 1200 }, (_, i) => i);
      const tree = renderTree(items, { pageSize: 500 });
      const children = () => tree.querySelectorAll('.children > .row[data-path]').length;
      const more = () => tree.querySelector<HTMLButtonElement>('.more');

      expect(children()).toBe(500);
      expect(more()?.textContent).toBe('Show 500 more (700 not shown)');

      more()?.click();
      expect(children()).toBe(1000);
      expect(more()?.textContent).toBe('Show 200 more (200 not shown)');

      more()?.click();
      expect(children()).toBe(1200);
      expect(more()).toBeNull();
      expect(rowText(tree, '$[1199]')).toBe('1199');
      expect(rowText(tree, '$[499]')).toBe('499,');
    });
  });

  describe('item counts', () => {
    const count = (tree: HTMLElement, path: string) => row(tree, path)?.querySelector('.count')?.textContent;

    it('shows how many items an array has and how many keys an object has', () => {
      const tree = renderTree({ items: [1, 2, 3], customer: { id: 1, name: 'Contoso' } });
      expect(count(tree, '$')).toBe('2 keys');
      expect(count(tree, '$.items')).toBe('3 items');
      expect(count(tree, '$.customer')).toBe('2 keys');
    });

    it('shows the count on folded and unfolded objects alike', () => {
      const tree = renderTree({ outer: { inner: { a: 1 } } }, { expandDepth: 2 });
      expect(branchOf(tree, '$.outer').classList.contains('collapsed')).toBe(false);
      expect(branchOf(tree, '$.outer.inner').classList.contains('collapsed')).toBe(true);
      expect(count(tree, '$.outer')).toBe('1 key');
      expect(count(tree, '$.outer.inner')).toBe('1 key');
    });

    it('shows no count on empty objects and arrays', () => {
      const tree = renderTree({ none: [], nothing: {} });
      expect(count(tree, '$.none')).toBeUndefined();
      expect(count(tree, '$.nothing')).toBeUndefined();
    });

    it('shows no counts when counts are switched off', () => {
      const tree = renderTree({ items: [1, 2] }, { counts: false });
      expect(tree.querySelector('.count')).toBeNull();
    });
  });

  describe('timestamps', () => {
    const ORDER = { placedAt: '2026-10-23T09:15:00Z', updatedAt: 1792745700, quantity: 1700000000, items: ['2026-10-23T09:15:00Z'] };
    const value = (tree: HTMLElement, path: string) => row(tree, path)?.querySelector<HTMLElement>('.string, .number');

    it('underlines dates and Unix times, and nothing else', () => {
      const tree = renderTree(ORDER, { expandDepth: 2 });

      expect(value(tree, '$.placedAt')?.classList.contains('timestamp')).toBe(true);
      expect(value(tree, '$.updatedAt')?.classList.contains('timestamp')).toBe(true);
      expect(value(tree, '$.items[0]')?.classList.contains('timestamp')).toBe(true);
      expect(value(tree, '$.quantity')?.classList.contains('timestamp')).toBe(false);
    });

    it('shows the local time and how long ago when a time is clicked, and hides it on the next click', () => {
      const tree = renderTree(ORDER);
      const time = value(tree, '$.updatedAt') as HTMLElement;

      time.click();
      const info = row(tree, '$.updatedAt')?.querySelector('.timestamp-info');
      expect(info?.textContent).toMatch(/2026.* · .+/);
      expect(info?.previousElementSibling).toBe(time);

      time.click();
      expect(row(tree, '$.updatedAt')?.querySelector('.timestamp-info')).toBeNull();
    });

    it('keeps the value itself unchanged', () => {
      const tree = renderTree(ORDER);
      expect(rowText(tree, '$.placedAt')).toBe('"placedAt": "2026-10-23T09:15:00Z",');
    });

    it('underlines no times when they are switched off', () => {
      const tree = renderTree(ORDER, { timestamps: false });
      expect(tree.querySelector('.timestamp')).toBeNull();
    });
  });

  describe('links', () => {
    it('turns http and https addresses into links that open in a new tab', () => {
      const tree = renderTree({ site: 'https://contoso.example/about', api: 'http://localhost:5179/orders.json' });
      const link = row(tree, '$.site')?.querySelector('a');

      expect(link?.href).toBe('https://contoso.example/about');
      expect(link?.target).toBe('_blank');
      expect(link?.rel).toBe('noopener noreferrer');
      expect(rowText(tree, '$.site')).toBe('"site": "https://contoso.example/about",');
      expect(row(tree, '$.api')?.querySelector('a')).not.toBeNull();
    });

    it.each([
      ['a javascript: address', 'javascript:alert(1)'],
      ['a file: address', 'file:///C:/Windows/win.ini'],
      ['a data: address', 'data:text/html,<script>alert(1)</script>'],
      ['a mailto: address', 'mailto:orders@contoso.example'],
      ['text around an address', 'see https://contoso.example'],
      ['an address with a space', 'https://contoso.example/a b'],
      ['a scheme without a host', 'https://'],
    ])('does not turn %s into a link', (_, text) => {
      const tree = renderTree({ value: text });
      expect(row(tree, '$.value')?.querySelector('a')).toBeNull();
      expect(rowText(tree, '$.value')).toBe(`"value": ${JSON.stringify(text)}`);
    });

    it('makes no links when links are switched off', () => {
      const tree = renderTree({ site: 'https://contoso.example' }, { links: false });
      expect(tree.querySelector('a')).toBeNull();
    });
  });
});

describe('setExpandedDeep', () => {
  const NESTED = { a: { b: { c: { d: 1 } } }, other: { x: { y: 1 } } };
  const isFolded = (tree: HTMLElement, path: string) => branchOf(tree, path).classList.contains('collapsed');

  it('unfolds every object and array inside, and nothing outside it', () => {
    const tree = renderTree(NESTED);

    setExpandedDeep(branchOf(tree, '$.a'), true);

    expect(isFolded(tree, '$.a')).toBe(false);
    expect(isFolded(tree, '$.a.b')).toBe(false);
    expect(isFolded(tree, '$.a.b.c')).toBe(false);
    expect(isFolded(tree, '$.other')).toBe(true);
    expect(row(tree, '$.other.x')).toBeNull();
  });

  it('folds everything inside again', () => {
    const tree = renderTree(NESTED);
    setExpandedDeep(branchOf(tree, '$.a'), true);

    setExpandedDeep(branchOf(tree, '$.a'), false);

    expect(isFolded(tree, '$.a')).toBe(true);
    expect(isFolded(tree, '$.a.b')).toBe(true);
    expect(isFolded(tree, '$.a.b.c')).toBe(true);
    expect(isFolded(tree, '$')).toBe(false);
  });

  it('still draws big arrays a page at a time', () => {
    const tree = renderTree({ items: Array.from({ length: 1200 }, (_, i) => ({ tags: [i] })) });

    setExpandedDeep(branchOf(tree, '$'), true);

    expect(branchOf(tree, '$.items').querySelectorAll(':scope > .children > .branch').length).toBe(500);
    expect(tree.querySelector('.more')?.textContent).toBe('Show 500 more (700 not shown)');
    expect(isFolded(tree, '$.items[499].tags')).toBe(false);
  });

  it('unfolds lines drawn later by "Show more" all the way down', () => {
    const tree = renderTree([{ a: { b: 1 } }, { a: { b: 2 } }, { a: { b: 3 } }], { pageSize: 2 });
    setExpandedDeep(branchOf(tree, '$'), true);

    tree.querySelector<HTMLButtonElement>('.more')?.click();

    expect(rowText(tree, '$[2].a.b')).toBe('"b": 3');
  });
});

describe('expandToLevel', () => {
  const NESTED = { a: { b: { c: { d: 1 } } }, list: [{ id: 1 }] };
  const isFolded = (tree: HTMLElement, path: string) => branchOf(tree, path).classList.contains('collapsed');

  it('unfolds every object and array above the level and folds the deeper ones', () => {
    const tree = renderTree(NESTED);

    expandToLevel(tree, 3);

    expect(isFolded(tree, '$')).toBe(false);
    expect(isFolded(tree, '$.a')).toBe(false);
    expect(isFolded(tree, '$.a.b')).toBe(false);
    expect(isFolded(tree, '$.a.b.c')).toBe(true);
    expect(isFolded(tree, '$.list[0]')).toBe(false);
    expect(rowText(tree, '$.list[0].id')).toBe('"id": 1');
  });

  it('folds objects again when a lower level is chosen', () => {
    const tree = renderTree(NESTED, { expandDepth: 4 });

    expandToLevel(tree, 1);

    expect(isFolded(tree, '$')).toBe(false);
    expect(isFolded(tree, '$.a')).toBe(true);
    // Unfolding one by hand shows what is inside it folded, as at level 1.
    setExpanded(branchOf(tree, '$.a'), true);
    expect(isFolded(tree, '$.a.b')).toBe(true);
  });

  it('unfolds everything at level Infinity', () => {
    const tree = renderTree(NESTED);

    expandToLevel(tree, Infinity);

    expect(tree.querySelector('.branch.collapsed')).toBeNull();
    expect(rowText(tree, '$.a.b.c.d')).toBe('"d": 1');
  });

  it('applies the level to lines drawn later by "Show more"', () => {
    const tree = renderTree([{ id: 1 }, { id: 2 }, { id: 3 }], { pageSize: 2 });

    expandToLevel(tree, 2);
    tree.querySelector<HTMLButtonElement>('.more')?.click();

    expect(isFolded(tree, '$[2]')).toBe(false);
  });

  it('still draws big arrays a page at a time', () => {
    const tree = renderTree({ items: Array.from({ length: 1200 }, (_, i) => ({ i })) });

    expandToLevel(tree, Infinity);

    expect(branchOf(tree, '$.items').querySelectorAll(':scope > .children > .branch').length).toBe(500);
    expect(tree.querySelector('.more')?.textContent).toBe('Show 500 more (700 not shown)');
  });

  it('does nothing for a document that is a single value', () => {
    const tree = renderTree(42);
    expandToLevel(tree, 2);
    expect(rowText(tree, '$')).toBe('42');
  });
});

describe('setSearch', () => {
  const marks = (tree: HTMLElement) => Array.from(tree.querySelectorAll('mark'), (mark) => mark.textContent);

  it('highlights the term in keys and values, ignoring case', () => {
    const tree = renderTree({ sku: 'SKU-1', other: 'x' });

    setSearch(tree, 'sku');

    expect(marks(tree)).toEqual(['sku', 'SKU']);
    expect(row(tree, '$.sku')?.querySelector('.key mark')?.textContent).toBe('sku');
    expect(row(tree, '$.sku')?.querySelector('.string mark')?.textContent).toBe('SKU');
  });

  it('highlights every occurrence in a value', () => {
    const tree = renderTree({ text: 'banana' });
    setSearch(tree, 'an');
    expect(marks(tree)).toEqual(['an', 'an']);
  });

  it('keeps the text of every line the same', () => {
    const tree = renderTree({ sku: 'A-100', n: 100 });

    setSearch(tree, '100');

    expect(rowText(tree, '$.sku')).toBe('"sku": "A-100",');
    expect(rowText(tree, '$.n')).toBe('"n": 100');
  });

  it('never highlights the quotes, counts or brackets', () => {
    const tree = renderTree({ items: [1, 2] });
    setSearch(tree, '"');
    expect(marks(tree)).toEqual([]);
    setSearch(tree, '[');
    expect(marks(tree)).toEqual([]);
    setSearch(tree, 'items');
    expect(marks(tree)).toEqual(['items']);
  });

  it('highlights inside links and keeps them working', () => {
    const tree = renderTree({ site: 'https://contoso.example' });

    setSearch(tree, 'contoso');

    const link = row(tree, '$.site')?.querySelector('a');
    expect(link?.querySelector('mark')?.textContent).toBe('contoso');
    expect(link?.href).toBe('https://contoso.example/');
  });

  it('highlights lines that are drawn later', () => {
    const tree = renderTree({ outer: { sku: 'A-100' } });
    setSearch(tree, 'sku');

    setExpanded(branchOf(tree, '$.outer'), true);

    expect(row(tree, '$.outer.sku')?.querySelector('mark')?.textContent).toBe('sku');
  });

  it('moves the highlights when the term changes and removes them when it is empty', () => {
    const tree = renderTree({ sku: 'A-100' });
    setSearch(tree, 'sku');
    setSearch(tree, 'A-1');
    expect(marks(tree)).toEqual(['A-1']);

    setSearch(tree, '');

    expect(tree.querySelector('mark')).toBeNull();
    expect(rowText(tree, '$.sku')).toBe('"sku": "A-100"');
  });

  it('highlights a document that is a single value', () => {
    const tree = renderTree('hello', { search: 'ell' });
    expect(marks(tree)).toEqual(['ell']);
  });

  it('never turns text from the page into HTML', () => {
    const tree = renderTree({ html: '<img src=x onerror=alert(1)>' });
    setSearch(tree, 'img');
    expect(tree.querySelector('img')).toBeNull();
    expect(marks(tree)).toEqual(['img']);
  });
});

describe('revealPath', () => {
  it('unfolds the objects and arrays on the way and returns the line', () => {
    const tree = renderTree({ a: { b: { c: 1 } } });

    const line = revealPath(tree, ['a', 'b', 'c']);

    expect(line).toBe(row(tree, '$.a.b.c'));
    expect(branchOf(tree, '$.a.b').classList.contains('collapsed')).toBe(false);
  });

  it("returns an object's first line", () => {
    const tree = renderTree({ a: { b: { c: 1 } } });
    expect(revealPath(tree, ['a', 'b'])).toBe(row(tree, '$.a.b'));
  });

  it('draws "Show more" pages until the entry is shown', () => {
    const tree = renderTree({ items: Array.from({ length: 2000 }, (_, i) => i) }, { pageSize: 500 });

    expect(revealPath(tree, ['items', 1100])?.textContent).toBe('1100,');
    expect(tree.querySelector('.more')?.textContent).toBe('Show 500 more (500 not shown)');
  });

  it('does not draw more pages when asked not to', () => {
    const tree = renderTree({ items: Array.from({ length: 1200 }, (_, i) => i) }, { pageSize: 500 });

    expect(revealPath(tree, ['items', 1100], false)).toBeNull();
    expect(branchOf(tree, '$.items').classList.contains('collapsed')).toBe(false);
    expect(tree.querySelectorAll('.children > .row[data-path]').length).toBe(500);
  });

  it('returns nothing for a path that is not in the document', () => {
    const tree = renderTree({ a: { b: 1 } });
    expect(revealPath(tree, ['a', 'missing'])).toBeNull();
    expect(revealPath(tree, ['a', 'b', 'c'])).toBeNull();
  });

  it('returns the root line for an empty path', () => {
    const tree = renderTree(42);
    expect(revealPath(tree, [])).toBe(row(tree, '$'));
  });
});

describe('countLabel', () => {
  it.each([
    [0, '0 items'],
    [1, '1 item'],
    [2, '2 items'],
    [1200, '1,200 items'],
  ])('labels an array of %i as %s', (count, label) => {
    expect(countLabel(count, true)).toBe(label);
  });

  it.each([
    [1, '1 key'],
    [5, '5 keys'],
  ])('labels an object with %i keys as %s', (count, label) => {
    expect(countLabel(count, false)).toBe(label);
  });
});

describe('isWebUrl', () => {
  it.each(['https://contoso.example', 'HTTP://CONTOSO.EXAMPLE/A?b=1#c', 'https://tracking.example/track?id=PN123&lang=da'])(
    'accepts %s',
    (text) => {
      expect(isWebUrl(text)).toBe(true);
    },
  );

  it.each(['ftp://files.example', 'javascript:alert(1)', 'https://'])('rejects %s', (text) => {
    expect(isWebUrl(text)).toBe(false);
  });
});

describe('getRowKeys', () => {
  it('gives the keys from the root down to a line', () => {
    const tree = renderTree({ items: [{ sku: 'A-1' }, { sku: 'B-2' }] }, { expandDepth: 3 });

    expect(getRowKeys(row(tree, '$.items[1].sku') as HTMLElement)).toEqual(['items', 1, 'sku']);
    expect(getRowKeys(row(tree, '$.items[1]') as HTMLElement)).toEqual(['items', 1]);
    expect(getRowKeys(row(tree, '$') as HTMLElement)).toEqual([]);
  });

  it('gives the keys of lines drawn by "Show more"', () => {
    const tree = renderTree(Array.from({ length: 700 }, (_, i) => i), { pageSize: 500 });
    tree.querySelector<HTMLButtonElement>('.more')?.click();
    expect(getRowKeys(row(tree, '$[650]') as HTMLElement)).toEqual([650]);
  });
});

describe('getRowValue', () => {
  it('returns the value behind each line', () => {
    const value = { a: 1, o: { b: [true] }, e: [] };
    const tree = renderTree(value, { expandDepth: 3 });

    expect(getRowValue(row(tree, '$') as HTMLElement)).toBe(value);
    expect(getRowValue(row(tree, '$.a') as HTMLElement)).toBe(1);
    expect(getRowValue(row(tree, '$.o') as HTMLElement)).toEqual({ b: [true] });
    expect(getRowValue(row(tree, '$.o.b[0]') as HTMLElement)).toBe(true);
    expect(getRowValue(row(tree, '$.e') as HTMLElement)).toEqual([]);
  });

  it('returns nothing for closing-bracket lines', () => {
    const tree = renderTree({ o: { b: 1 } }, { expandDepth: 2 });
    expect(getRowValue(tree.querySelector('.branch-tail') as HTMLElement)).toBeUndefined();
  });
});
