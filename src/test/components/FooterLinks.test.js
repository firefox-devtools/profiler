/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import fs from 'fs';
import * as React from 'react';
import { Provider } from 'react-redux';
import { FooterLinks } from 'firefox-profiler/components/app/FooterLinks';
import { AppLocalizationProvider } from 'firefox-profiler/components/app/AppLocalizationProvider';

import { blankStore } from 'firefox-profiler/test/fixtures/stores';
import { render, screen, fireEvent } from '@testing-library/react';
import { coerceMatchingShape } from 'firefox-profiler/utils/flow';

beforeEach(() => {
  // Implement the fetch operation for local language files, so that we can test
  // switching languages.
  const fetchUrlRe = /^\/locales\/(?<language>[^/]+)\/app.ftl$/;
  (window: any).fetch = jest.fn().mockImplementation((fetchUrl: string) => {
    const matchUrlResult = fetchUrlRe.exec(fetchUrl);
    if (matchUrlResult) {
      // $FlowExpectError Our Flow doesn't know about named groups.
      const { language } = matchUrlResult.groups;
      const path = `locales/${language}/app.ftl`;
      if (fs.existsSync(path)) {
        const response = (({
          ok: true,
          status: 200,
          headers: {
            get: () => 'text/plain',
          },
          text: () => Promise.resolve(fs.readFileSync(path)),
        }: any): Response);
        return Promise.resolve(response);
      }
    }
    return Promise.reject(
      coerceMatchingShape<Response>({
        ok: false,
        status: 404,
        statusText: 'Not found',
      })
    );
  });
});

afterEach(function () {
  delete window.fetch;
});

async function setup() {
  const store = blankStore();
  render(
    <Provider store={store}>
      <AppLocalizationProvider>
        <FooterLinks />
      </AppLocalizationProvider>
    </Provider>
  );
  await screen.findByText(/Legal/);
}

it('correctly renders the FooterLinks component', async () => {
  await setup();
  expect(document.body).toMatchSnapshot();
});

it('can hide the footer links', async () => {
  await setup();
  expect(screen.getByText(/Privacy/)).toBeInTheDocument();
  const closeButton = screen.getByRole('button', {
    name: 'Hide footer links',
  });
  fireEvent.click(closeButton);
  expect(screen.queryByText(/Privacy/)).not.toBeInTheDocument();
});

it('makes it possible to switch the language', async () => {
  await setup();

  // Select the german language
  const select = screen.getByRole('combobox', { name: 'Change language' });
  const option: HTMLOptionElement = (screen.getByRole('option', {
    name: 'Deutsch',
  }): any);
  option.selected = true;
  fireEvent.change(select);
  expect(await screen.findByText('Rechtliches')).toBeInTheDocument();
});
