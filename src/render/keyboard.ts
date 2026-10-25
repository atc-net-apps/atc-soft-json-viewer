import { setExpanded, setExpandedDeep } from './tree';

export interface KeyboardOptions {
  /** Selects a line; the selection follows the keyboard, so the status bar can copy it. */
  select?: (row: HTMLElement) => void;
}

export interface Keyboard {
  /** Makes a line the current one, for example after it was selected with the mouse or by search. */
  activate(row: HTMLElement): void;
}

let ids = 0;

/**
 * Keyboard use of the tree, following the WAI-ARIA tree view pattern. The tree is one Tab stop;
 * inside it, the current line is marked with `aria-activedescendant`, which stays valid when lines
 * are drawn again (A–Z, Show more):
 * ↑ ↓ previous / next line, → unfold or go to the first child, ← fold or go to the parent,
 * Home / End first / last line, * unfold or fold everything inside, and Enter folds or unfolds,
 * or does what clicking the line's link, JWT chip, time or "Show more" would do.
 */
export function enableKeyboard(tree: HTMLElement, options: KeyboardOptions = {}): Keyboard {
  const { select = () => {} } = options;
  tree.tabIndex = 0;
  let active: HTMLElement | null = null;

  /** The lines you can go to, top to bottom: those with a value, and "Show more". */
  function lines(): HTMLElement[] {
    return Array.from(tree.querySelectorAll<HTMLElement>('.row')).filter(
      (row) =>
        (row.dataset.path !== undefined || row.querySelector(':scope > .more')) &&
        // Not inside a folded object, and not in a decoded token's own tree.
        !row.parentElement?.closest('.branch.collapsed > .children') &&
        row.closest('.tree') === tree,
    );
  }

  /** The current line, or the selected one, or the first one. */
  function current(all: HTMLElement[]): HTMLElement | undefined {
    if (active && all.includes(active)) {
      return active;
    }
    const selected = tree.querySelector<HTMLElement>('.row.selected');
    return selected && all.includes(selected) ? selected : all[0];
  }

  function activate(row: HTMLElement, selectIt = false): void {
    active?.classList.remove('active');
    active = row;
    row.id ||= `atc-json-line-${++ids}`;
    row.classList.add('active');
    tree.setAttribute('aria-activedescendant', row.id);
    row.scrollIntoView?.({ block: 'nearest' });
    if (selectIt && row.dataset.path !== undefined) {
      select(row);
    }
  }

  const branchOf = (row: HTMLElement) => (row.classList.contains('branch-head') ? row.parentElement : null);

  function parentLine(row: HTMLElement): HTMLElement | null {
    const entry = branchOf(row) ?? row;
    const parent = entry.parentElement?.closest('.branch');
    return parent?.querySelector<HTMLElement>(':scope > .branch-head') ?? null;
  }

  tree.addEventListener('keydown', (event) => {
    // Keys on a link or a JWT chip inside the tree keep their own meaning.
    if (event.target !== tree || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    // Shows the current line's outline (viewer.css) while the keyboard is used, not after mouse clicks.
    tree.classList.add('keyboard');
    const all = lines();
    const row = current(all);
    if (!row) {
      return;
    }
    const index = all.indexOf(row);
    const branch = branchOf(row);
    const folded = branch?.classList.contains('collapsed') ?? false;
    const go = (target: HTMLElement | null | undefined) => target && activate(target, true);

    switch (event.key) {
      case 'ArrowDown':
        go(all[index + 1]);
        break;
      case 'ArrowUp':
        go(all[index - 1]);
        break;
      case 'Home':
        go(all[0]);
        break;
      case 'End':
        go(all.at(-1));
        break;
      case 'ArrowRight':
        if (branch && folded) {
          setExpanded(branch, true);
        } else if (branch) {
          go(lines()[index + 1]);
        }
        break;
      case 'ArrowLeft':
        if (branch && !folded) {
          setExpanded(branch, false);
        } else {
          go(parentLine(row));
        }
        break;
      case 'Enter':
        if (branch) {
          setExpanded(branch, folded);
        } else {
          // "Show more": the next page is drawn where the button was, so the line there is the first new one.
          const more = row.querySelector<HTMLButtonElement>(':scope > .more');
          if (more) {
            more.click();
            go(lines()[index]);
          } else {
            // The line's own action, as a click would do it: open the link, decode the token or show the time.
            row.querySelector<HTMLElement>(':scope > .string > a, :scope > .jwt-chip, :scope > .timestamp')?.click();
          }
        }
        break;
      case '*':
        if (branch) {
          setExpandedDeep(branch, !branch.classList.contains('deep'));
        }
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // Where a mouse click started, for "Show more", whose line is gone by the time the click arrives.
  let pressed = -1;
  tree.addEventListener('mousedown', (event) => {
    tree.classList.remove('keyboard');
    const row = (event.target as Element).closest<HTMLElement>('.row');
    pressed = row ? lines().indexOf(row) : -1;
  });

  // A click makes the clicked line current, so the keys go on from there.
  tree.addEventListener('click', (event) => {
    const target = event.target as Element;
    const row = target.closest<HTMLElement>('.row');
    const all = lines();
    // After "Show more", the first new line is where the button was.
    const line = row?.isConnected ? row : all[pressed];
    if (line && all.includes(line)) {
      activate(line);
      if (!target.closest('a')) {
        tree.focus({ preventScroll: true });
      }
    }
  });

  // Coming in with Tab shows where you are.
  tree.addEventListener('focus', () => {
    const row = current(lines());
    if (row && row !== active) {
      activate(row);
    }
  });

  return { activate: (row) => activate(row) };
}
