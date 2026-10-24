import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings } from './settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('settings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('remembers saved settings and keeps the others', async () => {
    await saveSettings({ theme: 'dark' });
    await saveSettings({ sortKeys: true });

    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', sortKeys: true });
  });

  it('stores settings in chrome.storage.local only', async () => {
    await saveSettings({ fontSize: 15 });

    expect(await fakeBrowser.storage.local.get('settings')).toEqual({
      settings: { ...DEFAULT_SETTINGS, fontSize: 15 },
    });
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
  });

  it('ignores unknown keys and invalid values in storage', async () => {
    await fakeBrowser.storage.local.set({
      settings: { theme: 'purple', fontSize: 15, unfoldDepth: -1, view: 'raw', somethingElse: 1 },
    });

    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, fontSize: 15, view: 'raw' });
  });

  it('ignores a damaged stored value', async () => {
    await fakeBrowser.storage.local.set({ settings: 'not an object' });

    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('never saves invalid values', async () => {
    await saveSettings({ fontSize: 500 } as never);

    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('resets to the defaults', async () => {
    await saveSettings({ theme: 'light' });
    await resetSettings();

    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
