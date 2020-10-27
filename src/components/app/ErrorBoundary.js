/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { reportError } from 'firefox-profiler/utils/analytics';
import './ErrorBoundary.css';

type State = {|
  hasError: boolean,
  showDetails: boolean,
  errorString: string | null,
  componentStack?: string,
|};

type Props = {|
  +children: React.Node,
  +message: string,
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
    errorString: null,
  };

  componentDidCatch(
    error: mixed,
    { componentStack }: { componentStack: string }
  ) {
    console.error(
      'An unhandled error was thrown in a React component.',
      error,
      componentStack
    );
    let errorString = null;
    if (
      error &&
      typeof error === 'object' &&
      typeof error.toString === 'function'
    ) {
      const result = error.toString();
      if (typeof result === 'string') {
        errorString = result;
      }
    }
    this.setState({ hasError: true, errorString, componentStack });
    reportError({
      exDescription: errorString
        ? errorString + '\n' + componentStack
        : componentStack,
      exFatal: true,
    });
  }

  _toggleErrorDetails = () => {
    this.setState(state => ({ showDetails: !state.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      const { errorString, componentStack, showDetails } = this.state;
      return (
        <div className="appErrorBoundary">
          <div className="appErrorBoundaryContents">
            <div className="photon-message-bar photon-message-bar-error">
              {this.props.message}
              <button
                className="photon-button photon-button-micro photon-message-bar-action-button"
                type="button"
                onClick={this._toggleErrorDetails}
                aria-expanded={showDetails ? 'true' : 'false'}
              >
                {showDetails ? 'Hide error details' : 'View full error details'}
              </button>
            </div>
            <div
              data-testid="error-technical-details"
              className={`appErrorBoundaryDetails ${showDetails ? '' : 'hide'}`}
            >
              {errorString ? <div>{errorString}</div> : null}
              {componentStack ? <div>{componentStack}</div> : null}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
