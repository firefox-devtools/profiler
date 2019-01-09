/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { render, fireEvent, cleanup } from 'react-testing-library';

import CompareHome from '../../components/app/CompareHome';
import { getProfilesToCompare } from '../../selectors/url-state';

import { blankStore } from '../fixtures/stores';

describe('app/CompareHome', () => {
  afterEach(cleanup);

  it('renders properly', () => {
    const store = blankStore();
    const { container, getByLabelText, getByText } = render(
      <Provider store={store}>
        <CompareHome />
      </Provider>
    );
    expect(container.firstChild).toMatchSnapshot();

    fireEvent.change(getByLabelText(/Profile 1/), {
      target: { value: 'www.url11.com' },
    });
    fireEvent.change(getByLabelText(/Profile 2/), {
      target: { value: 'www.url12.com' },
    });
    const retrieveButton = getByText(
      (content, element) =>
        element instanceof HTMLInputElement && /Retrieve/.test(element.value)
    );
    fireEvent.click(retrieveButton);

    expect(getProfilesToCompare(store.getState())).toEqual([
      'http://www.url11.com',
      'http://www.url12.com',
    ]);
  });
});
