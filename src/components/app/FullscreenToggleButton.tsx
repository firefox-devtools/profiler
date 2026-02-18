/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import classNames from 'classnames';

import { getIsBottomBoxFullscreen } from 'firefox-profiler/selectors/url-state';
import { toggleBottomBoxFullscreen } from 'firefox-profiler/actions/profile-view';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import { Localized } from '@fluent/react';

type StateProps = {
  readonly isBottomBoxFullscreen: boolean;
};

type DispatchProps = {
  readonly toggleBottomBoxFullscreen: typeof toggleBottomBoxFullscreen;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class FullscreenToggleButtonImpl extends React.PureComponent<Props> {
  _onClick = () => {
    this.props.toggleBottomBoxFullscreen();
  };

  override render() {
    const { isBottomBoxFullscreen } = this.props;

    return isBottomBoxFullscreen ? (
      <Localized id="BottomBox--hide-fullscreen" attrs={{ title: true }}>
        <button
          className={classNames(
            'bottom-fullscreen-hide-button',
            'photon-button',
            'photon-button-ghost',
            'photon-button-ghost--checked'
          )}
          title="Exit fullscreen"
          type="button"
          onClick={this._onClick}
        />
      </Localized>
    ) : (
      <Localized id="BottomBox--show-fullscreen" attrs={{ title: true }}>
        <button
          className={classNames(
            'bottom-fullscreen-show-button',
            'photon-button',
            'photon-button-ghost'
          )}
          title="Show fullscreen"
          type="button"
          onClick={this._onClick}
        />
      </Localized>
    );
  }
}

export const FullscreenToggleButton = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    isBottomBoxFullscreen: getIsBottomBoxFullscreen(state),
  }),
  mapDispatchToProps: {
    toggleBottomBoxFullscreen,
  },
  component: FullscreenToggleButtonImpl,
});
