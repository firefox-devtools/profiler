/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This implements a Button that triggers a panel. The panel will have a small
// arrow pointing towards the button, which is implemented in ArrowPanel.
//
// Here is a simple example:
//
// import { ButtonWithPanel } from // 'firefox-profiler/components/ButtonWithPanel';
// ...
// <ButtonWithPanel
//   className="MyButtonWithPanel"
//   buttonClassName="MyPanelButton"
//   panelClassName="MyPanel"
//   label="Click me!"
//   panelContent={<>
//     <p>We explain lots of useful things here.</p>
//     <p>If you want to know more <a href='/'>click here</a>.</p>
//   </>}
// />
//
// This registers the events on the window object (mouse and keyboard events).

import * as React from 'react';
import classNames from 'classnames';

import { ArrowPanel } from './ArrowPanel';

import './ButtonWithPanel.css';

type Props = {
  readonly className?: string;
  readonly label: string;
  readonly panelContent: React.ReactNode;
  readonly panelClassName?: string;
  // Setting this prop to true opens the panel.
  readonly open?: boolean;
  // The class name of the button input element.
  readonly buttonClassName?: string;
  readonly onPanelOpen?: () => unknown;
  readonly onPanelClose?: () => unknown;
  readonly title?: string;
};

type State = {
  readonly open: boolean;
};

export class ButtonWithPanel extends React.PureComponent<Props, State> {
  _panel: ArrowPanel | null = null;
  _buttonRef = React.createRef<HTMLButtonElement>();
  _wrapperRef = React.createRef<HTMLElement>();

  constructor(props: Props) {
    super(props);
    this.state = { open: !!props.open };
  }

  override componentDidMount() {
    // the panel can be closed by clicking anywhere on the window
    window.addEventListener('click', this._onWindowClick);
    // the panel can be closed by pressing the Esc key
    window.addEventListener('keydown', this._onKeyDown);
    if (this.state.open) {
      this.openPanel();
    }
  }

  override componentDidUpdate(prevProps: Props) {
    // Open the panel when the open prop becomes true.
    if (!prevProps.open && this.props.open) {
      this.setState({ open: true });
      this.openPanel();
    }
  }

  override componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('click', this._onWindowClick);
  }

  _onPanelOpen = () => {
    this.setState({ open: true });
    if (this.props.onPanelOpen) {
      this.props.onPanelOpen();
    }
  };

  _onPanelClose = () => {
    this.setState({ open: false });

    // Let's focus the delete button after dismissing the dialog, but _only_ if
    // the focus was part of the dialog before.
    // Note this branch isn't tested because jsdom doesn't support the
    // :focus-within selector.
    /* istanbul ignore if */
    if (this.isFocusWithin()) {
      this.focus();
    }

    if (this.props.onPanelClose) {
      this.props.onPanelClose();
    }
  };

  _takePanelRef = (panel: ArrowPanel | null) => {
    this._panel = panel;
  };

  openPanel() {
    if (this._panel) {
      this._panel.open();
    }
  }

  closePanel() {
    if (this._panel && this.state.open) {
      this._panel.close();
    }
  }

  _onWindowClick = () => {
    this.closePanel();
  };

  _onButtonClick = () => {
    if (!this.state.open) {
      // We use a timeout so that we let the event bubble up to the handlers bound
      // on `window`, closing all other panels, before opening this one.
      setTimeout(() => this.openPanel());
    }
  };

  _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.closePanel();
    }
  };

  // This function isn't called in tests because isFocusWithin never returns
  // true in jsdom. So let's ignore ir from the code coverage report.
  /* istanbul ignore next */
  focus() {
    if (this._buttonRef.current) {
      this._buttonRef.current.focus();
    }
  }

  isFocusWithin(): boolean {
    try {
      if (this._wrapperRef.current) {
        return this._wrapperRef.current.matches(':focus-within');
      }
    } catch {
      // This browser doesn't support :focus-within (especially JSDOM), let's
      // degrade gracefully.
    }
    return false;
  }

  override render() {
    const {
      className,
      label,
      panelContent,
      panelClassName,
      buttonClassName,
      title,
    } = this.props;
    const { open } = this.state;
    return (
      <div
        className={classNames('buttonWithPanel', className, { open })}
        ref={this._wrapperRef as React.RefObject<HTMLDivElement>}
      >
        <button
          type="button"
          className={classNames('buttonWithPanelButton', buttonClassName)}
          aria-expanded={open}
          title={open ? undefined : title}
          onClick={this._onButtonClick}
          ref={this._buttonRef}
        >
          {label}
        </button>
        <ArrowPanel
          className={panelClassName}
          onOpen={this._onPanelOpen}
          onClose={this._onPanelClose}
          ref={this._takePanelRef}
        >
          {panelContent}
        </ArrowPanel>
      </div>
    );
  }
}
