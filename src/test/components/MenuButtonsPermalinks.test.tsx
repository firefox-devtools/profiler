/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { MenuButtons } from '../../components/app/MenuButtons';
import { storeWithProfile } from '../fixtures/stores';
import { stateFromLocation } from '../../app-logic/url-handling';
import { ensureExists } from '../../utils/flow';
import { fireFullClick } from '../fixtures/utils';

describe('<Permalink>', function () {
  function setup(
    search = '',
    injectedUrlShortener?: (url: string) => Promise<string>
  ) {
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

    const getPermalinkButton = () => screen.getByText('Permalink');
    const queryInput = () => screen.queryByTestId('MenuButtonsPermalink-input');
    const clickAndRunTimers = (where: HTMLElement) => {
      fireFullClick(where);
      act(() => {
        jest.runAllTimers();
      });
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

  it('can render the permalink button', function () {
    const { getPermalinkButton, queryInput } = setup();
    getPermalinkButton();
    expect(queryInput()).toBeFalsy();
  });

  it('can click the permalink button', async function () {
    const {
      getPermalinkButton,
      queryInput,
      shortUrl,
      shortUrlPromise,
      clickAndRunTimers,
    } = setup();
    clickAndRunTimers(getPermalinkButton());
    await act(() => shortUrlPromise);
    const input = ensureExists(
      queryInput(),
      'Unable to find the permalink input text field'
    );
    expect(input).toHaveValue(shortUrl);
  });
});
