import { assert } from 'chai';

import { createImageMock } from './mocks/image';
import { blankStore } from './fixtures/stores';
import * as iconsAccessors from '../../reducers/icons';
import * as iconsActions from '../icons';

describe('actions/icons', function () {
  const validIcons = [
    'https://valid.icon1.example.org/favicon.ico',
    'https://valid.icon2.example.org/favicon.ico',
  ];
  const expectedClasses = [
    'https___valid_icon1_example_org_favicon_ico',
    'https___valid_icon2_example_org_favicon_ico',
  ];
  const invalidIcon = 'https://invalid.icon.example.org/favicon.ico';

  let instances;

  beforeEach(() => {
    const mock = createImageMock();
    instances = mock.instances;
    global.Image = mock.Image;
  });

  afterEach(() => {
    delete global.Image;
    instances = null;
  });

  let store;

  beforeEach(function () {
    store = blankStore();
  });

  afterEach(function () {
    store = null;
  });

  function waitForActions({ count } = { count: 1 }) {
    return new Promise(resolve => {
      const unsubscribe = store.subscribe(() => {
        if (--count === 0) { // eslint-disable-line no-param-reassign
          unsubscribe();
          resolve();
        }
      });
    });
  }

  describe('With the initial state', function () {
    let state;
    beforeEach(function () {
      state = store.getState();
    });

    afterEach(function () {
      state = null;
    });

    it('getIcons return an empty set', function () {
      const initialState = iconsAccessors.getIcons(state);
      assert.typeOf(initialState, 'set');
      assert.equal(initialState.size, 0);
    });

    it('getIconForNode returns null for any icon', function () {
      const subject = iconsAccessors.getIconForNode(state, { icon: validIcons[0] });
      assert.isNull(subject);
    });

    it('getIconClassNameForNode returns null for any icon', function () {
      const subject = iconsAccessors.getIconClassNameForNode(state, { icon: validIcons[0] });
      assert.isNull(subject);
    });

    it('getIconsWithClassNames returns an empty array', function () {
      const subject = iconsAccessors.getIconsWithClassNames(state);
      assert.deepEqual(subject, []);
    });
  });

  describe('Requesting an existing icon', function () {
    it('will populate the local cache', async function () {
      store.dispatch(iconsActions.iconStartLoading(validIcons[0]));
      // Second request for the same icon shouldn't dspatch anything
      store.dispatch(iconsActions.iconStartLoading(validIcons[0]));
      // 3rd request for another icon should dispatch the loaded action
      store.dispatch(iconsActions.iconStartLoading(validIcons[1]));

      // Only 2 requests because only 2 different icons
      assert.lengthOf(instances, 2);
      instances.forEach((instance, i) => {
        assert.equal(instance.src, validIcons[i]);
        assert.equal(instance.referrerPolicy, 'no-referrer');
      });
      instances.forEach(instance => instance.onload());
      await waitForActions({ count: 2 });

      const state = store.getState();
      let subject = iconsAccessors.getIcons(state);
      assert.sameMembers([...subject], validIcons, 'Icons are in the cache');

      subject = iconsAccessors.getIconsWithClassNames(state);
      assert.deepEqual(
        subject,
        validIcons.map((icon, i) => ({ icon, className: expectedClasses[i] })),
        'We can request all icons with their class names'
      );

      validIcons.forEach((icon, i) => {
        subject = iconsAccessors.getIconForNode(state, { icon });
        assert.equal(subject, icon, 'We can get an icon for a specific node');

        subject = iconsAccessors.getIconClassNameForNode(state, { icon });
        assert.equal(subject, expectedClasses[i], 'We can get a class name for a specific node');
      });
    });
  });

  describe('Requesting a non-existing image', function () {
    it('will not populate the local cache', async function () {
      store.dispatch(iconsActions.iconStartLoading(invalidIcon));
      assert.lengthOf(instances, 1);
      instances[0].onerror();

      await waitForActions();

      const state = store.getState();
      let subject = iconsAccessors.getIcons(state);
      assert.deepEqual([...subject], [], 'Errored icons are not in the cache');

      subject = iconsAccessors.getIconForNode(state, { icon: invalidIcon });
      assert.isNull(subject, 'Errored icons should not be found in the cache');

      subject = iconsAccessors.getIconClassNameForNode(state, { icon: invalidIcon });
      assert.isNull(subject, 'Errored icons should not yield a class name');

      subject = iconsAccessors.getIconsWithClassNames(state);
      assert.deepEqual(subject, [], 'Errores icons are not in the cache');
    });
  });
});

