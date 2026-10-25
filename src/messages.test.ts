import { describe, expect, it } from 'vitest';
import { isOpenSettings, OPEN_SETTINGS } from './messages';

describe('isOpenSettings', () => {
  const OWN_ID = 'abcdefghijklmnopabcdefghijklmnop';

  it('accepts the request from this extension', () => {
    expect(isOpenSettings(OPEN_SETTINGS, OWN_ID, OWN_ID)).toBe(true);
  });

  it.each([
    ['another extension', OPEN_SETTINGS, 'zyxwvutsrqponmlkzyxwvutsrqponmlk'],
    ['a sender without an extension ID', OPEN_SETTINGS, undefined],
    ['another message', { type: 'something-else' }, OWN_ID],
    ['a message that is not an object', 'open-settings', OWN_ID],
    ['null', null, OWN_ID],
  ])('ignores %s', (_, message, senderId) => {
    expect(isOpenSettings(message, senderId, OWN_ID)).toBe(false);
  });
});
