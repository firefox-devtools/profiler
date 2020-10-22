/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import { ContextMenuTrigger } from 'react-contextmenu';
export default class MyContextMenuTrigger extends PureComponent<{}> {
  render() {
    return <ContextMenuTrigger holdToDisplay={-1} {...this.props} />;
  }
}
