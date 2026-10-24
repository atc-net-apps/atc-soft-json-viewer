/**
 * An integer too large for a JavaScript number (beyond ±9 007 199 254 740 991).
 * Keeps the digits exactly as the server sent them, because `JSON.parse` would round them.
 */
export class BigNumber {
  constructor(readonly source: string) {}

  toString(): string {
    return this.source;
  }
}

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string; position: number; line: number; column: number };

export interface SyntaxErrorInfo {
  /** Index into the text, 0-based. Equals the text length when the text ends too early. */
  position: number;
  message: string;
}

/** The third reviver argument; current Chrome and Edge pass the raw source text of each primitive. */
interface ReviverContext {
  source?: string;
}

/**
 * Parses JSON text. On failure, says what is wrong and where (line and column are 1-based).
 * A leading byte order mark is ignored; positions refer to the text without it.
 */
export function parseDocument(text: string): ParseResult {
  const json = text.startsWith('﻿') ? text.slice(1) : text;

  try {
    return { ok: true, value: JSON.parse(json, keepBigIntegers) };
  } catch (error) {
    // Browsers word JSON errors differently and not all give a position, so we find it ourselves.
    const found = findSyntaxError(json) ?? {
      position: 0,
      message: error instanceof Error ? error.message : String(error),
    };
    return { ok: false, ...found, ...lineAndColumn(json, found.position) };
  }
}

function keepBigIntegers(_key: string, value: unknown, context?: ReviverContext): unknown {
  if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value) && context?.source) {
    return new BigNumber(context.source);
  }
  return value;
}

function lineAndColumn(text: string, position: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: position - lineStart + 1 };
}

/**
 * Scans JSON text (RFC 8259) and returns the first syntax error, or `null` when the text is valid.
 * Iterative rather than recursive, so deeply nested input cannot overflow the call stack.
 */
export function findSyntaxError(text: string): SyntaxErrorInfo | null {
  const length = text.length;
  const containers: ('{' | '[')[] = [];
  let i = 0;
  let expecting: 'value' | 'key' | 'separator' = 'value';

  const fail = (position: number, message: string): SyntaxErrorInfo => ({ position, message });
  const endTooEarly = (): SyntaxErrorInfo => fail(length, 'Unexpected end of JSON');
  const skipWhitespace = () => {
    while (i < length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) {
      i++;
    }
  };

  function scanString(): SyntaxErrorInfo | null {
    const start = i;
    i++; // opening quote
    while (i < length) {
      const char = text[i] as string;
      if (char === '"') {
        i++;
        return null;
      }
      if (char < ' ') {
        return fail(i, 'Line breaks and other control characters must be escaped in strings (for example \\n)');
      }
      if (char === '\\') {
        const escaped = text[i + 1];
        if (escaped === undefined) {
          break;
        }
        if (escaped === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
            return fail(i, 'Invalid \\u escape: expected 4 hexadecimal digits');
          }
          i += 6;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escaped)) {
          return fail(i, `Invalid escape sequence \\${escaped}`);
        }
        i += 2;
        continue;
      }
      i++;
    }
    return fail(start, 'This string is never closed (missing ")');
  }

  function scanNumber(): SyntaxErrorInfo | null {
    const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
    if (text[i] === '-') {
      i++;
    }
    if (text[i] === '0') {
      i++;
      if (isDigit(text[i])) {
        return fail(i - 1, 'Numbers cannot start with 0');
      }
    } else if (isDigit(text[i])) {
      while (isDigit(text[i])) i++;
    } else {
      return i >= length ? endTooEarly() : fail(i, 'Expected a digit');
    }
    if (text[i] === '.') {
      i++;
      if (!isDigit(text[i])) {
        return i >= length ? endTooEarly() : fail(i, 'Expected a digit after the decimal point');
      }
      while (isDigit(text[i])) i++;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++;
      if (text[i] === '+' || text[i] === '-') {
        i++;
      }
      if (!isDigit(text[i])) {
        return i >= length ? endTooEarly() : fail(i, 'Expected a digit in the exponent');
      }
      while (isDigit(text[i])) i++;
    }
    return null;
  }

  function scanLiteral(): SyntaxErrorInfo | null {
    const char = text[i] as string;
    const word = ['true', 'false', 'null'].find((w) => w[0] === char);
    if (word === undefined) {
      return fail(i, `Unexpected character ${JSON.stringify(char)}, expected a value`);
    }
    for (let k = 0; k < word.length; k++) {
      if (i + k >= length) {
        return endTooEarly();
      }
      if (text[i + k] !== word[k]) {
        return fail(i + k, `Invalid value, did you mean ${word}?`);
      }
    }
    i += word.length;
    return null;
  }

  skipWhitespace();
  if (i >= length) {
    return fail(0, 'The document is empty');
  }

  // Each round reads at least one character; every way out is a `return`.
  while (true) {
    skipWhitespace();

    if (expecting === 'value') {
      if (i >= length) {
        return endTooEarly();
      }
      const char = text[i] as string;
      if (char === '{' || char === '[') {
        containers.push(char);
        i++;
        skipWhitespace();
        const close = char === '{' ? '}' : ']';
        if (text[i] === close) {
          containers.pop();
          i++;
          expecting = 'separator';
        } else {
          expecting = char === '{' ? 'key' : 'value';
        }
        continue;
      }
      const error =
        char === '"' ? scanString() : char === '-' || (char >= '0' && char <= '9') ? scanNumber() : scanLiteral();
      if (error) {
        return error;
      }
      expecting = 'separator';
      continue;
    }

    if (expecting === 'key') {
      if (i >= length) {
        return endTooEarly();
      }
      if (text[i] !== '"') {
        return fail(i, 'Expected a property name in double quotes');
      }
      const error = scanString();
      if (error) {
        return error;
      }
      skipWhitespace();
      if (i >= length) {
        return endTooEarly();
      }
      if (text[i] !== ':') {
        return fail(i, 'Expected ":" after the property name');
      }
      i++;
      expecting = 'value';
      continue;
    }

    // expecting === 'separator': after a complete value.
    const container = containers[containers.length - 1];
    if (container === undefined) {
      return i < length ? fail(i, 'Unexpected text after the end of the JSON') : null;
    }
    if (i >= length) {
      return endTooEarly();
    }
    const close = container === '{' ? '}' : ']';
    if (text[i] === ',') {
      const comma = i;
      i++;
      skipWhitespace();
      if (text[i] === close) {
        return fail(comma, 'Trailing comma: remove the last ","');
      }
      expecting = container === '{' ? 'key' : 'value';
      continue;
    }
    if (text[i] === close) {
      containers.pop();
      i++;
      continue;
    }
    return fail(i, container === '{' ? 'Expected "," or "}" after the property value' : 'Expected "," or "]" after the array item');
  }
}
