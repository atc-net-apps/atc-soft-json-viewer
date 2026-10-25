// Fails if the built extension asks for more than it needs, or contains a file Chrome won't load.
// Run after a build: node scripts/check-manifest.mjs [folder] (default .output/chrome-mv3).
// Uses only Node's built-in modules.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Exactly these permissions: the current tab after a click, injecting the viewer, and settings. */
export const PERMISSIONS = ['activeTab', 'scripting', 'storage'];

/** The extension's own pages may only run its own scripts and can't connect anywhere. */
export const EXTENSION_PAGES_CSP = "script-src 'self'; object-src 'self'; connect-src 'none'";

/** Manifest keys that would give the extension access to sites, or let sites talk to it. */
const FORBIDDEN_KEYS = [
  'host_permissions',
  'optional_host_permissions',
  'optional_permissions',
  'content_scripts',
  'externally_connectable',
  'web_accessible_resources',
];

/** What is wrong with a built manifest, as sentences; empty when it is fine. */
export function checkManifest(manifest) {
  const problems = [];
  const permissions = [...(manifest.permissions ?? [])].sort();
  if (JSON.stringify(permissions) !== JSON.stringify([...PERMISSIONS].sort())) {
    problems.push(`permissions are ${JSON.stringify(manifest.permissions ?? [])}, expected exactly ${JSON.stringify(PERMISSIONS)}`);
  }
  for (const key of FORBIDDEN_KEYS) {
    if (key in manifest) {
      problems.push(`"${key}" must not be in the manifest`);
    }
  }
  if (manifest.content_security_policy?.extension_pages !== EXTENSION_PAGES_CSP) {
    problems.push(`content_security_policy.extension_pages must be "${EXTENSION_PAGES_CSP}" (is this a production build?)`);
  }
  return problems;
}

/**
 * Why Chrome would refuse to load a file ("isn't UTF-8 encoded"), or `null` when it is fine: bytes
 * that aren't UTF-8, or a Unicode noncharacter (U+FDD0–U+FDEF, or U+xxFFFE / U+xxFFFF).
 */
export function findBadText(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return 'not valid UTF-8';
  }
  for (let index = 0; index < text.length; index++) {
    const code = text.codePointAt(index);
    if ((code >= 0xfdd0 && code <= 0xfdef) || (code & 0xfffe) === 0xfffe) {
      return `noncharacter U+${code.toString(16).toUpperCase()} at character ${index + 1}`;
    }
    if (code > 0xffff) {
      index++;
    }
  }
  return null;
}

const TEXT_FILES = /\.(?:js|mjs|css|html|json)$/;

async function main() {
  const folder = resolve(process.argv[2] ?? '.output/chrome-mv3');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  } catch {
    console.error(`No manifest.json in ${folder}. Run npm run build first.`);
    process.exit(1);
  }

  const problems = checkManifest(manifest).map((problem) => `manifest.json: ${problem}`);
  const entries = await readdir(folder, { withFileTypes: true, recursive: true });
  for (const entry of entries.filter((item) => item.isFile() && TEXT_FILES.test(item.name))) {
    const file = join(entry.parentPath, entry.name);
    const bad = findBadText(await readFile(file));
    if (bad) {
      problems.push(`${relative(process.cwd(), file)}: ${bad}; Chrome would refuse to load it`);
    }
  }

  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`Manifest asks for exactly ${PERMISSIONS.join(', ')}, with the strict page policy; every file is valid for Chrome.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
