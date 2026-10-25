import { describe, expect, it } from 'vitest';
import BROKEN from '../../test/fixtures/broken.json?raw';
import { parseDocument } from '../parse';
import { type ParseFailure, renderParseError } from './error';

function render(text: string) {
  const element = renderParseError(text, parseDocument(text) as ParseFailure);
  const lineTexts = () => Array.from(element.querySelectorAll('.source-line:not(.caret-line) .line-text'), (line) => line.textContent);
  const lineNumbers = () =>
    Array.from(element.querySelectorAll('.source-line:not(.caret-line) .line-number'), (number) => number.textContent);
  return {
    element,
    lineTexts,
    lineNumbers,
    message: element.querySelector('.parse-error-message')?.textContent,
    errorLine: element.querySelector('.error-line'),
    errorChar: element.querySelector('.error-char')?.textContent,
    caret: element.querySelector('.caret-line .line-text')?.textContent,
  };
}

describe('renderParseError', () => {
  it('says what is wrong and where', () => {
    const { message, element } = render(BROKEN);
    expect(element.querySelector('.parse-error-title')?.textContent).toBe("This isn't valid JSON");
    expect(message).toBe('Line 5, column 38: Trailing comma: remove the last ","');
  });

  it('shows the text with line numbers and highlights the broken line', () => {
    const { lineNumbers, lineTexts, errorLine } = render(BROKEN);

    expect(lineNumbers()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(lineTexts()[1]).toBe('  "orderId": "A-1002",');
    expect(errorLine?.querySelector('.line-number')?.textContent).toBe('5');
    expect(errorLine?.querySelector('.line-text')?.textContent).toBe('    { "sku": "B-200", "quantity": 1 },');
  });

  it('marks the character at the error and puts a caret under it', () => {
    const { errorChar, caret } = render(BROKEN);
    expect(errorChar).toBe(',');
    expect(caret).toBe(`${' '.repeat(37)}^`);
  });

  it('keeps tabs in front of the caret, so it lines up with tab-indented text', () => {
    const { caret, errorChar } = render('{\n\t"a": 1 2\n}');
    expect(errorChar).toBe('2');
    expect(caret).toBe('\t       ^');
  });

  it('does not show the empty line after a final line break', () => {
    expect(render(BROKEN).lineNumbers().at(-1)).toBe('8');
  });

  it('shows that empty line when the error is on it', () => {
    const { lineNumbers, errorLine } = render('{"a": 1\n');
    expect(lineNumbers()).toEqual(['1', '2']);
    expect(errorLine?.querySelector('.line-number')?.textContent).toBe('2');
  });

  it('marks the end of the text when the text ends too early', () => {
    const { message, errorChar, caret } = render('{"a": 1');
    expect(message).toContain('Line 1, column 8');
    expect(errorChar).toBe(' ');
    expect(caret).toBe(`${' '.repeat(7)}^`);
  });

  it('shows only the 10 lines before and after the error in a long document', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `  "key${i}": ${i},`);
    lines[49] = '  "broken": tru,';
    const { lineNumbers } = render(`{\n${lines.join('\n')}\n}`);

    expect(lineNumbers()[0]).toBe('41');
    expect(lineNumbers().at(-1)).toBe('61');
  });

  it('cuts very long lines around the error, as in minified JSON', () => {
    const minified = `[${'1,'.repeat(500)}x]`;
    const { lineTexts, errorChar, caret } = render(minified);
    const [line] = lineTexts();

    expect(errorChar).toBe('x');
    expect(line?.startsWith('…')).toBe(true);
    expect(line?.length).toBeLessThan(300);
    expect(caret?.indexOf('^')).toBe(line?.indexOf('x'));
  });

  it('never turns text from the page into HTML', () => {
    const { element } = render('{"a": <img src=x onerror=alert(1)>}');
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.error-line')?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('works with Windows line endings and a byte order mark', () => {
    const { lineTexts, caret } = render('\uFEFF{\r\n  "a": 1,\r\n}');
    expect(lineTexts()).toEqual(['{', '  "a": 1,', '}']);
    expect(caret).toBe(`${' '.repeat(8)}^`);
  });
});
