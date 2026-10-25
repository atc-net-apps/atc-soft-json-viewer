import { describe, expect, it } from 'vitest';
import { checkManifest, EXTENSION_PAGES_CSP, findBadText } from './check-manifest.mjs';

const GOOD = {
  manifest_version: 3,
  permissions: ['activeTab', 'scripting', 'storage'],
  content_security_policy: { extension_pages: EXTENSION_PAGES_CSP },
};

describe('checkManifest', () => {
  it('accepts exactly the three permissions and the strict page policy', () => {
    expect(checkManifest(GOOD)).toEqual([]);
  });

  it('accepts the permissions in any order', () => {
    expect(checkManifest({ ...GOOD, permissions: ['storage', 'activeTab', 'scripting'] })).toEqual([]);
  });

  it.each([
    ['an extra permission', ['activeTab', 'scripting', 'storage', 'tabs']],
    ['a missing permission', ['activeTab', 'scripting']],
    ['no permissions', undefined],
  ])('rejects %s', (_, permissions) => {
    expect(checkManifest({ ...GOOD, permissions })[0]).toMatch(/^permissions are /);
  });

  it.each(['host_permissions', 'optional_host_permissions', 'optional_permissions', 'content_scripts', 'externally_connectable', 'web_accessible_resources'])(
    'rejects %s',
    (key) => {
      expect(checkManifest({ ...GOOD, [key]: [] })).toEqual([`"${key}" must not be in the manifest`]);
    },
  );

  it('rejects a build without the strict page policy', () => {
    const { content_security_policy: _, ...development } = GOOD;
    expect(checkManifest(development)[0]).toMatch(/^content_security_policy\.extension_pages must be/);
  });
});

describe('findBadText', () => {
  const bytes = (text) => new TextEncoder().encode(text);

  it('accepts ordinary UTF-8, including letters such as ø and emoji', () => {
    expect(findBadText(bytes('const city = "København"; // 📦'))).toBeNull();
  });

  it.each([
    ['U+FFFF', '\uffff', 'noncharacter U+FFFF at character 4'],
    ['U+FFFE', '\ufffe', 'noncharacter U+FFFE at character 4'],
    ['U+FDD0', '\ufdd0', 'noncharacter U+FDD0 at character 4'],
    ['U+1FFFF', '\u{1ffff}', 'noncharacter U+1FFFF at character 4'],
  ])('rejects the noncharacter %s', (_, character, message) => {
    expect(findBadText(bytes(`a =${character}`))).toBe(message);
  });

  it('rejects bytes that are not UTF-8', () => {
    expect(findBadText(new Uint8Array([0x61, 0xff, 0x62]))).toBe('not valid UTF-8');
  });
});
