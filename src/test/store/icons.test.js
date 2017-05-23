/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createImageMock } from '../fixtures/mocks/image';
import { blankStore } from '../fixtures/stores';
import * as iconsAccessors from '../../content/reducers/icons';
import * as iconsActions from '../../content/actions/icons';

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
      expect(initialState).toBeInstanceOf(Set);
      expect(initialState.size).toEqual(0);
    });

    it('getIconForNode returns null for any icon', function () {
      const subject = iconsAccessors.getIconForNode(state, { icon: validIcons[0] });
      expect(subject).toBeNull();
    });

    it('getIconClassNameForNode returns null for any icon', function () {
      const subject = iconsAccessors.getIconClassNameForNode(state, { icon: validIcons[0] });
      expect(subject).toBeNull();
    });

    it('getIconsWithClassNames returns an empty array', function () {
      const subject = iconsAccessors.getIconsWithClassNames(state);
      expect(subject).toEqual([]);
    });
  });

  describe('Requesting an existing icon', function () {
    it('will populate the local cache', async function () {
      const promises = [
        store.dispatch(iconsActions.iconStartLoading(validIcons[0])),
        // Second request for the same icon shouldn't dspatch anything
        store.dispatch(iconsActions.iconStartLoading(validIcons[0])),
        // 3rd request for another icon should dispatch the loaded action
        store.dispatch(iconsActions.iconStartLoading(validIcons[1])),
      ];

      // Only 2 requests because only 2 different icons
      expect(instances.length).toBe(2);
      instances.forEach((instance, i) => {
        expect(instance.src).toEqual(validIcons[i]);
        expect(instance.referrerPolicy).toEqual('no-referrer');
      });
      instances.forEach(instance => instance.onload());
      await Promise.all(promises);

      const state = store.getState();
      let subject = iconsAccessors.getIcons(state);
      expect([...subject]).toEqual(validIcons);

      subject = iconsAccessors.getIconsWithClassNames(state);
      expect(subject).toEqual(validIcons.map((icon, i) => ({ icon, className: expectedClasses[i] })));

      validIcons.forEach((icon, i) => {
        subject = iconsAccessors.getIconForNode(state, { icon });
        expect(subject).toEqual(icon);

        subject = iconsAccessors.getIconClassNameForNode(state, { icon });
        expect(subject).toEqual(expectedClasses[i]);
      });
    });
  });

  describe('Requesting a non-existing image', function () {
    it('will not populate the local cache', async function () {
      const actionPromise = store.dispatch(iconsActions.iconStartLoading(invalidIcon));
      expect(instances.length).toBe(1);
      instances[0].onerror();

      await actionPromise;

      const state = store.getState();
      let subject = iconsAccessors.getIcons(state);
      expect([...subject]).toEqual([]);

      subject = iconsAccessors.getIconForNode(state, { icon: invalidIcon });
      expect(subject).toBeNull();

      subject = iconsAccessors.getIconClassNameForNode(state, { icon: invalidIcon });
      expect(subject).toBeNull();

      subject = iconsAccessors.getIconsWithClassNames(state);
      expect(subject).toEqual([]);
    });
  });
});
