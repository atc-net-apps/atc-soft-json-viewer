import { parseDocument } from './parse';

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

/** Three base64url parts; the header and payload are JSON objects, so they start with `eyJ` (`{"`). */
const JWT = /^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*$/;

/**
 * Decodes a JSON Web Token's header and payload (RFC 7519), or returns `null` when the text isn't
 * one. Only decoding, in this browser: the signature is not verified and the token is never sent
 * anywhere.
 */
export function decodeJwt(token: string): DecodedJwt | null {
  if (!JWT.test(token)) {
    return null;
  }
  // The third part is the signature: bytes, not JSON, and not checked here.
  const [header, payload] = token.split('.').slice(0, 2).map(decodePart);
  return header && payload ? { header, payload } : null;
}

/** base64url (RFC 4648 §5) to UTF-8 text to a JSON object, or `null` if any step fails. */
function decodePart(part: string): Record<string, unknown> | null {
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    // `fatal`: invalid UTF-8 is an error rather than replacement characters.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = parseDocument(text);
    if (!parsed.ok || parsed.value === null || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return null;
    }
    return parsed.value as Record<string, unknown>;
  } catch {
    return null;
  }
}
