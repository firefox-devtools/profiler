/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * "Connect OpenRouter": OpenRouter's OAuth PKCE flow, which gives the user an
 * API key without a server on our side.
 *
 * The auth page opens in a popup, because a redirect would unload the profile.
 * OpenRouter then redirects the popup to res/oauth/openrouter-callback.html,
 * which posts the code back on a BroadcastChannel, as `window.opener` may be
 * cut off by the auth page's opener policy. The code is exchanged for a key
 * with the code verifier, which never leaves this page.
 *
 * See https://openrouter.ai/docs/use-cases/oauth-pkce
 */

const AUTH_URL = 'https://openrouter.ai/auth';
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';

// Shared with res/oauth/openrouter-callback.js.
export const OPENROUTER_AUTH_CHANNEL = 'profiler-openrouter-auth';
export const OPENROUTER_CALLBACK_PATH = '/oauth/openrouter-callback.html';

export type PkceParams = {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly state: string;
};

// What the callback page posts on the channel.
type CallbackMessage = {
  code?: unknown;
  state?: unknown;
  error?: unknown;
};

function _base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function _randomString(byteLength: number): string {
  return _base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/**
 * The S256 code challenge for a code verifier, see RFC 7636 section 4.2.
 */
export async function computeCodeChallenge(
  codeVerifier: string
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier)
  );
  return _base64UrlEncode(new Uint8Array(digest));
}

/**
 * Prepare a new sign-in. This is async, so it's done ahead of the click:
 * window.open needs to run synchronously in the click handler to avoid popup
 * blockers.
 */
export async function createPkceParams(): Promise<PkceParams> {
  const codeVerifier = _randomString(32);
  return {
    codeVerifier,
    codeChallenge: await computeCodeChallenge(codeVerifier),
    state: _randomString(16),
  };
}

export function getOpenRouterAuthURL(
  { codeChallenge, state }: PkceParams,
  origin: string
): string {
  const params = new URLSearchParams({
    callback_url: origin + OPENROUTER_CALLBACK_PATH,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    key_label: 'Firefox Profiler',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Wait for the callback page to post the code of the sign-in started with
 * `state`. Messages with another state are ignored, they belong to another
 * sign-in or didn't come from our callback.
 */
export function waitForOpenRouterCode(
  state: string,
  signal: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(OPENROUTER_AUTH_CHANNEL);
    const finish = () => {
      channel.close();
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    channel.onmessage = (event: MessageEvent<CallbackMessage>) => {
      const { code, state: messageState, error } = event.data ?? {};
      if (messageState !== state) {
        return;
      }
      finish();
      if (typeof code === 'string' && code !== '') {
        resolve(code);
      } else {
        reject(
          new Error(typeof error === 'string' ? error : 'No code was returned')
        );
      }
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort);
    }
  });
}

/**
 * Exchange the code from the callback for an API key.
 */
export async function exchangeOpenRouterCode(
  code: string,
  codeVerifier: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(KEYS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      code_challenge_method: 'S256',
    }),
    signal,
  });
  const json = (await response.json().catch(() => null)) as {
    key?: unknown;
    error?: { message?: unknown };
  } | null;
  if (!response.ok || typeof json?.key !== 'string') {
    const message = json?.error?.message;
    throw new Error(
      typeof message === 'string' ? message : `${response.status}`
    );
  }
  return json.key;
}
