/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { shortenUrl, expandUrl } from '../../utils/shorten-url';

beforeEach(() => {
  window.fetch = jest.fn();
});

afterEach(() => {
  delete window.fetch;
});

describe('shortenUrl', () => {
  function mockFetchWith(returnedHash) {
    window.fetch.mockImplementation(async urlString => {
      const url = new URL(urlString);
      const params = new URLSearchParams(url.search);
      const domain = params.get('domain') || 'bit.ly';

      return {
        json: async () => ({
          data: {
            global_hash: '900913',
            hash: returnedHash,
            long_url: urlString,
            new_hash: 1,
            url: `https://${domain}/${returnedHash}`,
          },
          status_code: 200,
          status_txt: 'OK',
        }),
      };
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
      expect.stringContaining(`longUrl=${encodeURIComponent(longUrl)}`)
    );
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('domain=perfht.ml')
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
      expect.stringContaining(`longUrl=${encodeURIComponent(expectedLongUrl)}`)
    );
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('domain=perfht.ml')
    );
  });
});

describe('shortenUrl', () => {
  function mockFetchWith(returnedLongUrl) {
    window.fetch.mockImplementation(async urlString => {
      const url = new URL(urlString);
      const params = new URLSearchParams(url.search);
      const shortUrl = params.get('shortUrl');
      const hash = shortUrl.slice(shortUrl.lastIndexOf('/') + 1);

      return {
        json: async () => ({
          data: {
            expand: [
              {
                global_hash: '900913',
                long_url: returnedLongUrl,
                short_url: shortUrl,
                user_hash: hash,
              },
            ],
          },
          status_code: 200,
          status_txt: 'OK',
        }),
      };
    });
  }

  it('returns the long url returned by the API', async () => {
    const shortUrl = 'https://perfht.ml/BITLYHASH';
    const returnedLongUrl =
      'https://profiler.firefox.com/public/FAKE_HASH/calltree/?thread=1&v=3';
    mockFetchWith(returnedLongUrl);

    const longUrl = await expandUrl(shortUrl);
    expect(longUrl).toBe(returnedLongUrl);
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`shortUrl=${encodeURIComponent(shortUrl)}`)
    );
  });

  it('forwards errors', async () => {
    window.fetch.mockImplementation(async () => ({
      json: async () => ({
        data: null,
        status_code: 503,
        status_txt: 'TEMPORARILY_UNAVAILABLE',
      }),
    }));

    const shortUrl = 'https://perfht.ml/BITLYHASH';
    await expect(expandUrl(shortUrl)).rejects.toThrow();
  });

  it('returns an error when the API returns (successfully) no data', async () => {
    window.fetch.mockImplementation(async shortUrl => ({
      json: async () => ({
        data: { expand: [{ short_url: shortUrl, error: 'NOT_FOUND' }] },
        status_code: 200,
        status_txt: 'OK',
      }),
    }));

    const shortUrl = 'https://perfht.ml/BITLYHASH';
    await expect(expandUrl(shortUrl)).rejects.toThrow();
  });
});
