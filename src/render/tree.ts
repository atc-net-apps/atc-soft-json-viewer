import { BigNumber } from '../parse';
import { childPath, ROOT_PATH } from '../path';

export interface TreeOptions {
  /** How many levels are unfolded at first: 0 = all folded, 1 = only the top level open. */
  expandDepth?: number;
  /** How many children of a big object or array are drawn at a time. */
  pageSize?: number;
  /** Turn http and https URLs in strings into links that open in a new tab. */
  links?: boolean;
  /** Show "3 items" or "5 keys" on the first line of every object and array. */
  counts?: boolean;
}

type Key = string | number;

/** What a folded or unfolded object/array needs to draw its children later. */
interface Branch {
  value: object;
  path: string;
  depth: number;
  entries: [Key, unknown][] | null;
  rendered: number;
  options: Required<TreeOptions>;
}

const DEFAULTS: Required<TreeOptions> = { expandDepth: 1, pageSize: 500, links: true, counts: true };

// Keeps each branch element's data without putting it in the DOM.
const branches = new WeakMap<Element, Branch>();
// The JSON value behind each row that has a path, for copying.
const rowValues = new WeakMap<Element, unknown>();

/**
 * Draws a JSON value as a collapsible tree.
 * Children of a folded object or array are only built when it is first unfolded,
 * and big ones are drawn `pageSize` children at a time, so huge documents stay fast.
 * All text is inserted with `textContent`, never as HTML.
 */
export function renderTree(value: unknown, options: TreeOptions = {}): HTMLElement {
  const tree = document.createElement('div');
  tree.className = 'tree';
  tree.append(renderEntry(null, value, ROOT_PATH, 0, true, { ...DEFAULTS, ...options }));
  tree.addEventListener('click', onClick);
  return tree;
}

/** The JSON value a row shows (for an object or array: the whole value), or `undefined` for rows without one. */
export function getRowValue(row: Element): unknown {
  return rowValues.get(row);
}

/** Folds or unfolds a branch (a `.branch` element), building its children the first time. */
export function setExpanded(branchElement: Element, expanded: boolean): void {
  const branch = branches.get(branchElement);
  if (!branch) {
    return;
  }
  if (expanded && branch.rendered === 0) {
    renderNextPage(branchElement, branch);
  }
  branchElement.classList.toggle('collapsed', !expanded);
  if (!expanded) {
    // Something is folded again, so neither it nor anything around it is unfolded all the way down any more.
    for (let element: Element | null = branchElement; element; element = element.parentElement?.closest('.branch') ?? null) {
      if (element !== branchElement && element.classList.contains('deep')) {
        element.classList.remove('deep');
        updateLabels(element);
      }
    }
    branchElement.classList.remove('deep');
  }
  updateLabels(branchElement);
}

/**
 * Unfolds or folds a branch and every object and array inside it, building children as needed.
 * Paging still applies: each one draws only its first page, so a huge document can't freeze the tab.
 */
export function setExpandedDeep(branchElement: Element, expanded: boolean): void {
  const branch = branches.get(branchElement);
  if (!branch) {
    return;
  }
  const built = branch.rendered > 0;
  // Marked first, so children built while unfolding are unfolded all the way down too (see renderNextPage).
  branchElement.classList.toggle('deep', expanded);
  setExpanded(branchElement, expanded);
  if (built) {
    for (const child of branchElement.querySelectorAll(':scope > .children > .branch')) {
      setExpandedDeep(child, expanded);
    }
  }
}

/** The fold arrow's and the ⇊ / ⇈ button's descriptions, which change with the branch's state. */
function updateLabels(branchElement: Element): void {
  const expanded = !branchElement.classList.contains('collapsed');
  const deep = branchElement.classList.contains('deep');
  const everything = `${deep ? 'Fold' : 'Unfold'} everything inside`;

  const toggle = branchElement.querySelector(':scope > .branch-head > .toggle');
  toggle?.setAttribute('aria-expanded', String(expanded));
  toggle?.setAttribute('aria-label', expanded ? 'Collapse' : 'Expand');
  toggle?.setAttribute('title', `Click to ${expanded ? 'fold' : 'unfold'} · Alt+click to ${everything.toLowerCase()}`);

  const expandAll = branchElement.querySelector(':scope > .branch-head > .expand-all');
  expandAll?.setAttribute('aria-label', everything);
  expandAll?.setAttribute('title', everything);
}

/**
 * Unfolds every object and array above `level` and folds the deeper ones:
 * 1 = only the top level open, `Infinity` = everything. Children are built only where needed.
 */
export function expandToLevel(tree: Element, level: number): void {
  const rootElement = tree.firstElementChild;
  const root = rootElement && branches.get(rootElement);
  if (!rootElement || !root) {
    return;
  }
  // Objects and arrays drawn later, by "Show more" or by unfolding one by hand, follow the new level too.
  root.options.expandDepth = level;
  applyLevel(rootElement, level);
}

function applyLevel(branchElement: Element, level: number): void {
  const branch = branches.get(branchElement);
  if (!branch) {
    return;
  }
  setExpanded(branchElement, branch.depth < level);
  // Folded children that were built earlier are folded too, so unfolding one by hand later shows it at this level.
  for (const child of branchElement.querySelectorAll(':scope > .children > .branch')) {
    applyLevel(child, level);
  }
}

function onClick(event: MouseEvent): void {
  const target = event.target as Element;

  // The ⇊ / ⇈ button, or Alt+click on the fold arrow: everything inside at once.
  const expandAll = target.closest('.expand-all') ?? (event.altKey ? target.closest('.toggle') : null);
  if (expandAll) {
    const branchElement = expandAll.closest('.branch');
    if (branchElement) {
      setExpandedDeep(branchElement, !branchElement.classList.contains('deep'));
    }
    return;
  }

  const toggle = target.closest('.toggle');
  if (toggle) {
    const branchElement = toggle.closest('.branch');
    if (branchElement) {
      setExpanded(branchElement, branchElement.classList.contains('collapsed'));
    }
    return;
  }

  const more = target.closest('.more');
  if (more) {
    const branchElement = more.closest('.branch');
    const branch = branchElement && branches.get(branchElement);
    if (branchElement && branch) {
      more.closest('.row')?.remove();
      renderNextPage(branchElement, branch);
    }
  }
}

function renderEntry(
  key: Key | null,
  value: unknown,
  path: string,
  depth: number,
  isLast: boolean,
  options: Required<TreeOptions>,
): HTMLElement {
  if (value !== null && typeof value === 'object' && !(value instanceof BigNumber)) {
    return renderBranch(key, value, path, depth, isLast, options);
  }
  const row = createRow(path, depth);
  rowValues.set(row, value);
  appendKey(row, key);
  row.append(renderPrimitive(value, options));
  if (!isLast) {
    row.append(span('punctuation', ','));
  }
  return row;
}

function renderBranch(
  key: Key | null,
  value: object,
  path: string,
  depth: number,
  isLast: boolean,
  options: Required<TreeOptions>,
): HTMLElement {
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  const comma = isLast ? '' : ',';

  if (isEmpty(value)) {
    const row = createRow(path, depth);
    rowValues.set(row, value);
    appendKey(row, key);
    row.append(span('bracket', open + close));
    if (comma) {
      row.append(span('punctuation', comma));
    }
    return row;
  }

  const branchElement = document.createElement('div');
  branchElement.className = 'branch collapsed';

  const head = createRow(path, depth);
  rowValues.set(head, value);
  head.classList.add('branch-head');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toggle';
  head.append(toggle);
  appendKey(head, key);
  head.append(span('bracket', open));
  // Shown only while folded: "{ … },"
  const folded = span('folded', '');
  folded.append(span('preview', ' … '), span('bracket', close));
  if (comma) {
    folded.append(span('punctuation', comma));
  }
  head.append(folded);
  if (options.counts) {
    const size = Array.isArray(value) ? value.length : Object.keys(value).length;
    head.append(span('count', countLabel(size, Array.isArray(value))));
  }
  // ⇊ / ⇈, drawn by viewer.css so it isn't part of the line's text when copying.
  const expandAll = document.createElement('button');
  expandAll.type = 'button';
  expandAll.className = 'expand-all';
  head.append(expandAll);

  const children = document.createElement('div');
  children.className = 'children';

  // Shown only while unfolded: the closing bracket on its own line.
  const tail = createRow(null, depth);
  tail.classList.add('branch-tail');
  tail.append(span('bracket', close));
  if (comma) {
    tail.append(span('punctuation', comma));
  }

  branchElement.append(head, children, tail);
  branches.set(branchElement, { value, path, depth, entries: null, rendered: 0, options });
  updateLabels(branchElement);

  if (depth < options.expandDepth) {
    setExpanded(branchElement, true);
  }
  return branchElement;
}

function renderNextPage(branchElement: Element, branch: Branch): void {
  branch.entries ??= Array.isArray(branch.value)
    ? branch.value.map((child, index): [Key, unknown] => [index, child])
    : Object.entries(branch.value);

  const children = branchElement.querySelector(':scope > .children');
  if (!children) {
    return;
  }
  const { entries, options } = branch;
  const deep = branchElement.classList.contains('deep');
  const end = Math.min(entries.length, branch.rendered + options.pageSize);
  for (let i = branch.rendered; i < end; i++) {
    const [key, child] = entries[i] as [Key, unknown];
    const entry = renderEntry(
      typeof key === 'number' ? null : key,
      child,
      childPath(branch.path, key),
      branch.depth + 1,
      i === entries.length - 1,
      options,
    );
    children.append(entry);
    if (deep && branches.has(entry)) {
      setExpandedDeep(entry, true);
    }
  }
  branch.rendered = end;

  const remaining = entries.length - end;
  if (remaining > 0) {
    const row = createRow(null, branch.depth + 1);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'more';
    more.textContent = `Show ${Math.min(remaining, options.pageSize)} more (${remaining} not shown)`;
    row.append(more);
    children.append(row);
  }
}

function renderPrimitive(value: unknown, options: Required<TreeOptions>): HTMLElement {
  if (value instanceof BigNumber) {
    const element = span('number big-number', value.source);
    element.title = 'Exact value as sent. It is larger than a normal JavaScript number can hold.';
    return element;
  }
  switch (typeof value) {
    case 'string':
      // JSON.stringify adds the quotes and shows escapes such as \n, exactly as JSON writes them.
      return options.links && isWebUrl(value) ? renderLink(value) : span('string', JSON.stringify(value));
    case 'number':
      return span('number', String(value));
    case 'boolean':
      return span('boolean', String(value));
    default:
      return span('null', 'null');
  }
}

/** `1 item`, `1,200 items`, `1 key`, `5 keys`. */
export function countLabel(count: number, isArray: boolean): string {
  const noun = isArray ? 'item' : 'key';
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Only whole-string http and https URLs become links. Other schemes, such as `javascript:` or
 * `file:`, never do, so a JSON value can't run code or open local files when clicked.
 */
export function isWebUrl(text: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(text)) {
    return false;
  }
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** `"https://…"` with the URL as a link that opens in a new tab, without telling the target where it came from. */
function renderLink(url: string): HTMLElement {
  const element = span('string', '');
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = JSON.stringify(url).slice(1, -1);
  element.append('"', link, '"');
  return element;
}

function createRow(path: string | null, depth: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  if (path !== null) {
    row.dataset.path = path;
  }
  // Set through the CSSOM, which a page's Content-Security-Policy does not block.
  row.style.setProperty('--depth', String(depth));
  return row;
}

function appendKey(row: HTMLElement, key: Key | null): void {
  if (typeof key === 'string') {
    row.append(span('key', JSON.stringify(key)), span('punctuation', ': '));
  }
}

function span(className: string, text: string): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

function isEmpty(value: object): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  for (const _ in value) {
    return false;
  }
  return true;
}
