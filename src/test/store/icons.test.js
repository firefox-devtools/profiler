/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { createImageMock } from '../fixtures/mocks/image';
import { blankStore } from '../fixtures/stores';
import * as iconsAccessors from '../../selectors/icons';
import * as iconsActions from '../../actions/icons';
import type { CallNodeDisplayData } from 'firefox-profiler/types';

describe('actions/icons', function() {
  const validIcons = [
    'https://valid.icon1.example.org/favicon.ico',
    'https://valid.icon2.example.org/favicon.ico',
  ];
  const expectedClasses = [
    'https___valid_icon1_example_org_favicon_ico',
    'https___valid_icon2_example_org_favicon_ico',
  ];
  const invalidIcon = 'https://invalid.icon.example.org/favicon.ico';

  let imageInstances: Image[] = [];

  beforeEach(() => {
    const mock = createImageMock();
    imageInstances = mock.instances;
    (window: any).Image = mock.Image;
  });

  afterEach(() => {
    delete (window: any).Image;
    imageInstances = [];
  });

  function _createCallNodeWithIcon(icon: string): CallNodeDisplayData {
    return {
      total: '0',
      totalWithUnit: '0 ms',
      totalPercent: '0',
      self: '0',
      selfWithUnit: '0 ms',
      name: 'icon',
      lib: 'icon',
      isFrameLabel: false,
      categoryName: 'Other',
      categoryColor: 'grey',
      icon,
      iconSrc: 'https://edition.cnn.com/favicon.ico',
      ariaLabel: 'fake aria label',
    };
  }

  describe('With the initial state', function() {
    function getInitialState() {
      return blankStore().getState();
    }

    it('getIcons return an empty set', function() {
      const initialState = iconsAccessors.getIcons(getInitialState());
      expect(initialState).toBeInstanceOf(Set);
      expect(initialState.size).toEqual(0);
    });

    it('getIconClassName returns an empty string for any icon', function() {
      const subject = iconsAccessors.getIconClassName(
        getInitialState(),
        _createCallNodeWithIcon(validIcons[0]).icon
      );
      expect(subject).toBe('');
    });

    it('getIconsWithClassNames returns an empty array', function() {
      const subject = iconsAccessors.getIconsWithClassNames(getInitialState());
      expect(subject).toEqual([]);
    });
  });

  describe('Requesting an existing icon', function() {
    it('will populate the local cache', async function() {
      const { dispatch, getState } = blankStore();
      const promises = [
        dispatch(iconsActions.iconStartLoading(validIcons[0])),
        // Second request for the same icon shouldn't dspatch anything
        dispatch(iconsActions.iconStartLoading(validIcons[0])),
        // 3rd request for another icon should dispatch the loaded action
        dispatch(iconsActions.iconStartLoading(validIcons[1])),
      ];

      // Only 2 requests because only 2 different icons
      expect(imageInstances.length).toBe(2);
      imageInstances.forEach((instance, i) => {
        expect(instance.src).toEqual(validIcons[i]);
        expect(instance.referrerPolicy).toEqual('no-referrer');
      });
      imageInstances.forEach(instance => (instance: any).onload());
      await Promise.all(promises);

      const state = getState();
      let subject = iconsAccessors.getIcons(state);
      expect([...subject]).toEqual(validIcons);

      subject = iconsAccessors.getIconsWithClassNames(state);
      expect(subject).toEqual(
        validIcons.map((icon, i) => ({ icon, className: expectedClasses[i] }))
      );

      validIcons.forEach((icon, i) => {
        subject = iconsAccessors.getIconClassName(
          state,
          _createCallNodeWithIcon(icon).icon
        );
        expect(subject).toEqual(expectedClasses[i]);
      });
    });
  });

  describe('Requesting a non-existing image', function() {
    it('will not populate the local cache', async function() {
      const { dispatch, getState } = blankStore();
      const actionPromise = dispatch(
        iconsActions.iconStartLoading(invalidIcon)
      );
      expect(imageInstances.length).toBe(1);
      (imageInstances[0]: any).onerror();

      await actionPromise;

      const state = getState();
      let subject = iconsAccessors.getIcons(state);
      expect([...subject]).toEqual([]);

      subject = iconsAccessors.getIconClassName(
        state,
        _createCallNodeWithIcon(invalidIcon).icon
      );
      expect(subject).toBe('');

      subject = iconsAccessors.getIconsWithClassNames(state);
      expect(subject).toEqual([]);
    });
  });
});
