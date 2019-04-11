/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import MenuButtons from '../../components/app/MenuButtons';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { stateFromLocation } from '../../app-logic/url-handling';
import { ensureExists } from '../../utils/flow';
import { getIsNewlyPublished } from '../../selectors/url-state';

describe('<Permalink>', function() {
  function setup(search = '', injectedUrlShortener) {
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

    return {
      ...store,
      ...renderResult,
      getPermalinkButton,
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
    } = setup();
    fireEvent.click(getPermalinkButton());
    await shortUrlPromise;
    const input = ensureExists(
      queryInput(),
      'Unable to find the permalink input text field'
    );
    expect(input.getAttribute('value')).toBe(shortUrl);
  });

  it('shows the permalink when visiting a published profile', async function() {
    const { queryInput, shortUrl, shortUrlPromise } = setup('?published');
    await shortUrlPromise;
    const input = ensureExists(
      queryInput(),
      'Unable to find the permalink input text field'
    );
    expect(input.getAttribute('value')).toBe(shortUrl);
  });

  it('resets the isNewlyPublishedState in the URL when mounted', async function() {
    const { originalState, getState } = setup('?published');
    expect(getIsNewlyPublished(originalState)).toBe(true);
    expect(getIsNewlyPublished(getState())).toBe(false);
  });
});
