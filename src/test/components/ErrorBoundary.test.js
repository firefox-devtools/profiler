/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render } from 'react-testing-library';

import { ErrorBoundary } from '../../components/app/ErrorBoundary';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';

describe('app/ErrorBoundary', function() {
  const childComponentText = 'This is a child component';
  const friendlyErrorMessage = 'Oops, there was an error';
  const technicalErrorMessage = 'This is an error.';
  const technicalErrorMatcher = /This is an error./;
  const ThrowingComponent = () => {
    throw new Error(technicalErrorMessage);
  };

  it('shows the component children when there is no error', () => {
    const { getByText } = render(
      <ErrorBoundary message={friendlyErrorMessage}>
        {childComponentText}
      </ErrorBoundary>
    );
    expect(getByText(childComponentText)).toBeTruthy();
  });

  it('shows the error message children when the component throws error', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary message={friendlyErrorMessage}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(getByText(friendlyErrorMessage)).toBeTruthy();
  });

  it('can click the component to view the full details', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary message={friendlyErrorMessage}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    // The technical error doesn't exist
    expect(() => getByText(technicalErrorMatcher)).toThrow();

    // Click the button to expand the details.
    getByText('View full error details').click();

    // The technical error now exists.
    expect(getByText(technicalErrorMatcher)).toBeTruthy();
  });

  it('reports errors to the analytics', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    withAnalyticsMock(() => {
      render(
        <ErrorBoundary message={friendlyErrorMessage}>
          <ThrowingComponent />
        </ErrorBoundary>
      );
      expect(self.ga.mock.calls).toEqual([
        [
          'send',
          'exception',
          {
            exDescription: [
              '',
              '    in ThrowingComponent',
              '    in ErrorBoundary',
            ].join('\n'),
            exFatal: true,
          },
        ],
      ]);
    });
  });
});
