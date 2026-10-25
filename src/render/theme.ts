import type { Theme } from '../settings';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** System → Light → Dark → System. */
export function nextTheme(theme: Theme): Theme {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] as Theme;
}

/**
 * viewer.css follows the operating system unless the host has `data-theme="light"` or `"dark"`.
 * An attribute rather than a style, so a page's Content-Security-Policy can't block it.
 */
export function applyTheme(host: HTMLElement, theme: Theme): void {
  if (theme === 'system') {
    host.removeAttribute('data-theme');
  } else {
    host.dataset.theme = theme;
  }
}

/** A toolbar button that cycles the theme and reports each change. */
export function renderThemeButton(host: HTMLElement, initial: Theme, onChange: (theme: Theme) => void): HTMLButtonElement {
  let theme = initial;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.title = 'Switch between the system theme, light and dark';

  const show = () => {
    button.textContent = `Theme: ${LABELS[theme]}`;
    applyTheme(host, theme);
  };

  button.addEventListener('click', () => {
    theme = nextTheme(theme);
    show();
    onChange(theme);
  });

  show();
  return button;
}
