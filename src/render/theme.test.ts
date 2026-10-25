import { describe, expect, it, vi } from 'vitest';
import { applyTheme, nextTheme, renderThemeButton } from './theme';

describe('nextTheme', () => {
  it('cycles System → Light → Dark → System', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});

describe('applyTheme', () => {
  it('sets data-theme for light and dark, and removes it for system', () => {
    const host = document.createElement('div');

    applyTheme(host, 'dark');
    expect(host.getAttribute('data-theme')).toBe('dark');

    applyTheme(host, 'light');
    expect(host.getAttribute('data-theme')).toBe('light');

    applyTheme(host, 'system');
    expect(host.hasAttribute('data-theme')).toBe(false);
  });
});

describe('renderThemeButton', () => {
  it('starts with the given theme', () => {
    const host = document.createElement('div');
    const button = renderThemeButton(host, 'dark', () => {});

    expect(button.textContent).toBe('Theme: Dark');
    expect(host.getAttribute('data-theme')).toBe('dark');
  });

  it('cycles the theme on click and reports each change', () => {
    const host = document.createElement('div');
    const onChange = vi.fn();
    const button = renderThemeButton(host, 'system', onChange);
    expect(button.textContent).toBe('Theme: System');

    button.click();
    expect(button.textContent).toBe('Theme: Light');
    expect(host.getAttribute('data-theme')).toBe('light');
    expect(onChange).toHaveBeenLastCalledWith('light');

    button.click();
    button.click();
    expect(button.textContent).toBe('Theme: System');
    expect(host.hasAttribute('data-theme')).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith('system');
  });
});
