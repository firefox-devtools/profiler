import 'babel-polyfill';
import { describe, it } from 'mocha';
import { assert } from 'chai';
import { blankStore, storeWithProfile } from './fixtures/stores';
import { getProfile, selectedThreadSelectors } from '../../selectors';
import { receiveProfileFromAddon, changeJSOnly } from '../';

const profile = require('../../../common/test/fixtures/profile-2d-canvas.json');

describe('actions/profile', function () {
  it('can take a profile from an addon and save it to state', function () {
    const store = blankStore();

    assert.deepEqual(getProfile(store.getState()), {}, 'No profile initially exists');
    store.dispatch(receiveProfileFromAddon(profile));
    assert.strictEqual(getProfile(store.getState()), profile, 'The passed in profile is saved in state.');
  });
});

describe('actions/getStackTimingByDepth', function () {

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
        'stack': [-1],
        'length': 1,
      },
      {
        'start': [60],
        'end': [91],
        'stack': [4],
        'length': 1,
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
        'stack': [-1],
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
});
