import 'babel-polyfill';
import { describe, it } from 'mocha';
import { assert } from 'chai';
import { summarizeProfile } from '../../common/summarize-profile';

const profile = require('../fixtures/profiles/profile-2d-canvas.json');

describe('summarize-profile', function () {
  const [geckoMain, compositor, content] = summarizeProfile(profile);

  it('has the thread names', function () {
    assert.equal(geckoMain.threadName, 'GeckoMain');
    assert.equal(compositor.threadName, 'Compositor');
    assert.equal(content.threadName, 'Content');
    assert.equal(profile.threads[geckoMain.threadIndex].name, 'GeckoMain');
    assert.equal(profile.threads[compositor.threadIndex].name, 'Compositor');
    assert.equal(profile.threads[content.threadIndex].name, 'Content');
  });

  // Probably not the most brilliant test, but assert that the values are the same from
  // a previous run on a profile.
  it('categorizes samples', () => {
    const {summary} = geckoMain;

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

    assert.deepEqual(summary, expectedSummary);
  });

  it('provides a rolling summary', () => {
    const {rollingSummary} = geckoMain;
    assert.ok(Array.isArray(rollingSummary));

    const hasSamples = (memo, {samples}) => memo && typeof samples === 'object';
    assert.ok(rollingSummary.reduce(hasSamples, true),
      'Each summary has samples');

    const hasPercentages = (memo, {percentage}) => memo && typeof percentage === 'object';
    assert.ok(rollingSummary.reduce(hasPercentages, true),
      'Each summary has percentages');

    for (const {samples} of rollingSummary) {
      for (const [name, value] of Object.entries(samples)) {
        assert.ok(value > 0, `"${name}" has a sample count greater than 0.`);
      }
    }

    for (const {percentage} of rollingSummary) {
      for (const [name, value] of Object.entries(percentage)) {
        assert.ok(value > 0, `"${name}" has a percentage count greater than 0.`);
        assert.ok(value <= 1, `"${name}" has a percentage count greater than 0.`);
      }
    }
  });

  it('provides sane rolling summary values', () => {
    const {samples, percentage} = geckoMain.rollingSummary[0];
    assert.equal(samples['dom.wait'], 2);
    assert.equal(samples['script.compile.baseline'], 2);
    assert.equal(samples.script, 12);
    assert.equal(samples.dom, 1);

    assertFloatEquals(percentage['CC.wait'], 0.05263157894736842);
    assertFloatEquals(percentage['script.compile.baseline'], 0.10526315789473684);
    assertFloatEquals(percentage.script, 0.631578947368421);
    assertFloatEquals(percentage.dom, 0.05263157894736842);
  });
});

function assertFloatEquals(a, b, message) {
  assert.ok(Math.abs(a - b) < 0.0001, message || `expected ${a} to be ${b}`);
}
