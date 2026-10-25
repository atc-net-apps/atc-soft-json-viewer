import { BigNumber } from '../parse';
import { childPath, ROOT_PATH } from '../path';

export interface TreeOptions {
  /** How many levels are unfolded at first: 0 = all folded, 1 = only the top level open. */
  expandDepth?: number;
  /** How many children of a big object or array are drawn at a time. */
  pageSize?: number;
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

const DEFAULTS: Required<TreeOptions> = { expandDepth: 1, pageSize: 500 };

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
  const toggle = branchElement.querySelector(':scope > .row > .toggle');
  toggle?.setAttribute('aria-expanded', String(expanded));
  toggle?.setAttribute('aria-label', expanded ? 'Collapse' : 'Expand');
}

function onClick(event: Event): void {
  const target = event.target as Element;

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
  row.append(renderPrimitive(value));
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
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Expand');
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
  const end = Math.min(entries.length, branch.rendered + options.pageSize);
  for (let i = branch.rendered; i < end; i++) {
    const [key, child] = entries[i] as [Key, unknown];
    children.append(
      renderEntry(
        typeof key === 'number' ? null : key,
        child,
        childPath(branch.path, key),
        branch.depth + 1,
        i === entries.length - 1,
        options,
      ),
    );
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

function renderPrimitive(value: unknown): HTMLElement {
  if (value instanceof BigNumber) {
    const element = span('number big-number', value.source);
    element.title = 'Exact value as sent. It is larger than a normal JavaScript number can hold.';
    return element;
  }
  switch (typeof value) {
    case 'string':
      // JSON.stringify adds the quotes and shows escapes such as \n, exactly as JSON writes them.
      return span('string', JSON.stringify(value));
    case 'number':
      return span('number', String(value));
    case 'boolean':
      return span('boolean', String(value));
    default:
      return span('null', 'null');
  }
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
