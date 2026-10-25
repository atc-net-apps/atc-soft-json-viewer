import { describe, expect, it, vi } from 'vitest';
import { renderSegmented, renderToggle } from './controls';

function setup() {
  const onChange = vi.fn();
  const control = renderSegmented(
    'View',
    [
      { value: 'tree', label: 'Tree' },
      { value: 'raw', label: 'Raw', title: 'Exactly what the server sent' },
    ],
    'tree',
    onChange,
  );
  const button = (value: string) => control.element.querySelector<HTMLButtonElement>(`[data-value="${value}"]`);
  return { control, onChange, button };
}

describe('renderToggle', () => {
  it('turns on and off when clicked, and reports it', () => {
    const onChange = vi.fn();
    const button = renderToggle('A–Z', 'Sort keys A–Z', false, onChange);
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith(true);

    button.click();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('starts pressed when asked to', () => {
    expect(renderToggle('A–Z', 'Sort keys A–Z', true, () => {}).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('renderSegmented', () => {
  it('marks the selected option as pressed', () => {
    const { control, button } = setup();
    expect(control.element.getAttribute('aria-label')).toBe('View');
    expect(button('tree')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('raw')?.getAttribute('aria-pressed')).toBe('false');
    expect(button('raw')?.title).toBe('Exactly what the server sent');
  });

  it('switches and reports the new value when an option is clicked', () => {
    const { onChange, button } = setup();
    button('raw')?.click();
    expect(onChange).toHaveBeenCalledWith('raw');
    expect(button('raw')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('tree')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('does nothing when the pressed option is clicked again', () => {
    const { onChange, button } = setup();
    button('tree')?.click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches from code without reporting a change', () => {
    const { control, onChange, button } = setup();
    control.setSelected('raw');
    expect(button('raw')?.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
  });
});
