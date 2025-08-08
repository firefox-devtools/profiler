/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stripIndent } from 'common-tags';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import {
  NonLocalizedErrorBoundary,
  LocalizedErrorBoundary,
} from '../../components/app/ErrorBoundary';
import { withAnalyticsMock } from '../fixtures/mocks/analytics';

describe('app/NonLocalizedErrorBoundary', function () {
  const childComponentText = 'This is a child component';
  const friendlyErrorMessage = 'Oops, there was an error';
  const technicalErrorMessage = 'This is an error.';
  const ThrowingComponent = () => {
    throw new Error(technicalErrorMessage);
  };

  function setupComponent(childComponent: React.ReactNode) {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const results = render(
      <NonLocalizedErrorBoundary message={friendlyErrorMessage}>
        {childComponent}
      </NonLocalizedErrorBoundary>
    );
    return { spy, ...results };
  }

  it('matches the snapshot', () => {
    const { container } = setupComponent(<ThrowingComponent />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('shows the component children when there is no error', () => {
    const { getByText } = setupComponent(childComponentText);
    expect(getByText(childComponentText)).toBeInTheDocument();
  });

  it('shows the error message children when the component throws error', () => {
    const { getByText } = setupComponent(<ThrowingComponent />);
    expect(getByText(new RegExp(friendlyErrorMessage))).toBeInTheDocument();
  });

  it('surfaces the error via console.error', () => {
    setupComponent(<ThrowingComponent />);
    expect(console.error).toHaveBeenCalled();
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

                  at ThrowingComponent \\(.*[/\\\\]ErrorBoundary.test.tsx:.*\\)
                  at ErrorBoundaryInternal \\(.*[/\\\\]ErrorBoundary.tsx:.*\\)
                  at NonLocalizedErrorBoundary
                  at LocalizationProvider \\(.*[/\\\\]@fluent[/\\\\]react[/\\\\]index.js:.*\\)
          `)
        ),
        exFatal: true,
      });
    });
  });
});

describe('app/LocalizedErrorBoundary', function () {
  const friendlyErrorMessage = 'Oops, there was an error';
  const technicalErrorMessage = 'This is an error.';
  const ThrowingComponent = () => {
    throw new Error(technicalErrorMessage);
  };

  function setupComponent(childComponent: React.ReactNode) {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const results = render(
      <LocalizedErrorBoundary message={friendlyErrorMessage}>
        {childComponent}
      </LocalizedErrorBoundary>
    );
    return { spy, ...results };
  }

  it('matches the snapshot', () => {
    setupComponent(<ThrowingComponent />);
    expect(document.body).toMatchSnapshot();
  });
});
