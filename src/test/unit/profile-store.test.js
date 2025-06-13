/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  uploadBinaryProfileData,
  deleteProfileOnServer,
} from 'firefox-profiler/profile-logic/profile-store';

describe('profile upload', () => {
  function setup() {
    function fakeXMLHttpRequest() {
      // eslint-disable-next-line @babel/no-invalid-this
      Object.assign(this, {
        abort: jest.fn(),
        upload: {},
        open: jest.fn(),
        setRequestHeader: jest.fn(),
        send: jest.fn(),
      });

      // eslint-disable-next-line @babel/no-invalid-this
      fakeXMLHttpRequest.instances.push(this);
    }
    fakeXMLHttpRequest.instances = [];

    jest.spyOn(window, 'XMLHttpRequest').mockImplementation(fakeXMLHttpRequest);

    function getLastXhr() {
      const xhr =
        fakeXMLHttpRequest.instances[fakeXMLHttpRequest.instances.length - 1];
      if (!xhr) {
        throw new Error(`No XHR has been created yet.`);
      }
      return xhr;
    }

    return {
      getLastXhr,

      sendProgress({ loaded, total }) {
        const e = new ProgressEvent('progress', {
          lengthComputable: true,
          loaded,
          total,
        });

        const xhr = getLastXhr();
        if (xhr.upload && xhr.upload.onprogress) {
          xhr.upload.onprogress(e);
        }
      },

      sendLoad({
        status,
        statusText,
        responseText,
      }: {
        status: number,
        statusText?: string,
        responseText?: string,
      }) {
        const xhr = getLastXhr();
        xhr.status = status;
        xhr.statusText = statusText;
        xhr.responseText = responseText;
        if (xhr.onload) {
          xhr.onload();
        }
      },

      sendError() {
        const xhr = getLastXhr();
        if (xhr.onerror) {
          xhr.onerror();
        }
      },
    };
  }

  it('uploads with the right information', async () => {
    const { getLastXhr, sendProgress, sendLoad } = setup();

    const data = new Uint8Array(10);
    const responseText = 'response';
    const progressCallback = jest.fn();
    const uploadPromise = uploadBinaryProfileData().startUpload(
      data,
      progressCallback
    );

    sendProgress({ loaded: 1, total: 4 });
    sendProgress({ loaded: 2, total: 4 });
    sendProgress({ loaded: 3, total: 4 });
    sendLoad({ status: 200, responseText });

    const result = await uploadPromise;
    expect(result).toBe(responseText);
    expect(progressCallback).toHaveBeenCalledTimes(3);
    expect(progressCallback).toHaveBeenCalledWith(0.25);
    expect(progressCallback).toHaveBeenCalledWith(0.5);
    expect(progressCallback).toHaveBeenCalledWith(0.75);

    const xhr = getLastXhr();
    expect(xhr.open).toHaveBeenCalledWith(
      'POST',
      'https://api.profiler.firefox.com/compressed-store'
    );
    expect(xhr.setRequestHeader).toHaveBeenCalledWith(
      'Accept',
      expect.stringMatching(/^application\/vnd\.firefox-profiler\+json;/)
    );
    expect(xhr.send).toHaveBeenCalledWith(data);
  });

  it('returns a proper error when receiving a 413 status', async () => {
    const { sendLoad } = setup();

    const data = new Uint8Array(10);
    const uploadPromise = uploadBinaryProfileData().startUpload(data);

    sendLoad({ status: 413 });

    await expect(uploadPromise).rejects.toThrow(/too large/);
  });

  it('returns a proper error when receiving another non-2xx status', async () => {
    const { sendLoad } = setup();

    const data = new Uint8Array(10);
    const uploadPromise = uploadBinaryProfileData().startUpload(data);

    sendLoad({ status: 400, statusText: 'configuration error' });

    await expect(uploadPromise).rejects.toThrow(
      /statusText: configuration error/
    );
  });

  it('returns a proper error when encoutnering a network error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { sendError, getLastXhr } = setup();

    const data = new Uint8Array(10);
    const uploadPromise = uploadBinaryProfileData().startUpload(data);

    sendError();

    await expect(uploadPromise).rejects.toThrow(
      'Unable to make a connection to publish the profile.'
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/network error/),
      getLastXhr()
    );
  });

  it('can abort the request', async () => {
    const { getLastXhr } = setup();

    const { startUpload, abortUpload } = uploadBinaryProfileData();
    startUpload(new Uint8Array(10));
    abortUpload();
    expect(getLastXhr().abort).toHaveBeenCalled();
  });
});

describe('profile deletion', () => {
  function mockFetchForDeleteProfile({
    endpointUrl,
    jwtToken,
  }: {
    endpointUrl: string,
    jwtToken: string,
  }) {
    window.fetchMock
      .catch(404) // catchall
      .route(endpointUrl, async ({ options }) => {
        const { method, headers } = options;

        if (method !== 'delete') {
          return new Response(null, {
            status: 405,
            statusText: 'Method not allowed',
          });
        }

        if (
          headers['content-type'] !== 'application/json' ||
          headers.accept !== 'application/vnd.firefox-profiler+json;version=1.0'
        ) {
          return new Response(null, {
            status: 406,
            statusText: 'Not acceptable',
          });
        }

        if (headers.authorization !== `Bearer ${jwtToken}`) {
          return new Response(null, {
            status: 401,
            statusText: 'Forbidden',
          });
        }

        return new Response('Profile successfully deleted.', { status: 200 });
      });
  }

  it('can delete a profile', async () => {
    const PROFILE_TOKEN = 'FAKE_PROFILE_TOKEN';
    const JWT_TOKEN = 'FAKE_JWT_TOKEN';

    const endpointUrl = `https://api.profiler.firefox.com/profile/${PROFILE_TOKEN}`;
    mockFetchForDeleteProfile({
      endpointUrl,
      jwtToken: JWT_TOKEN,
    });
    await deleteProfileOnServer({
      profileToken: PROFILE_TOKEN,
      jwtToken: JWT_TOKEN,
    });
    expect(window.fetch).toHaveFetched(endpointUrl, expect.anything());
  });
});
