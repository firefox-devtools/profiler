/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent } from '@testing-library/react';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { ButtonWithPanel } from '../../components/shared/ButtonWithPanel';
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
        title="Click here to open the panel"
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

  describe('protecting against mounting expensive panels', function () {
    it('does not render the contents when closed', function () {
      render(
        <ButtonWithPanel
          className="button"
          label="My Button"
          panelContent={<div data-testid="panel-content">Panel content</div>}
        />
      );
      expect(screen.queryByTestId('panel-content')).not.toBeInTheDocument();
    });

    /**
     * This test asserts that we don't try and mount the contents of a panel if it's
     * not open.
     */
    it('only renders the contents when open', function () {
      render(
        <ButtonWithPanel
          className="button"
          label="My Button"
          initialOpen={true}
          panelContent={<div data-testid="panel-content">Panel content</div>}
        />
      );
      expect(screen.getByTestId('panel-content')).toBeInTheDocument();
    });
  });

  it('displays a title only when not open', () => {
    setup();
    const button = screen.getByText('My Button');
    expect(button.title).toBe('Click here to open the panel');
    fireFullClick(button);
    act(() => {
      jest.runAllTimers();
    });
    expect(button.title).toBe('');
  });

  it('opens the panel when the button is clicked and closes the panel when the escape key is pressed', () => {
    const { container } = setup();

    fireFullClick(screen.getByText('My Button'));
    act(() => {
      jest.runAllTimers();
    });
    expect(container.firstChild).toMatchSnapshot();

    //it closes the panel when Esc key is pressed
    fireEvent.keyDown(container, {
      key: 'Escape',
      keyCode: 27,
      which: 27,
    });
    act(() => {
      jest.runAllTimers();
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('opens the panel when the button is clicked and closes the panel by clicking outside the panel', () => {
    const { container } = setup();

    fireFullClick(screen.getByText('My Button'));
    act(() => {
      jest.runAllTimers();
    });
    expect(container.firstChild).toMatchSnapshot();

    // it closes the panel when clicking outside the panel
    const newDiv = ensureExists(document.body).appendChild(
      document.createElement('div')
    );
    fireFullClick(newDiv);

    act(() => {
      jest.runAllTimers();
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('opens the panel when the button is clicked and closes the panel by clicking the button again', () => {
    const { container } = setup();

    fireFullClick(screen.getByText('My Button'));
    act(() => {
      jest.runAllTimers();
    });

    ensureExists(container.querySelector('.arrowPanel.open'));

    fireFullClick(screen.getByText('My Button'));
    act(() => {
      jest.runAllTimers();
    });

    expect(container.querySelector('.arrowPanel.open')).toBe(null);
  });

  it('opens the panel when the button is clicked and does not close the panel by clicking inside the panel', () => {
    const { container } = setup();

    fireFullClick(screen.getByText('My Button'));
    act(() => {
      jest.runAllTimers();
    });
    ensureExists(container.querySelector('.arrowPanel.open'));

    // Clicking on the panel doesn't hide the popup.
    fireFullClick(screen.getByText('Panel content'));
    act(() => {
      jest.runAllTimers();
    });
    ensureExists(container.querySelector('.arrowPanel.open'));

    // But clicking on the arrow area does.
    fireFullClick(
      ensureExists(container.querySelector('.arrowPanelArrow')) as HTMLElement
    );
    act(() => {
      jest.runAllTimers();
    });
    expect(container.querySelector('.arrowPanel.open')).toBe(null);
  });
});
