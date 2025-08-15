/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PROFILER_SERVER_ORIGIN } from 'firefox-profiler/app-logic/constants';

const ACCEPT_HEADER_VALUE = 'application/vnd.firefox-profiler+json;version=1.0';

export async function shortenUrl(urlToShorten: string): Promise<string> {
  let longUrl = urlToShorten;
  if (!longUrl.startsWith('https://profiler.firefox.com/')) {
    const parsedUrl = new URL(longUrl);
    parsedUrl.protocol = 'https';
    parsedUrl.host = 'profiler.firefox.com';
    parsedUrl.port = '';
    longUrl = parsedUrl.toString();
  }

  const ENDPOINT = `${PROFILER_SERVER_ORIGIN}/shorten`;
  const payload = {
    longUrl,
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: ACCEPT_HEADER_VALUE,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `An error happened while shortening the long url ${longUrl}: ${response.statusText} (${response.status})`
    );
  }

  const json = await response.json();
  return json.shortUrl;
}

export async function expandUrl(shortUrl: string): Promise<string> {
  const ENDPOINT = `${PROFILER_SERVER_ORIGIN}/expand`;
  const payload = {
    shortUrl,
  };
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: ACCEPT_HEADER_VALUE,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `An error happened while expanding the shortened url ${shortUrl}: ${response.statusText} (${response.status})`
    );
  }

  const json = await response.json();
  return json.longUrl;
}
