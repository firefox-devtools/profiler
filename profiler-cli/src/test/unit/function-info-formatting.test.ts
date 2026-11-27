/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  FunctionInfoResult,
  SessionContext,
  WithContext,
} from 'firefox-profiler/profile-query/types';
import { formatFunctionInfoResult } from '../../formatters';

function createMockContext(): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [
      { threadIndex: 0, name: 'Test Thread', processName: 'Parent Process' },
    ],
    resultThreadHandle: null,
    resultThreads: [],
    currentViewRange: null,
    rootRange: { start: 0, end: 1000 },
    callTreeSummaryStrategy: 'timing',
  };
}

function makeFunctionInfoResult(
  libraries: FunctionInfoResult['libraries']
): WithContext<FunctionInfoResult> {
  const emptyBreakdown = {
    totalSamples: 0,
    categories: [],
    samples: 0,
    percentageOfThread: 0,
  };
  return {
    type: 'function-info',
    functionHandle: 'f-12',
    funcIndex: 12,
    name: 'nsBlockFrame::Reflow',
    fullName: 'libxul.so!nsBlockFrame::Reflow',
    isJS: false,
    relevantForJS: false,
    resource: { name: 'libxul.so', index: 0 },
    libraries,
    categoryBreakdown: {
      threadHandle: 't-0',
      friendlyThreadName: 'Test Thread',
      threadSamples: 0,
      running: emptyBreakdown,
      self: emptyBreakdown,
    },
    context: createMockContext(),
  };
}

const BUILD_1 = {
  name: 'libxul.so',
  path: '/builds/1/libxul.so',
  debugName: 'libxul.so',
  debugPath: '/builds/1/libxul.so.dbg',
  breakpadId: 'BUILD_ONE',
};

const BUILD_2 = {
  name: 'libxul.so',
  path: '/builds/2/libxul.so',
  breakpadId: 'BUILD_TWO',
};

describe('function info formatting', function () {
  it('prints no library lines when there are no libraries', function () {
    const output = formatFunctionInfoResult(makeFunctionInfoResult([]));

    expect(output).toContain('  Resource: libxul.so');
    expect(output).not.toContain('Library');
    expect(output).not.toContain('Breakpad ID');
  });

  it('prints the details of a single library', function () {
    const output = formatFunctionInfoResult(makeFunctionInfoResult([BUILD_1]));

    expect(output).toContain(
      [
        '  Resource: libxul.so',
        '  Library: libxul.so',
        '  Library path: /builds/1/libxul.so',
        '  Debug name: libxul.so',
        '  Debug path: /builds/1/libxul.so.dbg',
        '  Breakpad ID: BUILD_ONE',
      ].join('\n')
    );
  });

  it('prints every library in order, leaving out missing fields', function () {
    const output = formatFunctionInfoResult(
      makeFunctionInfoResult([BUILD_1, BUILD_2])
    );

    expect(output).toContain(
      [
        '  Library: libxul.so',
        '  Library path: /builds/1/libxul.so',
        '  Debug name: libxul.so',
        '  Debug path: /builds/1/libxul.so.dbg',
        '  Breakpad ID: BUILD_ONE',
        '  Library: libxul.so',
        '  Library path: /builds/2/libxul.so',
        '  Breakpad ID: BUILD_TWO',
      ].join('\n')
    );
  });
});
