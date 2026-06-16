/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';

import { Provider } from 'react-redux';
import { SettingsMenu } from 'firefox-profiler/components/app/SettingsMenu';
import { AppLocalizationProvider } from 'firefox-profiler/components/app/AppLocalizationProvider';

import { blankStore } from 'firefox-profiler/test/fixtures/stores';
import { fireFullClick } from 'firefox-profiler/test/fixtures/utils';
import { render, screen, fireEvent } from '@testing-library/react';

beforeEach(() => {
  // Serve locale files from the filesystem so the AppLocalizationProvider can
  // load translations during tests that switch languages.
  const fetchUrlRe = /\/locales\/(?<language>[^/]+)\/app.ftl$/;
  window.fetchMock.catch(404).get(fetchUrlRe, ({ url }: { url: string }) => {
    const matchUrlResult = fetchUrlRe.exec(url);
    if (matchUrlResult) {
      const { language } = matchUrlResult.groups!;
      const path = `locales/${language}/app.ftl`;
      if (fs.existsSync(path)) {
        return fs.readFileSync(path);
      }
    }

    return 404;
  });
});

afterEach(function () {
  localStorage.clear();
});

function setup() {
  const store = blankStore();
  return render(
    <Provider store={store}>
      <AppLocalizationProvider>
        <SettingsMenu />
      </AppLocalizationProvider>
    </Provider>
  );
}

async function openMenu() {
  // Find the cog button and wait for the panel to open in a
  // language-agnostic way: before the menu opens there is only a single
  // button, and the language switcher combobox only appears once the panel
  // is shown. This avoids depending on localized label text.
  const button = await screen.findByRole('button');
  fireFullClick(button);
  await screen.findByRole('combobox');
}

it('renders the cog button in its closed state', async () => {
  setup();
  expect(
    await screen.findByRole('button', { name: 'Settings' })
  ).toBeInTheDocument();
  expect(screen.queryByText('Legal')).not.toBeInTheDocument();
});

it('opens the panel when the cog button is clicked', async () => {
  setup();
  await openMenu();
  expect(screen.getByText('Documentation')).toBeInTheDocument();
  expect(screen.getByText('Legal')).toBeInTheDocument();
  expect(screen.getByText('Privacy')).toBeInTheDocument();
  expect(screen.getByText('Cookies')).toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Change language' })
  ).toBeInTheDocument();
});

it('renders the open panel correctly', async () => {
  setup();
  await openMenu();
  expect(document.body).toMatchSnapshot();
});

it('makes it possible to switch the language and persists it', async () => {
  setup();
  await openMenu();

  const select = await screen.findByRole('combobox', {
    name: 'Change language',
  });
  const option: HTMLOptionElement = screen.getByRole('option', {
    name: 'Deutsch',
  }) as any;
  option.selected = true;
  fireEvent.change(select);
  expect(localStorage.getItem('requestedLocales')).toBe(JSON.stringify(['de']));
});

it('uses the previously requested locale at startup', async () => {
  localStorage.setItem('requestedLocales', JSON.stringify(['fr']));
  setup();
  await openMenu();

  const option: HTMLOptionElement = (await screen.findByRole('option', {
    name: 'Français',
  })) as any;
  expect(option.selected).toBeTrue();
});
