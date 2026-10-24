// Local test server for the files in test/fixtures (npm run fixtures).
// Uses only Node's built-in modules. Listens on 127.0.0.1, so only this computer can reach it.
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const PORT = 5179;
const FIXTURES = resolve(import.meta.dirname, '..', 'test', 'fixtures');

// A deliberately strict policy, to prove the viewer still looks right on such pages.
const STRICT_CSP = "default-src 'none'; style-src 'none'";

/** The headers a real server would send for this file name. Longest suffix wins. */
function headersFor(name) {
  if (name.endsWith('.strict-csp.json')) {
    return { 'Content-Type': 'application/json; charset=utf-8', 'Content-Security-Policy': STRICT_CSP };
  }
  if (name.endsWith('.problem.json')) {
    return { 'Content-Type': 'application/problem+json; charset=utf-8' };
  }
  if (name.endsWith('.json')) {
    return { 'Content-Type': 'application/json; charset=utf-8' };
  }
  if (name.endsWith('.txt')) {
    return { 'Content-Type': 'text/plain; charset=utf-8' };
  }
  return null;
}

async function listFixtures() {
  const names = await readdir(FIXTURES).catch(() => []);
  return names.filter((name) => headersFor(name) !== null).sort();
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function indexPage() {
  const names = await listFixtures();
  const items = names
    .map((name) => `<li><a href="/${encodeURIComponent(name)}">${escapeHtml(name)}</a> <small>${escapeHtml(headersFor(name)['Content-Type'])}</small></li>`)
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>ATC JSON Viewer fixtures</title>
<h1>ATC JSON Viewer fixtures</h1>
<p>Open a file, then click the ATC JSON Viewer button.</p>
<ul>${items || '<li>No fixtures found in test/fixtures.</li>'}</ul>`;
}

const server = createServer(async (request, response) => {
  // Never cache, so edited fixtures show up on reload.
  response.setHeader('Cache-Control', 'no-store');

  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await indexPage());
    return;
  }

  try {
    // Throws on malformed addresses such as "/%E0%A4%A"; the catch below answers 404 instead of crashing.
    const name = decodeURIComponent(url.pathname.slice(1));
    const file = resolve(FIXTURES, name);
    const headers = headersFor(name);
    // Only plain file names inside test/fixtures: no "../" tricks, no sub-folders.
    if (!headers || name.includes('/') || name.includes('\\') || !file.startsWith(FIXTURES + sep)) {
      throw new Error('not a fixture');
    }
    const body = await readFile(join(FIXTURES, name));
    response.writeHead(200, headers);
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Fixtures: http://localhost:${PORT}/  (Ctrl+C to stop)`);
});
