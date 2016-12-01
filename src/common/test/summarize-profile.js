import 'babel-polyfill';
import { describe, it } from 'mocha';
import { assert } from 'chai';
import { summarizeProfile } from '../summarize-profile';

const profile = require('./fixtures/profile-2d-canvas.json');

describe('summarize-profile', function () {
  const [geckoMain, compositor, content] = summarizeProfile(profile);

  it('has the thread names', function () {
    assert.equal(geckoMain.thread, 'GeckoMain');
    assert.equal(compositor.thread, 'Compositor');
    assert.equal(content.thread, 'Content');
  });

  // Probably not the most brilliant test, but assert that the values are the same from
  // a previous run on a profile.
  it('categorizes samples', () => {
    const {summary} = geckoMain;
    assert.equal(summary[0].category, 'idle');
    assert.equal(summary[0].samples, 142);
    assertFloatEquals(summary[0].percentage, 0.48464163822525597);

    assert.equal(summary[1].category, 'script');
    assert.equal(summary[1].samples, 113);
    assertFloatEquals(summary[1].percentage, 0.3856655290102389);

    assert.equal(summary[2].category, 'dom');
    assert.equal(summary[2].samples, 18);
    assertFloatEquals(summary[2].percentage, 0.06143344709897611);

    assert.equal(summary[3].category, 'script.compile');
    assert.equal(summary[3].samples, 16);
    assertFloatEquals(summary[3].percentage, 0.05460750853242321);

    assert.equal(summary[4].category, 'script.compile.baseline');
    assert.equal(summary[4].samples, 14);
    assertFloatEquals(summary[4].percentage, 0.04778156996587031);

    assert.equal(summary[5].category, 'uncategorized');
    assert.equal(summary[5].samples, 7);
    assertFloatEquals(summary[5].percentage, 0.023890784982935155);

    assert.equal(summary[6].category, 'frameconstruction');
    assert.equal(summary[6].samples, 6);
    assertFloatEquals(summary[6].percentage, 0.020477815699658702);

    assert.equal(summary[7].category, 'network');
    assert.equal(summary[7].samples, 4);
    assertFloatEquals(summary[7].percentage, 0.013651877133105802);

    assert.equal(summary[8].category, 'script.parse');
    assert.equal(summary[8].samples, 4);
    assertFloatEquals(summary[8].percentage, 0.013651877133105802);

    assert.equal(summary[9].category, 'script.compile.ion');
    assert.equal(summary[9].samples, 2);
    assertFloatEquals(summary[9].percentage, 0.006825938566552901);

    assert.equal(summary[10].category, 'wait');
    assert.equal(summary[10].samples, 2);
    assertFloatEquals(summary[10].percentage, 0.006825938566552901);

    assert.equal(summary[11].category, 'script.icupdate');
    assert.equal(summary[11].samples, 2);
    assertFloatEquals(summary[11].percentage, 0.006825938566552901);

    assert.equal(summary[12].category, 'restyle');
    assert.equal(summary[12].samples, 1);
    assertFloatEquals(summary[12].percentage, 0.0034129692832764505);
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

    rollingSummary.forEach(({samples}) => {
      forEachObj(samples, (value, name) => {
        assert.ok(value > 0, `"${name}" has a sample count greater than 0.`);
      });
    });

    rollingSummary.forEach(({percentage}) => {
      forEachObj(percentage, (value, name) => {
        assert.ok(value > 0, `"${name}" has a percentage count greater than 0.`);
        assert.ok(value <= 1, `"${name}" has a percentage count greater than 0.`);
      });
    });
  });

  it('provides sane rolling summary values', () => {
    const {samples, percentage} = geckoMain.rollingSummary[0];
    assert.equal(samples.wait, 2);
    assert.equal(samples.idle, 1);
    assert.equal(samples['script.compile.baseline'], 2);
    assert.equal(samples.script, 13);
    assert.equal(samples.dom, 1);

    assertFloatEquals(percentage.wait, 0.10526315789473684);
    assertFloatEquals(percentage.idle, 0.05263157894736842);
    assertFloatEquals(percentage['script.compile.baseline'], 0.10526315789473684);
    assertFloatEquals(percentage.script, 0.6842105263157895);
    assertFloatEquals(percentage.dom, 0.05263157894736842);
  });
});

function forEachObj (object, fn) {
  let i = 0;
  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      i++;
      fn(object[key], key, i);
    }
  }
}

function assertFloatEquals(a, b, message) {
  assert.ok(Math.abs(a - b) < 0.0001, message);
}
