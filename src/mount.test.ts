import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getMountedRoot, toggleViewer } from './mount';
import { loadSettings, saveSettings } from './settings';

const JSON_PAGE = '<pre>{"orderId": "A-1001", "customer": {"address": {"city": "Aarhus"}}}</pre><div class="json-formatter-container"></div>';

function page(html: string): Document {
  document.body.innerHTML = html;
  document.body.removeAttribute('style');
  return document;
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(async () => {
  // Leave no viewer mounted between tests.
  if (getMountedRoot()) {
    await toggleViewer(document, 'application/json');
  }
});

describe('toggleViewer', () => {
  it('formats a raw JSON page', async () => {
    const doc = page(JSON_PAGE);

    expect(await toggleViewer(doc, 'application/json')).toBe('formatted');

    expect(doc.getElementById('atc-json-viewer')).not.toBeNull();
    expect(getMountedRoot()?.querySelector('.row[data-path="$.orderId"]')?.textContent).toBe('"orderId": "A-1001",');
    expect(doc.querySelector('pre')?.style.getPropertyValue('display')).toBe('none');
    expect(doc.querySelector<HTMLElement>('.json-formatter-container')?.style.getPropertyValue('display')).toBe('none');
    expect(doc.body.style.getPropertyValue('margin')).toBe('0px');
  });

  it('shows a toolbar and a status bar around the document', async () => {
    page('<pre>{"a": 1}</pre>');

    await toggleViewer(document, 'application/json');

    const root = getMountedRoot();
    expect(root?.querySelector('.toolbar .brand')?.textContent).toBe('ATC JSON Viewer');
    expect(root?.querySelector('.status-type')?.textContent).toBe('application/json');
    expect(root?.querySelector('.status-size')?.textContent).toBe('8 B');
  });

  it('unfolds two levels by default', async () => {
    page(JSON_PAGE);

    await toggleViewer(document, 'application/json');

    const root = getMountedRoot();
    expect(root?.querySelector('.row[data-path="$.customer.address"]')).not.toBeNull();
    expect(root?.querySelector('.row[data-path="$.customer.address.city"]')).toBeNull();
  });

  it('uses the stored unfold depth and font size', async () => {
    await saveSettings({ unfoldDepth: 3, fontSize: 16 });
    page(JSON_PAGE);

    await toggleViewer(document, 'application/json');

    expect(getMountedRoot()?.querySelector('.row[data-path="$.customer.address.city"]')).not.toBeNull();
    expect(document.getElementById('atc-json-viewer')?.style.getPropertyValue('--font-size')).toBe('16px');
  });

  describe('Raw / Tree toggle', () => {
    const RAW = '{"b":1,   "a": [1,2]}';
    const pressed = () => getMountedRoot()?.querySelector('.toolbar-view [aria-pressed="true"]')?.textContent;
    const visible = (view: string) => {
      const element = getMountedRoot()?.querySelector<HTMLElement>(`[data-view="${view}"]`);
      return element ? !element.hidden : false;
    };

    it('starts in the tree and builds the raw view only when it is first shown', async () => {
      page(`<pre>${RAW}</pre>`);
      await toggleViewer(document, 'application/json');

      expect(pressed()).toBe('Tree');
      expect(visible('tree')).toBe(true);
      expect(getMountedRoot()?.querySelector('[data-view="raw"]')).toBeNull();
    });

    it('shows the text exactly as sent, and remembers the choice', async () => {
      page(`<pre>${RAW}</pre>`);
      await toggleViewer(document, 'application/json');

      getMountedRoot()?.querySelector<HTMLButtonElement>('.toolbar-view [data-value="raw"]')?.click();

      expect(pressed()).toBe('Raw');
      expect(visible('raw')).toBe(true);
      expect(visible('tree')).toBe(false);
      expect(getMountedRoot()?.querySelector('.raw')?.textContent).toBe(RAW);
      await vi.waitFor(async () => expect((await loadSettings()).view).toBe('raw'));
    });

    it('opens in the raw view when that was the last choice', async () => {
      await saveSettings({ view: 'raw' });
      page(`<pre>${RAW}</pre>`);
      await toggleViewer(document, 'application/json');

      expect(pressed()).toBe('Raw');
      expect(visible('raw')).toBe(true);
    });

    it('shows broken JSON as raw text too', async () => {
      page('<pre>{"a": 1,}</pre>');
      await toggleViewer(document, 'application/json');

      getMountedRoot()?.querySelector<HTMLButtonElement>('.toolbar-view [data-value="raw"]')?.click();
      expect(getMountedRoot()?.querySelector('.raw')?.textContent).toBe('{"a": 1,}');
    });
  });

  it('restores the page exactly on the second click', async () => {
    const doc = page(JSON_PAGE);
    const before = doc.body.outerHTML;

    await toggleViewer(doc, 'application/json');
    expect(await toggleViewer(doc, 'application/json')).toBe('restored');

    expect(doc.body.outerHTML).toBe(before);
    expect(getMountedRoot()).toBeUndefined();
  });

  it('restores the page when clicked again before the viewer has finished loading', async () => {
    const doc = page(JSON_PAGE);
    const before = doc.body.outerHTML;

    const first = toggleViewer(doc, 'application/json');
    const second = toggleViewer(doc, 'application/json');

    expect(await second).toBe('restored');
    await first;
    expect(doc.body.outerHTML).toBe(before);
  });

  it("keeps the browser's own styles on a plain-text <pre>", async () => {
    const doc = page('<pre style="word-wrap: break-word; white-space: pre-wrap;">[1, 2, 3]</pre>');
    const before = doc.body.outerHTML;

    expect(await toggleViewer(doc, 'text/plain')).toBe('formatted');
    await toggleViewer(doc, 'text/plain');

    expect(doc.body.outerHTML).toBe(before);
  });

  it('formats JSON sent as plain text', async () => {
    const doc = page('<pre>{"a": 1}</pre>');
    expect(await toggleViewer(doc, 'text/plain')).toBe('formatted');
  });

  it('shows where broken JSON is broken', async () => {
    const doc = page('<pre>{"a": 1,}</pre>');

    expect(await toggleViewer(doc, 'application/json')).toBe('formatted');

    const error = getMountedRoot()?.querySelector('.parse-error');
    expect(error?.textContent).toContain('Line 1, column 8: Trailing comma');
  });

  it.each([
    ['plain text that is not JSON', '<pre>Hello world</pre>', 'text/plain'],
    ['a normal web page', '<h1>Welcome</h1><p>{"a": 1}</p>', 'text/html'],
    ['an HTML page with only a <pre>', '<pre>{"a": 1}</pre>', 'text/html'],
    ['a JSON page another extension already changed', '<pre>{"a": 1}</pre><div id="other-viewer"></div>', 'application/json'],
    ['an empty page', '', 'application/json'],
  ])('does not change %s', async (_, html, contentType) => {
    const doc = page(html);
    const before = doc.body.outerHTML;

    expect(await toggleViewer(doc, contentType)).toBe('not-json');

    expect(doc.body.outerHTML).toBe(before);
    expect(getMountedRoot()).toBeUndefined();
  });
});
