import { BigNumber } from '../parse';
import { displayText, type Key } from '../search';
import { isTable, type TableData, tableColumns } from '../table';
import { countLabel, isWebUrl } from './tree';

export interface TableOptions {
  /** Turn http and https URLs into links that open in a new tab. */
  links?: boolean;
  /** How many rows are drawn at a time. */
  pageSize?: number;
  /** Called with the keys of a row, or of an object or array in a cell, to show it in the tree. */
  onOpen?: (keys: Key[]) => void;
  /** Called with the keys of a list to show as the table instead: a list of objects in a cell, or a step in the caption. */
  onTable?: (keys: Key[]) => void;
  /** The path of the selected line the table was looked up from, for the note when it was found elsewhere. */
  from?: string;
}

/** What the cells need: whether to make links, and what clicking does. */
type CellActions = Required<Pick<TableOptions, 'links' | 'onOpen' | 'onTable'>>;

/**
 * Draws an array of objects as a table: a `#` column, then one column per key. Plain values use the
 * tree's colours. A list of objects in a cell opens as the table; other objects and arrays, and row
 * numbers, open in the tree. Rows are drawn `pageSize` at a time. All text is inserted with
 * `textContent`, never as HTML.
 */
export function renderTable(table: TableData, options: TableOptions = {}): HTMLElement {
  const { links = true, pageSize = 500, onOpen = () => {}, onTable = () => {} } = options;
  const actions: CellActions = { links, onOpen, onTable };
  const columns = tableColumns(table.rows);

  const element = document.createElement('div');
  element.className = 'table-view';

  // Without this, a table from elsewhere would look as if it belonged to the selected line.
  if (table.found === 'elsewhere' && options.from) {
    const note = document.createElement('p');
    note.className = 'table-note';
    const from = document.createElement('code');
    from.textContent = options.from;
    note.append('Nothing to show as a table in ', from, ', so this is the first list in the document.');
    element.append(note);
  }

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const tableElement = document.createElement('table');
  tableElement.className = 'json-table';

  const caption = document.createElement('caption');
  caption.append(renderBreadcrumb(table, onTable), ` · ${plural(table.rows.length, 'row')} · ${plural(columns.length, 'column')}`);

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(cell('th', '#', 'index'), ...columns.map((column) => cell('th', column)));
  head.append(headRow);

  const body = document.createElement('tbody');
  tableElement.append(caption, head, body);
  scroll.append(tableElement);
  element.append(scroll);

  let rendered = 0;
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'more';
  more.addEventListener('click', drawNextPage);

  function drawNextPage(): void {
    const end = Math.min(table.rows.length, rendered + pageSize);
    for (let index = rendered; index < end; index++) {
      body.append(renderRow(table, columns, index, actions));
    }
    rendered = end;
    const remaining = table.rows.length - end;
    if (remaining > 0) {
      more.textContent = `Show ${Math.min(remaining, pageSize)} more (${remaining} not shown)`;
      element.append(more);
    } else {
      more.remove();
    }
  }

  drawNextPage();
  return element;
}

/** Shown when the document has no array of objects to show as a table. */
export function renderNoTable(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'table-empty';
  const title = document.createElement('p');
  title.className = 'table-empty-title';
  title.textContent = 'No table here';
  const hint = document.createElement('p');
  hint.textContent =
    'A table needs a list of objects, such as [{"id": 1}, {"id": 2}]. Select a line in the tree to look for one inside it.';
  element.append(title, hint);
  return element;
}

/**
 * `$ › orders › [0] › items`. Steps that are lists of objects themselves (`orders` here) are
 * buttons that go back up to that table; the others are only text, because there is no table there.
 */
function renderBreadcrumb(table: TableData, onTable: (keys: Key[]) => void): HTMLElement {
  const path = document.createElement('span');
  path.className = 'table-path';
  path.setAttribute('aria-label', 'Table location');
  const steps = ['$', ...table.keys.map((key) => (typeof key === 'number' ? `[${key}]` : key))];
  steps.forEach((step, index) => {
    if (index > 0) {
      path.append(span('table-path-separator', ' › '));
    }
    if (table.parents.includes(index)) {
      const target = table.keys.slice(0, index);
      path.append(openButton(step, 'Back up to this table', () => onTable(target)));
    } else {
      path.append(span(index === steps.length - 1 ? 'table-path-current' : 'table-path-step', step));
    }
  });
  return path;
}

function renderRow(table: TableData, columns: string[], index: number, actions: CellActions) {
  const row = table.rows[index] as Record<string, unknown>;
  const rowKeys = [...table.keys, index];
  const tr = document.createElement('tr');

  const indexCell = cell('td', '', 'index');
  indexCell.append(openButton(String(index), 'Show this row in the tree', () => actions.onOpen(rowKeys)));
  tr.append(indexCell);

  for (const column of columns) {
    const td = cell('td', '');
    if (!Object.hasOwn(row, column)) {
      td.classList.add('missing');
      td.title = 'This row has no such key';
    } else {
      td.append(renderValue(row[column], [...rowKeys, column], actions));
    }
    tr.append(td);
  }
  return tr;
}

function renderValue(value: unknown, keys: Key[], { links, onOpen, onTable }: CellActions): Node {
  if (value instanceof BigNumber) {
    const number = span('number big-number', value.source);
    number.title = 'Exact value as sent. It is larger than a normal JavaScript number can hold.';
    return number;
  }
  if (value !== null && typeof value === 'object') {
    const isArray = Array.isArray(value);
    const size = isArray ? value.length : Object.keys(value).length;
    if (size === 0) {
      return span('bracket', isArray ? '[]' : '{}');
    }
    const label = isArray ? `[${countLabel(size, true)}]` : `{${countLabel(size, false)}}`;
    // A list of objects is a table of its own; anything else is easier to read in the tree.
    return isTable(value)
      ? openButton(label, 'Show as a table', () => onTable(keys))
      : openButton(label, 'Show in the tree', () => onOpen(keys));
  }
  const text = displayText(value) ?? '';
  if (typeof value === 'string') {
    if (links && isWebUrl(value)) {
      const link = document.createElement('a');
      link.href = value;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = text;
      const string = span('string', '');
      string.append(link);
      return string;
    }
    return span('string', text);
  }
  return span(value === null ? 'null' : typeof value === 'number' ? 'number' : 'boolean', text);
}

function openButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cell-open';
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

function cell(tag: 'th' | 'td', text: string, className = ''): HTMLTableCellElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  if (tag === 'th') {
    element.scope = 'col';
  }
  return element;
}

function span(className: string, text: string): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}
