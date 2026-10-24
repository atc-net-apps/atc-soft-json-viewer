import { describe, expect, it } from 'vitest';
import { formatBytes, renderStatusBar, renderToolbar } from './toolbar';

describe('renderToolbar', () => {
  it('has a labelled slot for each group of controls', () => {
    const { element, slots } = renderToolbar();
    expect(element.querySelector('.brand')?.textContent).toBe('ATC JSON Viewer');
    expect(Object.values(slots).every((slot) => element.contains(slot) && slot.getAttribute('aria-label'))).toBe(true);
  });
});

describe('renderStatusBar', () => {
  it('shows the content type, the size and the selected path', () => {
    const statusBar = renderStatusBar({ contentType: 'application/problem+json', bytes: 2000 });
    expect(statusBar.element.textContent).toBe('application/problem+json2.0 KB');

    statusBar.setPath('$.items[0].sku');
    expect(statusBar.element.querySelector('.status-path')?.textContent).toBe('$.items[0].sku');

    statusBar.setPath(null);
    expect(statusBar.element.querySelector('.status-path')?.textContent).toBe('');
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
