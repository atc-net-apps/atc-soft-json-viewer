import { applyTheme } from './render/theme';
import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings, type Settings } from './settings';

type Field =
  | { key: keyof Settings; kind: 'select'; label: string; options: [string, string][] }
  | { key: keyof Settings; kind: 'number'; label: string; min: number; max: number; unit: string }
  | { key: keyof Settings; kind: 'switch'; label: string; hint: string };

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: 'Look',
    fields: [
      {
        key: 'theme',
        kind: 'select',
        label: 'Theme',
        options: [
          ['system', 'System'],
          ['light', 'Light'],
          ['dark', 'Dark'],
        ],
      },
      { key: 'fontSize', kind: 'number', label: 'Font size', min: 9, max: 24, unit: 'px' },
    ],
  },
  {
    title: 'When a page is formatted',
    fields: [
      {
        key: 'view',
        kind: 'select',
        label: 'Open in',
        options: [
          ['tree', 'Tree'],
          ['table', 'Table'],
          ['raw', 'Raw'],
        ],
      },
      { key: 'unfoldDepth', kind: 'number', label: 'Unfold', min: 0, max: 20, unit: 'levels' },
      { key: 'sortKeys', kind: 'switch', label: 'Sort keys A–Z', hint: 'Only the display: Raw and Copy value keep the original order.' },
    ],
  },
  {
    title: 'Show',
    fields: [
      { key: 'links', kind: 'switch', label: 'Clickable links', hint: 'Web addresses in values open in a new tab.' },
      { key: 'counts', kind: 'switch', label: 'Item counts', hint: '"3 items" or "5 keys" after every object and array.' },
      { key: 'timestamps', kind: 'switch', label: 'Readable timestamps', hint: 'Dates and Unix times are underlined; click one for local time.' },
      { key: 'jwt', kind: 'switch', label: 'JWT chips', hint: 'Tokens get a JWT chip that shows what is inside.' },
    ],
  },
];

/**
 * The settings page: every setting, saved as soon as it changes, and a button to go back to the
 * defaults. It follows changes made elsewhere too, such as the theme button in the viewer.
 */
export async function renderOptions(container: HTMLElement): Promise<void> {
  const form = document.createElement('form');
  form.className = 'options';
  // Nothing to submit: every change is saved straight away.
  form.addEventListener('submit', (event) => event.preventDefault());

  const title = document.createElement('h1');
  title.textContent = 'ATC JSON Viewer settings';
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'Settings are stored in this browser only. Changes are saved straight away and apply to the next page you format.';
  form.append(title, note);

  const inputs = new Map<keyof Settings, HTMLInputElement | HTMLSelectElement>();
  for (const section of SECTIONS) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = section.title;
    fieldset.append(legend, ...section.fields.map((field) => renderField(field, inputs)));
    form.append(fieldset);
  }

  const footer = document.createElement('div');
  footer.className = 'footer';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset';
  reset.textContent = 'Reset to defaults';
  const status = document.createElement('span');
  status.className = 'status';
  // Read out by screen readers when it changes.
  status.setAttribute('aria-live', 'polite');
  footer.append(reset, status);
  form.append(footer);
  container.replaceChildren(form);

  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  function say(text: string): void {
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (status.textContent = ''), 1500);
  }

  function show(settings: Settings): void {
    for (const [key, input] of inputs) {
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        input.checked = settings[key] as boolean;
      } else {
        input.value = String(settings[key]);
      }
    }
    applyTheme(document.documentElement, settings.theme);
  }

  for (const [key, input] of inputs) {
    input.addEventListener('change', async () => {
      const value = readValue(input);
      if (value === undefined) {
        // Not a usable value (for example an empty number box): show what is stored again.
        show(await loadSettings());
        return;
      }
      await saveSettings({ [key]: value });
      show(await loadSettings());
      say('Saved');
    });
  }

  reset.addEventListener('click', async () => {
    await resetSettings();
    show({ ...DEFAULT_SETTINGS });
    say('Back to the defaults');
  });

  // Changes made in the viewer while this page is open, such as the theme or A–Z.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'settings' in changes) {
      loadSettings().then(show);
    }
  });

  show(await loadSettings());
}

function renderField(field: Field, inputs: Map<keyof Settings, HTMLInputElement | HTMLSelectElement>): HTMLElement {
  const row = document.createElement('label');
  row.className = `field field-${field.kind}`;
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = field.label;

  let input: HTMLInputElement | HTMLSelectElement;
  if (field.kind === 'select') {
    input = document.createElement('select');
    for (const [value, text] of field.options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      input.append(option);
    }
    row.append(label, input);
  } else if (field.kind === 'number') {
    input = document.createElement('input');
    input.type = 'number';
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = '1';
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = field.unit;
    row.append(label, input, unit);
  } else {
    input = document.createElement('input');
    input.type = 'checkbox';
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = field.hint;
    const text = document.createElement('span');
    text.append(label, hint);
    row.append(input, text);
  }
  input.name = field.key;
  inputs.set(field.key, input);
  return row;
}

/**
 * The value of an input as a setting, or `undefined` when it isn't one; whole numbers are kept in
 * range. `saveSettings` checks every value again before storing it.
 */
function readValue(input: HTMLInputElement | HTMLSelectElement): Settings[keyof Settings] | undefined {
  if (input instanceof HTMLInputElement && input.type === 'checkbox') {
    return input.checked;
  }
  if (input instanceof HTMLInputElement && input.type === 'number') {
    const number = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(number)) {
      return undefined;
    }
    return Math.min(Number(input.max), Math.max(Number(input.min), Math.round(number)));
  }
  return input.value as Settings[keyof Settings];
}
