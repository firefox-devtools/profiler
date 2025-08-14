/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';
import { fireEvent } from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { CompareHome } from '../../components/app/CompareHome';
import { getProfilesToCompare } from '../../selectors/url-state';

import { blankStore } from '../fixtures/stores';
import { fireFullClick } from '../fixtures/utils';

describe('app/CompareHome', () => {
  function setup() {
    const store = blankStore();
    const renderResult = render(
      <Provider store={store}>
        <CompareHome />
      </Provider>
    );

    return { ...renderResult, getState: store.getState };
  }

  it('matches the snapshot', () => {
    const { container } = setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('starts loading profiles after user action', () => {
    const { getByLabelText, getByText, getState } = setup();

    fireEvent.change(getByLabelText(/Profile 1/), {
      target: { value: 'http://www.url11.com' },
    });
    fireEvent.change(getByLabelText(/Profile 2/), {
      target: { value: 'http://www.url12.com' },
    });
    const retrieveButton = getByText(/Retrieve/);
    fireFullClick(retrieveButton);

    expect(getProfilesToCompare(getState())).toEqual([
      'http://www.url11.com',
      'http://www.url12.com',
    ]);
  });
});
