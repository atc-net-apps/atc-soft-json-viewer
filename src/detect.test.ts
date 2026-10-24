import { describe, expect, it } from 'vitest';
import { detectKind } from './detect';

describe('detectKind', () => {
  describe('JSON content types', () => {
    it.each([
      'application/json',
      'text/json',
      'application/problem+json',
      'application/ld+json',
      'application/vnd.api+json',
      'application/geo+json',
    ])('treats %s as JSON', (contentType) => {
      expect(detectKind(contentType, '{}')).toBe('json');
    });

    it('ignores parameters, case and spaces', () => {
      expect(detectKind(' Application/JSON; charset=utf-8 ', '{}')).toBe('json');
    });

    it('treats a broken body as JSON, so the viewer can show the error', () => {
      expect(detectKind('application/json', '{"a": }')).toBe('json');
    });

    it('treats the page as JSON when its text is not available', () => {
      expect(detectKind('application/json', null)).toBe('json');
    });
  });

  describe('plain text', () => {
    it.each([
      ['an object', '{"id": 1}'],
      ['an array', '[1, 2, 3]'],
      ['JSON with surrounding whitespace', '\n  {"id": 1}  \n'],
      ['JSON after a byte order mark', '﻿{"id": 1}'],
    ])('treats %s as JSON', (_, body) => {
      expect(detectKind('text/plain', body)).toBe('json');
    });

    it.each([
      ['ordinary text', 'Hello world'],
      ['a bare number', '42'],
      ['a bare string', '"hello"'],
      ['broken JSON', '{"id": 1,}'],
      ['an empty page', ''],
    ])('does not treat %s as JSON', (_, body) => {
      expect(detectKind('text/plain', body)).toBeNull();
    });

    it('does not treat plain text as JSON when its text is not available', () => {
      expect(detectKind('text/plain', null)).toBeNull();
    });
  });

  describe('other content types', () => {
    it.each([
      'text/html',
      'application/xml',
      'application/javascript',
      'application/jsonl',
      'application/x-ndjson',
      'application/json-patch',
      'image/png',
      '',
    ])('does not treat %s as JSON, even with a JSON body', (contentType) => {
      expect(detectKind(contentType, '{"id": 1}')).toBeNull();
    });
  });
});
