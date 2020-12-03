/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { MenuButtons } from '../../components/app/MenuButtons';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { stateFromLocation } from '../../app-logic/url-handling';
import { ensureExists } from '../../utils/flow';
import { fireFullClick } from '../fixtures/utils';

describe('<Permalink>', function() {
  function setup(search = '', injectedUrlShortener) {
    jest.useFakeTimers();

    const store = storeWithProfile();
    const shortUrl = 'http://example.com/fake-short-url';
    const shortUrlPromise = Promise.resolve(shortUrl);

    if (!injectedUrlShortener) {
      injectedUrlShortener = () => shortUrlPromise;
    }
    store.dispatch({
      type: 'UPDATE_URL_STATE',
      newUrlState: stateFromLocation({
        pathname: '/public/fakehash',
        search,
        hash: '',
      }),
    });

    const originalState = store.getState();

    const renderResult = render(
      <Provider store={store}>
        <MenuButtons injectedUrlShortener={injectedUrlShortener} />
      </Provider>
    );

    const { queryByTestId, getByText } = renderResult;
    const getPermalinkButton = () => getByText('Permalink');
    const queryInput = () => queryByTestId('MenuButtonsPermalink-input');
    const clickAndRunTimers = where => {
      fireFullClick(where);
      jest.runAllTimers();
    };

    return {
      ...store,
      ...renderResult,
      getPermalinkButton,
      clickAndRunTimers,
      shortUrl,
      shortUrlPromise,
      queryInput,
      originalState,
    };
  }

  it('can render the permalink button', function() {
    const { getPermalinkButton, queryInput } = setup();
    getPermalinkButton();
    expect(queryInput()).toBeFalsy();
  });

  it('can click the permalink button', async function() {
    const {
      getPermalinkButton,
      queryInput,
      shortUrl,
      shortUrlPromise,
      clickAndRunTimers,
    } = setup();
    clickAndRunTimers(getPermalinkButton());
    await shortUrlPromise;
    const input = ensureExists(
      queryInput(),
      'Unable to find the permalink input text field'
    );
    expect(input).toHaveAttribute('value', shortUrl);
  });
});
