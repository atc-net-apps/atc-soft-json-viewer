/**
 * Clicking a row selects it (and only it) and reports the row; clicking elsewhere changes nothing.
 * Clicks on buttons and links keep their own meaning, and dragging to select text doesn't select a row.
 */
export function enableSelection(tree: HTMLElement, onSelect: (row: HTMLElement) => void): void {
  tree.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.closest('button, a')) {
      return;
    }
    if (document.getSelection()?.toString()) {
      return;
    }
    const row = target.closest<HTMLElement>('.row[data-path]');
    if (!row) {
      return;
    }
    tree.querySelector('.row.selected')?.classList.remove('selected');
    row.classList.add('selected');
    onSelect(row);
  });
}
