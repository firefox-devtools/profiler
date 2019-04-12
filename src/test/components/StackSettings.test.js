/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import * as React from 'react';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';
import StackSettings from '../../components/shared/StackSettings';
import { storeWithProfile } from '../fixtures/stores';
import {
  getImplementationFilter,
  getCurrentSearchString,
} from '../../selectors/url-state';

describe('StackSettings', function() {
  function setup() {
    jest.useFakeTimers();
    const store = storeWithProfile();

    const renderResult = render(
      <Provider store={store}>
        <StackSettings />
      </Provider>
    );

    return {
      ...renderResult,
      ...store,
    };
  }

  it('matches the snapshot', () => {
    const { container } = setup();
    expect(container).toMatchSnapshot();
  });

  it('can change the implementation filter to JavaScript', function() {
    const { getByText, getState } = setup();
    expect(getImplementationFilter(getState())).toEqual('combined');
    getByText('JavaScript').click();
    expect(getImplementationFilter(getState())).toEqual('js');
  });

  it('can change the implementation filter to Native', function() {
    const { getByText, getState } = setup();
    expect(getImplementationFilter(getState())).toEqual('combined');
    getByText('Native').click();
    expect(getImplementationFilter(getState())).toEqual('cpp');
  });

  it('can change the implementation filter to Native', function() {
    const { getByText, getState } = setup();
    getByText('Native').click();
    expect(getImplementationFilter(getState())).toEqual('cpp');
    getByText('All stacks').click();
    expect(getImplementationFilter(getState())).toEqual('combined');
  });

  it('can change the search', function() {
    const { getByLabelText, getState } = setup();
    expect(getCurrentSearchString(getState())).toEqual('');
    fireEvent.change(getByLabelText(/Filter stacks/), {
      target: { value: 'some search' },
    });
    jest.runAllTimers();
    expect(getCurrentSearchString(getState())).toEqual('some search');
  });
});
