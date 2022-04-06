/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { render } from '@testing-library/react';
import fs from 'fs';
import { LocalizationProvider, ReactLocalization } from '@fluent/react';
import { lazilyParsedBundles } from '../../app-logic/l10n';

function customRender(children: React$Element<any>, ...args: any) {
  const messages = fs.readFileSync('./locales/en-US/app.ftl', 'UTF-8');
  const bundles = lazilyParsedBundles([['en-US', messages]]);
  const localization = new ReactLocalization(bundles);

  // Silence React 18 errors as it's too noisy in the test output. Don't forget
  // to remove it when removing legacyRoot below!
  // Other files such as src/test/components/UrlManager.test.js also mock
  // console.error and might need to be changed in the same time.
  if (!console.error._isMockFunction) {
    const originalConsoleError = console.error.bind(console);
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      if (/ReactDOM.render is no longer supported in React 18/.test(args[0])) {
        return;
      }
      originalConsoleError(...args);
    });
  }

  const renderResult = render(
    <LocalizationProvider l10n={localization}>{children}</LocalizationProvider>,
    {
      // Stick to the React 17 behavior for now. Don't forget to remove the
      // mock for console.error above when removing this!
      legacyRoot: true,
      ...args,
    }
  );

  // Rerender function should also wrap the children with the LocalizationProvider.
  const rerender = (children: React$Element<any>, ...args: any) =>
    renderResult.rerender(
      <LocalizationProvider l10n={localization}>
        {children}
      </LocalizationProvider>,
      ...args
    );

  return ({
    ...renderResult,
    rerender,
  }: typeof renderResult);
}

// Reexport everything
export * from '@testing-library/react';

// override render method
export { customRender as render };
