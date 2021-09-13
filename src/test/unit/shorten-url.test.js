/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { shortenUrl, expandUrl } from 'firefox-profiler/utils/shorten-url';
import { Response } from 'firefox-profiler/test/fixtures/mocks/response';

beforeEach(() => {
  window.fetch = jest.fn();
});

afterEach(() => {
  delete window.fetch;
});

// This implements some base checks and behavior to mock the fetch API when
// testing functions dealing with this API.
function mockFetchForBitly({
  endpointUrl,
  responseFromRequestPayload,
}: {|
  endpointUrl: string,
  responseFromRequestPayload: (any) => Response,
|}) {
  window.fetch.mockImplementation(async (urlString, options) => {
    const { method, headers, body } = options;

    if (urlString !== endpointUrl) {
      return new Response(null, {
        status: 404,
        statusText: 'Not found',
      });
    }

    if (method !== 'POST') {
      return new Response(null, {
        status: 405,
        statusText: 'Method not allowed',
      });
    }

    if (
      headers['Content-Type'] !== 'application/json' ||
      headers.Accept !== 'application/vnd.firefox-profiler+json;version=1.0'
    ) {
      return new Response(null, {
        status: 406,
        statusText: 'Not acceptable',
      });
    }

    const payload = JSON.parse(body);
    return responseFromRequestPayload(payload);
  });
}

describe('shortenUrl', () => {
  function mockFetchWith(returnedHash) {
    mockFetchForBitly({
      endpointUrl: 'https://api.profiler.firefox.com/shorten',
      responseFromRequestPayload: () => {
        return new Response(
          JSON.stringify({
            shortUrl: `https://share.firefox.dev/${returnedHash}`,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
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
    expect(window.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining(`"longUrl":"${longUrl}"`),
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
    expect(window.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining(`"longUrl":"${expectedLongUrl}"`),
      })
    );
  });
});

describe('expandUrl', () => {
  function mockFetchWith(returnedLongUrl) {
    mockFetchForBitly({
      endpointUrl: 'https://api.profiler.firefox.com/expand',
      responseFromRequestPayload: () => {
        return new Response(
          JSON.stringify({
            longUrl: returnedLongUrl,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
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
    expect(window.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining(`"shortUrl":"${shortUrl}"`),
      })
    );
  });

  it('forwards errors', async () => {
    window.fetch.mockImplementation(
      async () =>
        new Response(null, {
          status: 503,
        })
    );

    const shortUrl = 'https://share.firefox.dev/BITLYHASH';
    await expect(expandUrl(shortUrl)).rejects.toThrow();
  });

  it('returns an error when there is no match for this hash', async () => {
    window.fetch.mockImplementation(
      async () =>
        new Response(null, {
          status: 404,
        })
    );

    const shortUrl = 'https://share.firefox.dev/BITLYHASH';
    await expect(expandUrl(shortUrl)).rejects.toThrow();
  });
});
