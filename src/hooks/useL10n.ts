/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { L10nContext } from 'firefox-profiler/contexts/L10nContext';
import type { L10nContextType } from 'firefox-profiler/contexts/L10nContext';

// Hook to use L10n context
export function useL10n(): L10nContextType {
  const context = React.useContext(L10nContext);
  if (!context) {
    throw new Error('useL10n must be used within an AppLocalizationProvider');
  }
  return context;
}
