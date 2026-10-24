/**
 * Shows one view at a time in a container. Each view is built the first time it is shown,
 * so a large document's Raw text isn't laid out until someone asks for it, and vice versa.
 */
export function createViews<T extends string>(container: HTMLElement, builders: Record<T, () => HTMLElement>) {
  const built = new Map<T, HTMLElement>();

  return {
    show(name: T): void {
      let view = built.get(name);
      if (!view) {
        view = builders[name]();
        view.dataset.view = name;
        built.set(name, view);
        container.append(view);
      }
      for (const [other, element] of built) {
        element.hidden = other !== name;
      }
    },
  };
}

/** The response exactly as the server sent it. */
export function renderRaw(text: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'raw';
  pre.textContent = text;
  return pre;
}
