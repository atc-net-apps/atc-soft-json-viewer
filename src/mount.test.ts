import { afterEach, describe, expect, it } from 'vitest';
import { getMountedRoot, toggleViewer } from './mount';

const JSON_PAGE = '<pre>{"orderId": "A-1001", "items": [1, 2]}</pre><div class="json-formatter-container"></div>';

function page(html: string): Document {
  document.body.innerHTML = html;
  document.body.removeAttribute('style');
  return document;
}

afterEach(() => {
  // Leave no viewer mounted between tests.
  if (getMountedRoot()) {
    toggleViewer(document, 'application/json');
  }
});

describe('toggleViewer', () => {
  it('formats a raw JSON page', () => {
    const doc = page(JSON_PAGE);

    expect(toggleViewer(doc, 'application/json')).toBe('formatted');

    expect(doc.getElementById('atc-json-viewer')).not.toBeNull();
    expect(getMountedRoot()?.querySelector('.row[data-path="$.orderId"]')?.textContent).toBe('"orderId": "A-1001",');
    expect(doc.querySelector('pre')?.style.getPropertyValue('display')).toBe('none');
    expect(doc.querySelector<HTMLElement>('.json-formatter-container')?.style.getPropertyValue('display')).toBe('none');
    expect(doc.body.style.getPropertyValue('margin')).toBe('0px');
  });

  it('restores the page exactly on the second click', () => {
    const doc = page(JSON_PAGE);
    const before = doc.body.outerHTML;

    toggleViewer(doc, 'application/json');
    expect(toggleViewer(doc, 'application/json')).toBe('restored');

    expect(doc.body.outerHTML).toBe(before);
    expect(getMountedRoot()).toBeUndefined();
  });

  it("keeps the browser's own styles on a plain-text <pre>", () => {
    const doc = page('<pre style="word-wrap: break-word; white-space: pre-wrap;">[1, 2, 3]</pre>');
    const before = doc.body.outerHTML;

    expect(toggleViewer(doc, 'text/plain')).toBe('formatted');
    toggleViewer(doc, 'text/plain');

    expect(doc.body.outerHTML).toBe(before);
  });

  it('formats JSON sent as plain text', () => {
    const doc = page('<pre>{"a": 1}</pre>');
    expect(toggleViewer(doc, 'text/plain')).toBe('formatted');
  });

  it('shows where broken JSON is broken', () => {
    const doc = page('<pre>{"a": 1,}</pre>');

    expect(toggleViewer(doc, 'application/json')).toBe('formatted');

    const error = getMountedRoot()?.querySelector('.parse-error');
    expect(error?.textContent).toContain('Line 1, column 8: Trailing comma');
  });

  it.each([
    ['plain text that is not JSON', '<pre>Hello world</pre>', 'text/plain'],
    ['a normal web page', '<h1>Welcome</h1><p>{"a": 1}</p>', 'text/html'],
    ['an HTML page with only a <pre>', '<pre>{"a": 1}</pre>', 'text/html'],
    ['a JSON page another extension already changed', '<pre>{"a": 1}</pre><div id="other-viewer"></div>', 'application/json'],
    ['an empty page', '', 'application/json'],
  ])('does not change %s', (_, html, contentType) => {
    const doc = page(html);
    const before = doc.body.outerHTML;

    expect(toggleViewer(doc, contentType)).toBe('not-json');

    expect(doc.body.outerHTML).toBe(before);
    expect(getMountedRoot()).toBeUndefined();
  });
});
