/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import type { SourceCodeLoadingError } from 'firefox-profiler/types';
import { Localized } from '@fluent/react';

export type CodeErrorOverlayProps = {
  errors: SourceCodeLoadingError[];
};

// Some URLs might be very long and would fill the whole overlay. Collapse the
// middle so the beginning and end stay readable. The full URL is kept in the
// `title` attribute for hover.
const MAX_DISPLAYED_URL_LENGTH = 160;

function shortenUrl(url: string): string {
  if (url.length <= MAX_DISPLAYED_URL_LENGTH) {
    return url;
  }
  const half = Math.floor((MAX_DISPLAYED_URL_LENGTH - 1) / 2);
  return `${url.slice(0, half)}…${url.slice(url.length - half)}`;
}

export function CodeErrorOverlay({ errors }: CodeErrorOverlayProps) {
  return (
    <ul className="codeErrorOverlay">
      {errors.map((error, key) => {
        switch (error.type) {
          case 'NO_KNOWN_CORS_URL': {
            return (
              <Localized key={key} id="SourceView--no-known-cors-url">
                <li>No known cross-origin-accessible URL.</li>
              </Localized>
            );
          }
          case 'NETWORK_ERROR': {
            const { url, networkErrorMessage } = error;
            const shortUrl = shortenUrl(url);
            return (
              <Localized
                key={key}
                id="SourceView--network-error-when-obtaining-source"
                vars={{ url: shortUrl, networkErrorMessage }}
              >
                <li
                  title={url}
                >{`There was a network error when fetching the URL ${shortUrl}: ${networkErrorMessage}`}</li>
              </Localized>
            );
          }
          case 'BROWSER_CONNECTION_ERROR': {
            const { browserConnectionErrorMessage } = error;
            return (
              <Localized
                key={key}
                id="SourceView--browser-connection-error-when-obtaining-source"
                vars={{ browserConnectionErrorMessage }}
              >
                <li>{`Could not query the browser’s symbolication API: ${browserConnectionErrorMessage}`}</li>
              </Localized>
            );
          }
          case 'BROWSER_API_ERROR': {
            const { apiErrorMessage } = error;
            return (
              <Localized
                key={key}
                id="SourceView--browser-api-error-when-obtaining-source"
                vars={{ apiErrorMessage }}
              >
                <li>{`The browser’s symbolication API returned an error: ${apiErrorMessage}`}</li>
              </Localized>
            );
          }
          case 'SYMBOL_SERVER_API_ERROR': {
            const { apiErrorMessage } = error;
            return (
              <Localized
                key={key}
                id="SourceView--local-symbol-server-api-error-when-obtaining-source"
                vars={{ apiErrorMessage }}
              >
                <li>{`The local symbol server’s symbolication API returned an error: ${apiErrorMessage}`}</li>
              </Localized>
            );
          }
          case 'BROWSER_API_MALFORMED_RESPONSE': {
            const { errorMessage } = error;
            return (
              <Localized
                key={key}
                id="SourceView--browser-api-malformed-response-when-obtaining-source"
                vars={{ errorMessage }}
              >
                <li>{`The browser’s symbolication API returned a malformed response: ${errorMessage}`}</li>
              </Localized>
            );
          }
          case 'SYMBOL_SERVER_API_MALFORMED_RESPONSE': {
            const { errorMessage } = error;
            return (
              <Localized
                key={key}
                id="SourceView--local-symbol-server-api-malformed-response-when-obtaining-source"
                vars={{ errorMessage }}
              >
                <li>{`The local symbol server’s symbolication API returned a malformed response: ${errorMessage}`}</li>
              </Localized>
            );
          }
          case 'NOT_PRESENT_IN_ARCHIVE': {
            const { url, pathInArchive } = error;
            const shortUrl = shortenUrl(url);
            return (
              <Localized
                key={key}
                id="SourceView--not-in-archive-error-when-obtaining-source"
                vars={{ url: shortUrl, pathInArchive }}
              >
                <li
                  title={url}
                >{`The file ${pathInArchive} was not found in the archive from ${shortUrl}.`}</li>
              </Localized>
            );
          }
          case 'ARCHIVE_PARSING_ERROR': {
            const { url, parsingErrorMessage } = error;
            const shortUrl = shortenUrl(url);
            return (
              <Localized
                key={key}
                id="SourceView--archive-parsing-error-when-obtaining-source"
                vars={{ url: shortUrl, parsingErrorMessage }}
              >
                <li
                  title={url}
                >{`The archive at ${shortUrl} could not be parsed: ${parsingErrorMessage}`}</li>
              </Localized>
            );
          }
          case 'NOT_PRESENT_IN_BROWSER': {
            const { sourceUuid, url, errorMessage } = error;
            const shortUrl = shortenUrl(url);
            return (
              <Localized
                key={key}
                id="SourceView--not-in-browser-error-when-obtaining-js-source"
                vars={{ url: shortUrl, sourceUuid, errorMessage }}
              >
                <li
                  title={url}
                >{`The browser was unable to obtain the source file for ${shortUrl} with sourceUuid ${sourceUuid}: ${errorMessage}`}</li>
              </Localized>
            );
          }
          default:
            throw assertExhaustiveCheck(error);
        }
      })}
    </ul>
  );
}
