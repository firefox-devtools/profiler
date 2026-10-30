/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import classNames from 'classnames';

import {
  getGeneratedSourceViewIsOpen,
  getIsGeneratedSourceViewAvailable,
} from 'firefox-profiler/selectors/url-state';
import {
  openGeneratedSourceView,
  closeGeneratedSourceView,
} from 'firefox-profiler/actions/profile-view';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import { Localized } from '@fluent/react';

type StateProps = {
  readonly generatedSourceViewIsOpen: boolean;
  readonly isGeneratedSourceViewAvailable: boolean;
};

type DispatchProps = {
  readonly openGeneratedSourceView: typeof openGeneratedSourceView;
  readonly closeGeneratedSourceView: typeof closeGeneratedSourceView;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class GeneratedSourceViewToggleButtonImpl extends React.PureComponent<Props> {
  _onClick = () => {
    if (this.props.generatedSourceViewIsOpen) {
      this.props.closeGeneratedSourceView();
    } else {
      this.props.openGeneratedSourceView();
    }
  };

  override render() {
    const { generatedSourceViewIsOpen, isGeneratedSourceViewAvailable } =
      this.props;

    // Only offer this button for source-mapped functions. Most profiles don't
    // have source maps, so a permanently disabled button would be noise.
    if (!isGeneratedSourceViewAvailable) {
      return null;
    }

    return generatedSourceViewIsOpen ? (
      <Localized id="GeneratedSourceView--hide-button" attrs={{ title: true }}>
        <button
          className={classNames(
            'bottom-generated-source-button',
            'photon-button',
            'photon-button-ghost',
            'photon-button-ghost--checked'
          )}
          title="Hide the generated code"
          type="button"
          onClick={this._onClick}
        />
      </Localized>
    ) : (
      <Localized id="GeneratedSourceView--show-button" attrs={{ title: true }}>
        <button
          className={classNames(
            'bottom-generated-source-button',
            'photon-button',
            'photon-button-ghost'
          )}
          title="Show the generated code"
          type="button"
          onClick={this._onClick}
        />
      </Localized>
    );
  }
}

export const GeneratedSourceViewToggleButton = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    generatedSourceViewIsOpen: getGeneratedSourceViewIsOpen(state),
    isGeneratedSourceViewAvailable: getIsGeneratedSourceViewAvailable(state),
  }),
  mapDispatchToProps: {
    openGeneratedSourceView,
    closeGeneratedSourceView,
  },
  component: GeneratedSourceViewToggleButtonImpl,
});
