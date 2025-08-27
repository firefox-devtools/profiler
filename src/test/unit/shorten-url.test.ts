/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { shortenUrl, expandUrl } from 'firefox-profiler/utils/shorten-url';
import type { CallLog } from 'fetch-mock';

// This implements some base checks and behavior to mock the fetch API when
// testing functions dealing with this API.
function mockFetchForBitly({
  endpointUrl,
  responseFromRequestPayload,
}: {
  endpointUrl: string;
  responseFromRequestPayload: (arg: any) => any;
}) {
  window.fetchMock
    .catch(404) // catch all
    .route(endpointUrl, async ({ options }: CallLog) => {
      const { method, headers, body } = options;

      if (method !== 'post') {
        return new Response(null, {
          status: 405,
          statusText: 'Method not allowed',
        });
      }

      if (
        !headers ||
        !('content-type' in headers) ||
        headers['content-type'] !== 'application/json' ||
        headers.accept !== 'application/vnd.firefox-profiler+json;version=1.0'
      ) {
        return new Response(null, {
          status: 406,
          statusText: 'Not acceptable',
        });
      }

      const payload = JSON.parse(body as string);
      return responseFromRequestPayload(payload);
    });
}

describe('shortenUrl', () => {
  function mockFetchWith(returnedHash: string) {
    mockFetchForBitly({
      endpointUrl: 'https://api.profiler.firefox.com/shorten',
      responseFromRequestPayload: () => {
        return {
          shortUrl: `https://share.firefox.dev/${returnedHash}`,
        };
      },
    });
  }

  it('calls the bitly API properly and returns the value', async () => {
    const bitlyHash = 'BITLYHASH';
    const expectedShortUrl = `https://share.firefox.dev/${bitlyHash}`;
    mockFetchWith(bitlyHash);

    const longUrl =
      'https://profiler.firefox.com/public/FAKE_HASH/calltree/?thread=1&v=3';
    const shortUrl = await shortenUrl(longUrl);

    expect(shortUrl).toBe(expectedShortUrl);
    expect(window.fetchMock.callHistory.lastCall()?.options).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ longUrl }),
      })
    );
  });

  it('changes the requested url if is not the main URL', async () => {
    const bitlyHash = 'BITLYHASH';
    const expectedShortUrl = `https://share.firefox.dev/${bitlyHash}`;
    const longUrl =
      'https://perf-html.io/public/FAKE_HASH/calltree/?thread=1&v=3';
    const expectedLongUrl = longUrl.replace(
      'perf-html.io',
      'profiler.firefox.com'
    );

    mockFetchWith(bitlyHash);

    const shortUrl = await shortenUrl(longUrl);
    expect(shortUrl).toBe(expectedShortUrl);
    expect(window.fetchMock.callHistory.lastCall()?.options).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ longUrl: expectedLongUrl }),
      })
    );
  });
});

describe('expandUrl', () => {
  function mockFetchWith(returnedLongUrl: string) {
    mockFetchForBitly({
      endpointUrl: 'https://api.profiler.firefox.com/expand',
      responseFromRequestPayload: () => {
        return {
          longUrl: returnedLongUrl,
        };
      },
    });
  }

  it('returns the long url returned by the API', async () => {
    const shortUrl = 'https://share.firefox.dev/BITLYHASH';
    const returnedLongUrl =
      'https://profiler.firefox.com/public/FAKE_HASH/calltree/?thread=1&v=3';
    mockFetchWith(returnedLongUrl);

    const longUrl = await expandUrl(shortUrl);
    expect(longUrl).toBe(returnedLongUrl);
    expect(window.fetchMock.callHistory.lastCall()?.options).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ shortUrl }),
      })
    );
  });

  it('forwards errors', async () => {
    window.fetchMock.any(503); // server error

    const shortUrl = 'https://share.firefox.dev/BITLYHASH';
    await expect(expandUrl(shortUrl)).rejects.toThrow();
  });

  it('returns an error when there is no match for this hash', async () => {
    window.fetchMock.any(404); // not found

    const shortUrl = 'https://share.firefox.dev/BITLYHASH';
    await expect(expandUrl(shortUrl)).rejects.toThrow();
  });
});
