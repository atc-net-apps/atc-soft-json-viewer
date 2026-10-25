import { describe, expect, it, vi } from 'vitest';
import { formatBytes, renderStatusBar, renderToolbar } from './toolbar';

describe('renderToolbar', () => {
  it('has a labelled slot for each group of controls', () => {
    const { element, slots } = renderToolbar();
    expect(element.querySelector('.brand')?.textContent).toBe('ATC JSON Viewer');
    expect(Object.values(slots).every((slot) => element.contains(slot) && slot.getAttribute('aria-label'))).toBe(true);
  });
});

describe('renderStatusBar', () => {
  it('shows the content type, the size and the selected path with copy buttons', () => {
    const statusBar = renderStatusBar({ contentType: 'application/problem+json', bytes: 2000 });
    const text = (selector: string) => statusBar.element.querySelector(selector)?.textContent;
    const actions = () => statusBar.element.querySelector<HTMLElement>('.status-actions');
    expect(text('.status-type')).toBe('application/problem+json');
    expect(text('.status-size')).toBe('2.0 KB');
    expect(actions()?.hidden).toBe(true);

    statusBar.setPath('$.items[0].sku');
    expect(text('.status-path')).toBe('$.items[0].sku');
    expect(actions()?.hidden).toBe(false);

    statusBar.setPath(null);
    expect(text('.status-path')).toBe('');
    expect(actions()?.hidden).toBe(true);
  });

  it('says whether copying worked, then shows the label again', async () => {
    vi.useFakeTimers();
    const onCopy = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const statusBar = renderStatusBar({ contentType: 'application/json', bytes: 2 }, onCopy);
    const button = statusBar.element.querySelector<HTMLButtonElement>('[data-copy="value"]') as HTMLButtonElement;

    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('Copied'));
    expect(onCopy).toHaveBeenCalledWith('value');

    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('Copy failed'));

    vi.advanceTimersByTime(2000);
    expect(button.textContent).toBe('Copy value');
    vi.useRealTimers();
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [902, '902 B'],
    [1000, '1.0 KB'],
    [12_345, '12.3 KB'],
    [1_039_898, '1.0 MB'],
    [999_949, '999.9 KB'],
    [999_999, '1.0 MB'],
    [5_000_000, '5.0 MB'],
  ])('formats %i bytes as %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
