/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { coerce } from '../../utils/flow';
import classNames from 'classnames';

import './KeyboardShortcut.css';

type Props = {|
  +wrapperClassName: string,
  +children: React.Node,
|};

type State = {|
  +isOpen: boolean,
  // The modal steals the focus of the screen. This is the element that was focused
  // before showing the modal. The focus will be restored once the modal is dismissed.
  +focusAfterClosed: HTMLElement | null,
|};

/**
 * Display a list of shortcuts that overlays the screen.
 */
export class KeyboardShortcut extends React.PureComponent<Props, State> {
  state = {
    isOpen: false,
    // The eslint error is a false positive due to how it's used, see the line:
    //  `focusAfterClosed.focus()`
    focusAfterClosed: null, // eslint-disable-line react/no-unused-state
  };

  _focusArea = React.createRef<HTMLDivElement>();

  componentDidMount() {
    window.addEventListener('keydown', this._handleKeyPress);
  }

  _focus() {
    requestAnimationFrame(() => {
      // Only manipulate the DOM outside of the React setState update cycle, otherwise
      // this triggers a React warning, plus we'll want the DOM to have been updated.
      // However, this DOM update isn't future proof if React changes to a more
      // asynchronous rendering method.
      //
      // "unstable_flushDiscreteUpdates: Cannot flush updates when React is already rendering."
      const div = this._focusArea.current;
      if (div) {
        div.focus();
      }
    });
  }

  _open = (state: State): State => {
    if (state.isOpen) {
      // Do nothing.
      return state;
    }
    const focusAfterClosed = document.activeElement;
    this._trapFocus();
    this._focus();
    return { isOpen: true, focusAfterClosed };
  };

  _close = (state: State): State => {
    const { focusAfterClosed, isOpen } = state;

    if (!isOpen) {
      // Do nothing.
      return state;
    }
    this._untrapFocus();
    if (focusAfterClosed) {
      requestAnimationFrame(() => {
        // Restore focus, but not during a React setState call, otherwise this triggers
        // a React warning:
        // "unstable_flushDiscreteUpdates: Cannot flush updates when React is already rendering."
        focusAfterClosed.focus();
      });
    }

    return { isOpen: false, focusAfterClosed: null };
  };

  _handleCloseClick = () => {
    this.setState(this._close);
  };

  _handleKeyPress = (event: KeyboardEvent) => {
    const target = coerce<EventTarget, HTMLElement>(event.target);
    switch (event.key) {
      case '?': {
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        ) {
          // Ignore this from input-like things.
          return;
        }
        // Toggle the state.
        this.setState((state) =>
          state.isOpen ? this._close(state) : this._open(state)
        );
        break;
      }
      case 'Escape': {
        // Unconditionally run close on escape, which is a noop if it's not open.
        this.setState(this._close);
        break;
      }
      default:
      // Do nothing.
    }
  };

  componentWillUnmount() {
    window.removeEventListener('keydown', this._handleKeyPress);
    this._untrapFocus();
  }

  _trapFocus() {
    document.addEventListener('focus', this._trapFocusHandler, true);
  }

  _untrapFocus() {
    document.removeEventListener('focus', this._trapFocusHandler, true);
  }

  // This is inspired by:
  // https://www.w3.org/TR/wai-aria-practices-1.1/examples/dialog-modal/dialog.html
  _trapFocusHandler = (event: FocusEvent) => {
    const div = this._focusArea.current;
    if (!div) {
      return;
    }
    if (!div.contains(coerce<EventTarget, Node>(event.target))) {
      // TODO - This does not handle shift-tabbing going to the last focusable
      // element in the list.
      div.focus();
    }
  };

  maybeRenderShortcuts() {
    if (!this.state.isOpen) {
      return null;
    }

    return (
      <>
        <div className="appKeyboardShortcutsHeader">
          <div
            className="appKeyboardShortcutsHeaderTitle"
            /* aria-labelledby id */
            id="AppKeyboardShortcutsHeaderTitle"
          >
            Keyboard shortcuts
          </div>
          <button
            type="button"
            className="appKeyboardShortcutsHeaderClose"
            onClick={this._handleCloseClick}
          >
            Close
          </button>
        </div>
        <div className="appKeyboardShortcutsContent">
          <div className="appKeyboardShortcutsColumn">
            <h2>Call Tree</h2>
            <Shortcut label="Close call node" shortcut="ArrowLeft" />
            <Shortcut label="Open call node" shortcut="ArrowRight" />
            <Shortcut label="Open all child call nodes" shortcut="*" />
            <Shortcut
              label="Copy call node label"
              shortcut="ctrl,c"
              macShortcut="cmd,c"
            />

            <h2>Flame Graph</h2>
            <Shortcut label="Move view up" shortcut="w" />
            <Shortcut label="Move view down" shortcut="s" />
            <Shortcut label="Move selection up" shortcut="ArrowUp" />
            <Shortcut label="Move selection down" shortcut="ArrowDown" />
            <Shortcut label="Move selection left" shortcut="ArrowLeft" />
            <Shortcut label="Move selection right" shortcut="ArrowRight" />
            <Shortcut
              label="Copy call node label"
              shortcut="ctrl,c"
              macShortcut="cmd,c"
            />

            <h2>Marker Table</h2>
            <Shortcut
              label="Copy marker label"
              shortcut="ctrl,c"
              macShortcut="cmd,c"
            />
          </div>
          <div className="appKeyboardShortcutsColumn">
            <h2>Timeline</h2>
            <Shortcut
              label="Select multiple threads"
              shortcut="ctrl,click"
              macShortcut="cmd,click"
            />

            <h2>Call Tree Transforms</h2>
            <Shortcut label="Merge function" shortcut="m" />
            <Shortcut label="Merge node only" shortcut="M" />
            <Shortcut label="Focus on function" shortcut="f" />
            <Shortcut label="Focus on subtree only" shortcut="F" />
            <Shortcut label="Collapse function" shortcut="c" />
            <Shortcut label="Collapse library" shortcut="C" />
            <Shortcut label="Drop samples with this function" shortcut="d" />
          </div>
        </div>
      </>
    );
  }

  render() {
    const { wrapperClassName, children } = this.props;
    const { isOpen } = this.state;
    return (
      <>
        <div
          className={classNames(wrapperClassName, {
            appKeyboardShortcutsNoInteract: isOpen,
          })}
        >
          {children}
        </div>
        {/* Always render this div so that we can target the _focusArea ref outside
            of the React life-cycle. The keyboard shortcuts will only render if the
            modal is actual open. */}
        <div
          className={classNames({ appKeyboardShortcuts: true, open: isOpen })}
        >
          <div
            className="appKeyboardShortcutsBox"
            ref={this._focusArea}
            tabIndex="0"
            role="dialog"
            aria-modal="true"
            aria-labelledby="AppKeyboardShortcutsHeaderTitle"
          >
            {this.maybeRenderShortcuts()}
          </div>
        </div>
      </>
    );
  }
}

type ShortcutProps = $ReadOnly<{|
  label: string,
  shortcut: string,
  macShortcut?: string,
|}>;

function Shortcut(props: ShortcutProps) {
  let shortcut = props.shortcut;
  if (props.macShortcut && window.navigator.platform.includes('Mac')) {
    shortcut = props.macShortcut;
  }
  return (
    <div className="appKeyboardShortcutsRow">
      <div className="appKeyboardShortcutsLabel">{props.label}</div>
      {shortcut.split(',').map((shortcut, index) => (
        <kbd key={index} className="appKeyboardShortcutsShortcut">
          {shortcut}
        </kbd>
      ))}
    </div>
  );
}
