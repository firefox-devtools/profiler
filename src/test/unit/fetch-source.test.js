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
        'https://symbolication.services.mozilla.com',
        null,
        {
          fetchUrlResponse: async (url: string, _postData?: MixedObject) => {
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
        'https://symbolication.services.mozilla.com',
        null,
        {
          fetchUrlResponse: async (_url: string, _postData?: MixedObject) => {
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

  it('fetches files from local symbol servers', async function () {
    expect(
      await fetchSource(
        '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs',
        'http://127.0.0.1:3000',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        {
          fetchUrlResponse: async (url: string, postData?: MixedObject) => {
            if (url === 'http://127.0.0.1:3000/source/v1') {
              if (!postData) {
                throw new Error('Expected post data');
              }
              const r = new Response(
                JSON.stringify({
                  symbolsLastModified: null,
                  sourceLastModified: null,
                  file: '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs',
                  source: `Fake source from local server symbolication API, with post data ${postData}`,
                }),
                {
                  status: 200,
                }
              );
              return (r: any);
            }
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
        'Fake source from local server symbolication API, with post data {"debugName":"FAKE_DEBUGNAME","debugId":"FAKE_DEBUGID","moduleOffset":"0x1234","file":"/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs"}',
    });
  });

  it('fetches permalink-style paths from local server first', async function () {
    expect(
      await fetchSource(
        'git:github.com/rust-lang/rust:library/core/src/intrinsics.rs:acbe4443cc4c9695c0b74a7b64b60333c990a400',
        'http://127.0.0.1:3001',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        {
          fetchUrlResponse: async (url: string, postData?: MixedObject) => {
            if (url === 'http://127.0.0.1:3001/source/v1') {
              if (!postData) {
                throw new Error('Expected post data');
              }
              const r = new Response(
                JSON.stringify({
                  symbolsLastModified: null,
                  sourceLastModified: null,
                  file: 'git:github.com/rust-lang/rust:library/core/src/intrinsics.rs:acbe4443cc4c9695c0b74a7b64b60333c990a400',
                  source: `Fake source from local server symbolication API, with post data ${postData}`,
                }),
                {
                  status: 200,
                }
              );
              return (r: any);
            }
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
        'Fake source from local server symbolication API, with post data {"debugName":"FAKE_DEBUGNAME","debugId":"FAKE_DEBUGID","moduleOffset":"0x1234","file":"git:github.com/rust-lang/rust:library/core/src/intrinsics.rs:acbe4443cc4c9695c0b74a7b64b60333c990a400"}',
    });
  });

  it('falls back to CORS url for permalink-style paths if local server fails', async function () {
    expect(
      await fetchSource(
        'git:github.com/rust-lang/rust:library/core/src/intrinsics.rs:acbe4443cc4c9695c0b74a7b64b60333c990a400',
        'http://127.0.0.1:3002',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        {
          fetchUrlResponse: async (url: string, postData?: MixedObject) => {
            if (url === 'http://127.0.0.1:3002/source/v1') {
              if (!postData) {
                throw new Error('Expected post data');
              }
              const r = new Response(
                JSON.stringify({
                  error:
                    'An error occurred when reading the file: No such file or directory (os error 2)',
                }),
                {
                  status: 200,
                }
              );
              return (r: any);
            }
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
        'Fake response from https://raw.githubusercontent.com/rust-lang/rust/acbe4443cc4c9695c0b74a7b64b60333c990a400/library/core/src/intrinsics.rs',
    });
  });

  it('reports all errors if everything fails', async function () {
    expect(
      await fetchSource(
        'git:github.com/rust-lang/rust:library/core/src/intrinsics.rs:acbe4443cc4c9695c0b74a7b64b60333c990a400',
        'http://127.0.0.1:3003',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        {
          fetchUrlResponse: async (_url: string, _postData?: MixedObject) => {
            throw new Error('Some network error');
          },
        }
      )
    ).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'NETWORK_ERROR',
          url: 'http://127.0.0.1:3003/source/v1',
          networkErrorMessage: 'Error: Some network error',
        },
        {
          type: 'NETWORK_ERROR',
          url: 'https://raw.githubusercontent.com/rust-lang/rust/acbe4443cc4c9695c0b74a7b64b60333c990a400/library/core/src/intrinsics.rs',
          networkErrorMessage: 'Error: Some network error',
        },
      ],
    });
  });

  it('rejects files from unknown URLs', async function () {
    expect(
      await fetchSource(
        'git:git.iximeow.net/yaxpeax-arm:src/armv8/a64.rs:0663147eacdef847cc1bdc07cf89eed14b1aeaca',
        'https://symbolication.services.mozilla.com',
        null,
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
