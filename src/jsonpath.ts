import { BigNumber } from './parse';
import { childPath, ROOT_PATH } from './path';
import type { Key } from './search';

/**
 * JSONPath (RFC 9535), the everyday part: `$`, `.name`, `['name']` / `["name"]`, `[0]` (negative
 * counts from the end), `.*` / `[*]` and `..` before any of them. Filters, slices and unions are
 * reported as "not supported yet". A hand-written parser: the query is never run as code.
 */

export interface QueryResult {
  /** The keys from the root down to the result. */
  keys: Key[];
  /** The same as a JSON path, for example `$.items[0].sku`. */
  path: string;
  value: unknown;
}

export type QueryOutcome =
  | { ok: true; results: QueryResult[]; limited: boolean }
  | { ok: false; message: string; position: number };

/** More results than this are cut off, so `$..*` on a huge document stays quick. */
export const RESULT_LIMIT = 10_000;

type Selector = { kind: 'name'; name: string } | { kind: 'index'; index: number } | { kind: 'wildcard' };

interface Segment {
  /** `..`: the selector applies to the node and everything inside it. */
  descendant: boolean;
  selector: Selector;
}

interface Node {
  value: unknown;
  keys: Key[];
}

/** Whether search box text is a query: `$` alone, or `$` followed by `.` or `[`. So `$ref` is still a search. */
export function isQuery(text: string): boolean {
  return /^\$(?:$|[.[])/.test(text.trim());
}

/** Runs a query on a parsed document and returns what it selects, in document order. */
export function query(root: unknown, expression: string): QueryOutcome {
  const parsed = parse(expression.trim());
  if ('message' in parsed) {
    return { ok: false, ...parsed };
  }

  let nodes: Node[] = [{ value: root, keys: [] }];
  let limited = false;
  for (const segment of parsed.segments) {
    const next: Node[] = [];
    for (const node of nodes) {
      for (const target of segment.descendant ? descendants(node) : [node]) {
        select(segment.selector, target, next);
      }
      if (next.length >= RESULT_LIMIT) {
        limited = true;
        break;
      }
    }
    nodes = next.slice(0, RESULT_LIMIT);
  }

  const results = nodes.map(({ value, keys }) => ({ keys, path: keys.reduce<string>(childPath, ROOT_PATH), value }));
  return { ok: true, results, limited };
}

// ---------- Evaluating ----------

function select(selector: Selector, node: Node, out: Node[]): void {
  const { value } = node;
  if (value === null || typeof value !== 'object' || value instanceof BigNumber) {
    return;
  }
  if (Array.isArray(value)) {
    if (selector.kind === 'wildcard') {
      value.forEach((child, index) => out.push({ value: child, keys: [...node.keys, index] }));
    } else if (selector.kind === 'index') {
      const index = selector.index < 0 ? value.length + selector.index : selector.index;
      if (index >= 0 && index < value.length) {
        out.push({ value: value[index], keys: [...node.keys, index] });
      }
    }
    return;
  }
  if (selector.kind === 'wildcard') {
    for (const [key, child] of Object.entries(value)) {
      out.push({ value: child, keys: [...node.keys, key] });
    }
  } else if (selector.kind === 'name' && Object.hasOwn(value, selector.name)) {
    out.push({ value: (value as Record<string, unknown>)[selector.name], keys: [...node.keys, selector.name] });
  }
}

/** The node and everything inside it, parents before their children. Iterative, so deep nesting can't overflow the stack. */
function* descendants(node: Node): Generator<Node> {
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop() as Node;
    yield current;
    const { value } = current;
    if (value !== null && typeof value === 'object' && !(value instanceof BigNumber)) {
      const children: [Key, unknown][] = Array.isArray(value)
        ? value.map((child, index): [Key, unknown] => [index, child])
        : Object.entries(value);
      for (let i = children.length - 1; i >= 0; i--) {
        const [key, child] = children[i] as [Key, unknown];
        stack.push({ value: child, keys: [...current.keys, key] });
      }
    }
  }
}

// ---------- Parsing ----------

class QueryError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
  }
}

const ESCAPES: Record<string, string> = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', '/': '/', '\\': '\\' };

/**
 * A name after `.` starts with a letter, `_` or any character from U+0080 up (RFC 9535 name-first).
 * Checked by code, not with a RegExp range up to U+FFFF: the bundler would write that character
 * into viewer.js as it is, and Chrome refuses to inject a script containing it.
 */
function isNameFirst(char: string | undefined): boolean {
  return char !== undefined && (/[A-Za-z_]/.test(char) || char.charCodeAt(0) >= 0x80);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function parse(text: string): { segments: Segment[] } | { message: string; position: number } {
  try {
    return { segments: new Parser(text).parse() };
  } catch (error) {
    if (error instanceof QueryError) {
      return { message: error.message, position: error.position };
    }
    throw error;
  }
}

class Parser {
  private i = 0;

  constructor(private readonly text: string) {}

  parse(): Segment[] {
    if (this.text[0] !== '$') {
      throw new QueryError('A query starts with $', 0);
    }
    this.i = 1;
    const segments: Segment[] = [];
    while (this.skipBlanks() < this.text.length) {
      if (this.text.startsWith('..', this.i)) {
        this.i += 2;
        segments.push({ descendant: true, selector: this.selectorAfterDot('..') });
      } else if (this.text[this.i] === '.') {
        this.i += 1;
        segments.push({ descendant: false, selector: this.selectorAfterDot('.') });
      } else if (this.text[this.i] === '[') {
        segments.push({ descendant: false, selector: this.bracket() });
      } else {
        throw new QueryError(`Unexpected "${this.text[this.i]}": use .name, ['name'], [0] or [*]`, this.i);
      }
    }
    return segments;
  }

  /** After `.` a name or `*`; after `..` also a `[…]`. */
  private selectorAfterDot(dots: '.' | '..'): Selector {
    const char = this.text[this.i];
    if (char === '*') {
      this.i += 1;
      return { kind: 'wildcard' };
    }
    if (dots === '..' && char === '[') {
      return this.bracket();
    }
    if (isNameFirst(char)) {
      const start = this.i;
      while (isNameFirst(this.text[this.i]) || isDigit(this.text[this.i])) {
        this.i += 1;
      }
      return { kind: 'name', name: this.text.slice(start, this.i) };
    }
    const hint = dots === '..' ? 'a name, * or [' : 'a name or *, or use [\'name\'] for other keys';
    throw new QueryError(`Expected ${hint} after ${dots}`, this.i);
  }

  private bracket(): Selector {
    this.i += 1; // [
    this.skipBlanks();
    const char = this.text[this.i];
    let selector: Selector;
    if (char === '?') {
      throw new QueryError('Not supported yet: filters ([?…])', this.i);
    } else if (char === ':') {
      throw new QueryError('Not supported yet: slices ([start:end])', this.i);
    } else if (char === '*') {
      this.i += 1;
      selector = { kind: 'wildcard' };
    } else if (char === "'" || char === '"') {
      selector = { kind: 'name', name: this.string(char) };
    } else if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) {
      selector = { kind: 'index', index: this.integer() };
    } else {
      throw new QueryError("Expected a name in quotes, a number or * inside [ ]", this.i);
    }

    this.skipBlanks();
    if (this.text[this.i] === ':') {
      throw new QueryError('Not supported yet: slices ([start:end])', this.i);
    }
    if (this.text[this.i] === ',') {
      throw new QueryError('Not supported yet: several selectors in one [ ] ([a, b])', this.i);
    }
    if (this.text[this.i] !== ']') {
      throw new QueryError('Expected ]', this.i);
    }
    this.i += 1;
    return selector;
  }

  private string(quote: "'" | '"'): string {
    const start = this.i;
    this.i += 1;
    let value = '';
    while (this.i < this.text.length) {
      const char = this.text[this.i] as string;
      if (char === quote) {
        this.i += 1;
        return value;
      }
      if (char === '\\') {
        value += this.escape(quote);
        continue;
      }
      if (char < ' ') {
        throw new QueryError('Control characters must be escaped, for example \\n', this.i);
      }
      value += char;
      this.i += 1;
    }
    throw new QueryError(`Missing closing ${quote}`, start);
  }

  private escape(quote: "'" | '"'): string {
    const char = this.text[this.i + 1];
    if (char === quote) {
      this.i += 2;
      return quote;
    }
    if (char !== undefined && char in ESCAPES) {
      this.i += 2;
      return ESCAPES[char] as string;
    }
    if (char === 'u') {
      const hex = this.text.slice(this.i + 2, this.i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw new QueryError('Expected 4 hex digits after \\u', this.i);
      }
      this.i += 6;
      return String.fromCharCode(parseInt(hex, 16));
    }
    throw new QueryError(`Unknown escape \\${char ?? ''}`, this.i);
  }

  private integer(): number {
    const match = /^-?(?:0|[1-9][0-9]*)/.exec(this.text.slice(this.i));
    if (!match || match[0] === '-' || match[0] === '-0') {
      throw new QueryError('Expected a whole number such as 0, 2 or -1', this.i);
    }
    const index = Number(match[0]);
    if (!Number.isSafeInteger(index)) {
      throw new QueryError('The number is too large', this.i);
    }
    this.i += match[0].length;
    return index;
  }

  /** Spaces are allowed between segments and inside brackets. Returns the new position. */
  private skipBlanks(): number {
    while (this.i < this.text.length && ' \t\n\r'.includes(this.text[this.i] as string)) {
      this.i += 1;
    }
    return this.i;
  }
}
