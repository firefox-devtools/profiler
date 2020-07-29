/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from '@testing-library/react';
import ButtonWithPanel from '../../components/shared/ButtonWithPanel';
import ArrowPanel from '../../components/shared/ArrowPanel';
import { ensureExists } from '../../utils/flow';

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
        open={true}
        panel={
          <ArrowPanel className="panel">
            <div>Panel content</div>
          </ArrowPanel>
        }
      />
    );
    expect(container.firstChild).toMatchSnapshot();
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
          open={true}
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

    fireEvent.click(getByText('My Button'));
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

    fireEvent.click(getByText('My Button'));
    jest.runAllTimers();
    expect(container.firstChild).toMatchSnapshot();

    // it closes the panel when clicking outside the panel
    const newDiv = ensureExists(document.body).appendChild(
      document.createElement('div')
    );
    fireEvent.click(newDiv);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('opens the panel when the button is clicked and closes the panel by clicking the button again', () => {
    const { getByText, container } = setup();

    fireEvent.click(getByText('My Button'));
    jest.runAllTimers();

    ensureExists(container.querySelector('.arrowPanel.open'));

    fireEvent.click(getByText('My Button'));
    jest.runAllTimers();

    expect(container.querySelector('.arrowPanel.open')).toBe(null);
  });

  it('opens the panel when the button is clicked and does not close the panel by clicking inside the panel', () => {
    const { getByText, container } = setup();

    fireEvent.click(getByText('My Button'));
    jest.runAllTimers();
    ensureExists(container.querySelector('.arrowPanel.open'));

    // Clicking on the panel doesn't hide the popup.
    fireEvent.click(getByText('Panel content'));
    jest.runAllTimers();
    ensureExists(container.querySelector('.arrowPanel.open'));

    // But clicking on the arrow area does.
    fireEvent.click(ensureExists(container.querySelector('.arrowPanelArrow')));
    jest.runAllTimers();
    expect(container.querySelector('.arrowPanel.open')).toBe(null);
  });
});
