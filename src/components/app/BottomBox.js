/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import classNames from 'classnames';

import { getSourceViewFile } from 'firefox-profiler/selectors/url-state';
import { closeBottomBox } from 'firefox-profiler/actions/profile-view';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import { Localized } from '@fluent/react';

import './BottomBox.css';

type StateProps = {|
  +sourceViewFile: string | null,
|};

type DispatchProps = {|
  +closeBottomBox: typeof closeBottomBox,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class BottomBoxImpl extends React.PureComponent<Props> {
  _onClickCloseButton = () => {
    this.props.closeBottomBox();
  };

  render() {
    const { sourceViewFile } = this.props;
    return (
      <div className="bottom-box">
        <div className="bottom-box-bar">
          <h3 className="bottom-box-title">
            {sourceViewFile === null
              ? '(no file selected)'
              : parseFileNameFromSymbolication(sourceViewFile).path}
          </h3>
          <Localized id="SourceView--close-button" attrs={{ title: true }}>
            <button
              className={classNames(
                'bottom-close-button',
                'photon-button',
                'photon-button-ghost'
              )}
              title="Close the source view"
              type="button"
              onClick={this._onClickCloseButton}
            />
          </Localized>
        </div>
        <div className="bottom-main" id="bottom-main"></div>
      </div>
    );
  }
}

export const BottomBox = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    sourceViewFile: getSourceViewFile(state),
  }),
  mapDispatchToProps: {
    closeBottomBox,
  },
  component: BottomBoxImpl,
});
