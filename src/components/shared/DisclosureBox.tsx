/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

import './DisclosureBox.css';

type Props = {
  readonly label: string;
  readonly initialOpen?: boolean;
  readonly children: React.ReactNode;
};

type State = {
  isOpen: boolean;
};

export class DisclosureBox extends React.PureComponent<Props, State> {
  override state: State = {
    isOpen: this.props.initialOpen ?? true,
  };

  _onToggle = () => {
    this.setState((state) => ({ isOpen: !state.isOpen }));
  };

  override render() {
    const { label, children } = this.props;
    const { isOpen } = this.state;

    return (
      <div className={`disclosureBox ${isOpen ? 'open' : 'closed'}`}>
        <button
          type="button"
          className="disclosureBoxButton"
          onClick={this._onToggle}
          aria-expanded={isOpen}
        >
          <span className="disclosureBoxArrow" aria-hidden="true" />
          {label}
        </button>
        {isOpen ? (
          <div className="disclosureBoxContents">{children}</div>
        ) : null}
      </div>
    );
  }
}
