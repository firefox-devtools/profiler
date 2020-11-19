/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { stripIndent } from 'common-tags';

import { ErrorBoundary } from '../../components/app/ErrorBoundary';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';
import { fireFullClick } from '../fixtures/utils';

describe('app/ErrorBoundary', function() {
  const childComponentText = 'This is a child component';
  const friendlyErrorMessage = 'Oops, there was an error';
  const technicalErrorMessage = 'This is an error.';
  const ThrowingComponent = () => {
    throw new Error(technicalErrorMessage);
  };

  function setupComponent(childComponent) {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const results = render(
      <ErrorBoundary message={friendlyErrorMessage}>
        {childComponent}
      </ErrorBoundary>
    );
    return { spy, ...results };
  }

  it('matches the snapshot', () => {
    const { container } = setupComponent(<ThrowingComponent />);

    // We need to change the textContent of the stack, so that path information
    // isn't tied to a specific environment.
    const stack = screen.getByText(/at ThrowingComponent/);
    stack.textContent = stack.textContent
      .replace(/\\/g, '/') // normalizes Windows paths
      .replace(/\(.*\/src/g, '(REDACTED)/src'); // Removes the home directory

    expect(container.firstChild).toMatchSnapshot();
  });

  it('shows the component children when there is no error', () => {
    const { getByText } = setupComponent(childComponentText);
    expect(getByText(childComponentText)).toBeTruthy();
  });

  it('shows the error message children when the component throws error', () => {
    const { getByText } = setupComponent(<ThrowingComponent />);
    expect(getByText(friendlyErrorMessage)).toBeTruthy();
  });

  it('surfaces the error via console.error', () => {
    setupComponent(<ThrowingComponent />);
    expect(console.error).toHaveBeenCalled();
  });

  it('can click the component to view the full details', () => {
    const { getByText, getByTestId } = setupComponent(<ThrowingComponent />);

    // The technical error isn't visible yet.
    expect(
      getByTestId('error-technical-details').classList.contains('hide')
    ).toBe(true);

    // Click the button to expand the details.
    fireFullClick(getByText('View full error details'));

    // The technical error now exists.
    expect(
      getByTestId('error-technical-details').classList.contains('hide')
    ).toBe(false);
  });

  it('reports errors to the analytics', () => {
    withAnalyticsMock(() => {
      setupComponent(<ThrowingComponent />);
      expect(self.ga).toHaveBeenCalledWith('send', 'exception', {
        exDescription: expect.stringMatching(
          // This regexp looks a  bit scary, but all it does is avoiding
          // matching on things that depends on the environment (like path
          // names) and path separators (unixes use `/` but windows uses `\`).
          new RegExp(stripIndent`
              Error: This is an error\\.

                  at ThrowingComponent \\(.*[/\\\\]ErrorBoundary.test.js:19:11\\)
                  at ErrorBoundary \\(.*[/\\\\]ErrorBoundary.js:28:66\\)
          `)
        ),
        exFatal: true,
      });
    });
  });
});
