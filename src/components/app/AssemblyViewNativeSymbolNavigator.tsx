/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import classNames from 'classnames';

import {
  getAssemblyViewCurrentNativeSymbolEntryIndex,
  getAssemblyViewNativeSymbolEntryCount,
} from 'firefox-profiler/selectors/url-state';
import { changeAssemblyViewNativeSymbolEntryIndex } from 'firefox-profiler/actions/profile-view';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import { Localized } from '@fluent/react';

type StateProps = {
  readonly assemblyViewCurrentNativeSymbolEntryIndex: number | null;
  readonly assemblyViewNativeSymbolEntryCount: number;
};

type DispatchProps = {
  readonly changeAssemblyViewNativeSymbolEntryIndex: typeof changeAssemblyViewNativeSymbolEntryIndex;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class AssemblyViewNativeSymbolNavigatorImpl extends React.PureComponent<Props> {
  _onPreviousClick = () => {
    this._changeIndexBy(-1);
  };

  _onNextClick = () => {
    this._changeIndexBy(1);
  };

  _changeIndexBy(delta: number) {
    const {
      assemblyViewCurrentNativeSymbolEntryIndex: index,
      assemblyViewNativeSymbolEntryCount: count,
      changeAssemblyViewNativeSymbolEntryIndex,
    } = this.props;
    const newIndex = (index ?? 0) + delta;
    if (newIndex >= 0 && newIndex < count) {
      changeAssemblyViewNativeSymbolEntryIndex(newIndex);
    }
  }

  override render() {
    const {
      assemblyViewCurrentNativeSymbolEntryIndex: index,
      assemblyViewNativeSymbolEntryCount: count,
    } = this.props;

    if (index === null || count <= 1) {
      return null;
    }

    return (
      <>
        <h3 className="bottom-box-title-trailer">
          {index !== null && count > 1 ? `${index + 1} of ${count}` : ''}
        </h3>
        <Localized id="AssemblyView--prev-button" attrs={{ title: true }}>
          <button
            className={classNames(
              'bottom-prev-button',
              'photon-button',
              'photon-button-ghost'
            )}
            title="Previous"
            type="button"
            disabled={index <= 0}
            onClick={this._onPreviousClick}
          >
            ◀
          </button>
        </Localized>
        <Localized id="AssemblyView--next-button" attrs={{ title: true }}>
          <button
            className={classNames(
              'bottom-next-button',
              'photon-button',
              'photon-button-ghost'
            )}
            title="Next"
            type="button"
            disabled={index >= count - 1}
            onClick={this._onNextClick}
          >
            ▶
          </button>
        </Localized>
      </>
    );
  }
}

export const AssemblyViewNativeSymbolNavigator = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    assemblyViewCurrentNativeSymbolEntryIndex:
      getAssemblyViewCurrentNativeSymbolEntryIndex(state),
    assemblyViewNativeSymbolEntryCount:
      getAssemblyViewNativeSymbolEntryCount(state),
  }),
  mapDispatchToProps: {
    changeAssemblyViewNativeSymbolEntryIndex,
  },
  component: AssemblyViewNativeSymbolNavigatorImpl,
});
