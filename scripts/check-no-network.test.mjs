import { describe, expect, it } from 'vitest';
import { findForbidden } from './check-no-network.mjs';

describe('findForbidden', () => {
  it.each([
    ['fetch(', 'fetch("https://example.com")'],
    ['fetch(', 'globalThis.fetch (url)'],
    ['XMLHttpRequest', 'new XMLHttpRequest()'],
    ['WebSocket', 'new WebSocket(url)'],
    ['EventSource', 'new EventSource(url)'],
    ['sendBeacon', 'navigator.sendBeacon(url, data)'],
    ['importScripts', 'importScripts("x.js")'],
    ['eval(', 'eval(code)'],
    ['new Function(', 'new Function("return 1")'],
    ['innerHTML', 'element.innerHTML = text'],
    ['outerHTML', 'element.outerHTML = text'],
    ['insertAdjacentHTML', 'element.insertAdjacentHTML("beforeend", text)'],
    ['document.write', 'document.write(text)'],
  ])('finds %s in %s', (name, code) => {
    expect(findForbidden(code).map((found) => found.name)).toEqual([name]);
  });

  it('gives the line and column of each one', () => {
    expect(findForbidden('const a = 1;\nconst b = fetch(url);')).toEqual([
      { name: 'fetch(', why: 'network request', line: 2, column: 11 },
    ]);
  });

  it.each([
    ['a longer word that ends in fetch', 'prefetch(link)'],
    ['the word without a call', 'const fetchedAt = 1'],
    ['textContent', 'element.textContent = text'],
    ['a function called evaluate', 'evaluate(x)'],
  ])('ignores %s', (_, code) => {
    expect(findForbidden(code)).toEqual([]);
  });
});
