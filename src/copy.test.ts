import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, valueToText } from './copy';
import { BigNumber } from './parse';

describe('valueToText', () => {
  it.each([
    ['a string, without quotes', 'A-1001', 'A-1001'],
    ['a number', 249.5, '249.5'],
    ['true', true, 'true'],
    ['null', null, 'null'],
    ['a big number, exactly', new BigNumber('9007199254740993'), '9007199254740993'],
  ])('copies %s', (_, value, text) => {
    expect(valueToText(value)).toBe(text);
  });

  it('copies objects and arrays as indented JSON', () => {
    expect(valueToText({ sku: 'A-100', tags: ['red'] })).toBe('{\n  "sku": "A-100",\n  "tags": [\n    "red"\n  ]\n}');
  });

  it('keeps big numbers exact and unquoted inside objects', () => {
    expect(valueToText({ ledgerId: new BigNumber('9007199254740993'), ids: [new BigNumber('-12345678901234567890')] })).toBe(
      '{\n  "ledgerId": 9007199254740993,\n  "ids": [\n    -12345678901234567890\n  ]\n}',
    );
  });
});

describe('copyText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the Clipboard API on secure pages', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('isSecureContext', true);

    expect(await copyText('hello', document.body)).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to the copy command on plain-HTTP pages and removes its hidden text box', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('isSecureContext', false);
    let copied = '';
    const execCommand = vi.fn(() => {
      copied = (document.querySelector('.copy-buffer') as HTMLTextAreaElement).value;
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

    expect(await copyText('hello', document.body)).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copied).toBe('hello');
    expect(document.querySelector('.copy-buffer')).toBeNull();
  });

  it('reports a failure when no copy method works', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('isSecureContext', false);
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });

    expect(await copyText('hello', document.body)).toBe(false);
  });
});
