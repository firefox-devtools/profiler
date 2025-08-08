/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { ProfileName } from '../../components/app/ProfileName';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { getProfileNameFromUrl } from 'firefox-profiler/selectors';
import { changeProfileName } from 'firefox-profiler/actions/profile-view';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';

describe('ProfileName', function () {
  const defaultName = 'Firefox – macOS 10.14';

  function setup(profileName?: string) {
    const { profile } = getProfileFromTextSamples('A');
    Object.assign(profile.meta, {
      oscpu: 'Intel Mac OS X 10.14',
      platform: 'Macintosh',
      toolkit: 'cocoa',
    });

    const store = storeWithProfile(profile);
    if (profileName) {
      store.dispatch(changeProfileName(profileName));
    }
    const renderResult = render(
      <Provider store={store}>
        <ProfileName />
      </Provider>
    );
    return { ...store, ...renderResult };
  }

  function nullProfile() {
    const { profile } = getProfileFromTextSamples('A');
    Object.assign(profile.meta, {
      oscpu: '',
      platform: '',
      toolkit: '',
      product: '',
    });

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileName />
      </Provider>
    );
    return { ...store, ...renderResult };
  }

  it('matches the snapshot', function () {
    const { container } = setup();
    expect(container).toMatchSnapshot();
  });

  it('has a default name', function () {
    const { getByText } = setup();
    expect(getByText(defaultName)).toBeInTheDocument();
  });

  it('can edit the name', function () {
    const { getByText, queryByText, getByDisplayValue, getState } = setup();
    const button = getByText(defaultName);

    // Test the default state.
    expect(getByText(defaultName)).toBeInTheDocument();
    expect(getProfileNameFromUrl(getState())).toBe(null);

    // Click the button to activate it.
    fireEvent.click(button);
    const input = getByDisplayValue(defaultName);

    expect(queryByText('Custom name')).not.toBeInTheDocument();

    // Change the input, and blur it.
    fireEvent.change(input, { target: { value: 'Custom name' } });
    fireEvent.blur(input);

    expect(getByText('Custom name')).toBeInTheDocument();
    expect(getProfileNameFromUrl(getState())).toBe('Custom name');
  });

  it('sends analytics', () => {
    withAnalyticsMock(() => {
      const { getByText, getByDisplayValue } = setup();
      const button = getByText(defaultName);
      fireEvent.click(button);
      const input = getByDisplayValue(defaultName);
      fireEvent.change(input, { target: { value: 'Custom name' } });
      fireEvent.blur(input);

      expect(self.ga).toHaveBeenCalledWith('send', {
        eventAction: 'change profile name',
        eventCategory: 'profile',
        hitType: 'event',
      });
    });
  });

  it('will use a url-provided profile name', function () {
    const { getByText } = setup('Custom name from URL');

    expect(getByText('Custom name from URL')).toBeInTheDocument();
  });

  it('shows UnitledProfile when profile has no name', () => {
    const { getByText } = nullProfile();

    expect(getByText('Untitled profile')).toBeInTheDocument();
  });
});
