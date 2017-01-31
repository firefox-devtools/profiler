import 'babel-polyfill';
import { describe, it } from 'mocha';
import { assert } from 'chai';
import { blankStore, storeWithProfile } from './fixtures/stores';
import * as selectors from '../../selectors';
import { receiveProfileFromAddon, changeJSOnly, addRangeFilter } from '../';
const { selectedThreadSelectors } = selectors;

const profile = require('../../../common/test/fixtures/profile-2d-canvas.json');

describe('actions/profile', function () {
  it('can take a profile from an addon and save it to state', function () {
    const store = blankStore();

    assert.deepEqual(selectors.getProfile(store.getState()), {}, 'No profile initially exists');
    store.dispatch(receiveProfileFromAddon(profile));
    assert.strictEqual(selectors.getProfile(store.getState()), profile, 'The passed in profile is saved in state.');
  });
});

describe('selectors/getStackTimingByDepth', function () {
  /**
   * This table shows off how a flame chart gets collapsed, where the number is the stack
   * index, and P is platform code, and J javascript.
   *
   *          Unfiltered             ->             JS Only
   *  =============================      =============================
   *  0P 0P 0P 0P 0P 0P 0P 0P 0P 0P      0P 0P 0P 0P 0P 0P 0P 0P 0P 0P
   *  1P 1P 1P 1P    1P 1P 1P 1P 1P                        1J 1J 1J 1J
   *     2P 2P 3P       4J 4J 4J 4J                           2J 2J
   *                       5J 5J                                 3P
   *                          6P                                 4J
   *                          7P
   *                          8J
   *
   *        Unfiltered Timing
   *  =============================
   *  {stack: 0, start: 0, end: 91}
   *  {stack: 1, start: 0, end 40}, {stack: 1, start: 50, end: 91},
   *  {stack: 2, start: 10, end: 30}, {stack: 3, start:30, end: 40}, {stack: 4, start: 60, end: 91}
   *  {stack: 5, start: 70, end: 90}
   *  {stack: 6, start: 80, end: 90}
   *  {stack: 7, start: 80, end: 90}
   *  {stack: 8, start: 80, end: 90}
   *
   *          JS Only Timing
   *  ==============================
   *  {stack: -1, start: 0, end: 91}
   *  {stack: 4, start: 60, end: 91}
   *  {stack: 5, start: 70: end: 90}
   *  {stack: -1, start: 80, end: 90}
   *  {stack: 8, start: 80: end: 90}
   *
   */

  it('computes unfiltered stack timing by depth', function () {
    const store = storeWithProfile();
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepth(store.getState());
    assert.deepEqual(stackTimingByDepth, [
      {
        'start': [0],
        'end': [91],
        'stack': [0],
        'length': 1,
      },
      {
        'start': [0, 50],
        'end': [40, 91],
        'stack': [1, 1],
        'length': 2,
      },
      {
        'start': [10, 30, 60],
        'end': [30, 40, 91],
        'stack': [2, 3, 4],
        'length': 3,
      },
      {
        'start': [70],
        'end': [90],
        'stack': [5],
        'length': 1,
      },
      {
        'start': [80],
        'end': [90],
        'stack': [6],
        'length': 1,
      },
      {
        'start': [80],
        'end': [90],
        'stack': [7],
        'length': 1,
      },
      {
        'start': [80],
        'end': [90],
        'stack': [8],
        'length': 1,
      },
    ]);
  });

  it('computes JS only stack timing by depth', function () {
    const store = storeWithProfile();
    store.dispatch(changeJSOnly(true));
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepth(store.getState());

    assert.deepEqual(stackTimingByDepth, [
      {
        'start': [0],
        'end': [91],
        'stack': [0],
        'length': 1,
      },
      {
        'start': [60],
        'end': [91],
        'stack': [1],
        'length': 1,
      },
      {
        'start': [70],
        'end': [90],
        'stack': [2],
        'length': 1,
      },
      {
        'start': [80],
        'end': [90],
        'stack': [3],
        'length': 1,
      },
      {
        'start': [80],
        'end': [90],
        'stack': [4],
        'length': 1,
      },
    ]);
  });
});

describe('selectors/getFuncStackMaxDepth', function () {
  it('calculates the max func depth and observes of JS filters', function () {
    const store = storeWithProfile();
    const allSamplesMaxDepth = selectedThreadSelectors.getFuncStackMaxDepth(store.getState());
    assert.equal(allSamplesMaxDepth, 6);
    store.dispatch(changeJSOnly(true));
    const jsOnlySamplesMaxDepth = selectedThreadSelectors.getFuncStackMaxDepth(store.getState());
    assert.equal(jsOnlySamplesMaxDepth, 4);
  });

  it('acts upon the current range', function () {
    const store = storeWithProfile();
    store.dispatch(addRangeFilter(0, 20));
    const allSamplesMaxDepth = selectedThreadSelectors.getFuncStackMaxDepth(store.getState());
    assert.equal(allSamplesMaxDepth, 2);
    store.dispatch(changeJSOnly(true));
    const jsOnlySamplesMaxDepth = selectedThreadSelectors.getFuncStackMaxDepth(store.getState());
    assert.equal(jsOnlySamplesMaxDepth, 0);
  });
});
