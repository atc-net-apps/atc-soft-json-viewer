import { findMatches, type Match } from '../search';
import { revealPath, setSearch } from './tree';

/** Matches whose objects and arrays are unfolded straight away. The rest are unfolded as you go to them. */
export const REVEAL_LIMIT = 200;

/** Waits this long after the last keystroke, so a big document isn't searched once per letter. */
const TYPING_DELAY = 150;

// A line's value, as drawn by tree.ts.
const VALUE = ':scope > .string, :scope > .number, :scope > .boolean, :scope > .null';

/**
 * The search box: highlights the term in the tree, unfolds where it was found and goes from match
 * to match with Enter / Shift+Enter or the ↑ ↓ buttons. `getTree` returns the tree once it is drawn.
 */
export function renderSearch(getTree: () => HTMLElement | null, value: unknown, delay = TYPING_DELAY): HTMLElement {
  const element = document.createElement('div');
  element.className = 'search';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'search-input';
  input.placeholder = 'Search keys and values';
  input.setAttribute('aria-label', 'Search keys and values');
  input.spellcheck = false;
  input.autocomplete = 'off';

  const count = document.createElement('span');
  count.className = 'search-count';
  // Read out by screen readers when it changes.
  count.setAttribute('aria-live', 'polite');

  const previous = stepButton('↑', 'Previous match (Shift+Enter or ↑)');
  const next = stepButton('↓', 'Next match (Enter or ↓)');
  element.append(input, count, previous, next);

  let matches: Match[] = [];
  let limited = false;
  let current = -1;
  let searched = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  function search(term: string): void {
    clearTimeout(timer);
    timer = undefined;
    const tree = getTree();
    if (!tree || term === searched) {
      return;
    }
    searched = term;
    clearCurrent(tree);
    setSearch(tree, term);
    ({ matches, limited } = findMatches(value, term));
    for (const match of matches.slice(0, REVEAL_LIMIT)) {
      revealPath(tree, match.keys, false);
    }
    current = -1;
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
      const found = line.querySelector(match.in === 'key' ? ':scope > .key' : VALUE);
      for (const mark of found?.querySelectorAll('mark') ?? []) {
        mark.classList.add('current');
      }
      line.scrollIntoView?.({ block: 'center' });
    }
    update();
  }

  function update(): void {
    const total = `${matches.length.toLocaleString('en-US')}${limited ? '+' : ''}`;
    count.textContent = searched === '' ? '' : matches.length === 0 ? 'No matches' : `${current + 1} of ${total}`;
    previous.disabled = next.disabled = matches.length < 2;
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
  return element;
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
