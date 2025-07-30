/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import {
  getProfileViewOptions,
  getSymbolicationStatus,
} from 'firefox-profiler/selectors/profile';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { RequestedLib } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './SymbolicationStatusOverlay.css';

function englishSgPlLibrary(count) {
  return count === 1 ? 'library' : 'libraries';
}

function englishListJoin(list) {
  switch (list.length) {
    case 0:
      return '';
    case 1:
      return list[0];
    default: {
      const allButLast = list.slice(0, list.length - 1);
      return allButLast.join(', ') + ' and ' + list[list.length - 1];
    }
  }
}

type StateProps = {
  +symbolicationStatus: string,
  +waitingForLibs: Set<RequestedLib>,
};

type Props = ConnectedProps<{}, StateProps, {}>;

class SymbolicationStatusOverlayImpl extends PureComponent<Props> {
  render() {
    const { symbolicationStatus, waitingForLibs } = this.props;
    if (symbolicationStatus === 'SYMBOLICATING') {
      if (waitingForLibs.size > 0) {
        const libNames = Array.from(waitingForLibs.values()).map(
          (lib) => lib.debugName
        );
        return (
          <div className="symbolicationStatusOverlay">
            <span className="symbolicationStatusOverlayThrobber" />
            {`Waiting for symbols for ${englishSgPlLibrary(
              libNames.length
            )} ${englishListJoin(libNames)}...`}
          </div>
        );
      }
      return (
        <div className="symbolicationStatusOverlay">
          <span className="symbolicationStatusOverlayThrobber" />
          Symbolicating call stacks...
        </div>
      );
    }
    return <div className="symbolicationStatusOverlay hidden" />;
  }
}

export const SymbolicationStatusOverlay = explicitConnect<
  {},
  StateProps,
  {},
>({
  mapStateToProps: (state) => ({
    symbolicationStatus: getSymbolicationStatus(state),
    waitingForLibs: getProfileViewOptions(state).waitingForLibs,
  }),
  component: SymbolicationStatusOverlayImpl,
});
