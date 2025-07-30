/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import React, { PureComponent } from 'react';

import './EmptyReasons.css';

type Props = {
  readonly viewName: string,
  readonly threadName: string,
  readonly reason: string,
};

/**
 * This component tells why a panel is empty and display a friendly message to
 * the end user.
 */
export class EmptyReasons extends PureComponent<Props> {
  render() {
    const { viewName, reason, threadName } = this.props;

    return (
      <div className="EmptyReasons">
        <h3>
          The {viewName} is empty for “{threadName}”
        </h3>
        <p>{reason}</p>
      </div>
    );
  }
}
