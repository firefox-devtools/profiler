/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import JSZip from 'jszip';
import zlib from 'zlib';

import { fetchProfile } from '../../utils/profile-fetch';
import { serializeProfileToJsonString } from '../../profile-logic/process-profile';
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
 * fetchProfile is responsible for downloading bytes and distinguishing ZIPs
 * (via content-type or URL extension) from everything else. Format detection
 * and gzip decompression happen downstream in unserializeProfileOfArbitraryFormat,
 * so the non-ZIP path here just returns raw bytes.
 */
describe('fetchProfile', function () {
  async function configureFetch(obj: {
    url: string;
    contentType?: string;
    content: 'generated-zip' | 'generated-json' | Uint8Array;
  }) {
    const { url, contentType, content } = obj;
    const stringProfile = serializeProfileToJsonString(_getSimpleProfile());
    let bytes: Uint8Array;

    switch (content) {
      case 'generated-zip': {
        const zip = new JSZip();
        zip.file('profile.json', stringProfile);
        bytes = await zip.generateAsync({ type: 'uint8array' });
        break;
      }
      case 'generated-json':
        bytes = encode(stringProfile);
        break;
      default:
        bytes = content;
        break;
    }

    window.fetchMock.catch(403).get(url, {
      body: bytes,
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

    return { bytes, args, reportError };
  }

  function expectBytesEqual(received: unknown, expected: Uint8Array) {
    // Uint8Arrays from workers / other realms aren't instanceof Uint8Array here.
    expect(Object.prototype.toString.call(received)).toBe(
      '[object Uint8Array]'
    );
    expect(Array.from(received as Uint8Array)).toEqual(Array.from(expected));
  }

  it('returns the raw bytes when the content-type is application/json', async function () {
    const { bytes, args } = await configureFetch({
      url: 'https://example.com/profile.json',
      contentType: 'application/json',
      content: 'generated-json',
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip.responseType).toBe('BYTES');
    expectBytesEqual((profileOrZip as any).bytes, bytes);
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

  it('returns the raw bytes when the URL has a .json extension but no content type', async function () {
    const { bytes, args, reportError } = await configureFetch({
      url: 'https://example.com/profile.json',
      content: 'generated-json',
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip.responseType).toBe('BYTES');
    expectBytesEqual((profileOrZip as any).bytes, bytes);
    expect(reportError.mock.calls.length).toBe(0);
  });

  it('returns the raw bytes when the URL extension and content type are both unknown', async function () {
    const { bytes, args, reportError } = await configureFetch({
      url: 'https://example.com/profile.file',
      content: 'generated-json',
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip.responseType).toBe('BYTES');
    expectBytesEqual((profileOrZip as any).bytes, bytes);
    expect(reportError.mock.calls.length).toBe(0);
  });

  it('passes gzipped bytes through unchanged (decompression is downstream)', async function () {
    // Previously fetchProfile decompressed in-place, which detached the
    // original ArrayBuffer and broke the fallback path for binary formats
    // like JSLB. Now the bytes pass through as-is.
    const payload = new Uint8Array([0x89, 0x4a, 0x53, 0x4c, 0x42, 0, 1, 2, 3]);
    const gzipped = new Uint8Array(zlib.gzipSync(payload));
    const { args } = await configureFetch({
      url: 'https://example.com/profile.bin',
      content: gzipped,
    });

    const profileOrZip = await fetchProfile(args);
    expect(profileOrZip.responseType).toBe('BYTES');
    expectBytesEqual((profileOrZip as any).bytes, gzipped);
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
});
