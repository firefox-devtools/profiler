/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  queryApiWithFallback,
  RegularExternalCommunicationDelegate,
} from 'firefox-profiler/utils/query-api';
import type {
  ExternalCommunicationCallbacks,
  ExternalCommunicationDelegate,
} from 'firefox-profiler/utils/query-api';
import type { BrowserConnection } from 'firefox-profiler/app-logic/browser-connection';

describe('queryApiWithFallback', function () {
  function createMockDelegate(
    overrides: Partial<ExternalCommunicationDelegate> = {}
  ): ExternalCommunicationDelegate {
    return {
      fetchUrlResponse: jest.fn(
        overrides.fetchUrlResponse ??
          (async () => {
            throw new Error('Not implemented');
          })
      ),
      queryBrowserSymbolicationApi: jest.fn(
        overrides.queryBrowserSymbolicationApi ??
          (async () => {
            throw new Error('Not implemented');
          })
      ),
      fetchJSSourceFromBrowser: jest.fn(
        overrides.fetchJSSourceFromBrowser ??
          (async () => {
            throw new Error('Not implemented');
          })
      ),
    };
  }

  const uppercasingResponseConverter = (json: any) => {
    if (typeof json.data !== 'string') {
      throw new Error('Invalid response format');
    }
    return json.data.toUpperCase();
  };

  it('returns success when browser API succeeds', async function () {
    const delegate = createMockDelegate({
      queryBrowserSymbolicationApi: async () =>
        JSON.stringify({ data: 'hello' }),
    });

    const result = await queryApiWithFallback(
      '/test/v1',
      '{"request": "data"}',
      null,
      delegate,
      uppercasingResponseConverter
    );

    expect(result).toEqual({
      type: 'SUCCESS',
      convertedResponse: 'HELLO',
    });
    expect(delegate.queryBrowserSymbolicationApi).toHaveBeenCalledWith(
      '/test/v1',
      '{"request": "data"}'
    );
    expect(delegate.fetchUrlResponse).not.toHaveBeenCalled();
  });

  it('falls back to symbol server when browser API fails', async function () {
    const delegate = createMockDelegate({
      queryBrowserSymbolicationApi: async () => {
        throw new Error('Browser connection failed');
      },
      fetchUrlResponse: async () =>
        new Response(JSON.stringify({ data: 'world' }), { status: 200 }),
    });

    const result = await queryApiWithFallback(
      '/test/v1',
      '{"request": "data"}',
      'http://localhost:8000',
      delegate,
      uppercasingResponseConverter
    );

    expect(result).toEqual({
      type: 'SUCCESS',
      convertedResponse: 'WORLD',
    });
    expect(delegate.queryBrowserSymbolicationApi).toHaveBeenCalled();
    expect(delegate.fetchUrlResponse).toHaveBeenCalledWith(
      'http://localhost:8000/test/v1',
      '{"request": "data"}'
    );
  });

  it('returns error when browser API returns error response', async function () {
    const delegate = createMockDelegate({
      queryBrowserSymbolicationApi: async () =>
        JSON.stringify({ error: 'Something went wrong' }),
    });

    const result = await queryApiWithFallback(
      '/test/v1',
      '{"request": "data"}',
      null,
      delegate,
      uppercasingResponseConverter
    );

    expect(result).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_API_ERROR',
          apiErrorMessage: 'Something went wrong',
        },
      ],
    });
  });

  it('returns error when browser API returns malformed JSON', async function () {
    const delegate = createMockDelegate({
      queryBrowserSymbolicationApi: async () => 'not valid JSON {',
    });

    const result = await queryApiWithFallback(
      '/test/v1',
      '{"request": "data"}',
      null,
      delegate,
      uppercasingResponseConverter
    );

    expect(result).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_API_MALFORMED_RESPONSE',
          errorMessage: expect.stringMatching(/SyntaxError/),
        },
      ],
    });
  });

  it('returns error when uppercasingResponseConverter throws', async function () {
    const delegate = createMockDelegate({
      queryBrowserSymbolicationApi: async () =>
        JSON.stringify({ wrongField: 'data' }),
    });

    const result = await queryApiWithFallback(
      '/test/v1',
      '{"request": "data"}',
      null,
      delegate,
      uppercasingResponseConverter
    );

    expect(result).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_API_MALFORMED_RESPONSE',
          errorMessage: 'Error: Invalid response format',
        },
      ],
    });
  });

  it('collects errors from both browser and symbol server', async function () {
    const delegate = createMockDelegate({
      queryBrowserSymbolicationApi: async () => {
        throw new Error('Browser error');
      },
      fetchUrlResponse: async () => {
        throw new Error('Network error');
      },
    });

    const result = await queryApiWithFallback(
      '/test/v1',
      '{"request": "data"}',
      'http://localhost:8000',
      delegate,
      uppercasingResponseConverter
    );

    expect(result).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_CONNECTION_ERROR',
          browserConnectionErrorMessage: 'Error: Browser error',
        },
        {
          type: 'NETWORK_ERROR',
          url: 'http://localhost:8000/test/v1',
          networkErrorMessage: 'Error: Network error',
        },
      ],
    });
  });

  it('returns error when symbol server API returns error', async function () {
    const delegate = createMockDelegate({
      queryBrowserSymbolicationApi: async () => {
        throw new Error('No browser');
      },
      fetchUrlResponse: async () =>
        new Response(JSON.stringify({ error: 'Server error' }), {
          status: 200,
        }),
    });

    const result = await queryApiWithFallback(
      '/test/v1',
      '{"request": "data"}',
      'http://localhost:8000',
      delegate,
      uppercasingResponseConverter
    );

    expect(result).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_CONNECTION_ERROR',
          browserConnectionErrorMessage: 'Error: No browser',
        },
        {
          type: 'SYMBOL_SERVER_API_ERROR',
          apiErrorMessage: 'Server error',
        },
      ],
    });
  });

  it('does not query symbol server if URL is null', async function () {
    const delegate = createMockDelegate({
      queryBrowserSymbolicationApi: async () => {
        throw new Error('Browser failed');
      },
      fetchUrlResponse: jest.fn(),
    });

    const result = await queryApiWithFallback(
      '/test/v1',
      '{"request": "data"}',
      null,
      delegate,
      uppercasingResponseConverter
    );

    expect(result.type).toEqual('ERROR');
    expect(delegate.fetchUrlResponse).not.toHaveBeenCalled();
  });
});

describe('RegularExternalCommunicationDelegate', function () {
  function setup(bcOverrides: Partial<BrowserConnection> | null): {
    delegate: RegularExternalCommunicationDelegate;
    callbacks: ExternalCommunicationCallbacks;
    browserConnection: BrowserConnection | null;
  } {
    const browserConnection: BrowserConnection | null =
      bcOverrides !== null
        ? {
            querySymbolicationApi: jest.fn(bcOverrides.querySymbolicationApi),
            getProfile: jest.fn(bcOverrides.getProfile),
            getExternalMarkers: jest.fn(bcOverrides.getExternalMarkers),
            getExternalPowerTracks: jest.fn(bcOverrides.getExternalPowerTracks),
            getSymbolTable: jest.fn(bcOverrides.getSymbolTable),
            getPageFavicons: jest.fn(bcOverrides.getPageFavicons),
            showFunctionInDevtools: jest.fn(bcOverrides.showFunctionInDevtools),
            getJSSource: jest.fn(bcOverrides.getJSSource),
          }
        : null;

    const callbacks = {
      onBeginUrlRequest: jest.fn(),
      onBeginBrowserConnectionQuery: jest.fn(),
    };

    const delegate = new RegularExternalCommunicationDelegate(
      browserConnection,
      callbacks
    );

    return { delegate, callbacks, browserConnection };
  }

  describe('fetchUrlResponse', function () {
    it('makes POST request with verbatim post data', async function () {
      const mockResponse = 'test response';
      const postData = '{"key": "value"}';

      window.fetchMock
        .catch(404)
        .postOnce('https://example.com/api', mockResponse);

      const { delegate, callbacks } = setup(null);

      const response = await delegate.fetchUrlResponse(
        'https://example.com/api',
        postData
      );
      expect(await response.text()).toBe(mockResponse);
      expect(callbacks.onBeginUrlRequest).toHaveBeenCalledWith(
        'https://example.com/api'
      );
      // Check that postData was passed as-is to fetch
      expect(window.fetchMock.callHistory.lastCall()?.options).toEqual(
        expect.objectContaining({
          body: postData,
        })
      );
    });

    it('throws error for non-200 status codes', async function () {
      window.fetchMock.getOnce('https://example.com/api', 404);

      const { delegate, callbacks } = setup(null);
      await expect(
        delegate.fetchUrlResponse('https://example.com/api')
      ).rejects.toThrow(
        'The request to https://example.com/api returned HTTP status 404'
      );
      expect(callbacks.onBeginUrlRequest).toHaveBeenCalled();
    });

    it('propagates fetch errors', async function () {
      window.fetchMock.getOnce('https://example.com/api', {
        throws: new Error('Network failure'),
      });
      const { delegate, callbacks } = setup(null);
      await expect(
        delegate.fetchUrlResponse('https://example.com/api')
      ).rejects.toThrow('Network failure');

      expect(callbacks.onBeginUrlRequest).toHaveBeenCalled();
    });
  });

  describe('queryBrowserSymbolicationApi', function () {
    it('queries browser connection when available', async function () {
      const { delegate, callbacks, browserConnection } = setup({
        querySymbolicationApi: () => Promise.resolve('{"result": "success"}'),
      });
      const result = await delegate.queryBrowserSymbolicationApi(
        '/api/v1',
        '{"request": "data"}'
      );
      expect(result).toBe('{"result": "success"}');
      expect(callbacks.onBeginBrowserConnectionQuery).toHaveBeenCalled();
      expect(browserConnection!.querySymbolicationApi).toHaveBeenCalledWith(
        '/api/v1',
        '{"request": "data"}'
      );
    });

    it('throws error when no browser connection exists', async function () {
      const { delegate, callbacks } = setup(null);
      await expect(
        delegate.queryBrowserSymbolicationApi('/api/v1', '{"request": "data"}')
      ).rejects.toThrow('No connection to the browser.');
      expect(callbacks.onBeginBrowserConnectionQuery).not.toHaveBeenCalled();
    });

    it('propagates browser connection errors', async function () {
      const { delegate, callbacks } = setup({
        querySymbolicationApi: () =>
          Promise.reject(new Error('Browser API failed')),
      });
      await expect(
        delegate.queryBrowserSymbolicationApi('/api/v1', '{"request": "data"}')
      ).rejects.toThrow('Browser API failed');
      expect(callbacks.onBeginBrowserConnectionQuery).toHaveBeenCalled();
    });
  });
});
