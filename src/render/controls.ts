export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export interface Segmented<T extends string> {
  element: HTMLElement;
  setSelected(value: T): void;
}

/** A row of joined toggle buttons where exactly one is pressed, e.g. Tree | Raw. */
export function renderSegmented<T extends string>(
  label: string,
  options: SegmentOption<T>[],
  selected: T,
  onChange: (value: T) => void,
): Segmented<T> {
  const element = document.createElement('div');
  element.className = 'segmented';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', label);

  const buttons = options.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.textContent = option.label;
    button.dataset.value = option.value;
    if (option.title) {
      button.title = option.title;
    }
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') !== 'true') {
        setSelected(option.value);
        onChange(option.value);
      }
    });
    return button;
  });

  function setSelected(value: T): void {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.value === value));
    }
  }

  setSelected(selected);
  element.append(...buttons);
  return { element, setSelected };
}
