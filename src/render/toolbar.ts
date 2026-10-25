/**
 * The viewer's frame: a toolbar on top and a status bar at the bottom.
 * Features add their controls to the toolbar's slots.
 */

export interface ToolbarSlots {
  /** Tree / Raw / Table switch. */
  view: HTMLElement;
  /** Search and JSONPath box. */
  search: HTMLElement;
  /** Unfold-to-level buttons. */
  levels: HTMLElement;
  /** A–Z, theme and settings buttons. */
  actions: HTMLElement;
}

export interface Toolbar {
  element: HTMLElement;
  slots: ToolbarSlots;
}

export interface StatusBar {
  element: HTMLElement;
  /** Shows the JSON path of the selected row with its copy buttons, or nothing. */
  setPath(path: string | null): void;
}

export type CopyWhat = 'path' | 'value';

export function renderToolbar(): Toolbar {
  const element = document.createElement('header');
  element.className = 'toolbar';

  const brand = document.createElement('span');
  brand.className = 'brand';
  brand.textContent = 'ATC JSON Viewer';

  const slot = (name: keyof ToolbarSlots, label: string) => {
    const group = document.createElement('div');
    group.className = `toolbar-group toolbar-${name}`;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    return group;
  };
  const slots: ToolbarSlots = {
    view: slot('view', 'View'),
    search: slot('search', 'Search'),
    levels: slot('levels', 'Unfold to level'),
    actions: slot('actions', 'Options'),
  };

  // The view switch sits on the left and the actions on the right, with room between them, so
  // neither moves when the search and level controls are hidden (in the table and raw views).
  const spacer = document.createElement('span');
  spacer.className = 'toolbar-spacer';
  element.append(brand, slots.view, spacer, slots.search, slots.levels, slots.actions);
  return { element, slots };
}

/**
 * `onCopy` is called by the Copy path / Copy value buttons and reports whether copying worked,
 * so the button can say "Copied" or "Copy failed" for a moment.
 */
export function renderStatusBar(
  info: { contentType: string; bytes: number },
  onCopy: (what: CopyWhat) => Promise<boolean> = async () => false,
): StatusBar {
  const element = document.createElement('footer');
  element.className = 'status-bar';

  const type = document.createElement('span');
  type.className = 'status-type';
  type.textContent = info.contentType;

  const size = document.createElement('span');
  size.className = 'status-size';
  size.textContent = formatBytes(info.bytes);

  const path = document.createElement('span');
  path.className = 'status-path';

  const actions = document.createElement('span');
  actions.className = 'status-actions';
  actions.hidden = true;
  actions.append(copyButton('path', 'Copy path', onCopy), copyButton('value', 'Copy value', onCopy));

  element.append(type, size, path, actions);
  return {
    element,
    setPath(value) {
      path.textContent = value ?? '';
      actions.hidden = value === null;
    },
  };
}

const FEEDBACK_MS = 1200;

function copyButton(what: CopyWhat, label: string, onCopy: (what: CopyWhat) => Promise<boolean>): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-small';
  button.dataset.copy = what;
  button.textContent = label;
  let timer: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener('click', async () => {
    const copied = await onCopy(what);
    button.textContent = copied ? 'Copied' : 'Copy failed';
    clearTimeout(timer);
    timer = setTimeout(() => (button.textContent = label), FEEDBACK_MS);
  });
  return button;
}

/** Decimal units, like Chrome DevTools: `902` → `902 B`, `12_345` → `12.3 KB`, `1_039_898` → `1.0 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  // 999 999 bytes would round to "1000.0 KB", so switch to MB just below a million.
  if (bytes < 999_950) {
    return `${(bytes / 1000).toFixed(1)} KB`;
  }
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
