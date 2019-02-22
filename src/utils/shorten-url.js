/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import queryString from 'query-string';
import url from 'url';

const accessToken = 'b177b00a130faf3ecda6960e8b59fde73e902422';
export function shortenUrl(urlToShorten: string): Promise<string> {
  let longUrl = urlToShorten;
  if (!longUrl.startsWith('https://profiler.firefox.com/')) {
    const parsedUrl = url.parse(longUrl);
    const parsedUrlOnCanonicalHost = Object.assign({}, parsedUrl, {
      protocol: 'https:',
      host: 'profiler.firefox.com',
    });
    longUrl = url.format(parsedUrlOnCanonicalHost);
  }

  const bitlyQueryUrl =
    'https://api-ssl.bitly.com/v3/shorten?' +
    queryString.stringify({
      longUrl,
      domain: 'perfht.ml',
      format: 'json',
      access_token: accessToken,
    });

  return fetch(bitlyQueryUrl)
    .then(response => response.json())
    .then(json => json.data.url);
}

export async function expandUrl(urlToExpand: string): Promise<string> {
  const bitlyQueryUrl =
    'https://api-ssl.bitly.com/v3/expand?' +
    queryString.stringify({
      shortUrl: urlToExpand,
      format: 'json',
      access_token: accessToken,
    });
  const response = await fetch(bitlyQueryUrl);
  const json = await response.json();

  if (!json.data) {
    // In case of an error, json.data is null.
    throw new Error(
      `An error happened while expanding the shortened url ${urlToExpand}: ${
        json.status_txt
      } (${json.status_code})`
    );
  }

  const [data] = json.data.expand;
  if (!response) {
    throw new Error(
      'There were no data in the otherwise well-formed answer from bit.ly.'
    );
  }

  const longUrl = data.long_url;
  if (!longUrl) {
    throw new Error(`The short URL ${urlToExpand} couldn't be expanded.`);
  }
  return longUrl;
}
