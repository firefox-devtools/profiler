/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';

import { Warning } from '../shared/Warning';

const LOCAL_STORAGE_KEY = 'profileServerMigrationNoticeDismissed2020';

type State = {|
  wasDismissedInThePast: boolean,
|};

export class DowntimeWarning extends PureComponent<{||}, State> {
  state = {
    wasDismissedInThePast: !!localStorage.getItem(LOCAL_STORAGE_KEY),
  };

  _onDowntimeActionClick() {
    window.open('/docs/#/./cloud-migration', '_blank');
  }

  _onClose() {
    localStorage.setItem(LOCAL_STORAGE_KEY, 'dismissed');
  }

  render() {
    // Because this code is planned to be only temporary, let's skip it in tests.
    if (process.env.NODE_ENV === 'test') {
      return null;
    }

    const currentDate = new Date();
    const feb23Date = new Date(Date.UTC(2020, 1, 23));
    if (currentDate >= feb23Date) {
      return null;
    }

    const feb21Date = new Date(Date.UTC(2020, 1, 21));
    if (currentDate < feb21Date && this.state.wasDismissedInThePast) {
      return null;
    }

    return (
      <Warning
        message="The profiler will encounter some downtime on Feb 21 and 22."
        actionText="More information"
        actionTitle="Consult more information about the downtime (opens a new tab)"
        actionOnClick={this._onDowntimeActionClick}
        onClose={this._onClose}
      />
    );
  }
}
