/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import { reportError } from '../../utils/analytics';
import './ErrorBoundary.css';

type State = {|
  hasError: boolean,
  showDetails: boolean,
  error?: Error,
  componentStack?: string,
|};

type Props = {|
  children: *,
  message: string,
|};

/**
 * This component will catch errors in components, and display a more friendly error
 * message. This stops the entire app from unmounting and displaying an empty screen.
 *
 * See: https://reactjs.org/docs/error-boundaries.html
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state = {
    hasError: false,
    showDetails: false,
  };

  componentDidCatch(
    error: any,
    { componentStack }: { componentStack: string }
  ) {
    console.error(error, componentStack);
    this.setState({ hasError: true, error, componentStack });
    reportError({
      exDescription: componentStack,
      exFatal: true,
    });
  }

  _toggleErrorDetails = () => {
    this.setState(state => ({ showDetails: !state.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      const { error, componentStack, showDetails } = this.state;
      return (
        <div className="appErrorBoundary">
          <div className="appErrorBoundaryContents">
            <div className="photon-message-bar photon-message-bar-error">
              <span className="photon-message-bar-error-icon" />
              {this.props.message}
              <button
                className="photon-message-bar-error-action"
                type="button"
                onClick={this._toggleErrorDetails}
              >
                {showDetails ? 'Hide error details' : 'View full error details'}
              </button>
            </div>
            {showDetails ? (
              <div className="appErrorBoundaryDetails">
                {error ? <div>{error.toString()}</div> : null}
                {componentStack ? <div>{componentStack}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
