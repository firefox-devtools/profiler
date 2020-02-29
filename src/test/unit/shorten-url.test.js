/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { STATUS_CODES } from 'http';

import { shortenUrl, expandUrl } from '../../utils/shorten-url';

beforeEach(() => {
  window.fetch = jest.fn();
});

afterEach(() => {
  delete window.fetch;
});

// This is a partial implementation of the Fetch API's Response object,
// implementing just what we need for these tests.
class Response {
  status: number;
  statusText: string;
  ok: boolean;
  _body: string | null;

  constructor(
    body: string | null,
    options: {|
      status: number,
      statusText?: string,
      headers?: {},
    |}
  ) {
    this.status = options.status || 200;
    this.statusText = options.statusText || STATUS_CODES[this.status];
    this.ok = this.status >= 200 && this.status < 300;
    this._body = body;
  }

  async json() {
    if (this._body) {
      return JSON.parse(this._body);
    }
    throw new Error('The body is missing.');
  }
}

// This implements some base checks and behavior to mock the fetch API when
// testing functions dealing with this API.
function mockFetchForBitly({
  endpointUrl,
  responseFromRequestPayload,
}: {|
  endpointUrl: string,
  responseFromRequestPayload: any => Response,
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

    const authorization = headers.Authorization;
    if (!authorization || !authorization.startsWith('Bearer')) {
      return new Response(null, { status: 401, statusText: 'Unauthorized' });
    }

    if (headers['Content-Type'] !== 'application/json') {
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
      endpointUrl: 'https://api-ssl.bitly.com/v4/shorten',
      responseFromRequestPayload: payload => {
        const domain = payload.domain;
        const longUrl = payload.long_url;

        return new Response(
          JSON.stringify({
            long_url: longUrl,
            link: `https://${domain}/${returnedHash}`,
            id: `${domain}/${returnedHash}`,
            // There are other things, but we're not really interested
          }),
          {
            status: 201,
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
    const expectedShortUrl = `https://perfht.ml/${bitlyHash}`;
    mockFetchWith(bitlyHash);

    const longUrl =
      'https://profiler.firefox.com/public/FAKE_HASH/calltree/?thread=1&v=3';
    const shortUrl = await shortenUrl(longUrl);

    expect(shortUrl).toBe(expectedShortUrl);
    expect(window.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining(`"long_url":"${longUrl}"`),
      })
    );
  });

  it('changes the requested url if is not the main URL', async () => {
    const bitlyHash = 'BITLYHASH';
    const expectedShortUrl = `https://perfht.ml/${bitlyHash}`;
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
        body: expect.stringContaining(`"long_url":"${expectedLongUrl}"`),
      })
    );
  });
});

describe('expandUrl', () => {
  function mockFetchWith(returnedLongUrl) {
    mockFetchForBitly({
      endpointUrl: 'https://api-ssl.bitly.com/v4/expand',
      responseFromRequestPayload: payload => {
        const bitlinkId = payload.bitlink_id;
        const [domain, hash] = bitlinkId.split('/');

        return new Response(
          JSON.stringify({
            long_url: returnedLongUrl,
            link: `https://${domain}/${hash}`,
            id: bitlinkId,
            // There are other things, but we're not really interested
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
    const bitlinkId = 'perfht.ml/BITLYHASH';
    const shortUrl = 'https://' + bitlinkId;
    const returnedLongUrl =
      'https://profiler.firefox.com/public/FAKE_HASH/calltree/?thread=1&v=3';
    mockFetchWith(returnedLongUrl);

    const longUrl = await expandUrl(shortUrl);
    expect(longUrl).toBe(returnedLongUrl);
    expect(window.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining(`"bitlink_id":"${bitlinkId}"`),
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

    const shortUrl = 'https://perfht.ml/BITLYHASH';
    await expect(expandUrl(shortUrl)).rejects.toThrow();
  });

  it('returns an error when there is no match for this hash', async () => {
    window.fetch.mockImplementation(
      async () =>
        new Response(null, {
          status: 404,
        })
    );

    const shortUrl = 'https://perfht.ml/BITLYHASH';
    await expect(expandUrl(shortUrl)).rejects.toThrow();
  });
});
