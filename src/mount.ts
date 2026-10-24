import { detectKind } from './detect';
import { parseDocument, type ParseResult } from './parse';
import { renderTree } from './render/tree';
import css from './render/viewer.css?inline';

export type ToggleResult = 'formatted' | 'restored' | 'not-json';

interface MountedViewer {
  root: ShadowRoot;
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
export function toggleViewer(doc: Document = document, contentType: string = doc.contentType): ToggleResult {
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

  viewerGlobal.__atcJsonViewer = mount(doc, raw);
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

function mount(doc: Document, raw: RawJson): MountedViewer {
  const started = performance.now();
  const body = doc.body;

  const undo = [...raw.elements.map((element) => setStyle(element, 'display', 'none')), setStyle(body, 'margin', '0')];

  const host = doc.createElement('div');
  host.id = HOST_ID;
  // Closed: the website's scripts can't reach inside through `host.shadowRoot`.
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];

  const result = parseDocument(raw.text);
  root.append(result.ok ? renderTree(result.value) : renderParseError(result));
  body.append(host);

  if (import.meta.env.DEV) {
    console.log(`ATC JSON Viewer: formatted ${raw.text.length} characters in ${Math.round(performance.now() - started)} ms`);
  }

  return {
    root,
    restore() {
      host.remove();
      undo.forEach((restoreStyle) => restoreStyle());
    },
  };
}

/** A simple error view: what is wrong and where. */
function renderParseError(error: Extract<ParseResult, { ok: false }>): HTMLElement {
  const box = document.createElement('div');
  box.className = 'parse-error';
  const title = document.createElement('p');
  title.className = 'parse-error-title';
  title.textContent = "This isn't valid JSON";
  const detail = document.createElement('p');
  detail.textContent = `Line ${error.line}, column ${error.column}: ${error.message}`;
  const hint = document.createElement('p');
  hint.className = 'parse-error-hint';
  hint.textContent = 'Click the ATC JSON Viewer button again to see the original text.';
  box.append(title, detail, hint);
  return box;
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
