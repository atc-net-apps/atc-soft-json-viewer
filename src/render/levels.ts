const LEVELS: { label: string; level: number; title: string }[] = [
  { label: '1', level: 1, title: 'Fold everything below the top level' },
  { label: '2', level: 2, title: 'Unfold 2 levels' },
  { label: '3', level: 3, title: 'Unfold 3 levels' },
  { label: 'All', level: Infinity, title: 'Unfold everything' },
];

/** "Unfold 1 2 3 All": `onLevel` gets the chosen level, `Infinity` for All. */
export function renderLevelButtons(onLevel: (level: number) => void): HTMLElement {
  const element = document.createElement('div');
  element.className = 'levels';

  const label = document.createElement('span');
  label.className = 'toolbar-label';
  label.textContent = 'Unfold';

  // Joined like the Tree | Raw switch, but none stays pressed: folding by hand changes the levels anyway.
  const buttons = document.createElement('div');
  buttons.className = 'segmented';
  for (const option of LEVELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.textContent = option.label;
    button.title = option.title;
    button.setAttribute('aria-label', option.title);
    button.addEventListener('click', () => onLevel(option.level));
    buttons.append(button);
  }

  element.append(label, buttons);
  return element;
}
