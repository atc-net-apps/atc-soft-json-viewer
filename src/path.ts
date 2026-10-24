/** The JSONPath of the document itself. */
export const ROOT_PATH = '$';

// RFC 9535 member-name shorthand: starts with a letter or "_", then letters, digits or "_".
const SHORTHAND_NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/**
 * The JSONPath (RFC 9535) of a child value.
 *
 * - array index: `$.items` + `0` → `$.items[0]`
 * - simple key: `$` + `items` → `$.items`
 * - any other key: `$` + `odd key` → `$['odd key']`
 */
export function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') {
    return `${parent}[${key}]`;
  }
  return SHORTHAND_NAME.test(key) ? `${parent}.${key}` : `${parent}['${escapeName(key)}']`;
}

/** Escapes a key for a single-quoted JSONPath name, as RFC 9535 normalized paths do. */
function escapeName(key: string): string {
  let escaped = '';
  for (const char of key) {
    switch (char) {
      case "'":
        escaped += "\\'";
        break;
      case '\\':
        escaped += '\\\\';
        break;
      case '\b':
        escaped += '\\b';
        break;
      case '\f':
        escaped += '\\f';
        break;
      case '\n':
        escaped += '\\n';
        break;
      case '\r':
        escaped += '\\r';
        break;
      case '\t':
        escaped += '\\t';
        break;
      default:
        escaped += char < ' ' ? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}` : char;
    }
  }
  return escaped;
}
