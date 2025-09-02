/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from '@testing-library/react';
import fs from 'fs';
import { LocalizationProvider, ReactLocalization } from '@fluent/react';
import { lazilyParsedBundles } from '../../app-logic/l10n';

export type CustomRenderResult = ReturnType<typeof customRender>;

function customRender(children: React.ReactElement<any>, ...args: any) {
  const messages = fs.readFileSync('./locales/en-US/app.ftl', 'utf8');
  const bundles = lazilyParsedBundles([['en-US', messages]]);
  const localization = new ReactLocalization(bundles);

  const renderResult = render(
    <LocalizationProvider l10n={localization}>{children}</LocalizationProvider>,
    {
      ...args,
    }
  );

  // Rerender function should also wrap the children with the LocalizationProvider.
  const rerender = (children: React.ReactElement<any>, ..._args: any) =>
    renderResult.rerender(
      <LocalizationProvider l10n={localization}>
        {children}
      </LocalizationProvider>
    );

  return {
    ...renderResult,
    rerender,
  };
}

// Reexport everything
export * from '@testing-library/react';

// override render method
export { customRender as render };
export type { CustomRenderResult as RenderResult };
