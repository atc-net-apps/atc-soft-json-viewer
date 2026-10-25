import { type DecodedJwt, decodeJwt } from '../jwt';
import { BigNumber } from '../parse';
import { childPath, ROOT_PATH } from '../path';
import { type Key, searchPattern } from '../search';
import { objectEntries } from '../sort';
import { describeTimestamp, timestampFrom } from '../timestamps';

export interface TreeOptions {
  /** How many levels are unfolded at first: 0 = all folded, 1 = only the top level open. */
  expandDepth?: number;
  /** How many children of a big object or array are drawn at a time. */
  pageSize?: number;
  /** Turn http and https URLs in strings into links that open in a new tab. */
  links?: boolean;
  /** Show "3 items" or "5 keys" on the first line of every object and array. */
  counts?: boolean;
  /** Highlight this text in keys and values (case-insensitive). */
  search?: string;
  /** Underline dates and Unix times; clicking one shows it as local time. */
  timestamps?: boolean;
  /** Add a JWT chip to JSON Web Tokens, which shows their decoded header and payload. */
  jwt?: boolean;
  /** Show object keys A–Z instead of in the server's order. Only the display changes. */
  sortKeys?: boolean;
}

/** One tree's options. Lines drawn later read them too, so changing them affects what is drawn next. */
type TreeState = Required<TreeOptions> & { pattern: RegExp | null; value: unknown };

/** What a folded or unfolded object/array needs to draw its children later. */
interface Branch {
  value: object;
  path: string;
  depth: number;
  entries: [Key, unknown][] | null;
  rendered: number;
  options: TreeState;
}

const DEFAULTS: Required<TreeOptions> = {
  expandDepth: 1,
  pageSize: 500,
  links: true,
  counts: true,
  search: '',
  timestamps: true,
  jwt: true,
  sortKeys: false,
};

// The elements that show a key or a value, which search highlights.
const SEARCHABLE = '.key, .string, .number, .boolean, .null';
// The same, but only a line's own (not those of the lines inside it).
const OWN_SEARCHABLE = SEARCHABLE.split(', ')
  .map((selector) => `:scope > ${selector}`)
  .join(', ');

// Keeps each branch element's data without putting it in the DOM.
const branches = new WeakMap<Element, Branch>();
// The JSON value behind each row that has a path, for copying.
const rowValues = new WeakMap<Element, unknown>();
// Each tree's options, for changes after it is drawn.
const trees = new WeakMap<Element, TreeState>();
// The moment each underlined time stands for, in milliseconds since 1970.
const times = new WeakMap<Element, number>();
// The decoded token behind each JWT chip.
const tokens = new WeakMap<Element, DecodedJwt>();

/**
 * Draws a JSON value as a collapsible tree.
 * Children of a folded object or array are only built when it is first unfolded,
 * and big ones are drawn `pageSize` children at a time, so huge documents stay fast.
 * All text is inserted with `textContent`, never as HTML.
 */
export function renderTree(value: unknown, options: TreeOptions = {}): HTMLElement {
  const tree = document.createElement('div');
  tree.className = 'tree';
  const state: TreeState = { ...DEFAULTS, ...options, pattern: null, value };
  state.pattern = state.search ? searchPattern(state.search) : null;
  trees.set(tree, state);
  const root = renderEntry(null, value, ROOT_PATH, 0, true, state);
  markEntry(root, state.pattern);
  tree.append(root);
  tree.addEventListener('click', onClick);
  return tree;
}

/**
 * Highlights `term` in every key and value: those drawn now and those drawn later. An empty term
 * removes the highlights. What is found matches `findMatches`, which searches the whole document.
 */
export function setSearch(tree: Element, term: string): void {
  const state = trees.get(tree);
  if (!state) {
    return;
  }
  state.search = term;
  state.pattern = term ? searchPattern(term) : null;
  for (const element of tree.querySelectorAll(SEARCHABLE)) {
    // A decoded token isn't part of the document, so search doesn't find it either.
    if (!element.closest('.jwt-box')) {
      markMatches(element, state.pattern);
    }
  }
}

/**
 * Unfolds the objects and arrays on the way to the entry at `keys` and returns its line (for an
 * object or array: its first line). With `allPages`, "Show more" pages are drawn until the entry is
 * shown; without it, an entry beyond the drawn pages gives `null`.
 */
export function revealPath(tree: Element, keys: readonly Key[], allPages = true): HTMLElement | null {
  let element = tree.firstElementChild;
  for (const key of keys) {
    const branch = element && branches.get(element);
    if (!element || !branch) {
      return null;
    }
    setExpanded(element, true);
    // The position in the drawn order, which is the order of `entries` (for arrays, the index itself).
    const index = Array.isArray(branch.value)
      ? typeof key === 'number' && key < branch.value.length
        ? key
        : -1
      : entriesOf(branch).findIndex(([entryKey]) => entryKey === key);
    if (index < 0) {
      return null;
    }
    while (branch.rendered <= index) {
      if (!allPages) {
        return null;
      }
      showMore(element, branch);
    }
    element = element.querySelector(':scope > .children')?.children[index] ?? null;
  }
  if (!element) {
    return null;
  }
  return branches.has(element) ? element.querySelector<HTMLElement>(':scope > .branch-head') : (element as HTMLElement);
}

/**
 * Draws the tree again with object keys A–Z, or in the server's order again. What was unfolded, and
 * unfolded all the way down, stays so. The values themselves are not changed.
 */
export function setSortKeys(tree: Element, sorted: boolean): void {
  const state = trees.get(tree);
  if (!state || state.sortKeys === sorted) {
    return;
  }
  // This tree's own objects and arrays, not those of decoded tokens inside it. Keys are found
  // before redrawing: they don't depend on the order, but their position does.
  const own = Array.from(tree.querySelectorAll('.branch')).filter((branch) => branch.closest('.tree') === tree);
  const keysOf = (branch: Element) => getRowKeys(branch.querySelector(':scope > .branch-head') as Element);
  const unfolded = own.filter((branch) => !branch.classList.contains('collapsed')).map(keysOf);
  const deep = own.filter((branch) => branch.classList.contains('deep')).map(keysOf);

  state.sortKeys = sorted;
  // Nothing unfolds by itself while the old state is put back.
  const level = state.expandDepth;
  state.expandDepth = 0;
  const root = renderEntry(null, state.value, ROOT_PATH, 0, true, state);
  markEntry(root, state.pattern);
  tree.replaceChildren(root);
  for (const keys of unfolded) {
    const head = revealPath(tree, keys);
    if (head?.parentElement) {
      setExpanded(head.parentElement, true);
    }
  }
  for (const keys of deep) {
    const branchElement = revealPath(tree, keys)?.parentElement;
    if (branchElement) {
      branchElement.classList.add('deep');
      updateLabels(branchElement);
    }
  }
  state.expandDepth = level;
}

/** The JSON value a row shows (for an object or array: the whole value), or `undefined` for rows without one. */
export function getRowValue(row: Element): unknown {
  return rowValues.get(row);
}

/**
 * The keys from the root down to a line's entry, worked out from where the line sits in the tree:
 * each entry's position among its siblings is its position in the parent's `entries`.
 */
export function getRowKeys(row: Element): Key[] {
  const keys: Key[] = [];
  let entry: Element | null = row.classList.contains('branch-head') ? row.parentElement : row;
  while (entry?.parentElement?.classList.contains('children')) {
    const branchElement = entry.parentElement.parentElement;
    const branch = branchElement && branches.get(branchElement);
    if (!branchElement || !branch) {
      break;
    }
    const index = Array.prototype.indexOf.call(entry.parentElement.children, entry);
    const key = entriesOf(branch)[index]?.[0];
    if (key === undefined) {
      break;
    }
    keys.unshift(key);
    entry = branchElement;
  }
  return keys;
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
  const state = trees.get(tree);
  if (!rootElement || !state) {
    return;
  }
  // Objects and arrays drawn later, by "Show more" or by unfolding one by hand, follow the new level too.
  state.expandDepth = level;
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

  // A time: show or hide it as local time. The line is still selected, as for any click on it.
  const time = target.closest('.timestamp');
  if (time) {
    toggleTime(time);
  }

  const chip = target.closest('.jwt-chip');
  if (chip) {
    toggleJwt(chip);
    return;
  }

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
      showMore(branchElement, branch);
    }
  }
}

/** Replaces the "Show more" line with the next page of children. */
function showMore(branchElement: Element, branch: Branch): void {
  branchElement.querySelector(':scope > .children > .row > .more')?.closest('.row')?.remove();
  renderNextPage(branchElement, branch);
}

function renderEntry(
  key: Key | null,
  value: unknown,
  path: string,
  depth: number,
  isLast: boolean,
  options: TreeState,
): HTMLElement {
  if (value !== null && typeof value === 'object' && !(value instanceof BigNumber)) {
    return renderBranch(key, value, path, depth, isLast, options);
  }
  const row = createRow(path, depth);
  rowValues.set(row, value);
  appendKey(row, key);
  row.append(renderPrimitive(value, key, options));
  if (!isLast) {
    row.append(span('punctuation', ','));
  }
  const token = options.jwt && typeof value === 'string' ? decodeJwt(value) : null;
  if (token) {
    row.append(renderJwtChip(token));
  }
  return row;
}

function renderBranch(
  key: Key | null,
  value: object,
  path: string,
  depth: number,
  isLast: boolean,
  options: TreeState,
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

/** A branch's children in the order they are drawn. */
function entriesOf(branch: Branch): [Key, unknown][] {
  branch.entries ??= Array.isArray(branch.value)
    ? branch.value.map((child, index): [Key, unknown] => [index, child])
    : objectEntries(branch.value, branch.options.sortKeys);
  return branch.entries;
}

function renderNextPage(branchElement: Element, branch: Branch): void {
  const children = branchElement.querySelector(':scope > .children');
  if (!children) {
    return;
  }
  const entries = entriesOf(branch);
  const { options } = branch;
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
    markEntry(entry, options.pattern);
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

function renderPrimitive(value: unknown, key: Key | null, options: TreeState): HTMLElement {
  const element = renderPlain(value, options);
  const time = options.timestamps ? timestampFrom(value, key) : null;
  if (time !== null) {
    element.classList.add('timestamp');
    element.title = 'A time: click to show it as local time';
    times.set(element, time);
  }
  return element;
}

/** "25 Oct 2026, 11:15:00 · 2 days ago" after a time, or hides it again. Worked out when clicked, so "ago" is current. */
function toggleTime(element: Element): void {
  const shown = element.nextElementSibling;
  if (shown?.classList.contains('timestamp-info')) {
    shown.remove();
    return;
  }
  const time = times.get(element);
  if (time !== undefined) {
    element.after(span('timestamp-info', describeTimestamp(time)));
  }
}

/** "JWT" at the end of a token's line. The label is drawn by viewer.css, so it isn't part of the line's text. */
function renderJwtChip(token: DecodedJwt): HTMLElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'jwt-chip';
  chip.title = 'A JSON Web Token: click to show what is inside';
  chip.setAttribute('aria-label', 'Decode this JSON Web Token');
  chip.setAttribute('aria-expanded', 'false');
  tokens.set(chip, token);
  return chip;
}

/**
 * Shows the token's header and payload as trees under its line, or hides them again. Times such
 * as `exp` and `iat` are underlined there too.
 */
function toggleJwt(chip: Element): void {
  const row = chip.closest('.row');
  const shown = row?.querySelector(':scope > .jwt-box');
  if (shown) {
    shown.remove();
    chip.setAttribute('aria-expanded', 'false');
    return;
  }
  const token = tokens.get(chip);
  const state = row && trees.get(row.closest('.tree') as Element);
  if (!row || !token || !state) {
    return;
  }

  const box = document.createElement('div');
  box.className = 'jwt-box';
  const note = document.createElement('p');
  note.className = 'jwt-note';
  note.textContent = 'Decoded locally in your browser. The signature is not verified.';
  box.append(note);
  const options: TreeOptions = { expandDepth: Infinity, links: state.links, counts: state.counts, timestamps: state.timestamps, jwt: false };
  for (const [label, part] of [
    ['Header', token.header],
    ['Payload', token.payload],
  ] as const) {
    const title = document.createElement('p');
    title.className = 'jwt-label';
    title.textContent = label;
    box.append(title, renderTree(part, options));
  }
  // Clicks inside are for the decoded trees only: they must not fold or select lines of the document.
  box.addEventListener('click', (event) => event.stopPropagation());
  row.append(box);
  chip.setAttribute('aria-expanded', 'true');
}

function renderPlain(value: unknown, options: TreeState): HTMLElement {
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

/** Highlights the search term in a newly drawn entry's own line (its children mark themselves). */
function markEntry(entry: Element, pattern: RegExp | null): void {
  if (!pattern) {
    return;
  }
  const line = branches.has(entry) ? entry.querySelector(':scope > .branch-head') : entry;
  for (const element of line?.querySelectorAll(OWN_SEARCHABLE) ?? []) {
    markMatches(element, pattern);
  }
}

/**
 * Wraps every match of `pattern` in a key or value element in `<mark>`, or removes the marks when
 * `pattern` is `null`. Only the text inside the quotes is searched, so the quotes never match, and
 * a link keeps its `<a>`. Built with DOM calls only, never as HTML.
 */
function markMatches(element: Element, pattern: RegExp | null): void {
  const target = element.querySelector('a') ?? element;
  const quoted = target === element && (element.classList.contains('key') || element.classList.contains('string'));
  const shown = target.textContent ?? '';
  const text = quoted ? shown.slice(1, -1) : shown;
  const matches = pattern ? Array.from(text.matchAll(pattern)) : [];
  if (matches.length === 0 && !target.querySelector('mark')) {
    return;
  }

  const parts: (string | Node)[] = [];
  let last = 0;
  for (const match of matches) {
    const mark = document.createElement('mark');
    mark.textContent = match[0];
    parts.push(text.slice(last, match.index), mark);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  const content = parts.filter((part) => part !== '');
  target.replaceChildren(...(quoted ? ['"', ...content, '"'] : content));
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
