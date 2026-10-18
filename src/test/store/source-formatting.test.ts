/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import * as UrlStateSelectors from '../../selectors/url-state';
import * as CodeSelectors from '../../selectors/code';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getBottomBoxInfoForCallNode } from '../../profile-logic/bottom-box';
import {
  updateBottomBoxContentsAndMaybeOpen,
  setSourceViewPrettyPrint,
} from '../../actions/profile-view';
import { startFormattingSource } from '../../actions/code';
import { runFormatWorker } from '../../profile-logic/js-format/run-format-worker';
import { StringTable } from '../../utils/string-table';
import { ensureExists } from '../../utils/types';
import { FuncFlag } from 'firefox-profiler/types';
import type { FormatWorkerOutput } from '../../profile-logic/js-format/types';

// The real worker needs to be bundled by esbuild. Instead, run the formatter
// on the main thread, and report its edits in two steps, like the worker does
// for large code.
jest.mock('../../profile-logic/js-format/run-format-worker', () => ({
  runFormatWorker: jest.fn(),
}));

function mockFormatWorker() {
  const { formatJsCode } = jest.requireActual(
    '../../profile-logic/js-format/formatter'
  );
  let pendingSecondStep: (() => void) | null = null;
  (runFormatWorker as jest.Mock).mockImplementation(
    (
      { code, dialect }: { code: string; dialect: string },
      onOutput: (output: FormatWorkerOutput) => void
    ) => {
      const edits = formatJsCode(code, dialect);
      const half = Math.floor(edits.length / 6) * 3;
      onOutput({
        type: 'progress',
        edits: edits.slice(0, half),
        formattedUpTo: edits[half - 2],
        isDone: false,
      });
      pendingSecondStep = () =>
        onOutput({
          type: 'progress',
          edits: edits.slice(half),
          formattedUpTo: code.length,
          isDone: true,
        });
    }
  );
  return {
    finishFormatting: () => ensureExists(pendingSecondStep)(),
  };
}

// Minified code with three functions on one line.
const CODE = 'function A(){B();C()}function B(){x()}function C(){y()}';
// The formatted code:
//  1 function A() {
//  2   B();
//  3   C()
//  4 }
//  5 function B() {
//  6   x()
//  7 }
//  8 function C() {
//  9   y()
// 10 }

// The 1-based column of the first occurrence of `str` in CODE.
function col(str: string): number {
  return CODE.indexOf(str) + 1;
}

function setup() {
  const { finishFormatting } = mockFormatWorker();
  const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
    A[file:bundle.js][line:1][col:${col('B()')}]  A[file:bundle.js][line:1][col:${col('C()')}]  A[file:bundle.js][line:1][col:${col('B()')}]
    B[file:bundle.js][line:1][col:${col('x()')}]  C[file:bundle.js][line:1][col:${col('y()')}]  B[file:bundle.js][line:1][col:${col('x()')}]
  `);
  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);
  const sourceIndex = profile.shared.sources.filename.indexOf(
    stringTable.indexForString('bundle.js')
  );
  profile.shared.sources.content[sourceIndex] = CODE;

  const { dispatch, getState } = storeWithProfile(profile);
  const { A } = funcNamesDictPerThread[0];
  const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());
  const bottomBoxInfo = getBottomBoxInfoForCallNode(
    ensureExists(callNodeInfo.getCallNodeIndexFromPath([A])),
    callNodeInfo,
    selectedThreadSelectors.getFilteredThread(getState()),
    selectedThreadSelectors.getPreviewFilteredCtssSamples(getState())
  );
  dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo));

  function startFormatting() {
    const request = ensureExists(
      CodeSelectors.getSourceViewFormattingRequest(getState())
    );
    dispatch(startFormattingSource(request));
  }

  return {
    dispatch,
    getState,
    sourceIndex,
    startFormatting,
    finishFormatting,
  };
}

describe('pretty-printing the source view', function () {
  it('only requests formatting when pretty-printing is enabled', function () {
    const { dispatch, getState, sourceIndex } = setup();
    expect(CodeSelectors.getSourceViewFormatDialect(getState())).toBe('');
    expect(CodeSelectors.getSourceViewFormattingRequest(getState())).toBeNull();

    dispatch(setSourceViewPrettyPrint(true));
    expect(CodeSelectors.getSourceViewFormattingRequest(getState())).toEqual({
      sourceIndex,
      code: CODE,
      dialect: '',
    });
  });

  it('attributes the samples to the formatted lines using the columns', function () {
    const { dispatch, getState, startFormatting, finishFormatting } = setup();
    // Without pretty-printing, everything is on line 1.
    expect(
      selectedThreadSelectors.getSourceViewLineTimings(getState())
    ).toEqual({
      totalLineHits: new Map([[1, 3]]),
      selfLineHits: new Map([[1, 3]]),
    });

    dispatch(setSourceViewPrettyPrint(true));
    startFormatting();
    finishFormatting();
    expect(CodeSelectors.getSourceViewFormattingRequest(getState())).toBeNull();
    const formatting = ensureExists(
      CodeSelectors.getSourceViewFormatting(getState())
    );
    expect(formatting.isDone).toBeTrue();
    expect(formatting.lines).toHaveLength(10);
    expect(
      selectedThreadSelectors.getSourceViewLineTimings(getState())
    ).toEqual({
      totalLineHits: new Map([
        [2, 2],
        [3, 1],
        [6, 2],
        [9, 1],
      ]),
      selfLineHits: new Map([
        [6, 2],
        [9, 1],
      ]),
    });

    // The bottom box scrolls to the hottest column on the hottest line. Map
    // it to the formatted line, like the BottomBox component does.
    const scrollToLine = ensureExists(
      UrlStateSelectors.getSourceViewScrollToLineNumber(getState())
    );
    const scrollToColumn = ensureExists(
      UrlStateSelectors.getSourceViewScrollToColumnNumber(getState())
    );
    expect(scrollToLine).toBe(1);
    expect(scrollToColumn).toBe(col('B()'));
    expect(formatting.mapPositionToLine(scrollToLine, scrollToColumn)).toBe(2);

    // Turning off pretty-printing goes back to the original lines, and keeps
    // the formatting result for later.
    dispatch(setSourceViewPrettyPrint(false));
    expect(CodeSelectors.getSourceViewFormatting(getState())).toBeNull();
    expect(
      selectedThreadSelectors.getSourceViewLineTimings(getState())
    ).toEqual({
      totalLineHits: new Map([[1, 3]]),
      selfLineHits: new Map([[1, 3]]),
    });
    dispatch(setSourceViewPrettyPrint(true));
    expect(CodeSelectors.getSourceViewFormattingRequest(getState())).toBeNull();
    expect(CodeSelectors.getSourceViewFormatting(getState())).not.toBeNull();
  });

  it('shows partially-formatted code while formatting is in progress', function () {
    const { dispatch, getState, startFormatting, finishFormatting } = setup();
    dispatch(setSourceViewPrettyPrint(true));
    startFormatting();

    const partialFormatting = ensureExists(
      CodeSelectors.getSourceViewFormatting(getState())
    );
    expect(partialFormatting.isDone).toBeFalse();
    expect(partialFormatting.lines.length).toBeGreaterThan(1);
    expect(partialFormatting.lines.length).toBeLessThan(10);
    // The line timings are consistent with the partially-formatted lines.
    const { totalLineHits } =
      selectedThreadSelectors.getSourceViewLineTimings(getState());
    for (const line of totalLineHits.keys()) {
      expect(line).toBeLessThanOrEqual(partialFormatting.lines.length);
    }

    finishFormatting();
    expect(
      ensureExists(CodeSelectors.getSourceViewFormatting(getState())).lines
    ).toHaveLength(10);
  });

  it('scrolls to the start of the function if the frames have no position', function () {
    // Some JS frames only have the position of their function, which is on
    // the very long minified line.
    const { finishFormatting } = mockFormatWorker();
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A[file:bundle.js]
      C[file:bundle.js]
    `);
    const stringTable = StringTable.withBackingArray(
      profile.shared.stringArray
    );
    const sourceIndex = profile.shared.sources.filename.indexOf(
      stringTable.indexForString('bundle.js')
    );
    profile.shared.sources.content[sourceIndex] = CODE;
    const { funcTable } = profile.shared;
    const { A, C } = funcNamesDictPerThread[0];
    for (const [func, name] of [
      [A, 'function A'],
      [C, 'function C'],
    ] as const) {
      funcTable.flags[func] |= FuncFlag.HasLine | FuncFlag.HasColumn;
      funcTable.lineNumber[func] = 1;
      funcTable.columnNumber[func] = col(name);
    }

    const { dispatch, getState } = storeWithProfile(profile);
    const callNodeInfo = selectedThreadSelectors.getCallNodeInfo(getState());
    const bottomBoxInfo = getBottomBoxInfoForCallNode(
      ensureExists(callNodeInfo.getCallNodeIndexFromPath([A, C])),
      callNodeInfo,
      selectedThreadSelectors.getFilteredThread(getState()),
      selectedThreadSelectors.getPreviewFilteredCtssSamples(getState())
    );
    expect(bottomBoxInfo.scrollToLineNumber).toBe(1);
    expect(bottomBoxInfo.scrollToColumnNumber).toBe(col('function C'));
    dispatch(updateBottomBoxContentsAndMaybeOpen('calltree', bottomBoxInfo));

    dispatch(setSourceViewPrettyPrint(true));
    dispatch(
      startFormattingSource(
        ensureExists(CodeSelectors.getSourceViewFormattingRequest(getState()))
      )
    );
    finishFormatting();
    const formatting = ensureExists(
      CodeSelectors.getSourceViewFormatting(getState())
    );
    expect(
      formatting.mapPositionToLine(
        1,
        ensureExists(bottomBoxInfo.scrollToColumnNumber)
      )
    ).toBe(8);
  });
});
