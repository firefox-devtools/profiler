/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for ProfileQuerier.functionAnnotate.
 *
 * fetchSource and fetchAssembly are mocked because they make network requests.
 *
 * NOTE on sample layout: _parseTextSamples uses the FIRST row to determine
 * column widths. Functions with long names (e.g. A[file:f.c][line:10]) must
 * be in row 1 so their column is wide enough. Use single-row samples when the
 * function under test should be both root and leaf.
 */

import { ProfileQuerier } from 'firefox-profiler/profile-query';
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import { storeWithProfile } from '../../fixtures/stores';

jest.mock('firefox-profiler/utils/fetch-source');
jest.mock('firefox-profiler/utils/fetch-assembly');

function funcHandle(
  funcNamesDictPerThread: Array<{ [name: string]: number }>,
  name: string
): string {
  return `f-${funcNamesDictPerThread[0][name]}`;
}

function makeQuerier(
  profile: ReturnType<typeof getProfileFromTextSamples>['profile']
) {
  const store = storeWithProfile(profile);
  return new ProfileQuerier(store, getProfileRootRange(store.getState()));
}

describe('ProfileQuerier.functionAnnotate', function () {
  let fetchSource: jest.Mock;

  beforeEach(function () {
    fetchSource = jest.requireMock(
      'firefox-profiler/utils/fetch-source'
    ).fetchSource;
    fetchSource.mockResolvedValue({ type: 'ERROR', errors: [] });
  });

  describe('aggregate self/total sample counts', function () {
    it('counts self when function is the only frame (root = leaf)', async function () {
      // Single-row samples: A is simultaneously root and leaf in all 3 samples.
      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:10]  A[file:f.c][line:10]  A[file:f.c][line:10]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000'
      );

      expect(result.totalSelfSamples).toBe(3);
      expect(result.totalTotalSamples).toBe(3);
    });

    it('distinguishes self from total when A is not always the leaf', async function () {
      // A must be in row 1 so column widths are determined correctly.
      // Sample 1: A@10 (root) → B (leaf)  →  A.self=0, A.total=1
      // Sample 2: B (root) → A@10 (leaf)  →  A.self=1, A.total=1
      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:10]  B
        B                     A[file:f.c][line:10]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000'
      );

      expect(result.totalSelfSamples).toBe(1);
      expect(result.totalTotalSamples).toBe(2);
    });
  });

  describe('src mode - line timings', function () {
    it('attributes self and total hits to the correct lines', async function () {
      // Single-row samples: A is root and leaf, hits different lines per sample.
      // Sample 1: A@line10 → self@10 += 1, total@10 += 1
      // Sample 2: A@line12 → self@12 += 1, total@12 += 1
      // Sample 3: A@line10 → self@10 += 1, total@10 += 1
      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:10]  A[file:f.c][line:12]  A[file:f.c][line:10]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000'
      );

      const src = result.srcAnnotation;
      expect(src).not.toBeNull();

      const line10 = src!.lines.find((l) => l.lineNumber === 10);
      const line12 = src!.lines.find((l) => l.lineNumber === 12);

      expect(line10).toBeDefined();
      expect(line10!.selfSamples).toBe(2);
      expect(line10!.totalSamples).toBe(2);

      expect(line12).toBeDefined();
      expect(line12!.selfSamples).toBe(1);
      expect(line12!.totalSamples).toBe(1);
    });

    it('separates self (leaf) from total (any stack position) for line hits', async function () {
      // Sample 1: A@10 (root) → B (leaf):  line10.self=0, line10.total=1
      // Sample 2: B (root) → A@10 (leaf):  line10.self=1, line10.total=1
      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:10]  B
        B                     A[file:f.c][line:10]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000'
      );

      const src = result.srcAnnotation;
      expect(src).not.toBeNull();

      const line10 = src!.lines.find((l) => l.lineNumber === 10);
      expect(line10).toBeDefined();
      expect(line10!.selfSamples).toBe(1);
      expect(line10!.totalSamples).toBe(2);
    });

    it('includes source text when fetchSource succeeds', async function () {
      fetchSource.mockResolvedValue({
        type: 'SUCCESS',
        source: 'line one\nline two\nline three\nline four\nline five',
      });

      // Single-row: A is leaf, hit at line 2.
      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:2]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000'
      );

      const src = result.srcAnnotation;
      expect(src).not.toBeNull();
      expect(src!.totalFileLines).toBe(5);

      const line2 = src!.lines.find((l) => l.lineNumber === 2);
      expect(line2!.sourceText).toBe('line two');
    });

    it('leaves sourceText null and adds a warning when fetchSource fails', async function () {
      fetchSource.mockResolvedValue({
        type: 'ERROR',
        errors: [{ type: 'NO_KNOWN_CORS_URL' }],
      });

      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:5]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000'
      );

      const src = result.srcAnnotation;
      expect(src).not.toBeNull();
      expect(src!.totalFileLines).toBeNull();

      const line5 = src!.lines.find((l) => l.lineNumber === 5);
      expect(line5!.sourceText).toBeNull();
      expect(result.warnings.some((w) => w.includes('f.c'))).toBe(true);
    });

    it('adds a warning and returns null srcAnnotation when function has no source index', async function () {
      // A has no [file:] attribute → funcTable.source[funcIndex] is null
      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000'
      );

      expect(result.srcAnnotation).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('no source index');
    });
  });

  describe('--context option', function () {
    it('shows all lines when context is "file"', async function () {
      fetchSource.mockResolvedValue({
        type: 'SUCCESS',
        source: Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join(
          '\n'
        ),
      });

      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:10]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000',
        'file'
      );

      const src = result.srcAnnotation;
      expect(src).not.toBeNull();
      expect(src!.contextMode).toBe('full file');
      expect(src!.lines.length).toBe(20);
      expect(src!.lines[0].lineNumber).toBe(1);
      expect(src!.lines[19].lineNumber).toBe(20);
    });

    it('shows annotated lines ± N context lines when context is a number', async function () {
      fetchSource.mockResolvedValue({
        type: 'SUCCESS',
        source: Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join(
          '\n'
        ),
      });

      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:10]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000',
        '1'
      );

      const src = result.srcAnnotation;
      expect(src).not.toBeNull();
      expect(src!.contextMode).toBe('±1 lines context');

      const lineNumbers = src!.lines.map((l) => l.lineNumber);
      expect(lineNumbers).toContain(9);
      expect(lineNumbers).toContain(10);
      expect(lineNumbers).toContain(11);
      expect(lineNumbers).not.toContain(1);
      expect(lineNumbers).not.toContain(20);
    });

    it('shows only annotated lines when context is 0', async function () {
      fetchSource.mockResolvedValue({
        type: 'SUCCESS',
        source: Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join(
          '\n'
        ),
      });

      const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
        A[file:f.c][line:10]
      `);

      const result = await makeQuerier(profile).functionAnnotate(
        funcHandle(funcNamesDictPerThread, 'A'),
        'src',
        'http://localhost:3000',
        '0'
      );

      const src = result.srcAnnotation;
      expect(src).not.toBeNull();
      expect(src!.contextMode).toBe('annotated lines only');

      const lineNumbers = src!.lines.map((l) => l.lineNumber);
      expect(lineNumbers).toEqual([10]);
    });
  });
});
