/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import classNames from 'classnames';

import { getAssemblyViewIsOpen } from 'firefox-profiler/selectors/url-state';
import {
  openAssemblyView,
  closeAssemblyView,
} from 'firefox-profiler/actions/profile-view';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import { Localized } from '@fluent/react';

type StateProps = {
  readonly assemblyViewIsOpen: boolean;
};

type DispatchProps = {
  readonly openAssemblyView: typeof openAssemblyView;
  readonly closeAssemblyView: typeof closeAssemblyView;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class AssemblyViewToggleButtonImpl extends React.PureComponent<Props> {
  _onClick = () => {
    if (this.props.assemblyViewIsOpen) {
      this.props.closeAssemblyView();
    } else {
      this.props.openAssemblyView();
    }
  };

  override render() {
    const { assemblyViewIsOpen } = this.props;

    return assemblyViewIsOpen ? (
      <Localized id="AssemblyView--hide-button" attrs={{ title: true }}>
        <button
          className={classNames(
            'bottom-assembly-button',
            'photon-button',
            'photon-button-ghost',
            'photon-button-ghost--checked'
          )}
          title="Hide the assembly view"
          type="button"
          onClick={this._onClick}
        />
      </Localized>
    ) : (
      <Localized id="AssemblyView--show-button" attrs={{ title: true }}>
        <button
          className={classNames(
            'bottom-assembly-button',
            'photon-button',
            'photon-button-ghost'
          )}
          title="Show the assembly view"
          type="button"
          onClick={this._onClick}
        />
      </Localized>
    );
  }
}

export const AssemblyViewToggleButton = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    assemblyViewIsOpen: getAssemblyViewIsOpen(state),
  }),
  mapDispatchToProps: {
    openAssemblyView,
    closeAssemblyView,
  },
  component: AssemblyViewToggleButtonImpl,
});
