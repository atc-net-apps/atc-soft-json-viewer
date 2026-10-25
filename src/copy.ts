import { BigNumber } from './parse';

// JSON.rawJSON (Chrome and Edge 114+) lets JSON.stringify write a big number's digits unquoted.
// TypeScript's library doesn't describe it yet.
const rawJSON = (JSON as unknown as { rawJSON(text: string): unknown }).rawJSON;

/**
 * The text "Copy value" puts on the clipboard: strings without quotes, numbers and big numbers
 * exactly as sent, objects and arrays as indented JSON.
 */
export function valueToText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof BigNumber) {
    return value.source;
  }
  return JSON.stringify(value, (_key, child: unknown) => (child instanceof BigNumber ? rawJSON(child.source) : child), 2);
}

/**
 * Puts text on the clipboard. Uses the Clipboard API where the page allows it (HTTPS and localhost)
 * and falls back to a hidden text box plus the copy command on plain-HTTP pages.
 * `container` is where the fallback text box may be placed, e.g. the viewer's shadow root.
 */
export async function copyText(text: string, container: Node & ParentNode): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older method.
  }

  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.className = 'copy-buffer';
  container.append(box);
  box.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    box.remove();
  }
}
