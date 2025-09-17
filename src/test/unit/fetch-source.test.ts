/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fetchSource } from 'firefox-profiler/utils/fetch-source';

describe('fetchSource', function () {
  it('fetches single files', async function () {
    expect(
      await fetchSource(
        'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28',
        null,
        'https://symbolication.services.mozilla.com',
        null,
        new Map(),
        {
          fetchUrlResponse: async (url: string, _postData?: string) => {
            const r = new Response(`Fake response from ${url}`, {
              status: 200,
            });
            return r;
          },
          queryBrowserSymbolicationApi: async (
            _path: string,
            _requestJson: string
          ) => {
            throw new Error('No browser connection');
          },
        }
      )
    ).toEqual({
      type: 'SUCCESS',
      source:
        'Fake response from https://hg.mozilla.org/mozilla-central/raw-file/997f00815e6bc28806b75448c8829f0259d2cb28/widget/cocoa/nsAppShell.mm',
    });
  });

  it('fetches archives', async function () {
    const fetchUrlResponse = jest.fn(
      async (_url: string, _postData?: string) => {
        // Return an array buffer with .tar.gz bytes for an archive with the following contents:
        // - addr2line-0.17.0 (directory)
        //   - src (directory)
        //     - lib.rs containing "Fake addr2line-0.17.0 src/lib.rs contents"
        //     - function.rs containing "Fake addr2line-0.17.0 src/function.rs contents"
        const tgzHexString =
          '1F8B0800F3C9CD610003ED945B0E82301045594A3720CEC04CBB03F7813C0C11' +
          '4BC263FF36824A10D08F4A7CF4FCDC0F1A9872EF9D2849AAA0C875BA011F950F' +
          '5BCF3E00A098C54565A71050A73D02096518864C0C029002064FF01B6679A0AD' +
          '9BA832A39C8CEA433A7BCE3CCEB285F7F4F7B8E997108DFDAFABD876065EF79F' +
          '48211AFF1942E5FC5F8349FF8B7CEF57B5B56F98FF218916FC67BCF69FD81C00' +
          '94C8EC09B036C1027FEEFF2E3AA6621C02710F81884BDDA4BAB19706C72731D9' +
          'FFACD5719397DAD21278DE7F39D8FFCAF45F0584AEFF6B30DFFF4108DC127038' +
          '1C8E9FE30C4A53C44300100000';
        const byteLen = tgzHexString.length / 2;
        const arr = new Uint8Array(byteLen);
        for (let i = 0; i < arr.length; i++) {
          arr[i] = parseInt(tgzHexString.slice(i * 2, i * 2 + 2), 16);
        }
        const r = new Response(arr.buffer, { status: 200 });
        return r as any;
      }
    );
    const queryBrowserSymbolicationApi = async (
      _path: string,
      _requestJson: string
    ) => {
      throw new Error('No browser connection');
    };

    const archiveCache = new Map<string, Promise<Uint8Array>>();

    expect(
      await fetchSource(
        'cargo:github.com-1ecc6299db9ec823:addr2line-0.17.0:src/lib.rs',
        null,
        'https://symbolication.services.mozilla.com',
        null,
        archiveCache,
        { fetchUrlResponse, queryBrowserSymbolicationApi }
      )
    ).toEqual({
      type: 'SUCCESS',
      source: 'Fake addr2line-0.17.0 src/lib.rs contents',
    });
    expect(fetchUrlResponse).toHaveBeenCalledTimes(1);
    expect(fetchUrlResponse).toHaveBeenCalledWith(
      'https://crates.io/api/v1/crates/addr2line/0.17.0/download'
    );

    // Fetch another file from the same archive, and make sure the cached archive is used.
    expect(
      await fetchSource(
        'cargo:github.com-1ecc6299db9ec823:addr2line-0.17.0:src/function.rs',
        null,
        'https://symbolication.services.mozilla.com',
        null,
        archiveCache,
        { fetchUrlResponse, queryBrowserSymbolicationApi }
      )
    ).toEqual({
      type: 'SUCCESS',
      source: 'Fake addr2line-0.17.0 src/function.rs contents',
    });
    // No additional call should have been made.
    expect(fetchUrlResponse).toHaveBeenCalledTimes(1);

    // Fetch a file which is not present in the archive.
    expect(
      await fetchSource(
        'cargo:github.com-1ecc6299db9ec823:addr2line-0.17.0:src/nonexist.rs',
        null,
        'https://symbolication.services.mozilla.com',
        null,
        archiveCache,
        { fetchUrlResponse, queryBrowserSymbolicationApi }
      )
    ).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'NOT_PRESENT_IN_ARCHIVE',
          url: 'https://crates.io/api/v1/crates/addr2line/0.17.0/download',
          pathInArchive: 'addr2line-0.17.0/src/nonexist.rs',
        },
      ],
    });
    // No additional call should have been made.
    expect(fetchUrlResponse).toHaveBeenCalledTimes(1);
  });

  it('propagates network errors', async function () {
    expect(
      await fetchSource(
        'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28',
        null,
        'https://symbolication.services.mozilla.com',
        null,
        new Map(),
        {
          fetchUrlResponse: async (_url: string, _postData?: string) => {
            throw new Error('Some network error');
          },
          queryBrowserSymbolicationApi: async (
            _path: string,
            _requestJson: string
          ) => {
            // Shouldn't be called anyway because we're not providing an AddressProof.
            throw new Error('No browser connection');
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

  it('fetches files from the browser', async function () {
    expect(
      await fetchSource(
        '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs',
        null,
        'https://symbolication.services.mozilla.com',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        new Map(),
        {
          fetchUrlResponse: async (_url: string, _postData?: string) => {
            throw new Error('Some network error');
          },
          queryBrowserSymbolicationApi: async (
            path: string,
            requestJson: string
          ) => {
            if (path !== '/source/v1') {
              throw new Error(`Unrecognized API path ${path}`);
            }
            return JSON.stringify({
              symbolsLastModified: null,
              sourceLastModified: null,
              file: '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs',
              source: `Fake source from browser symbolication API, for request JSON ${requestJson}`,
            });
          },
        }
      )
    ).toEqual({
      type: 'SUCCESS',
      source:
        'Fake source from browser symbolication API, for request JSON {"debugName":"FAKE_DEBUGNAME","debugId":"FAKE_DEBUGID","moduleOffset":"0x1234","file":"/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs"}',
    });
  });

  it('fetches files from local symbol servers', async function () {
    expect(
      await fetchSource(
        '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs',
        null,
        'http://127.0.0.1:3000',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        new Map(),
        {
          fetchUrlResponse: async (url: string, postData?: string) => {
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
              return r as any;
            }
            const r = new Response(`Fake response from ${url}`, {
              status: 200,
            });
            return r as any;
          },
          queryBrowserSymbolicationApi: async (
            _path: string,
            _requestJson: string
          ) => {
            throw new Error('No browser connection');
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
        null,
        'http://127.0.0.1:3001',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        new Map(),
        {
          fetchUrlResponse: async (url: string, postData?: string) => {
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
              return r as any;
            }
            const r = new Response(`Fake response from ${url}`, {
              status: 200,
            });
            return r as any;
          },
          queryBrowserSymbolicationApi: async (
            _path: string,
            _requestJson: string
          ) => {
            throw new Error('No browser connection');
          },
        }
      )
    ).toEqual({
      type: 'SUCCESS',
      source:
        'Fake source from local server symbolication API, with post data {"debugName":"FAKE_DEBUGNAME","debugId":"FAKE_DEBUGID","moduleOffset":"0x1234","file":"git:github.com/rust-lang/rust:library/core/src/intrinsics.rs:acbe4443cc4c9695c0b74a7b64b60333c990a400"}',
    });
  });

  it('falls back to CORS url for permalink-style paths if local server and browser query fails', async function () {
    expect(
      await fetchSource(
        'git:github.com/rust-lang/rust:library/core/src/intrinsics.rs:acbe4443cc4c9695c0b74a7b64b60333c990a400',
        null,
        'http://127.0.0.1:3002',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        new Map(),
        {
          fetchUrlResponse: async (url: string, postData?: string) => {
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
              return r as any;
            }
            const r = new Response(`Fake response from ${url}`, {
              status: 200,
            });
            return r as any;
          },
          queryBrowserSymbolicationApi: async (
            _path: string,
            _requestJson: string
          ) => {
            throw new Error('No browser connection');
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
        null,
        'http://127.0.0.1:3003',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        new Map(),
        {
          fetchUrlResponse: async (_url: string, _postData?: string) => {
            throw new Error('Some network error');
          },
          queryBrowserSymbolicationApi: async (
            _path: string,
            _requestJson: string
          ) => {
            throw new Error('No browser connection');
          },
        }
      )
    ).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_CONNECTION_ERROR',
          browserConnectionErrorMessage: 'Error: No browser connection',
        },
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
        null,
        'https://symbolication.services.mozilla.com',
        null,
        new Map(),
        {
          fetchUrlResponse: async (_url: string) => {
            throw new Error('Some network error');
          },
          queryBrowserSymbolicationApi: async (
            _path: string,
            _requestJson: string
          ) => {
            throw new Error('No browser connection');
          },
        }
      )
    ).toEqual({
      type: 'ERROR',
      errors: [{ type: 'NO_KNOWN_CORS_URL' }],
    });
  });

  it('reports appropriate errors when the API response is not valid JSON', async function () {
    expect(
      await fetchSource(
        '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs',
        null,
        'https://symbolication.services.mozilla.com',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        new Map(),
        {
          fetchUrlResponse: async (_url: string, _postData?: string) => {
            throw new Error('Some network error');
          },
          queryBrowserSymbolicationApi: async (
            path: string,
            _requestJson: string
          ) => {
            if (path !== '/source/v1') {
              throw new Error(`Unrecognized API path ${path}`);
            }
            return '[Invalid \\ JSON}';
          },
        }
      )
    ).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_API_MALFORMED_RESPONSE',
          errorMessage: expect.stringMatching(/SyntaxError: Unexpected token/),
        },
        {
          type: 'NO_KNOWN_CORS_URL',
        },
      ],
    });
  });

  it('reports appropriate errors when the API response is malformed', async function () {
    expect(
      await fetchSource(
        '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs',
        null,
        'https://symbolication.services.mozilla.com',
        {
          debugName: 'FAKE_DEBUGNAME',
          breakpadId: 'FAKE_DEBUGID',
          address: 0x1234,
        },
        new Map(),
        {
          fetchUrlResponse: async (_url: string, _postData?: string) => {
            throw new Error('Some network error');
          },
          queryBrowserSymbolicationApi: async (
            path: string,
            _requestJson: string
          ) => {
            if (path !== '/source/v1') {
              throw new Error(`Unrecognized API path ${path}`);
            }
            return JSON.stringify({
              symbolsLastModified: null,
              sourceLastModified: null,
              file: '/Users/mstange/code/mozilla/gfx/wr/webrender/src/renderer/mod.rs',
              hahaYouThoughtThereWouldBeSourceHereButNo: 42,
            });
          },
        }
      )
    ).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_API_MALFORMED_RESPONSE',
          errorMessage: 'Error: No string "source" property on API response',
        },
        {
          type: 'NO_KNOWN_CORS_URL',
        },
      ],
    });
  });
});
