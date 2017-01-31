import 'babel-polyfill';
import { describe, it } from 'mocha';
import { assert } from 'chai';
import { blankStore } from './fixtures/stores';
import { getProfile } from '../../selectors';
import { receiveProfileFromAddon } from '../';

const profile = require('../../../common/test/fixtures/profile-2d-canvas.json');

describe('actions', function () {
  it('can take a profile from an addon and save it to state', function () {
    const store = blankStore();

    assert.deepEqual(getProfile(store.getState()), {}, 'No profile initially exists');
    store.dispatch(receiveProfileFromAddon(profile));
    assert.strictEqual(getProfile(store.getState()), profile, 'The passed in profile is saved in state.');
  });
});
