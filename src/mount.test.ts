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

  it('hides item counts when the stored settings switch them off', async () => {
    await saveSettings({ counts: false });
    page(JSON_PAGE);

    await toggleViewer(document, 'application/json');

    expect(getMountedRoot()?.querySelector('.count')).toBeNull();
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

  describe('unfold to level', () => {
    const root = () => getMountedRoot() as ShadowRoot;
    const levelButton = (label: string) =>
      Array.from(root().querySelectorAll<HTMLButtonElement>('.toolbar-levels button')).find((button) => button.textContent === label);
    const isFolded = (path: string) => root().querySelector(`.row[data-path="${path}"]`)?.closest('.branch')?.classList.contains('collapsed');

    it('unfolds and folds the tree from the toolbar', async () => {
      page(JSON_PAGE);
      await toggleViewer(document, 'application/json');

      levelButton('All')?.click();
      expect(isFolded('$.customer.address')).toBe(false);
      expect(root().querySelector('.row[data-path="$.customer.address.city"]')).not.toBeNull();

      levelButton('1')?.click();
      expect(isFolded('$')).toBe(false);
      expect(isFolded('$.customer')).toBe(true);
    });

    it('hides the level buttons in the raw view', async () => {
      page(JSON_PAGE);
      await toggleViewer(document, 'application/json');
      const levels = root().querySelector<HTMLElement>('.toolbar-levels');
      expect(levels?.hidden).toBe(false);

      root().querySelector<HTMLButtonElement>('.toolbar-view [data-value="raw"]')?.click();
      expect(levels?.hidden).toBe(true);

      root().querySelector<HTMLButtonElement>('.toolbar-view [data-value="tree"]')?.click();
      expect(levels?.hidden).toBe(false);
    });

    it('works after starting in the raw view', async () => {
      await saveSettings({ view: 'raw' });
      page(JSON_PAGE);
      await toggleViewer(document, 'application/json');
      expect(root().querySelector<HTMLElement>('.toolbar-levels')?.hidden).toBe(true);

      root().querySelector<HTMLButtonElement>('.toolbar-view [data-value="tree"]')?.click();
      levelButton('All')?.click();
      expect(isFolded('$.customer.address')).toBe(false);
    });

    it('shows no level buttons for broken JSON', async () => {
      page('<pre>{"a": 1,}</pre>');
      await toggleViewer(document, 'application/json');
      expect(root().querySelector('.toolbar-levels button')).toBeNull();
    });
  });

  describe('copy value and path', () => {
    const root = () => getMountedRoot() as ShadowRoot;
    const pathText = () => root().querySelector('.status-path')?.textContent;
    const actionsHidden = () => root().querySelector<HTMLElement>('.status-actions')?.hidden;

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('shows the path of the clicked line with copy buttons', async () => {
      page('<pre>{"items": [{"sku": "A-100"}]}</pre>');
      await toggleViewer(document, 'application/json');
      expect(actionsHidden()).toBe(true);

      root().querySelector<HTMLElement>('.row[data-path="$.items"]')?.click();

      expect(pathText()).toBe('$.items');
      expect(actionsHidden()).toBe(false);
    });

    it('copies the path, and the value with big numbers exact', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      vi.stubGlobal('isSecureContext', true);
      page('<pre>{"order": {"ledgerId": 9007199254740993, "sku": "A-100"}}</pre>');
      await toggleViewer(document, 'application/json');

      root().querySelector<HTMLElement>('.row[data-path="$.order"]')?.click();
      root().querySelector<HTMLButtonElement>('[data-copy="path"]')?.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith('$.order'));

      root().querySelector<HTMLButtonElement>('[data-copy="value"]')?.click();
      await vi.waitFor(() =>
        expect(writeText).toHaveBeenLastCalledWith('{\n  "ledgerId": 9007199254740993,\n  "sku": "A-100"\n}'),
      );
      await vi.waitFor(() => expect(root().querySelector('[data-copy="value"]')?.textContent).toBe('Copied'));
    });

    it('hides the path in the raw view and shows it again in the tree', async () => {
      page('<pre>{"a": 1}</pre>');
      await toggleViewer(document, 'application/json');
      root().querySelector<HTMLElement>('.row[data-path="$.a"]')?.click();

      root().querySelector<HTMLButtonElement>('.toolbar-view [data-value="raw"]')?.click();
      expect(pathText()).toBe('');
      expect(actionsHidden()).toBe(true);

      root().querySelector<HTMLButtonElement>('.toolbar-view [data-value="tree"]')?.click();
      expect(pathText()).toBe('$.a');
    });
  });

  describe('theme', () => {
    const host = () => document.getElementById('atc-json-viewer');
    const themeButton = () =>
      [...(getMountedRoot()?.querySelectorAll<HTMLButtonElement>('.toolbar-actions .button') ?? [])].find((b) =>
        b.textContent?.startsWith('Theme:'),
      );

    it('follows the system by default', async () => {
      page('<pre>{"a": 1}</pre>');
      await toggleViewer(document, 'application/json');

      expect(themeButton()?.textContent).toBe('Theme: System');
      expect(host()?.hasAttribute('data-theme')).toBe(false);
    });

    it('applies and remembers the chosen theme', async () => {
      page('<pre>{"a": 1}</pre>');
      await toggleViewer(document, 'application/json');

      themeButton()?.click();
      themeButton()?.click();

      expect(host()?.getAttribute('data-theme')).toBe('dark');
      await vi.waitFor(async () => expect((await loadSettings()).theme).toBe('dark'));
    });

    it('opens in the stored theme', async () => {
      await saveSettings({ theme: 'light' });
      page('<pre>{"a": 1}</pre>');
      await toggleViewer(document, 'application/json');

      expect(themeButton()?.textContent).toBe('Theme: Light');
      expect(host()?.getAttribute('data-theme')).toBe('light');
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
