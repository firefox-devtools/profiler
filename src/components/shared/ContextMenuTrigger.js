/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import { ContextMenuTrigger as ReactContextMenuTrigger } from 'react-contextmenu';
import type { MixedObject } from 'firefox-profiler/types';

export class ContextMenuTrigger extends PureComponent<MixedObject> {
  render() {
    return <ReactContextMenuTrigger holdToDisplay={-1} {...this.props} />;
  }
}
