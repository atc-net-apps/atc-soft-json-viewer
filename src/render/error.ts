import type { ParseResult } from '../parse';

export type ParseFailure = Extract<ParseResult, { ok: false }>;

/** Lines shown before and after the broken line. */
const CONTEXT_LINES = 10;
/** Characters shown on each side of the error when lines are very long, as in minified JSON. */
const CONTEXT_CHARS = 120;

/**
 * Says what is wrong and where, then shows the lines around the error with line numbers,
 * the broken line highlighted and a caret under the exact column.
 * The text is only ever inserted with `textContent`.
 */
export function renderParseError(text: string, error: ParseFailure): HTMLElement {
  const element = document.createElement('div');
  element.className = 'parse-error';
  element.append(renderBanner(error), renderSource(text, error));
  return element;
}

function renderBanner(error: ParseFailure): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'parse-error-banner';
  banner.append(
    paragraph('parse-error-title', "This isn't valid JSON"),
    paragraph('parse-error-message', `Line ${error.line}, column ${error.column}: ${error.message}`),
    paragraph('parse-error-hint', 'Switch to Raw to see the whole text, or click the ATC JSON Viewer button again for the original page.'),
  );
  return banner;
}

function renderSource(text: string, error: ParseFailure): HTMLElement {
  // Positions don't count a byte order mark (see parseDocument).
  const lines = (text.startsWith('﻿') ? text.slice(1) : text).split('\n').map((line) => line.replace(/\r$/, ''));
  // A final line break doesn't start a line of its own, as in an editor, unless the error is right there.
  if (lines.length > error.line && lines.at(-1) === '') {
    lines.pop();
  }
  const errorIndex = Math.min(error.line, lines.length) - 1;
  const first = Math.max(0, errorIndex - CONTEXT_LINES);
  const last = Math.min(lines.length - 1, errorIndex + CONTEXT_LINES);

  // Every line shows the same columns, so they stay lined up when long lines are cut.
  const caretIndex = error.column - 1;
  const start = Math.max(0, caretIndex - CONTEXT_CHARS);
  const end = caretIndex + CONTEXT_CHARS;

  const source = document.createElement('div');
  source.className = 'error-source';
  // Room for the widest line number, set through the CSSOM (CSP-safe).
  source.style.setProperty('--number-width', `${String(last + 1).length}ch`);

  for (let index = first; index <= last; index++) {
    const line = lines[index] ?? '';
    const row = sourceLine(String(index + 1));
    const content = row.lastElementChild as HTMLElement;
    if (start > 0 && line.length > 0) {
      content.append('…');
    }

    if (index === errorIndex) {
      row.classList.add('error-line');
      // The character the parser stopped at; a space when the line (or the text) ends there.
      content.append(line.slice(start, caretIndex));
      const marked = document.createElement('span');
      marked.className = 'error-char';
      marked.textContent = line[caretIndex] ?? ' ';
      content.append(marked, line.slice(caretIndex + 1, end));
    } else {
      content.append(line.slice(start, end));
    }
    if (line.length > end) {
      content.append('…');
    }
    source.append(row);

    if (index === errorIndex) {
      source.append(renderCaret(line, start, caretIndex));
    }
  }
  return source;
}

/** `    ^` under the error. Tabs are kept, so the caret lines up with tab-indented text. */
function renderCaret(line: string, start: number, caretIndex: number): HTMLElement {
  const row = sourceLine('');
  row.classList.add('caret-line');
  // Only decoration: the message above already says where the error is.
  row.setAttribute('aria-hidden', 'true');
  const before = line.slice(start, caretIndex).replace(/[^\t]/g, ' ');
  (row.lastElementChild as HTMLElement).textContent = `${start > 0 ? ' ' : ''}${before}^`;
  return row;
}

function sourceLine(number: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'source-line';
  const numberElement = document.createElement('span');
  numberElement.className = 'line-number';
  numberElement.textContent = number;
  const content = document.createElement('span');
  content.className = 'line-text';
  row.append(numberElement, content);
  return row;
}

function paragraph(className: string, text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}
