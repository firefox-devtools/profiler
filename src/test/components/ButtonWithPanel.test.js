/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from '@testing-library/react';
import ButtonWithPanel from '../../components/shared/ButtonWithPanel';
import ArrowPanel from '../../components/shared/ArrowPanel';
import { ensureExists } from '../../utils/flow';
import { fireFullClick } from '../fixtures/utils';

beforeEach(() => {
  jest.useFakeTimers();
});

describe('shared/ButtonWithPanel', () => {
  // renders the button in its default state
  function setup() {
    return render(
      <ButtonWithPanel
        className="button"
        buttonClassName="buttonButton"
        label="My Button"
        panel={
          <ArrowPanel className="panel">
            <div>Panel content</div>
          </ArrowPanel>
        }
      />
    );
  }

  it('renders the ButtonWithPanel with a closed panel', () => {
    const { container } = setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders a button with a panel', () => {
    const { container } = render(
      <ButtonWithPanel
        className="button"
        label="My Button"
        initialOpen={true}
        panel={
          <ArrowPanel className="panel">
            <div>Panel content</div>
          </ArrowPanel>
        }
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  describe('with ok and cancel buttons', () => {
    function setupWithTitleAndButtons(
      overrides: $Shape<{|
        +buttonProps: $Shape<React.ElementConfig<typeof ButtonWithPanel>>,
        +arrowPanelProps: $Shape<React.ElementConfig<typeof ArrowPanel>>,
      |}> = {}
    ) {
      const { buttonProps, arrowPanelProps } = overrides;
      const renderResult = render(
        <ButtonWithPanel
          className="button"
          label="My Button"
          {...buttonProps}
          panel={
            <ArrowPanel
              className="panel"
              title="Wonderful content"
              okButtonText="Confirm"
              cancelButtonText="Cancel"
              {...arrowPanelProps}
            >
              <div>Panel content</div>
            </ArrowPanel>
          }
        />
      );

      const { container, getByText, queryByText } = renderResult;

      function clickOpenButtonAndWait() {
        fireFullClick(getByText('My Button'));
        assertPanelIsOpen();
      }

      function clickOkButton() {
        fireFullClick(getByText('Confirm'));
      }

      function clickCancelButton() {
        fireFullClick(getByText('Cancel'));
      }

      function assertPanelIsClosed() {
        // Closing the panel involves timeouts.
        jest.runAllTimers();
        expect(queryByText('Panel content')).toBe(null);
        expect(container.querySelector('.arrowPanel.open')).toBe(null);
      }

      function assertPanelIsOpen() {
        // Opening the panel involves timeouts.
        jest.runAllTimers();
        expect(getByText('Panel content')).toBeTruthy();
        expect(container.querySelector('.arrowPanel.open')).toBeTruthy();
      }

      return {
        ...renderResult,
        clickOpenButtonAndWait,
        clickOkButton,
        clickCancelButton,
        assertPanelIsClosed,
        assertPanelIsOpen,
      };
    }

    it('renders panels with default buttons and titles', () => {
      const { container } = setupWithTitleAndButtons({
        buttonProps: { initialOpen: true },
      });
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders panels with specified buttons', () => {
      const { container } = setupWithTitleAndButtons({
        buttonProps: { initialOpen: true },
        arrowPanelProps: { okButtonType: 'destructive' },
      });
      expect(container.firstChild).toMatchSnapshot();
    });

    // eslint-disable-next-line jest/expect-expect
    it('opens and closes the panel when clicking on cancel button', () => {
      const {
        clickOpenButtonAndWait,
        clickCancelButton,
        assertPanelIsClosed,
      } = setupWithTitleAndButtons();
      clickOpenButtonAndWait();

      clickCancelButton();
      assertPanelIsClosed();
    });

    // eslint-disable-next-line jest/expect-expect
    it('opens and closes the panel when clicking on confirm button', () => {
      const {
        clickOpenButtonAndWait,
        clickOkButton,
        assertPanelIsClosed,
      } = setupWithTitleAndButtons();
      clickOpenButtonAndWait();

      clickOkButton();
      assertPanelIsClosed();
    });

    // eslint-disable-next-line jest/expect-expect
    it('waits for the end of callbacks', async () => {
      // We initialize to empty functions just so that Flow doesn't error later.
      let resolveOkPromise = () => {};
      const okPromise = new Promise(resolve => {
        resolveOkPromise = resolve;
      });

      let resolveCancelPromise = () => {};
      const cancelPromise = new Promise(resolve => {
        resolveCancelPromise = resolve;
      });

      const {
        clickOpenButtonAndWait,
        clickOkButton,
        clickCancelButton,
        assertPanelIsOpen,
        assertPanelIsClosed,
      } = setupWithTitleAndButtons({
        arrowPanelProps: {
          onOkButtonClick: () => okPromise,
          onCancelButtonClick: () => cancelPromise,
        },
      });
      clickOpenButtonAndWait();

      clickOkButton();
      // It's still not closed because the promise isn't resolved.
      assertPanelIsOpen();

      // Let's resolve the OK promise and wait for timers again.
      resolveOkPromise();
      await okPromise;

      // This time, the panel should be closed.
      assertPanelIsClosed();

      // Do it again for the cancel button now.
      clickOpenButtonAndWait();
      clickCancelButton();
      assertPanelIsOpen();
      resolveCancelPromise();
      await cancelPromise;
      assertPanelIsClosed();
    });
  });

  describe('protecting against mounting expensive panels', function() {
    it('does not render the contents when closed', function() {
      const { queryByTestId } = render(
        <ButtonWithPanel
          className="button"
          label="My Button"
          panel={
            <ArrowPanel className="panel">
              <div data-testid="panel-content">Panel content</div>
            </ArrowPanel>
          }
        />
      );
      expect(queryByTestId('panel-content')).toBeFalsy();
    });

    /**
     * This test asserts that we don't try and mount the contents of a panel if it's
     * not open.
     */
    it('only renders the contents when open', function() {
      const { queryByTestId } = render(
        <ButtonWithPanel
          className="button"
          label="My Button"
          initialOpen={true}
          panel={
            <ArrowPanel className="panel">
              <div data-testid="panel-content">Panel content</div>
            </ArrowPanel>
          }
        />
      );
      expect(queryByTestId('panel-content')).toBeTruthy();
    });
  });

  it('opens the panel when the button is clicked and closes the panel when the escape key is pressed', () => {
    const { getByText, container } = setup();

    fireFullClick(getByText('My Button'));
    jest.runAllTimers();
    expect(container.firstChild).toMatchSnapshot();

    //it closes the panel when Esc key is pressed
    fireEvent.keyDown(container, {
      key: 'Escape',
      keyCode: 27,
      which: 27,
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('opens the panel when the button is clicked and closes the panel by clicking outside the panel', () => {
    const { getByText, container } = setup();

    fireFullClick(getByText('My Button'));
    jest.runAllTimers();
    expect(container.firstChild).toMatchSnapshot();

    // it closes the panel when clicking outside the panel
    const newDiv = ensureExists(document.body).appendChild(
      document.createElement('div')
    );
    fireFullClick(newDiv);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('opens the panel when the button is clicked and closes the panel by clicking the button again', () => {
    const { getByText, container } = setup();

    fireFullClick(getByText('My Button'));
    jest.runAllTimers();

    ensureExists(container.querySelector('.arrowPanel.open'));

    fireFullClick(getByText('My Button'));
    jest.runAllTimers();

    expect(container.querySelector('.arrowPanel.open')).toBe(null);
  });

  it('opens the panel when the button is clicked and does not close the panel by clicking inside the panel', () => {
    const { getByText, container } = setup();

    fireFullClick(getByText('My Button'));
    jest.runAllTimers();
    ensureExists(container.querySelector('.arrowPanel.open'));

    // Clicking on the panel doesn't hide the popup.
    fireFullClick(getByText('Panel content'));
    jest.runAllTimers();
    ensureExists(container.querySelector('.arrowPanel.open'));

    // But clicking on the arrow area does.
    fireFullClick(ensureExists(container.querySelector('.arrowPanelArrow')));
    jest.runAllTimers();
    expect(container.querySelector('.arrowPanel.open')).toBe(null);
  });
});
