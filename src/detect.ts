export type DocumentKind = 'json';

/**
 * Decides whether a page holds JSON that the viewer should format.
 *
 * @param contentType The page's content type, e.g. `document.contentType`.
 * @param bodyText The raw page text, or `null` when it isn't available.
 * @returns `'json'` when the page is JSON, otherwise `null`.
 */
export function detectKind(contentType: string, bodyText: string | null): DocumentKind | null {
  const mediaType = normalizeMediaType(contentType);

  if (isJsonMediaType(mediaType)) {
    // Trust the server, even when the body is broken: the viewer then shows where it breaks.
    return 'json';
  }

  if (mediaType === 'text/plain' && bodyText !== null && looksLikeJson(bodyText)) {
    return 'json';
  }

  return null;
}

/** `"Application/JSON; charset=utf-8"` → `"application/json"`. */
function normalizeMediaType(contentType: string): string {
  const end = contentType.indexOf(';');
  return (end === -1 ? contentType : contentType.slice(0, end)).trim().toLowerCase();
}

/** `application/json`, `text/json`, and structured types such as `application/problem+json`. */
function isJsonMediaType(mediaType: string): boolean {
  return mediaType === 'application/json' || mediaType === 'text/json' || /^application\/[\w.-]+\+json$/.test(mediaType);
}

/** Plain text counts as JSON only when it starts like an object or array and actually parses. */
function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
