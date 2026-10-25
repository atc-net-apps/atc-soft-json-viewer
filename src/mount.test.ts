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

  describe('search', () => {
    const root = () => getMountedRoot() as ShadowRoot;
    const searchBox = () => root().querySelector<HTMLInputElement>('.toolbar-search input');

    it('searches the tree from the toolbar', async () => {
      page(JSON_PAGE);
      await toggleViewer(document, 'application/json');
      const input = searchBox() as HTMLInputElement;

      input.value = 'aarhus';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(root().querySelector('.search-count')?.textContent).toBe('1 of 1');
      expect(root().querySelector('.current-match')?.getAttribute('data-path')).toBe('$.customer.address.city');
    });

    it('hides the search box in the raw view', async () => {
      page(JSON_PAGE);
      await toggleViewer(document, 'application/json');
      const search = root().querySelector<HTMLElement>('.toolbar-search');
      expect(search?.hidden).toBe(false);

      root().querySelector<HTMLButtonElement>('.toolbar-view [data-value="raw"]')?.click();
      expect(search?.hidden).toBe(true);
    });

    it('shows no search box for broken JSON', async () => {
      page('<pre>{"a": 1,}</pre>');
      await toggleViewer(document, 'application/json');
      expect(searchBox()).toBeNull();
    });
  });

  describe('table view', () => {
    const TABLE_PAGE =
      '<pre>{"orderId": "A-1001", "items": [{"sku": "A-100", "size": {"w": 2}}, {"sku": "B-200"}], "customer": {"contacts": [{"name": "Ann"}]}}</pre>';
    const root = () => getMountedRoot() as ShadowRoot;
    const showTable = () => root().querySelector<HTMLButtonElement>('.toolbar-view [data-value="table"]')?.click();
    const caption = () => root().querySelector('[data-view="table"] caption')?.textContent;

    it('shows the first list of objects as a table, and remembers the choice', async () => {
      page(TABLE_PAGE);
      await toggleViewer(document, 'application/json');

      showTable();

      expect(caption()).toBe('$ › items · 2 rows · 2 columns');
      expect(root().querySelector<HTMLElement>('.toolbar-search')?.hidden).toBe(true);
      await vi.waitFor(async () => expect((await loadSettings()).view).toBe('table'));
    });

    it('opens in the table view when that was the last choice', async () => {
      await saveSettings({ view: 'table' });
      page(TABLE_PAGE);
      await toggleViewer(document, 'application/json');

      expect(root().querySelector('.toolbar-view [aria-pressed="true"]')?.textContent).toBe('Table');
      expect(caption()).toBe('$ › items · 2 rows · 2 columns');
    });

    it('shows the table inside the selected line', async () => {
      page(TABLE_PAGE);
      await toggleViewer(document, 'application/json');

      root().querySelector<HTMLElement>('.row[data-path="$.customer"]')?.click();
      showTable();

      expect(caption()).toBe('$ › customer › contacts · 1 row · 1 column');
    });

    it('opens an object from a cell in the tree and selects it', async () => {
      page(TABLE_PAGE);
      await toggleViewer(document, 'application/json');
      showTable();

      Array.from(root().querySelectorAll<HTMLButtonElement>('.cell-open'))
        .find((button) => button.textContent === '{1 key}')
        ?.click();

      expect(root().querySelector('.toolbar-view [aria-pressed="true"]')?.textContent).toBe('Tree');
      expect(root().querySelector<HTMLElement>('[data-view="tree"]')?.hidden).toBe(false);
      expect(root().querySelector('.row.selected')?.getAttribute('data-path')).toBe('$.items[0].size');
      expect(root().querySelector('.status-path')?.textContent).toBe('$.items[0].size');
    });

    it('says so when the selected line has no table and shows the first one in the document', async () => {
      page(TABLE_PAGE);
      await toggleViewer(document, 'application/json');

      root().querySelector<HTMLElement>('.row[data-path="$.orderId"]')?.click();
      showTable();

      expect(root().querySelector('.table-note')?.textContent).toContain('Nothing to show as a table in $.orderId');
      expect(caption()).toBe('$ › items · 2 rows · 2 columns');
    });

    describe('going into and out of lists', () => {
      const ORDERS_PAGE =
        '<pre>{"orders": [{"id": "A-1", "items": [{"sku": "X-1"}, {"sku": "X-2"}]}, {"id": "A-2", "items": [{"sku": "X-3"}]}]}</pre>';
      const button = (label: string) =>
        Array.from(root().querySelectorAll<HTMLButtonElement>('[data-view="table"] .cell-open')).find(
          (candidate) => candidate.textContent === label,
        );
      const backToTable = () => root().querySelector<HTMLButtonElement>('.back-to-table');

      it('opens a list of objects in a cell as the table, and goes back up from the caption', async () => {
        page(ORDERS_PAGE);
        await toggleViewer(document, 'application/json');
        showTable();

        button('[2 items]')?.click();
        expect(caption()).toBe('$ › orders › [0] › items · 2 rows · 1 column');
        expect(root().querySelector('.toolbar-view [aria-pressed="true"]')?.textContent).toBe('Table');

        button('orders')?.click();
        expect(caption()).toBe('$ › orders · 2 rows · 2 columns');
      });

      it('goes back to the same table from the tree', async () => {
        page(ORDERS_PAGE);
        await toggleViewer(document, 'application/json');
        showTable();
        button('[2 items]')?.click();

        button('1')?.click();
        expect(root().querySelector('.row.selected')?.getAttribute('data-path')).toBe('$.orders[0].items[1]');
        expect(backToTable()?.hidden).toBe(false);

        backToTable()?.click();
        expect(root().querySelector('.toolbar-view [aria-pressed="true"]')?.textContent).toBe('Table');
        expect(caption()).toBe('$ › orders › [0] › items · 2 rows · 1 column');
        expect(backToTable()?.hidden).toBe(true);
      });

      it('hides Back to table when another view is chosen', async () => {
        page(ORDERS_PAGE);
        await toggleViewer(document, 'application/json');
        showTable();
        button('0')?.click();
        expect(backToTable()?.hidden).toBe(false);

        root().querySelector<HTMLButtonElement>('.toolbar-view [data-value="raw"]')?.click();
        expect(backToTable()?.hidden).toBe(true);
      });

      it('looks the table up again when a different line is selected in the tree', async () => {
        page(ORDERS_PAGE);
        await toggleViewer(document, 'application/json');
        showTable();
        button('0')?.click();

        root().querySelector<HTMLElement>('.row[data-path="$.orders[1]"]')?.click();
        showTable();

        expect(caption()).toBe('$ › orders › [1] › items · 1 row · 1 column');
      });
    });

    it('explains when there is no table', async () => {
      page('<pre>{"a": [1, 2]}</pre>');
      await toggleViewer(document, 'application/json');
      showTable();
      expect(root().querySelector('.table-empty')?.textContent).toContain('No table here');
    });

    it('shows the error for broken JSON', async () => {
      page('<pre>{"a": 1,}</pre>');
      await toggleViewer(document, 'application/json');
      showTable();
      expect(root().querySelector('[data-view="table"] .parse-error')).not.toBeNull();
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
