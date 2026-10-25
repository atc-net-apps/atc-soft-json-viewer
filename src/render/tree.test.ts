import { describe, expect, it } from 'vitest';
import { BigNumber } from '../parse';
import { getRowValue, isWebUrl, renderTree, setExpanded } from './tree';

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
