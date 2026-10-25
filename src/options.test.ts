import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { renderOptions } from './options';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

async function setup() {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  await renderOptions(container);
  const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) =>
    container.querySelector<T>(`[name="${name}"]`) as T;
  const change = async (input: HTMLInputElement | HTMLSelectElement) => {
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(container.querySelector('.status')?.textContent).not.toBe(''));
  };
  return { container, field, change };
}

beforeEach(() => {
  fakeBrowser.reset();
  document.documentElement.removeAttribute('data-theme');
});

describe('renderOptions', () => {
  it('has a field for every setting', async () => {
    const { field } = await setup();
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      expect(field(key), key).not.toBeNull();
    }
  });

  it('says where the settings are stored', async () => {
    const { container } = await setup();
    expect(container.querySelector('.note')?.textContent).toContain('stored in this browser only');
  });

  it('shows the stored settings', async () => {
    await saveSettings({ theme: 'dark', unfoldDepth: 4, links: false });
    const { field } = await setup();

    expect(field<HTMLSelectElement>('theme').value).toBe('dark');
    expect(field<HTMLInputElement>('unfoldDepth').value).toBe('4');
    expect(field<HTMLInputElement>('links').checked).toBe(false);
    expect(field<HTMLInputElement>('counts').checked).toBe(true);
  });

  it('saves a choice as soon as it changes, and says so', async () => {
    const { field, change, container } = await setup();

    field<HTMLSelectElement>('view').value = 'table';
    await change(field('view'));
    expect((await loadSettings()).view).toBe('table');
    expect(container.querySelector('.status')?.textContent).toBe('Saved');

    field<HTMLInputElement>('jwt').checked = false;
    await change(field('jwt'));
    expect((await loadSettings()).jwt).toBe(false);
  });

  it('keeps numbers within their range', async () => {
    const { field, change } = await setup();

    field<HTMLInputElement>('fontSize').value = '99';
    await change(field('fontSize'));

    expect((await loadSettings()).fontSize).toBe(24);
    expect(field<HTMLInputElement>('fontSize').value).toBe('24');
  });

  it('puts the stored number back when the box is left empty', async () => {
    await saveSettings({ unfoldDepth: 3 });
    const { field } = await setup();

    field<HTMLInputElement>('unfoldDepth').value = '';
    field('unfoldDepth').dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect(field<HTMLInputElement>('unfoldDepth').value).toBe('3'));
    expect((await loadSettings()).unfoldDepth).toBe(3);
  });

  it('goes back to the defaults', async () => {
    await saveSettings({ theme: 'dark', fontSize: 16, sortKeys: true });
    const { container, field } = await setup();

    container.querySelector<HTMLButtonElement>('.reset')?.click();

    await vi.waitFor(() => expect(field<HTMLSelectElement>('theme').value).toBe('system'));
    expect(field<HTMLInputElement>('fontSize').value).toBe('13');
    expect(field<HTMLInputElement>('sortKeys').checked).toBe(false);
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('follows changes made in the viewer while the page is open', async () => {
    const { field } = await setup();

    await saveSettings({ sortKeys: true });

    await vi.waitFor(() => expect(field<HTMLInputElement>('sortKeys').checked).toBe(true));
  });

  it('uses the chosen theme for the page itself', async () => {
    await saveSettings({ theme: 'dark' });
    await setup();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
