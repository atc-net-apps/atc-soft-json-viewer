import { describe, expect, it } from 'vitest';
import { BigNumber, findSyntaxError, parseDocument } from './parse';

function expectError(text: string) {
  const result = parseDocument(text);
  if (result.ok) {
    throw new Error(`expected a parse error for ${JSON.stringify(text)}`);
  }
  return result;
}

describe('parseDocument', () => {
  describe('valid JSON', () => {
    it('parses objects and arrays', () => {
      expect(parseDocument('{"items": [1, "two", true, null]}')).toEqual({
        ok: true,
        value: { items: [1, 'two', true, null] },
      });
    });

    it.each([
      ['a number', '42', 42],
      ['a string', '"hi"', 'hi'],
      ['null', 'null', null],
    ])('parses %s on its own', (_, text, value) => {
      expect(parseDocument(text)).toEqual({ ok: true, value });
    });

    it('ignores a byte order mark', () => {
      expect(parseDocument('﻿{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
    });
  });

  describe('big numbers', () => {
    it('keeps integers beyond the safe range exactly', () => {
      const result = parseDocument('{"ledgerId": 9007199254740993}');
      expect(result).toEqual({ ok: true, value: { ledgerId: new BigNumber('9007199254740993') } });
      expect(String((result as { value: { ledgerId: BigNumber } }).value.ledgerId)).toBe('9007199254740993');
    });

    it('keeps large negative integers exact, also inside arrays', () => {
      expect(parseDocument('[-12345678901234567890, 1]')).toEqual({
        ok: true,
        value: [new BigNumber('-12345678901234567890'), 1],
      });
    });

    it('keeps safe integers and decimals as normal numbers', () => {
      expect(parseDocument('[9007199254740991, -9007199254740991, 0.1, 1.5e3]')).toEqual({
        ok: true,
        value: [9007199254740991, -9007199254740991, 0.1, 1500],
      });
    });
  });

  describe('errors', () => {
    it.each([
      ['a trailing comma in an object', '{"a": 1,}', 7, 'Trailing comma'],
      ['a trailing comma in an array', '[1, 2,]', 5, 'Trailing comma'],
      ['an unquoted property name', '{a: 1}', 1, 'property name in double quotes'],
      ['single quotes', "{'a': 1}", 1, 'property name in double quotes'],
      ['a missing colon', '{"a" 1}', 5, 'Expected ":"'],
      ['a missing value', '{"a": }', 6, 'expected a value'],
      ['a missing comma in an array', '[1 2]', 3, 'Expected "," or "]"'],
      ['a missing comma in an object', '{"a": 1 "b": 2}', 8, 'Expected "," or "}"'],
      ['an unclosed string', '{"a": "hello}', 6, 'never closed'],
      ['a raw line break in a string', '"a\nb"', 2, 'control characters'],
      ['an invalid escape', '"\\x"', 1, 'Invalid escape'],
      ['a short \\u escape', '"\\u12"', 1, '4 hexadecimal digits'],
      ['a leading zero', '[012]', 1, 'cannot start with 0'],
      ['a missing digit after the point', '[1.]', 3, 'after the decimal point'],
      ['a missing exponent digit', '[1e]', 3, 'in the exponent'],
      ['a misspelled literal', '[tru3]', 4, 'did you mean true'],
      ['an unknown word', '[undefined]', 1, 'expected a value'],
      ['text after the value', '{} extra', 3, 'after the end of the JSON'],
      ['an empty document', '   ', 0, 'empty'],
    ])('points at %s', (_, text, position, message) => {
      const error = expectError(text);
      expect(error.position).toBe(position);
      expect(error.message).toContain(message);
    });

    it.each(['{"a": 1', '{"a":', '[1, 2', '"abc', '{"a": tr', '-'])('reports an unexpected end for %j', (text) => {
      const error = expectError(text);
      expect(error.position).toBe(text === '"abc' ? 0 : text.length);
    });

    it('gives the line and column on later lines', () => {
      const error = expectError('{\n  "a": 1,\n  "b": 2,\n}');
      expect(error).toMatchObject({ line: 3, column: 9, message: expect.stringContaining('Trailing comma') });
    });

    it('counts Windows line endings as one line break', () => {
      const error = expectError('{\r\n  "a": }');
      expect(error).toMatchObject({ line: 2, column: 8 });
    });
  });
});

describe('findSyntaxError', () => {
  it.each([
    '{}',
    '[]',
    '{"a": {"b": [1, -2.5e-3, "x\\n\\u00e9", true, false, null]}}',
    '  [ 0 , -0 , 10 , 1E+2 ]  ',
    '"\\"\\\\\\/\\b\\f\\n\\r\\t"',
  ])('accepts %j as valid', (text) => {
    expect(() => JSON.parse(text)).not.toThrow();
    expect(findSyntaxError(text)).toBeNull();
  });

  it('handles very deep nesting without running out of memory', () => {
    const text = '['.repeat(100_000);
    expect(findSyntaxError(text)).toEqual({ position: 100_000, message: 'Unexpected end of JSON' });
  });
});
