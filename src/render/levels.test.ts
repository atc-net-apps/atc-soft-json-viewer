import { describe, expect, it, vi } from 'vitest';
import { renderLevelButtons } from './levels';

describe('renderLevelButtons', () => {
  const button = (element: HTMLElement, label: string) =>
    Array.from(element.querySelectorAll('button')).find((candidate) => candidate.textContent === label);

  it('offers 1, 2, 3 and All, each with a description', () => {
    const element = renderLevelButtons(() => {});
    const buttons = Array.from(element.querySelectorAll('button'));

    expect(element.querySelector('.toolbar-label')?.textContent).toBe('Unfold');
    expect(buttons.map((candidate) => candidate.textContent)).toEqual(['1', '2', '3', 'All']);
    expect(buttons.every((candidate) => candidate.title && candidate.getAttribute('aria-label'))).toBe(true);
  });

  it.each([
    ['1', 1],
    ['2', 2],
    ['3', 3],
    ['All', Infinity],
  ])('reports %s as level %s', (label, level) => {
    const onLevel = vi.fn();
    const element = renderLevelButtons(onLevel);

    button(element, label)?.click();

    expect(onLevel).toHaveBeenCalledWith(level);
  });

  it('keeps no button pressed', () => {
    const element = renderLevelButtons(() => {});
    button(element, '2')?.click();
    expect(element.querySelector('[aria-pressed]')).toBeNull();
  });
});
