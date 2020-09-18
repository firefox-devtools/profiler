/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from '@testing-library/react';
import {
  ButtonWithPanel,
  ConfirmDialog,
} from '../../components/shared/ButtonWithPanel';
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
        panelClassName="panel"
        panelContent={<div>Panel content</div>}
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
        panelClassName="panel"
        panelContent={<div>Panel content</div>}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  describe('with ok and cancel buttons', () => {
    function setupWithTitleAndButtons(
      overrides: $Shape<{|
        +buttonProps: $Shape<React.ElementConfig<typeof ButtonWithPanel>>,
        +confirmDialogProps: $Shape<React.ElementConfig<typeof ConfirmDialog>>,
      |}> = {}
    ) {
      const { buttonProps, confirmDialogProps } = overrides;
      const renderResult = render(
        <ButtonWithPanel
          className="button"
          label="My Button"
          {...buttonProps}
          panelContent={
            <ConfirmDialog title="Wonderful content" {...confirmDialogProps}>
              <div>Panel content</div>
            </ConfirmDialog>
          }
        />
      );

      const { container, getByText, queryByText } = renderResult;

      function clickOpenButtonAndWait() {
        fireFullClick(getByText('My Button'));
        assertPanelIsOpen();
      }

      function clickConfirmButton() {
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
        clickConfirmButton,
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
        confirmDialogProps: {
          className: 'my-dialog',
          title: 'Do you confirm this destructive action?',
          confirmButtonText: 'Delete',
          cancelButtonText: 'Stop',
          confirmButtonType: 'destructive',
        },
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
        clickConfirmButton,
        assertPanelIsClosed,
      } = setupWithTitleAndButtons();
      clickOpenButtonAndWait();

      clickConfirmButton();
      assertPanelIsClosed();
    });

    it('waits for the end of callbacks', async () => {
      // We initialize to empty functions just so that Flow doesn't error later.
      let resolveConfirmPromise = () => {};
      const confirmPromise = new Promise(resolve => {
        resolveConfirmPromise = resolve;
      });

      let resolveCancelPromise = () => {};
      const cancelPromise = new Promise(resolve => {
        resolveCancelPromise = resolve;
      });

      const onConfirmButtonClick = jest.fn(() => confirmPromise);
      const onCancelButtonClick = jest.fn(() => cancelPromise);

      const {
        clickOpenButtonAndWait,
        clickConfirmButton,
        clickCancelButton,
        assertPanelIsOpen,
        assertPanelIsClosed,
      } = setupWithTitleAndButtons({
        confirmDialogProps: {
          onConfirmButtonClick,
          onCancelButtonClick,
        },
      });
      clickOpenButtonAndWait();

      clickConfirmButton();
      // It's still not closed because the promise isn't resolved.
      assertPanelIsOpen();

      // Clicking another time shouldn't trigger the callback once more. We'll
      // check this later.
      clickConfirmButton();
      // Same for the cancel button.
      clickCancelButton();

      // Let's resolve the OK promise and wait for timers again.
      resolveConfirmPromise();
      await confirmPromise;

      // This time, the panel should be closed.
      assertPanelIsClosed();

      // *** Do it again for the cancel button now. ***
      clickOpenButtonAndWait();
      clickCancelButton();
      assertPanelIsOpen();

      // Check that preventing double click works.
      clickCancelButton();
      clickConfirmButton();

      resolveCancelPromise();
      await cancelPromise;

      // Now it's closed after the promise is resolved.
      assertPanelIsClosed();

      expect(onConfirmButtonClick).toHaveBeenCalledTimes(1);
      expect(onCancelButtonClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('protecting against mounting expensive panels', function() {
    it('does not render the contents when closed', function() {
      const { queryByTestId } = render(
        <ButtonWithPanel
          className="button"
          label="My Button"
          panelContent={<div data-testid="panel-content">Panel content</div>}
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
          panelContent={<div data-testid="panel-content">Panel content</div>}
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
