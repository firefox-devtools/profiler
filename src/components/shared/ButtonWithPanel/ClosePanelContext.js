/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// This is a very simple context that's used for communication between the panel
// and its content, so that it can be closed from actions in inner content.

import * as React from 'react';

export const ClosePanelContext: React.Context<
  (void) => mixed
> = React.createContext(() => {});
