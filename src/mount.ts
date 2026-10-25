import { copyText, valueToText } from './copy';
import { detectKind } from './detect';
import { parseDocument } from './parse';
import { ROOT_PATH } from './path';
import { renderSegmented } from './render/controls';
import { renderParseError } from './render/error';
import { renderLevelButtons } from './render/levels';
import { renderSearch } from './render/search';
import { enableSelection, type Selection } from './render/selection';
import { renderNoTable, renderTable } from './render/table';
import { renderThemeButton } from './render/theme';
import { renderStatusBar, renderToolbar } from './render/toolbar';
import { expandToLevel, getRowKeys, getRowValue, renderTree, revealPath } from './render/tree';
import css from './render/viewer.css?inline';
import { createViews, renderRaw } from './render/views';
import type { Key } from './search';
import { loadSettings, saveSettings, type Settings } from './settings';
import { findTable } from './table';

export type ToggleResult = 'formatted' | 'restored' | 'not-json';

interface MountedViewer {
  root: ShadowRoot;
  /** Settles when the viewer's content has been drawn. */
  ready: Promise<void>;
  restore(): void;
}

// The viewer script is injected again on every click, so the state lives on the extension's own
// global object (the isolated world), which the website cannot see and which survives re-injection.
type ViewerGlobal = typeof globalThis & { __atcJsonViewer?: MountedViewer };

const HOST_ID = 'atc-json-viewer';

/**
 * Formats the page if it is raw JSON, or restores it if it is already formatted.
 * `contentType` is a parameter so tests can simulate any page.
 */
export async function toggleViewer(doc: Document = document, contentType: string = doc.contentType): Promise<ToggleResult> {
  const viewerGlobal = globalThis as ViewerGlobal;

  if (viewerGlobal.__atcJsonViewer) {
    viewerGlobal.__atcJsonViewer.restore();
    viewerGlobal.__atcJsonViewer = undefined;
    return 'restored';
  }

  const raw = findRawJson(doc);
  if (!raw || detectKind(contentType, raw.text) === null) {
    return 'not-json';
  }

  // Mounted (and remembered) before waiting for the settings, so a quick second click still restores.
  const mounted = mount(doc, raw, contentType);
  viewerGlobal.__atcJsonViewer = mounted;
  await mounted.ready;
  return 'formatted';
}

/** The viewer's shadow root while the page is formatted. For tests: the real root is closed. */
export function getMountedRoot(): ShadowRoot | undefined {
  return (globalThis as ViewerGlobal).__atcJsonViewer?.root;
}

interface RawJson {
  text: string;
  /** The browser's own elements: the `<pre>` and, on JSON pages, its Pretty-print container. */
  elements: HTMLElement[];
}

/**
 * Chrome and Edge show a raw response as `<body><pre>…</pre></body>`, plus a
 * `.json-formatter-container` for JSON. Anything else in `<body>` means a normal web page,
 * or one another extension has already changed, so we don't guess.
 */
function findRawJson(doc: Document): RawJson | null {
  const body = doc.body;
  if (!body) {
    return null;
  }

  let pre: HTMLElement | null = null;
  const elements: HTMLElement[] = [];
  for (const child of Array.from(body.children) as HTMLElement[]) {
    if (child.tagName === 'PRE' && pre === null) {
      pre = child;
    } else if (!child.classList.contains('json-formatter-container')) {
      return null;
    }
    elements.push(child);
  }

  return pre ? { text: pre.textContent ?? '', elements } : null;
}

function mount(doc: Document, raw: RawJson, contentType: string): MountedViewer {
  const body = doc.body;

  const undo = [...raw.elements.map((element) => setStyle(element, 'display', 'none')), setStyle(body, 'margin', '0')];

  const host = doc.createElement('div');
  host.id = HOST_ID;
  // Closed: the website's scripts can't reach inside through `host.shadowRoot`.
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];
  body.append(host);

  const ready = loadSettings().then((settings) => render(host, root, raw.text, contentType, settings));

  return {
    root,
    ready,
    restore() {
      host.remove();
      undo.forEach((restoreStyle) => restoreStyle());
    },
  };
}

/** Draws the toolbar, the document and the status bar into the viewer's shadow root. */
function render(host: HTMLElement, root: ShadowRoot, text: string, contentType: string, settings: Settings): void {
  const started = performance.now();

  // Set through the CSSOM (CSP-safe), read by viewer.css.
  host.style.setProperty('--font-size', `${settings.fontSize}px`);

  const viewer = document.createElement('div');
  viewer.className = 'viewer';

  const toolbar = renderToolbar();
  const content = document.createElement('main');
  content.className = 'content';
  let selected: HTMLElement | null = null;
  let tree: HTMLElement | null = null;
  const statusBar = renderStatusBar({ contentType, bytes: new Blob([text]).size }, async (what) => {
    if (!selected) {
      return false;
    }
    const copied = what === 'path' ? (selected.dataset.path ?? '') : valueToText(getRowValue(selected));
    return copyText(copied, root);
  });

  const result = parseDocument(text);
  let selection: Selection | null = null;
  const tableView = document.createElement('div');
  // The path the table was last looked up from, so it is only looked up again when the selection changes.
  let tableFrom: string | null = null;

  const views = createViews(content, {
    tree: () => {
      if (!result.ok) {
        return renderParseError(text, result);
      }
      tree = renderTree(result.value, {
        expandDepth: settings.unfoldDepth,
        links: settings.links,
        counts: settings.counts,
        timestamps: settings.timestamps,
        jwt: settings.jwt,
      });
      selection = enableSelection(tree, (row) => {
        selected = row;
        statusBar.setPath(row.dataset.path ?? null);
      });
      return tree;
    },
    table: () => tableView,
    raw: () => renderRaw(text),
  });

  /**
   * Shows the table at, inside or around the selected line, or in the whole document if nothing is
   * selected. Kept as it is (including where you went in it) until a different line is selected.
   */
  function refreshTable(): void {
    const from = selected?.dataset.path ?? ROOT_PATH;
    if (from === tableFrom) {
      return;
    }
    tableFrom = from;
    if (!result.ok) {
      tableView.replaceChildren(renderParseError(text, result));
      return;
    }
    drawTable(selected ? getRowKeys(selected) : [], from);
  }

  function drawTable(start: Key[], from?: string): void {
    if (!result.ok) {
      return;
    }
    const table = findTable(result.value, start);
    tableView.replaceChildren(
      table
        ? renderTable(table, { links: settings.links, onOpen: openInTree, onTable: (keys) => drawTable(keys), from })
        : renderNoTable(),
    );
  }

  /** From a table: switches to the tree and selects the row, or the object or array in a cell. */
  function openInTree(keys: Key[]): void {
    showView('tree');
    const row = tree && revealPath(tree, keys);
    if (row && selection) {
      selection.select(row);
      // Selected from the table, so going back shows the same table, not one looked up from this line.
      tableFrom = row.dataset.path ?? null;
      row.scrollIntoView?.({ block: 'center' });
    }
    backToTable.hidden = false;
  }

  // Shown in the tree after opening something from the table.
  const backToTable = document.createElement('button');
  backToTable.type = 'button';
  backToTable.className = 'button back-to-table';
  backToTable.textContent = '← Back to table';
  backToTable.title = 'Back to the table you came from';
  backToTable.hidden = true;
  backToTable.addEventListener('click', () => showView('table'));

  function showView(view: Settings['view']): void {
    backToTable.hidden = true;
    if (view === 'table') {
      refreshTable();
    }
    views.show(view);
    viewSwitch.setSelected(view);
    // Only the tree can be searched and unfolded.
    toolbar.slots.search.hidden = toolbar.slots.levels.hidden = view !== 'tree';
    // The selected path only means something in the tree.
    statusBar.setPath(view === 'tree' && selected ? (selected.dataset.path ?? null) : null);
  }

  const viewSwitch = renderSegmented<Settings['view']>(
    'View',
    [
      { value: 'tree', label: 'Tree', title: 'Formatted, collapsible view' },
      { value: 'table', label: 'Table', title: 'A list of objects as rows and columns' },
      { value: 'raw', label: 'Raw', title: 'Exactly what the server sent' },
    ],
    settings.view,
    (view) => {
      showView(view);
      // Remembered for the next page; failing to save must not break the viewer.
      saveSettings({ view }).catch(() => {});
    },
  );
  toolbar.slots.view.append(viewSwitch.element, backToTable);

  // None for broken JSON, which has nothing to search or unfold.
  if (result.ok) {
    const search = renderSearch(() => tree, result.value, { onSelect: (line) => selection?.select(line) });
    toolbar.slots.search.append(search.element);
    // Under the toolbar's controls, so the list stays in view while the tree scrolls.
    toolbar.element.append(search.results);
    toolbar.slots.levels.append(
      renderLevelButtons((level) => {
        if (tree) {
          expandToLevel(tree, level);
        }
      }),
    );
  }
  showView(settings.view);

  toolbar.slots.actions.append(
    renderThemeButton(host, settings.theme, (theme) => {
      saveSettings({ theme }).catch(() => {});
    }),
  );

  viewer.append(toolbar.element, content, statusBar.element);
  root.append(viewer);

  if (import.meta.env.DEV) {
    console.log(`ATC JSON Viewer: formatted ${text.length} characters in ${Math.round(performance.now() - started)} ms`);
  }
}

/**
 * Sets one inline style through the CSSOM (a page's Content-Security-Policy can't block it) and
 * returns a function that puts back exactly what was there before, including removing a `style`
 * attribute we created.
 */
function setStyle(element: HTMLElement, property: string, value: string): () => void {
  const hadStyleAttribute = element.hasAttribute('style');
  const previousValue = element.style.getPropertyValue(property);
  const previousPriority = element.style.getPropertyPriority(property);

  element.style.setProperty(property, value, 'important');

  return () => {
    if (previousValue) {
      element.style.setProperty(property, previousValue, previousPriority);
    } else {
      element.style.removeProperty(property);
    }
    if (!hadStyleAttribute && element.getAttribute('style') === '') {
      element.removeAttribute('style');
    }
  };
}
