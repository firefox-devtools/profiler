/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { Localized } from '@fluent/react';
import { reportError } from 'firefox-profiler/utils/analytics';
import './ErrorBoundary.css';

type State = {
  hasError: boolean,
  errorString: string | null,
};

type ExternalProps = {
  readonly children: React.Node,
  readonly message: string,
};

type InternalProps = {
  ...ExternalProps,
  buttonContent: React.Node,
  reportExplanationMessage: React.Node,
};

/**
 * This component will catch errors in components, and display a more friendly error
 * message. This stops the entire app from unmounting and displaying an empty screen.
 *
 * See: https://reactjs.org/docs/error-boundaries.html
 */
class ErrorBoundaryInternal extends React.Component<InternalProps, State> {
  state = {
    hasError: false,
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
    this.setState({
      hasError: true,
      errorString,
    });
    reportError({
      exDescription: errorString
        ? errorString + '\n' + componentStack
        : componentStack,
      exFatal: true,
    });
  }

  render() {
    if (this.state.hasError) {
      const { errorString } = this.state;
      return (
        <div className="appErrorBoundary">
          <div className="appErrorBoundaryContents">
            <div className="photon-message-bar photon-message-bar-error photon-message-bar-inner-content">
              <div className="photon-message-bar-inner-text appErrorBoundaryInnerText">
                <p>{this.props.message}</p>
                {errorString ? <p>{errorString}.</p> : null}
                <p>{this.props.reportExplanationMessage}</p>
              </div>
              <a
                className="photon-button photon-button-micro photon-message-bar-action-button"
                href="https://github.com/firefox-devtools/profiler/issues/new?title=An%20error%20occurred%20in%20Firefox%20Profiler"
                target="_blank"
                rel="noreferrer"
              >
                {this.props.buttonContent}
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Use this error boundary when outside of the AppLocalizationProvider hierarchy
 */
export function NonLocalizedErrorBoundary(props: ExternalProps) {
  return (
    <ErrorBoundaryInternal
      {...props}
      buttonContent="Report the error on GitHub"
      reportExplanationMessage="Please report this error to the developers, including the full error as displayed in the Developer Tools’ Web Console."
    />
  );
}

/**
 * Use this error boundary when inside of the AppLocalizationProvider hierarchy
 */
export function LocalizedErrorBoundary(props: ExternalProps) {
  return (
    <ErrorBoundaryInternal
      {...props}
      buttonContent={
        <Localized id="ErrorBoundary--report-error-on-github">
          Report the error on GitHub
        </Localized>
      }
      reportExplanationMessage={
        <Localized id="ErrorBoundary--report-error-to-developers-description">
          Please report this issue to the developers, including the full error
          as displayed in the Developer Tools’ Web Console.
        </Localized>
      }
    />
  );
}
