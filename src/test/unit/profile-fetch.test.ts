/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import JSZip from 'jszip';

import { fetchProfile } from '../../utils/profile-fetch';
import { serializeProfile } from '../../profile-logic/process-profile';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import type { Profile } from 'firefox-profiler/types';

function encode(string: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(string);
}

/**
 * This profile will have a single sample, and a single thread.
 */
function _getSimpleProfile(): Profile {
  return getProfileFromTextSamples('A').profile;
}

/**
 * fetchProfile has a decent amount of complexity around different issues with loading
 * in different support URL formats. It's mainly testing what happens when JSON
 * and zip file is sent, and what happens when things fail.
 */
describe('fetchProfile', function () {
  /**
   * This helper function encapsulates various configurations for the type of content
   * as well and response headers.
   */
  async function configureFetch(obj: {
    url: string;
    contentType?: string;
    content: 'generated-zip' | 'generated-json' | Uint8Array;
  }) {
    const { url, contentType, content } = obj;
    const stringProfile = serializeProfile(_getSimpleProfile());
    const profile = JSON.parse(stringProfile);
    let arrayBuffer;

    switch (content) {
      case 'generated-zip': {
        const zip = new JSZip();
        zip.file('profile.json', stringProfile);
        arrayBuffer = await zip.generateAsync({ type: 'uint8array' });
        break;
      }
      case 'generated-json':
        arrayBuffer = encode(stringProfile);
        break;
      default:
        arrayBuffer = content;
        break;
    }

    window.fetchMock.catch(403).get(url, {
      body: arrayBuffer,
      headers: {
        'content-type': contentType,
      },
    });

    const reportError = jest.fn();
    const args = {
      url,
      onTemporaryError: () => {},
      reportError,
    };

    // Return fetch's args, based on the inputs.
    return { profile, args, reportError };
  }

  it('fetches a normal profile with the correct content-type headers', async function () {
    const { profile, args } = await configureFetch({
      url: 'https://example.com/profile.json',
      contentType: 'application/json',
      content: 'generated-json',
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip).toEqual({ responseType: 'PROFILE', profile });
  });

  it('fetches a zipped profile with correct content-type headers', async function () {
    const { args, reportError } = await configureFetch({
      url: 'https://example.com/profile.zip',
      contentType: 'application/zip',
      content: 'generated-zip',
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip.responseType).toBe('ZIP');
    expect(reportError.mock.calls.length).toBe(0);
  });

  it('fetches a zipped profile with incorrect content-type headers, but .zip extension', async function () {
    const { args, reportError } = await configureFetch({
      url: 'https://example.com/profile.zip',
      content: 'generated-zip',
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip.responseType).toBe('ZIP');
    expect(reportError.mock.calls.length).toBe(0);
  });

  it('fetches a profile with incorrect content-type headers, but .json extension', async function () {
    const { profile, args, reportError } = await configureFetch({
      url: 'https://example.com/profile.json',
      content: 'generated-json',
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip).toEqual({ responseType: 'PROFILE', profile });
    expect(reportError.mock.calls.length).toBe(0);
  });

  it('fetches a profile with incorrect content-type headers, no known extension, and attempts to JSON parse it it', async function () {
    const { profile, args, reportError } = await configureFetch({
      url: 'https://example.com/profile.file',
      content: 'generated-json',
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip).toEqual({ responseType: 'PROFILE', profile });
    expect(reportError.mock.calls.length).toBe(0);
  });

  it('fails if a bad zip file is passed in', async function () {
    const { args, reportError } = await configureFetch({
      url: 'https://example.com/profile.file',
      contentType: 'application/zip',
      content: new Uint8Array([0, 1, 2, 3]),
    });

    let userFacingError;
    try {
      await fetchProfile(args);
    } catch (error) {
      userFacingError = error;
    }
    expect(userFacingError).toMatchSnapshot();
    expect(reportError.mock.calls.length).toBeGreaterThan(0);
    expect(reportError.mock.calls).toMatchSnapshot();
  });

  it('fails if a bad profile JSON is passed in', async function () {
    const invalidJSON = 'invalid';
    const { args, reportError } = await configureFetch({
      url: 'https://example.com/profile.json',
      contentType: 'application/json',
      content: encode(invalidJSON),
    });

    let userFacingError;
    try {
      await fetchProfile(args);
    } catch (error) {
      userFacingError = error;
    }
    expect(userFacingError).toMatchSnapshot();
    expect(reportError.mock.calls.length).toBeGreaterThan(0);
    expect(reportError.mock.calls).toMatchSnapshot();
  });

  it('fails if a bad profile JSON is passed in, with no content type', async function () {
    const invalidJSON = 'invalid';
    const { args, reportError } = await configureFetch({
      url: 'https://example.com/profile.json',
      content: encode(invalidJSON),
    });

    let userFacingError;
    try {
      await fetchProfile(args);
    } catch (error) {
      userFacingError = error;
    }
    expect(userFacingError).toMatchSnapshot();
    expect(reportError.mock.calls.length).toBeGreaterThan(0);
    expect(reportError.mock.calls).toMatchSnapshot();
  });

  it('fallback behavior if a completely unknown file is passed in', async function () {
    const invalidJSON = 'invalid';
    const profile = encode(invalidJSON);
    const { args } = await configureFetch({
      url: 'https://example.com/profile.unknown',
      content: profile,
    });

    let userFacingError = null;
    try {
      const profileOrZip = await fetchProfile(args);
      expect(profileOrZip).toEqual({
        responseType: 'PROFILE',
        profile: profile.buffer,
      });
    } catch (error) {
      userFacingError = error;
    }
    expect(userFacingError).toBeNull();
  });
});
