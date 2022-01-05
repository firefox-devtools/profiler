/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { fetchSource } from 'firefox-profiler/utils/fetch-source';
import { Response } from 'firefox-profiler/test/fixtures/mocks/response';

describe('fetchSource', function () {
  it('fetches single files', async function () {
    expect(
      await fetchSource(
        'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28',
        {
          fetchUrlResponse: async (url: string) => {
            const r = new Response(`Fake response from ${url}`, {
              status: 200,
            });
            return (r: any);
          },
        }
      )
    ).toEqual({
      type: 'SUCCESS',
      source:
        'Fake response from https://hg.mozilla.org/mozilla-central/raw-file/997f00815e6bc28806b75448c8829f0259d2cb28/widget/cocoa/nsAppShell.mm',
    });
  });

  it('propagates network errors', async function () {
    expect(
      await fetchSource(
        'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28',
        {
          fetchUrlResponse: async (_url: string) => {
            throw new Error('Some network error');
          },
        }
      )
    ).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'NETWORK_ERROR',
          networkErrorMessage: 'Error: Some network error',
          url: 'https://hg.mozilla.org/mozilla-central/raw-file/997f00815e6bc28806b75448c8829f0259d2cb28/widget/cocoa/nsAppShell.mm',
        },
      ],
    });
  });

  it('rejects files from unknown URLs', async function () {
    expect(
      await fetchSource(
        'git:git.iximeow.net/yaxpeax-arm:src/armv8/a64.rs:0663147eacdef847cc1bdc07cf89eed14b1aeaca',
        {
          fetchUrlResponse: async (_url: string) => {
            throw new Error('Some network error');
          },
        }
      )
    ).toEqual({
      type: 'ERROR',
      errors: [{ type: 'NO_KNOWN_CORS_URL' }],
    });
  });
});
