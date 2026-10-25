// Fails if the built extension contains code that could reach the network, run text as code, or
// turn text into HTML. Run after a build: node scripts/check-no-network.mjs [folder]
// (default .output/chrome-mv3). Uses only Node's built-in modules.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** What must never appear in the shipped code, and why. */
export const FORBIDDEN = [
  { name: 'fetch(', pattern: /\bfetch\s*\(/g, why: 'network request' },
  { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/g, why: 'network request' },
  { name: 'WebSocket', pattern: /\bWebSocket\b/g, why: 'network connection' },
  { name: 'EventSource', pattern: /\bEventSource\b/g, why: 'network connection' },
  { name: 'sendBeacon', pattern: /\bsendBeacon\b/g, why: 'network request' },
  { name: 'importScripts', pattern: /\bimportScripts\b/g, why: 'loads code from elsewhere' },
  { name: 'eval(', pattern: /\beval\s*\(/g, why: 'runs text as code' },
  { name: 'new Function(', pattern: /\bnew\s+Function\s*\(/g, why: 'runs text as code' },
  { name: 'innerHTML', pattern: /\binnerHTML\b/g, why: 'turns text into HTML' },
  { name: 'outerHTML', pattern: /\bouterHTML\b/g, why: 'turns text into HTML' },
  { name: 'insertAdjacentHTML', pattern: /\binsertAdjacentHTML\b/g, why: 'turns text into HTML' },
  { name: 'document.write', pattern: /\bdocument\.write(?:ln)?\b/g, why: 'turns text into HTML' },
];

const SCANNED = /\.(?:js|mjs|html)$/;

/** Every forbidden pattern in a file's text, with its line and column (1-based). */
export function findForbidden(text) {
  const found = [];
  for (const { name, pattern, why } of FORBIDDEN) {
    for (const match of text.matchAll(pattern)) {
      const before = text.slice(0, match.index);
      const line = before.split('\n').length;
      const column = match.index - before.lastIndexOf('\n');
      found.push({ name, why, line, column });
    }
  }
  return found;
}

async function filesIn(folder) {
  const entries = await readdir(folder, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile() && SCANNED.test(entry.name)).map((entry) => join(entry.parentPath, entry.name));
}

async function main() {
  const folder = resolve(process.argv[2] ?? '.output/chrome-mv3');
  const files = await filesIn(folder).catch(() => []);
  if (files.length === 0) {
    console.error(`No built files in ${folder}. Run npm run build first.`);
    process.exit(1);
  }

  let problems = 0;
  for (const file of files) {
    for (const { name, why, line, column } of findForbidden(await readFile(file, 'utf8'))) {
      console.error(`${relative(process.cwd(), file)}:${line}:${column}  ${name} (${why})`);
      problems++;
    }
  }
  if (problems > 0) {
    console.error(`\n${problems} forbidden pattern(s) found. The extension must not use the network or build HTML from text.`);
    process.exit(1);
  }
  console.log(`No network access, code from text or HTML from text in ${files.length} built files.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
