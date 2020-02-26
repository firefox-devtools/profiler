/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This file provides simple utils to deal with JWT tokens.

export function extractAndDecodePayload(jwtToken: string): any {
  if (!isValidJwtToken(jwtToken)) {
    console.error('The token is an invalid JWT token.');
    return null;
  }

  try {
    const payload = jwtToken.split('.')[1];
    const decodedPayload = decodeJwtBase64Url(payload);
    const jsonPayload = JSON.parse(decodedPayload);

    return jsonPayload;
  } catch (e) {
    console.error(
      `We got an unexpected error when trying to decode the JWT token '${jwtToken}':`,
      e
    );
    return null;
  }
}

// This uses the base64url characters, that is base64 characters where + is
// replaced by -, and / is replaced by _. Moreover the padding character isn't
// used with JWT.
const JWT_TOKEN_RE = /^(?:[a-zA-Z0-9_-])+\.(?:[a-zA-Z0-9_-])+\.(?:[a-zA-Z0-9_-])+$/;
export function isValidJwtToken(jwtToken: string): boolean {
  return JWT_TOKEN_RE.test(jwtToken);
}

export function decodeJwtBase64Url(base64UrlEncodedValue: string): string {
  // In the base64url variant used in JWT, the padding "=" character is removed.
  // But atob doesn't mind, so we don't need to recover the missing padding like
  // most implementations do.

  // We do need to convert the string to a "normal" base64 encoding though.
  const base64EncodedValue = base64UrlEncodedValue
    .replace('-', '+')
    .replace('_', '/');

  return atob(base64EncodedValue);
}
