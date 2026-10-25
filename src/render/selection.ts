export interface Selection {
  /** Selects a row as if it had been clicked. */
  select(row: HTMLElement): void;
}

/**
 * Clicking a row selects it (and only it) and reports the row; clicking elsewhere changes nothing.
 * Clicks on buttons and links keep their own meaning, and dragging to select text doesn't select a row.
 */
export function enableSelection(tree: HTMLElement, onSelect: (row: HTMLElement) => void): Selection {
  function select(row: HTMLElement): void {
    const previous = tree.querySelector('.row.selected');
    previous?.classList.remove('selected');
    previous?.removeAttribute('aria-selected');
    row.classList.add('selected');
    row.setAttribute('aria-selected', 'true');
    onSelect(row);
  }

  tree.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.closest('button, a')) {
      return;
    }
    if (document.getSelection()?.toString()) {
      return;
    }
    const row = target.closest<HTMLElement>('.row[data-path]');
    if (row) {
      select(row);
    }
  });

  return { select };
}
