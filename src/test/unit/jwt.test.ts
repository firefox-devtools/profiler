/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as Jwt from '../../utils/jwt';

// This is a valid token taken from jwt.io.
// It was carefully chosen to contain both - and _ characters, that are
// special to the Base64URL encoding.
const completeToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiP34_fj9-In0.KIumXQmDxL1bJ0RGNV2-mm-8h0LEQATKbtHUsCHMGcg`;

describe('jwt/isValidJwtToken', () => {
  it('returns true for valid jwt tokens', () => {
    expect(Jwt.isValidJwtToken(completeToken)).toBe(true);
  });

  it('returns false for incomplete tokens', () => {
    const fixture = completeToken.slice(completeToken.indexOf('.') + 1);

    expect(Jwt.isValidJwtToken(fixture)).toBe(false);
  });

  const fixtures = [
    // This one is invalid for both encodings base64 and base64url
    '|ODe.iOIZ.X;oD',

    // These ones are valid base64 values, but invalid base64url
    'a+hD.b1sc.cSre',
    'a/4a.bRcZ.c81Z',

    // This one is valid base64url but uses a padding character, that's not
    // used with JWT.
    'SOE=.SUY5.4ScA',
  ];

  fixtures.forEach((fixture) => {
    it(`returns false for invalid base64url value: ${fixture}`, () => {
      expect(Jwt.isValidJwtToken(fixture)).toBe(false);
    });
  });
});

describe('jwt/decodeJwtBase64Url', () => {
  it('decodes base64url values', () => {
    const fixture = 'eyJuYW1lIjoiP34_fj9-P34_fj9-P34ifQ';
    const expected = '{"name":"?~?~?~?~?~?~?~"}';
    expect(Jwt.decodeJwtBase64Url(fixture)).toEqual(expected);
  });
});

describe('jwt/extractAndDecodePayload', () => {
  it('decodes jwt payloads', () => {
    const expected = { name: '?~?~?~' };
    expect(Jwt.extractAndDecodePayload(completeToken)).toEqual(expected);
  });

  it(`returns null when the payload isn't a JSON`, () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const fixture = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.c3RyaW5n.dCi-PvNARK1DvRcqTtkVaimRLFJTY_a7LZqSruor1Uw`;

    expect(Jwt.extractAndDecodePayload(fixture)).toBe(null);
  });

  it(`returns null when the payload isn't a valid token`, () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const fixture = `ABCD`;

    expect(Jwt.extractAndDecodePayload(fixture)).toBe(null);
  });
});

describe('jwt/extractProfileTokenFromJwt', () => {
  // Main use cases are tested in the store/publish.test.js. In this unit test
  // we'll focus on error cases.

  it('errors when passing a badly formed token', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // This looks like a JWT token but it's clearly incorrect.
    const incorrectBase64 = 'A.B.C';
    expect(() => Jwt.extractProfileTokenFromJwt(incorrectBase64)).toThrow();

    // This is the same one as in a previous test.
    const incorrectJSON = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.c3RyaW5n.dCi-PvNARK1DvRcqTtkVaimRLFJTY_a7LZqSruor1Uw`;
    expect(() => Jwt.extractProfileTokenFromJwt(incorrectJSON)).toThrow();
  });

  it(`errors when the token doesn't have the needed property`, () => {
    // This token's payload is { "name": "John Doe" }
    const tokenWithoutProfileToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiSm9obiBEb2UifQ.DjwRE2jZhren2Wt37t5hlVru6Myq4AhpGLiiefF69u8`;
    expect(() =>
      Jwt.extractProfileTokenFromJwt(tokenWithoutProfileToken)
    ).toThrow();
  });
});
