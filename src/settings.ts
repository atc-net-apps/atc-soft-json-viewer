export type Theme = 'system' | 'light' | 'dark';
export type View = 'tree' | 'raw' | 'table';

/** The user's choices, remembered in this browser only. */
export interface Settings {
  theme: Theme;
  sortKeys: boolean;
  view: View;
  /** Levels unfolded when a page is formatted. */
  unfoldDepth: number;
  /** Font size in pixels. */
  fontSize: number;
  links: boolean;
  counts: boolean;
  timestamps: boolean;
  jwt: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  theme: 'system',
  sortKeys: false,
  view: 'tree',
  unfoldDepth: 2,
  fontSize: 13,
  links: true,
  counts: true,
  timestamps: true,
  jwt: true,
});

const STORAGE_KEY = 'settings';

// How to recognise a valid stored value for each setting. Anything else falls back to the default,
// so a damaged or outdated stored value can never break the viewer.
const isValid: { [K in keyof Settings]: (value: unknown) => boolean } = {
  theme: (v) => v === 'system' || v === 'light' || v === 'dark',
  sortKeys: (v) => typeof v === 'boolean',
  view: (v) => v === 'tree' || v === 'raw' || v === 'table',
  unfoldDepth: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 20,
  fontSize: (v) => Number.isInteger(v) && (v as number) >= 9 && (v as number) <= 24,
  links: (v) => typeof v === 'boolean',
  counts: (v) => typeof v === 'boolean',
  timestamps: (v) => typeof v === 'boolean',
  jwt: (v) => typeof v === 'boolean',
};

/** Stored settings merged over the defaults. Unknown keys and invalid values are ignored. */
export async function loadSettings(): Promise<Settings> {
  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    return { ...DEFAULT_SETTINGS, ...pickValid(stored) };
  } catch {
    // Storage can be unavailable (e.g. while the browser shuts down); the defaults still work.
    return { ...DEFAULT_SETTINGS };
  }
}

/** Saves the given settings, keeping the others as they are. */
export async function saveSettings(changes: Partial<Settings>): Promise<void> {
  const current = await loadSettings();
  await browser.storage.local.set({ [STORAGE_KEY]: { ...current, ...pickValid(changes) } });
}

/** Forgets all stored settings, so the defaults apply again. */
export async function resetSettings(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}

function pickValid(value: unknown): Partial<Settings> {
  if (value === null || typeof value !== 'object') {
    return {};
  }
  const valid: Record<string, unknown> = {};
  for (const [key, check] of Object.entries(isValid)) {
    const candidate = (value as Record<string, unknown>)[key];
    if (check(candidate)) {
      valid[key] = candidate;
    }
  }
  return valid as Partial<Settings>;
}
