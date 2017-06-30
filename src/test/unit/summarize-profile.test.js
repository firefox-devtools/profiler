/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'babel-polyfill';
import { summarizeProfile } from '../../profile-logic/summarize-profile';

const profile = require('../fixtures/profiles/profile-2d-canvas.json');

describe('summarize-profile', function() {
  const [geckoMain, compositor, content] = summarizeProfile(profile);

  it('has the thread names', function() {
    expect(geckoMain.threadName).toEqual('GeckoMain');
    expect(compositor.threadName).toEqual('Compositor');
    expect(content.threadName).toEqual('Content');
    expect(profile.threads[geckoMain.threadIndex].name).toEqual('GeckoMain');
    expect(profile.threads[compositor.threadIndex].name).toEqual('Compositor');
    expect(profile.threads[content.threadIndex].name).toEqual('Content');
  });

  // Probably not the most brilliant test, but assert that the values are the same from
  // a previous run on a profile.
  it('categorizes samples', () => {
    const { summary } = geckoMain;

    const expectedSummary = [
      { category: 'wait', samples: 141 },
      { category: 'script', samples: 113 },
      { category: 'script.execute', samples: 28 },
      { category: 'script.execute.baseline', samples: 28 },
      { category: 'dom', samples: 20 },
      { category: 'script.compile', samples: 16 },
      { category: 'script.compile.baseline', samples: 14 },
      { category: 'frameconstruction', samples: 6 },
      { category: 'network', samples: 4 },
      { category: 'script.parse', samples: 4 },
      { category: 'dom.wait', samples: 2 },
      { category: 'script.compile.ion', samples: 2 },
      { category: 'script.icupdate', samples: 2 },
      { category: 'CC', samples: 1 },
      { category: 'CC.wait', samples: 1 },
      { category: 'restyle', samples: 1 },
    ];

    // Go ahead and calculate the percentages dynamically for the test, this way
    // the float equalities will pass a strict equality test.
    const sampleCount = 286;
    expectedSummary.forEach(row => {
      row.percentage = row.samples / sampleCount;
    });

    expect(summary).toEqual(expectedSummary);
  });

  it('provides a rolling summary', () => {
    const { rollingSummary } = geckoMain;
    expect(Array.isArray(rollingSummary)).toBeTruthy();

    const hasSamples = (memo, { samples }) =>
      memo && typeof samples === 'object';

    // Each summary has samples
    expect(rollingSummary.reduce(hasSamples, true)).toBeTruthy();

    const hasPercentages = (memo, { percentage }) =>
      memo && typeof percentage === 'object';
    expect(rollingSummary.reduce(hasPercentages, true)).toBeTruthy();

    for (const { samples } of rollingSummary) {
      for (const value of Object.values(samples)) {
        // This sample has a sample count greater than 0.
        expect(value).toBeGreaterThan(0);
      }
    }

    for (const { percentage } of rollingSummary) {
      for (const value of Object.values(percentage)) {
        // This sample has a percentage count greater than 0.
        expect(value).toBeGreaterThan(0);
        // This sample has a percentage count greater than 0.
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('provides sane rolling summary values', () => {
    const { samples, percentage } = geckoMain.rollingSummary[0];
    expect(samples['dom.wait']).toEqual(2);
    expect(samples['script.compile.baseline']).toEqual(2);
    expect(samples.script).toEqual(12);
    expect(samples.dom).toEqual(1);

    expect(percentage['CC.wait']).toBeCloseTo(0.05263157894736842);
    expect(percentage['script.compile.baseline']).toBeCloseTo(
      0.10526315789473684
    );
    expect(percentage.script).toBeCloseTo(0.631578947368421);
    expect(percentage.dom).toBeCloseTo(0.05263157894736842);
  });
});
