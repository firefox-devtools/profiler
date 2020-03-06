/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { oneLine } from 'common-tags';

export function uploadBinaryProfileData(): * {
  const xhr = new XMLHttpRequest();
  let isAborted = false;

  return {
    abortFunction: (): void => {
      isAborted = true;
      xhr.abort();
    },
    startUpload: (
      data: $TypedArray,
      progressChangeCallback?: number => mixed
    ): Promise<string> =>
      new Promise((resolve, reject) => {
        if (isAborted) {
          reject(new Error('The request was already aborted.'));
          return;
        }

        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(xhr.responseText);
          } else {
            reject(
              new Error(
                `xhr onload with status != 200, xhr.statusText: ${xhr.statusText}`
              )
            );
          }
        };

        xhr.onerror = () => {
          console.error(
            'There was an XHR error in uploadBinaryProfileData()',
            xhr
          );
          reject(
            new Error(
              // The profile store does not give useful responses.
              // See: https://github.com/firefox-devtools/profiler/issues/998
              xhr.statusText
                ? oneLine`
                    There was an issue uploading the profile to the server. This is often
                    caused by the profile file size being too large. The error
                    response was: ${xhr.statusText}
                  `
                : 'Unable to make a connection to publish the profile.'
            )
          );
        };

        xhr.upload.onprogress = e => {
          if (progressChangeCallback && e.lengthComputable) {
            progressChangeCallback(e.loaded / e.total);
          }
        };

        xhr.open('POST', 'https://profile-store.appspot.com/compressed-store');
        xhr.send(data);
      }),
  };
}
