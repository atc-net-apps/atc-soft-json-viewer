/**
 * Messages from the viewer (in the web page) to the service worker. Web pages can't open extension
 * pages, so the viewer asks the service worker to.
 */
export const OPEN_SETTINGS = { type: 'open-settings' } as const;

/**
 * Whether a message asks to open the settings page. Only messages from this extension's own viewer
 * count: `senderId` is the sending extension's ID, which a web page can't fake.
 */
export function isOpenSettings(message: unknown, senderId: string | undefined, ownId: string): boolean {
  return senderId === ownId && typeof message === 'object' && message !== null && (message as { type?: unknown }).type === OPEN_SETTINGS.type;
}
