/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import { Warning } from '../shared/Warning';
import explicitConnect from '../../utils/connect';
import { getMeta } from '../../selectors/profile';

import type { ProfileMeta } from 'firefox-profiler/types';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {
  readonly meta: ProfileMeta,
};

type Props = ConnectedProps<{}, StateProps, {}>;
class DebugWarningImp extends PureComponent<Props> {
  render() {
    const { meta } = this.props;

    return (
      <>
        {meta.debug ? (
          <Localized
            id="DebugWarning--warning-message"
            attrs={{ message: true }}
          >
            <Warning message="This profile was recorded in a build without release optimizations. Performance observations might not apply to the release population." />
          </Localized>
        ) : null}
      </>
    );
  }
}

export const DebugWarning = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state) => ({
    meta: getMeta(state),
  }),
  component: DebugWarningImp,
});
