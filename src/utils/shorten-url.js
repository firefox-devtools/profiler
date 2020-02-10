/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

const accessToken = 'b177b00a130faf3ecda6960e8b59fde73e902422';
export async function shortenUrl(urlToShorten: string): Promise<string> {
  let longUrl = urlToShorten;
  if (!longUrl.startsWith('https://profiler.firefox.com/')) {
    const parsedUrl = new URL(longUrl);
    parsedUrl.protocol = 'https';
    parsedUrl.host = 'profiler.firefox.com';
    parsedUrl.port = '';
    longUrl = parsedUrl.toString();
  }

  const bitlyQueryUrl = 'https://api-ssl.bitly.com/v4/shorten';
  const payload = {
    long_url: longUrl,
    domain: 'perfht.ml',
  };

  const response = await fetch(bitlyQueryUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `An error happened while shortening the long url ${longUrl}: ${
        response.statusText
      } (${response.status})`
    );
  }

  const json = await response.json();
  return json.link;
}

export async function expandUrl(urlToExpand: string): Promise<string> {
  const bitlyQueryUrl = 'https://api-ssl.bitly.com/v4/expand';
  const payload = {
    bitlink_id: urlToExpand.replace(/^https:\/\//, ''),
  };
  const response = await fetch(bitlyQueryUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `An error happened while expanding the shortened url ${urlToExpand}: ${
        response.statusText
      } (${response.status})`
    );
  }

  const json = await response.json();
  return json.long_url;
}
