/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { fireFullClick } from '../fixtures/utils';
import { ensureExists } from '../../utils/flow';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import {
  getProfileFromTextSamples,
  addExtraInfoToProfile,
} from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import { MetaInfoPanel } from '../../components/app/MenuButtons/MetaInfo';

describe('app/MetaInfo', function () {
  function setup(store) {
    const renderResult = render(
      <Provider store={store}>
        <MetaInfoPanel />
      </Provider>
    );

    return {
      ...store,
      ...renderResult,
    };
  }

  function setupForMoreInfoButton(addExtraInfos: boolean = false) {
    const initialProfile = getProfileFromTextSamples('A').profile;
    const profile = addExtraInfos
      ? addExtraInfoToProfile(initialProfile)
      : initialProfile;
    return setup(storeWithProfile(profile));
  }

  describe('More Info section', function () {
    it('opens more info section if clicked', () => {
      const { container } = setupForMoreInfoButton(true);

      expect(container).toMatchSnapshot();

      const summary = ensureExists(container.querySelector('.moreInfoSummary'));

      fireFullClick(summary);
      expect(container).toMatchSnapshot();
    });

    it("doesn't show the more info button if there isn't any extra info", () => {
      const { container } = setupForMoreInfoButton(false);
      expect(container).toMatchSnapshot();

      const summary = container.querySelector('.moreInfoSummary');
      expect(summary).toBeNull();
    });
  });
});
