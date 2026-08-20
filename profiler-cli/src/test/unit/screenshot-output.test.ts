/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the CLI side of screenshot extraction: decoding a data URL to a
 * file, and rendering the screenshot listings.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  writeScreenshotFile,
  writeScreenshots,
} from '../../utils/screenshot-file';
import { formatScreenshotsResult } from '../../formatters';
import { elideScreenshotData } from 'firefox-profiler/profile-query/screenshot';
import type {
  ScreenshotData,
  ScreenshotsResult,
  SessionContext,
  WithContext,
} from 'firefox-profiler/profile-query/types';

// A 1x1 JPEG. Small, but real bytes with the FFD8FF magic number.
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzNP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EAKHAAAEC/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

function makeScreenshot(
  overrides: Partial<ScreenshotData> = {}
): ScreenshotData {
  return {
    url: `data:image/jpeg;base64,${JPEG_BASE64}`,
    mimeType: 'image/jpeg',
    base64: JPEG_BASE64,
    windowWidth: 1280,
    windowHeight: 951,
    windowID: '0x1',
    ...overrides,
  };
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pcli-screenshot-test-'));
}

describe('writeScreenshotFile', function () {
  let tempDir: string;

  beforeEach(function () {
    tempDir = makeTempDir();
  });

  afterEach(function () {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('decodes the base64 payload to real image bytes', function () {
    const target = path.join(tempDir, 'shot.jpg');
    const result = writeScreenshotFile(makeScreenshot(), target, 'm-11');

    expect(result.path).toBe(target);
    const bytes = fs.readFileSync(target);
    expect(result.byteLength).toBe(bytes.length);
    // JPEG magic number, so the file really is an image and not base64 text.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('creates missing parent directories', function () {
    const target = path.join(tempDir, 'nested', 'deeper', 'shot.jpg');
    writeScreenshotFile(makeScreenshot(), target, 'm-11');
    expect(fs.existsSync(target)).toBe(true);
  });

  it('writes inside an existing directory, naming the file after the marker', function () {
    const result = writeScreenshotFile(makeScreenshot(), tempDir, 'm-11');
    expect(result.path).toBe(path.join(tempDir, 'screenshot-m-11.jpg'));
  });

  it('treats a trailing separator as a directory even if it does not exist yet', function () {
    const dir = path.join(tempDir, 'shots');
    const result = writeScreenshotFile(
      makeScreenshot(),
      dir + path.sep,
      'm-12'
    );
    expect(result.path).toBe(path.join(dir, 'screenshot-m-12.jpg'));
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('derives the extension from the MIME type', function () {
    const result = writeScreenshotFile(
      makeScreenshot({ mimeType: 'image/png' }),
      tempDir,
      'm-13'
    );
    expect(result.path.endsWith('screenshot-m-13.png')).toBe(true);
  });

  it('throws rather than writing a bogus file when there is no base64 payload', function () {
    expect(() =>
      writeScreenshotFile(
        makeScreenshot({ base64: undefined }),
        path.join(tempDir, 'shot.jpg'),
        'm-14'
      )
    ).toThrow(/cannot be written/);
  });
});

describe('formatScreenshotsResult', function () {
  function makeContext(): SessionContext {
    return {
      selectedThreadHandle: 't-0',
      selectedThreads: [{ threadIndex: 0, name: 'GeckoMain' }],
      currentViewRange: null,
      rootRange: { start: 0, end: 3000 },
    };
  }

  function makeResult(
    screenshots: ScreenshotsResult['screenshots'],
    at = 1000
  ): WithContext<ScreenshotsResult> {
    return {
      type: 'screenshots',
      at,
      totalScreenshotCount: 10,
      screenshots,
      context: makeContext(),
    };
  }

  const baseEntry = {
    markerHandle: 'm-1',
    threadHandle: 't-90',
    friendlyThreadName: 'GPU Process',
    start: 900,
    end: 1100,
    screenshot: makeScreenshot(),
  };

  it('marks stale frames and explains why', function () {
    const output = formatScreenshotsResult(
      makeResult([{ ...baseEntry, end: 500, isFallback: true, staleByMs: 500 }])
    );

    expect(output).toContain('stale');
    // The staleness must be quantified, not just asserted.
    expect(output).toMatch(/ended .* earlier/);
    expect(output).toContain('not what was on screen at that instant');
  });

  it('does not mention staleness when every frame spans the instant', function () {
    const output = formatScreenshotsResult(makeResult([baseEntry]));
    expect(output).not.toContain('stale');
  });

  it('identifies the window on each row, since --at returns one per window', function () {
    const output = formatScreenshotsResult(
      makeResult([
        baseEntry,
        {
          ...baseEntry,
          markerHandle: 'm-2',
          screenshot: makeScreenshot({ windowID: '0x2' }),
        },
      ])
    );
    // Two rows for the same instant are only tellable apart by their window.
    expect(output).toContain('win 0x1');
    expect(output).toContain('win 0x2');
  });

  it('explains an empty result when the profile has no screenshots at all', function () {
    const output = formatScreenshotsResult({
      ...makeResult([]),
      totalScreenshotCount: 0,
    });
    expect(output).toContain('No screenshots');
    expect(output).toContain('"screenshots" feature');
  });
});

describe('elideScreenshotData', function () {
  it('replaces the image bytes with a stand-in, keeping the metadata', function () {
    const elided = elideScreenshotData(makeScreenshot());

    // The point of the elision: --json must never carry the blob itself.
    expect(elided.url).toEqual({
      elided: true,
      length: `data:image/jpeg;base64,${JPEG_BASE64}`.length,
      preview: `data:image/jpeg;base64,${JPEG_BASE64}`.slice(0, 64),
    });
    expect(elided.base64).toEqual({
      elided: true,
      length: JPEG_BASE64.length,
      preview: JPEG_BASE64.slice(0, 64),
    });
    // Everything a consumer might filter on survives.
    expect(elided.mimeType).toBe('image/jpeg');
    expect(elided.windowWidth).toBe(1280);
    expect(elided.windowID).toBe('0x1');
  });

  it('serializes to a payload far smaller than the raw image', function () {
    const screenshot = makeScreenshot();
    const raw = JSON.stringify(screenshot).length;
    const elided = JSON.stringify(elideScreenshotData(screenshot)).length;
    expect(elided).toBeLessThan(raw);
    // No base64 run survives anywhere in the serialized form.
    expect(JSON.stringify(elideScreenshotData(screenshot))).not.toContain(
      JPEG_BASE64
    );
  });

  it('leaves base64 absent when the payload had none', function () {
    const elided = elideScreenshotData(makeScreenshot({ base64: undefined }));
    expect(elided.base64).toBeUndefined();
  });
});

describe('screenshots --json with -o', function () {
  let tempDir: string;

  beforeEach(function () {
    tempDir = makeTempDir();
  });

  afterEach(function () {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeResult(): ScreenshotsResult {
    return {
      type: 'screenshots',
      at: 1000,
      totalScreenshotCount: 10,
      screenshots: [
        {
          markerHandle: 'm-1',
          threadHandle: 't-90',
          friendlyThreadName: 'GPU Process',
          start: 900,
          end: 1100,
          screenshot: makeScreenshot({ windowID: '0x1' }),
        },
        {
          markerHandle: 'm-2',
          threadHandle: 't-90',
          friendlyThreadName: 'GPU Process',
          start: 950,
          end: 1100,
          screenshot: makeScreenshot({ windowID: '0x2' }),
        },
      ],
    };
  }

  // The bug that shipped: --json returned before the writing loop, so -o was
  // silently ignored and the base64 went to stdout instead.
  it('writes one file per window, so -o is not ignored', function () {
    const written = writeScreenshots(makeResult(), tempDir);

    expect(written).toHaveLength(2);
    expect(fs.readdirSync(tempDir).sort()).toEqual([
      'screenshot-m-1.jpg',
      'screenshot-m-2.jpg',
    ]);
    for (const file of written) {
      expect(fs.existsSync(file.path)).toBe(true);
      expect(file.byteLength).toBeGreaterThan(0);
    }
  });

  it('reports the written paths in result order, so they zip onto the entries', function () {
    const result = makeResult();
    const written = writeScreenshots(result, tempDir);

    expect(written.map((file) => path.basename(file.path))).toEqual([
      'screenshot-m-1.jpg',
      'screenshot-m-2.jpg',
    ]);
    // Machine-readable pairing is the whole point of --json.
    const payload = result.screenshots.map((entry, index) => ({
      markerHandle: entry.markerHandle,
      path: written[index].path,
    }));
    expect(payload[0].markerHandle).toBe('m-1');
    expect(payload[0].path).toBe(written[0].path);
  });

  it('accepts a directory without a trailing separator', function () {
    const dir = path.join(tempDir, 'shots');
    const written = writeScreenshots(makeResult(), dir);
    expect(written).toHaveLength(2);
    expect(fs.existsSync(path.join(dir, 'screenshot-m-1.jpg'))).toBe(true);
  });

  it('writes nothing when no -o was given', function () {
    expect(writeScreenshots(makeResult(), undefined)).toEqual([]);
    expect(fs.readdirSync(tempDir)).toEqual([]);
  });
});
