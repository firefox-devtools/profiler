/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  computeCodeChallenge,
  createPkceParams,
  exchangeOpenRouterCode,
  getOpenRouterAuthURL,
  OPENROUTER_AUTH_CHANNEL,
  OpenRouterSignInCancelledError,
  waitForOpenRouterCode,
} from 'firefox-profiler/app-logic/profile-chat/providers/openrouter-auth';

describe('OpenRouter sign-in', function () {
  it('computes the S256 challenge of the RFC 7636 example', async function () {
    expect(
      await computeCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('creates fresh parameters and the auth URL', async function () {
    const params = await createPkceParams();
    const other = await createPkceParams();
    expect(params.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.codeVerifier).not.toBe(other.codeVerifier);
    expect(params.state).not.toBe(other.state);
    expect(params.codeChallenge).toBe(
      await computeCodeChallenge(params.codeVerifier)
    );

    const url = new URL(
      getOpenRouterAuthURL(params, 'https://profiler.firefox.com')
    );
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      callback_url:
        'https://profiler.firefox.com/oauth/openrouter-callback.html',
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      state: params.state,
      key_label: 'Firefox Profiler',
    });
  });

  describe('waitForOpenRouterCode', function () {
    let callback: BroadcastChannel;
    beforeEach(function () {
      callback = new BroadcastChannel(OPENROUTER_AUTH_CHANNEL);
    });
    afterEach(function () {
      callback.close();
    });

    it('ignores other states and resolves with the matching code', async function () {
      const promise = waitForOpenRouterCode(
        'state-1',
        new AbortController().signal
      );
      let isSettled = false;
      promise.finally(() => {
        isSettled = true;
      });
      callback.postMessage({ code: 'stolen', state: 'state-2' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(isSettled).toBe(false);

      callback.postMessage({ code: 'code-1', state: 'state-1' });
      await expect(promise).resolves.toBe('code-1');
    });

    it('rejects when the callback has no code', async function () {
      const promise = waitForOpenRouterCode(
        'state-1',
        new AbortController().signal
      );
      callback.postMessage({ code: null, state: 'state-1' });
      await expect(promise).rejects.toThrow('No code was returned');
    });

    it('rejects as cancelled when the user denies access', async function () {
      const promise = waitForOpenRouterCode(
        'state-1',
        new AbortController().signal
      );
      // OpenRouter leaves the state out in this case.
      callback.postMessage({ code: null, state: null });
      await expect(promise).rejects.toBeInstanceOf(
        OpenRouterSignInCancelledError
      );
    });

    it('stops waiting after 10 minutes', async function () {
      jest.useFakeTimers();
      const promise = waitForOpenRouterCode(
        'state-1',
        new AbortController().signal
      );
      jest.advanceTimersByTime(10 * 60 * 1000);
      await expect(promise).rejects.toThrow('timed out');
    });

    it('stops waiting when aborted', async function () {
      const controller = new AbortController();
      const promise = waitForOpenRouterCode('state-1', controller.signal);
      controller.abort();
      await expect(promise).rejects.toThrow('Aborted');
    });
  });

  describe('exchangeOpenRouterCode', function () {
    const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';

    it('returns the key', async function () {
      window.fetchMock.post(KEYS_URL, { key: 'sk-or-v1-test' });
      expect(await exchangeOpenRouterCode('code-1', 'verifier-1')).toBe(
        'sk-or-v1-test'
      );
      const call = window.fetchMock.callHistory.lastCall(KEYS_URL);
      expect(JSON.parse(call?.options.body as string)).toEqual({
        code: 'code-1',
        code_verifier: 'verifier-1',
        code_challenge_method: 'S256',
      });
    });

    it('throws the error message', async function () {
      window.fetchMock.post(KEYS_URL, {
        status: 400,
        body: { error: { code: 400, message: 'Invalid code' } },
      });
      await expect(
        exchangeOpenRouterCode('code-1', 'verifier-1')
      ).rejects.toThrow('Invalid code');
    });
  });
});
