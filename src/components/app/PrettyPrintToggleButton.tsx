/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import classNames from 'classnames';
import { Localized } from '@fluent/react';

type Props = {
  readonly isPrettyPrinted: boolean;
  readonly onChange: (isPrettyPrinted: boolean) => void;
};

/**
 * The {} button in the header of a source view pane, which toggles whether
 * the JS code in this pane is pretty-printed.
 */
export class PrettyPrintToggleButton extends React.PureComponent<Props> {
  _onClick = () => {
    this.props.onChange(!this.props.isPrettyPrinted);
  };

  override render() {
    const { isPrettyPrinted } = this.props;
    return isPrettyPrinted ? (
      <Localized
        id="SourceView--pretty-print-hide-button"
        attrs={{ title: true }}
      >
        <button
          className={classNames(
            'bottom-pretty-print-button',
            'photon-button',
            'photon-button-ghost',
            'photon-button-ghost--checked'
          )}
          title="Show the code without pretty-printing"
          type="button"
          aria-pressed="true"
          onClick={this._onClick}
        >
          {'{}'}
        </button>
      </Localized>
    ) : (
      <Localized
        id="SourceView--pretty-print-show-button"
        attrs={{ title: true }}
      >
        <button
          className={classNames(
            'bottom-pretty-print-button',
            'photon-button',
            'photon-button-ghost'
          )}
          title="Pretty-print the code"
          type="button"
          aria-pressed="false"
          onClick={this._onClick}
        >
          {'{}'}
        </button>
      </Localized>
    );
  }
}
