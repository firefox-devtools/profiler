/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  CategoryBreakdown,
  FunctionInfoResult,
  SessionContext,
  ThreadSamplesResult,
  WithContext,
} from 'firefox-profiler/profile-query/types';
import {
  formatFunctionInfoResult,
  formatThreadSamplesResult,
} from '../../formatters';

function createMockContext(): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [{ threadIndex: 0, name: 'Test Thread' }],
    currentViewRange: null,
    rootRange: { start: 0, end: 1000 },
  };
}

const BREAKDOWN: CategoryBreakdown = {
  totalSamples: 100,
  categories: [
    {
      name: 'Layout',
      categoryIndex: 3,
      samples: 60,
      percentage: 60,
      subcategories: [
        {
          name: 'Reflow',
          subcategoryIndex: 1,
          samples: 45,
          percentage: 45,
        },
        { name: 'Other', subcategoryIndex: 0, samples: 15, percentage: 15 },
      ],
    },
    {
      name: 'JavaScript',
      categoryIndex: 2,
      samples: 40,
      percentage: 40,
      subcategories: [],
    },
  ],
};

const EMPTY_BREAKDOWN: CategoryBreakdown = {
  totalSamples: 0,
  categories: [],
};

function makeSamplesResult(
  categoryBreakdown: CategoryBreakdown
): WithContext<ThreadSamplesResult> {
  return {
    type: 'thread-samples',
    threadHandle: 't-0',
    friendlyThreadName: 'Test Thread',
    categoryBreakdown,
    topFunctionsByTotal: [
      {
        functionHandle: 'f-0',
        functionIndex: 0,
        name: 'A',
        nameWithLibrary: 'A',
        totalSamples: 100,
        totalPercentage: 100,
        selfSamples: 40,
        selfPercentage: 40,
      },
    ],
    topFunctionsBySelf: [],
    heaviestStack: {
      selfSamples: 0,
      frameCount: 0,
      hasInlinedFrames: false,
      frames: [],
    },
    context: createMockContext(),
  };
}

function makeFunctionInfoResult(
  categoryBreakdown: FunctionInfoResult['categoryBreakdown']
): WithContext<FunctionInfoResult> {
  return {
    type: 'function-info',
    functionHandle: 'f-12',
    funcIndex: 12,
    name: 'nsBlockFrame::Reflow',
    fullName: 'libxul.so!nsBlockFrame::Reflow',
    isJS: false,
    relevantForJS: false,
    categoryBreakdown,
    context: createMockContext(),
  };
}

describe('category breakdown formatting', function () {
  it('renders categories with their subcategories in thread samples', function () {
    expect(
      formatThreadSamplesResult(makeSamplesResult(BREAKDOWN))
    ).toMatchSnapshot();
  });

  it('renders the running and self breakdowns in function info', function () {
    expect(
      formatFunctionInfoResult(
        makeFunctionInfoResult({
          threadHandle: 't-0',
          friendlyThreadName: 'Test Thread',
          threadSamples: 200,
          running: {
            ...BREAKDOWN,
            samples: 100,
            percentageOfThread: 50,
          },
          self: {
            ...EMPTY_BREAKDOWN,
            samples: 0,
            percentageOfThread: 0,
          },
        })
      )
    ).toMatchSnapshot();
  });

  it('renders an empty breakdown without any category rows', function () {
    expect(
      formatThreadSamplesResult(makeSamplesResult(EMPTY_BREAKDOWN))
    ).toContain('No samples in the current view.');
  });

  it('names the thread it looked at when a function has no samples', function () {
    const output = formatFunctionInfoResult(
      makeFunctionInfoResult({
        threadHandle: 't-0',
        friendlyThreadName: 'Test Thread',
        threadSamples: 200,
        running: { ...EMPTY_BREAKDOWN, samples: 0, percentageOfThread: 0 },
        self: { ...EMPTY_BREAKDOWN, samples: 0, percentageOfThread: 0 },
      })
    );

    expect(output).toContain(
      'No samples for this function on t-0 (Test Thread) in the current view.'
    );
    expect(output).not.toContain('Categories:');
  });
});
