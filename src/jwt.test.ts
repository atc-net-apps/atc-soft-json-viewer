import { describe, expect, it } from 'vitest';
import { decodeJwt } from './jwt';
import { BigNumber } from './parse';

/** base64url of a text's UTF-8 bytes, without padding, as in a real token. */
function base64url(text: string): string {
  const binary = Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const token = (header: string, payload: string, signature = 'c2lnbmF0dXJl') =>
  `${base64url(header)}.${base64url(payload)}.${signature}`;

describe('decodeJwt', () => {
  it('decodes the header and payload', () => {
    const decoded = decodeJwt(token('{"alg":"RS256","typ":"JWT"}', '{"sub":"customer-4711","exp":1792749300}'));
    expect(decoded).toEqual({ header: { alg: 'RS256', typ: 'JWT' }, payload: { sub: 'customer-4711', exp: 1792749300 } });
  });

  it('decodes the token from the sample response', () => {
    const accessToken =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImNvbnRvc28tMjAyNi0xMCJ9.eyJzdWIiOiJjdXN0b21lci00NzExIiwibmFtZSI6IkNvbnRvc28gQS9TIiwic2NvcGUiOiJvcmRlcnMucmVhZCBvcmRlcnMud3JpdGUiLCJpYXQiOjE3OTI3NDU3MDAsImV4cCI6MTc5Mjc0OTMwMH0.ZmFrZS1zaWduYXR1cmUtZm9yLXRlc3Rpbmctb25seQ';
    expect(decodeJwt(accessToken)?.payload).toEqual({
      sub: 'customer-4711',
      name: 'Contoso A/S',
      scope: 'orders.read orders.write',
      iat: 1792745700,
      exp: 1792749300,
    });
  });

  it('decodes letters such as æ, ø and å, which take more than one byte', () => {
    expect(decodeJwt(token('{"alg":"none"}', '{"name":"Søren Ærø Åberg"}'))?.payload).toEqual({ name: 'Søren Ærø Åberg' });
  });

  it('decodes the characters base64url uses instead of + and /', () => {
    // "??>" gives "Pz8-" and "???" gives "Pz8_" in base64url.
    expect(decodeJwt(token('{"alg":"none"}', '{"a":"??>","b":"???"}'))?.payload).toEqual({ a: '??>', b: '???' });
  });

  it('accepts a token without a signature', () => {
    expect(decodeJwt(token('{"alg":"none"}', '{"sub":"x"}', ''))?.payload).toEqual({ sub: 'x' });
  });

  it('keeps big numbers in claims exact', () => {
    expect(decodeJwt(token('{"alg":"none"}', '{"id":9007199254740993}'))?.payload).toEqual({ id: new BigNumber('9007199254740993') });
  });

  it.each([
    ['ordinary text', 'hello'],
    ['a token with two parts', `${base64url('{"alg":"none"}')}.${base64url('{"sub":"x"}')}`],
    ['a token with four parts', `${token('{"alg":"none"}', '{"sub":"x"}')}.extra`],
    ['text around a token', `Bearer ${token('{"alg":"none"}', '{"sub":"x"}')}`],
    ['a payload that is not JSON', `${base64url('{"alg":"none"}')}.eyJub3QganNvbg.sig`],
    // "eyJhb" is 5 characters, which base64 can never be.
    ['a payload that is not base64', `${base64url('{"alg":"none"}')}.eyJhb.sig`],
    // "eyJhIjoi_yJ9" is {"a":"…"} with the byte FF inside the quotes, which is never valid UTF-8.
    ['a payload that is not UTF-8', `${base64url('{"alg":"none"}')}.eyJhIjoi_yJ9.sig`],
  ])('returns nothing for %s', (_, text) => {
    expect(decodeJwt(text)).toBeNull();
  });
});
