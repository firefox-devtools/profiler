import 'babel-polyfill';
import { describe, it } from 'mocha';
import { assert } from 'chai';

import profile from '../reducers/profile';
import summary from '../reducers/summary';

describe('worker/reducers', function () {

  describe('reducers/profile', function () {

    it('returns the profile', function () {
      const data = '____DATA____';
      const state = profile(null, {
        type: 'PROFILE_PROCESSED',
        profile: data,
      });
      assert.strictEqual(data, state);
    });

    it('defaults to returning the state', function () {
      let state = profile(undefined, {
        type: null,
      });
      assert.equal(null, state);

      const data = {};
      state = profile(data, {
        type: null,
      });
      assert.strictEqual(data, state);
    });

  });

  describe('reducers/summary', function () {

    it('returns the summary', function () {
      const data = '____DATA____';
      const state = summary(null, {
        type: 'PROFILE_SUMMARY_PROCESSED',
        summary: data,
      });
      assert.strictEqual(data, state);
    });

    it('defaults to returning the state', function () {
      let state = summary(undefined, {
        type: null,
      });
      assert.equal(null, state);

      const data = {};
      state = summary(data, {
        type: null,
      });
      assert.strictEqual(data, state);
    });

  });
});
