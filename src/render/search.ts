import { isQuery, query, type QueryOutcome } from '../jsonpath';
import { BigNumber } from '../parse';
import { findMatches, type Match } from '../search';
import { countLabel, revealPath, setSearch } from './tree';

/** Matches whose objects and arrays are unfolded straight away. The rest are unfolded as you go to them. */
export const REVEAL_LIMIT = 200;

/** Query results listed under the toolbar. Enter / ↓ still go through all of them. */
export const LISTED_RESULTS = 500;

/** Waits this long after the last keystroke, so a big document isn't searched once per letter. */
const TYPING_DELAY = 150;

// A line's value, as drawn by tree.ts.
const VALUE = ':scope > .string, :scope > .number, :scope > .boolean, :scope > .null';

export interface SearchOptions {
  /** Milliseconds to wait after typing before searching. */
  delay?: number;
  /** Whether keys are shown A–Z, so "next match" goes down the screen. */
  sortKeys?: () => boolean;
  /** Selects a line in the tree; used for query results, so the status bar can copy them. */
  onSelect?: (line: HTMLElement) => void;
}

export interface SearchBox {
  /** The box, the counter and the ↑ ↓ buttons, for the toolbar. */
  element: HTMLElement;
  /** The list of query results (or the query's error), shown under the toolbar while a query is typed. */
  results: HTMLElement;
  /** Searches again for the same text, after the tree was drawn again (for example A–Z). */
  refresh(): void;
  /** Puts the cursor in the search box, with its text selected so typing replaces it. */
  focus(): void;
  /** Empties the search box and removes the highlights. */
  clear(): void;
}

/**
 * The search box. Text is searched in keys and values: highlighted in the tree, unfolded where it was
 * found, and Enter / Shift+Enter or ↑ ↓ go from match to match. Text starting with `$.` or `$[` is a
 * JSONPath query instead: its results are listed, and going to one selects it in the tree.
 * `getTree` returns the tree once it is drawn.
 */
export function renderSearch(getTree: () => HTMLElement | null, value: unknown, options: SearchOptions = {}): SearchBox {
  const { delay = TYPING_DELAY, onSelect = () => {}, sortKeys = () => false } = options;

  const element = document.createElement('div');
  element.className = 'search';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'search-input';
  input.placeholder = 'Search, or $.path';
  input.title = 'Search keys and values, or type a JSONPath query such as $.items[*].sku';
  input.setAttribute('aria-label', 'Search keys and values, or type a JSONPath query starting with $');
  input.spellcheck = false;
  input.autocomplete = 'off';

  const count = document.createElement('span');
  count.className = 'search-count';
  // Read out by screen readers when it changes.
  count.setAttribute('aria-live', 'polite');

  const previous = stepButton('↑', 'Previous match (Shift+Enter or ↑)');
  const next = stepButton('↓', 'Next match (Enter or ↓)');
  element.append(input, count, previous, next);

  const results = document.createElement('div');
  results.className = 'query-results';
  results.hidden = true;

  let matches: Match[] = [];
  let limited = false;
  let current = -1;
  let searched = '';
  let querying = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function search(term: string): void {
    clearTimeout(timer);
    timer = undefined;
    const tree = getTree();
    if (!tree || term === searched) {
      return;
    }
    searched = term;
    querying = isQuery(term);
    clearCurrent(tree);
    current = -1;

    if (querying) {
      // A query selects entries; there is no text to highlight.
      setSearch(tree, '');
      const outcome = query(value, term);
      matches = outcome.ok ? outcome.results.map(({ keys, path }) => ({ keys, path, in: 'value' as const })) : [];
      limited = outcome.ok && outcome.limited;
      showResults(outcome, term.trim());
    } else {
      setSearch(tree, term);
      ({ matches, limited } = findMatches(value, term, sortKeys()));
      for (const match of matches.slice(0, REVEAL_LIMIT)) {
        revealPath(tree, match.keys, false);
      }
      results.hidden = true;
      results.replaceChildren();
    }

    if (matches.length > 0) {
      go(0);
    } else {
      update();
    }
  }

  function go(index: number): void {
    const tree = getTree();
    if (!tree || matches.length === 0) {
      return;
    }
    clearCurrent(tree);
    current = (index + matches.length) % matches.length;
    const match = matches[current] as Match;
    const line = revealPath(tree, match.keys);
    if (line) {
      line.classList.add('current-match');
      if (querying) {
        onSelect(line);
      } else {
        const found = line.querySelector(match.in === 'key' ? ':scope > .key' : VALUE);
        for (const mark of found?.querySelectorAll('mark') ?? []) {
          mark.classList.add('current');
        }
      }
      line.scrollIntoView?.({ block: 'center' });
    }
    if (querying) {
      for (const item of results.querySelectorAll('.query-result[aria-current]')) {
        item.removeAttribute('aria-current');
      }
      const item = results.querySelector<HTMLElement>(`.query-result[data-index="${current}"]`);
      item?.setAttribute('aria-current', 'true');
      item?.scrollIntoView?.({ block: 'nearest' });
    }
    update();
  }

  function update(): void {
    const total = `${matches.length.toLocaleString('en-US')}${limited ? '+' : ''}`;
    if (searched === '' || (querying && results.querySelector('.query-error'))) {
      count.textContent = '';
    } else if (matches.length === 0) {
      count.textContent = querying ? 'No results' : 'No matches';
    } else {
      count.textContent = `${current + 1} of ${total}`;
    }
    previous.disabled = next.disabled = matches.length < 2;
  }

  /** The results as a list of path and value, or the query with a caret under what is wrong. */
  function showResults(outcome: QueryOutcome, expression: string): void {
    results.hidden = false;
    if (!outcome.ok) {
      const error = document.createElement('div');
      error.className = 'query-error';
      const message = document.createElement('p');
      message.textContent = outcome.message;
      const source = document.createElement('pre');
      source.textContent = `${expression}\n${' '.repeat(outcome.position)}^`;
      error.append(message, source);
      results.replaceChildren(error);
      return;
    }

    const list = document.createElement('ol');
    list.className = 'query-list';
    outcome.results.slice(0, LISTED_RESULTS).forEach((result, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'query-result';
      button.dataset.index = String(index);
      const path = document.createElement('span');
      path.className = 'query-path';
      path.textContent = result.path;
      const preview = document.createElement('span');
      preview.className = 'query-value';
      preview.textContent = previewOf(result.value);
      button.append(path, preview);
      button.addEventListener('click', () => go(index));
      item.append(button);
      list.append(item);
    });
    results.replaceChildren(list);
    if (outcome.results.length > LISTED_RESULTS) {
      const more = document.createElement('p');
      more.className = 'query-more';
      more.textContent = `Listing the first ${LISTED_RESULTS.toLocaleString('en-US')}. Enter and ↓ go through all of them.`;
      results.append(more);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), delay);
  });
  input.addEventListener('keydown', (event) => {
    // In a one-line box, ↑ and ↓ would only move the caret to the start or end.
    const step = { Enter: event.shiftKey ? -1 : 1, ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && input.value !== '') {
      event.preventDefault();
      // Typed but not searched yet: search now, which shows the first match.
      if (timer !== undefined || input.value !== searched) {
        search(input.value);
      } else {
        go(current + step);
      }
    } else if (event.key === 'Escape' && input.value !== '') {
      event.preventDefault();
      input.value = '';
      search('');
    }
  });
  previous.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));

  update();
  function refresh(): void {
    const term = searched;
    searched = '';
    search(term);
  }

  function focus(): void {
    input.focus();
    input.select();
  }

  function clear(): void {
    input.value = '';
    search('');
  }

  return { element, results, refresh, focus, clear };
}

/** One line for a result: plain values as JSON, objects and arrays by their size. */
function previewOf(value: unknown): string {
  if (value instanceof BigNumber) {
    return value.source;
  }
  if (value !== null && typeof value === 'object') {
    const isArray = Array.isArray(value);
    const size = isArray ? value.length : Object.keys(value).length;
    return isArray ? `[${countLabel(size, true)}]` : `{${countLabel(size, false)}}`;
  }
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
}

function clearCurrent(tree: Element): void {
  tree.querySelector('.current-match')?.classList.remove('current-match');
  for (const mark of tree.querySelectorAll('mark.current')) {
    mark.classList.remove('current');
  }
}

function stepButton(label: string, title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-small';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  return button;
}
