/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

// Create a context for L10n functionality
export type L10nContextType = {
  primaryLocale: string | null;
  requestL10n: (locales: string[]) => void;
};

export const L10nContext: React.Context<L10nContextType | null> =
  React.createContext(null as L10nContextType | null);
