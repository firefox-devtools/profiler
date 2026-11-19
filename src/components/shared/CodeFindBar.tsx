/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import { Localized } from '@fluent/react';

// The parts of CodeMirror's SearchQuery that the find bar can change. This
// component doesn't import @codemirror/search, so that CodeMirror can stay in
// its own bundle chunk.
export type CodeFindBarQuery = {
  readonly search: string;
  readonly caseSensitive: boolean;
  readonly regexp: boolean;
  readonly wholeWord: boolean;
};

type CheckboxName = 'caseSensitive' | 'regexp' | 'wholeWord';

export type CodeFindBarProps = {
  readonly query: CodeFindBarQuery;
  readonly onQueryChange: (query: CodeFindBarQuery) => void;
  readonly onFindNext: () => void;
  readonly onFindPrevious: () => void;
  readonly onClose: () => void;
  // Runs the key bindings for the find bar, such as Escape and F3. Returns
  // true if a binding handled the key.
  readonly onKeyDown: (event: KeyboardEvent) => boolean;
};

/**
 * The find bar for the source view and the assembly view. It's displayed in
 * CodeMirror's panel area, above the code.
 */
export class CodeFindBar extends React.PureComponent<CodeFindBarProps> {
  _input = React.createRef<HTMLInputElement>();

  override componentDidMount() {
    // CodeMirror focuses the find field when the find bar is already open, but
    // not when it's being created, because we render it after CodeMirror has
    // added the panel.
    const input = this._input.current;
    if (input) {
      // CodeMirror uses this attribute to find the field that it focuses when
      // Ctrl/Cmd+F is pressed while the find bar is open.
      input.setAttribute('main-field', 'true');
      input.focus();
      input.select();
    }
  }

  _onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (this.props.onKeyDown(event.nativeEvent)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && event.target === this._input.current) {
      event.preventDefault();
      if (event.shiftKey) {
        this.props.onFindPrevious();
      } else {
        this.props.onFindNext();
      }
    }
  };

  _onSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.props.onQueryChange({
      ...this.props.query,
      search: event.target.value,
    });
  };

  _onCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    if (name === 'caseSensitive' || name === 'regexp' || name === 'wholeWord') {
      this.props.onQueryChange({ ...this.props.query, [name]: checked });
    }
  };

  _renderCheckbox(name: CheckboxName, l10nId: string, label: string) {
    return (
      <label className="photon-label photon-label-micro codeFindBarLabel">
        <input
          type="checkbox"
          className="photon-checkbox photon-checkbox-micro"
          name={name}
          checked={this.props.query[name]}
          onChange={this._onCheckboxChange}
        />
        <Localized id={l10nId}>{label}</Localized>
      </label>
    );
  }

  override render() {
    const { query, onFindNext, onFindPrevious, onClose } = this.props;
    return (
      <div className="codeFindBar" onKeyDown={this._onKeyDown}>
        <Localized
          id="CodeFindBar--search-field"
          attrs={{ placeholder: true, 'aria-label': true }}
        >
          <input
            type="text"
            className="photon-input codeFindBarInput"
            placeholder="Find"
            aria-label="Find"
            value={query.search}
            onChange={this._onSearchChange}
            ref={this._input}
          />
        </Localized>
        <Localized id="CodeFindBar--previous-button" attrs={{ title: true }}>
          <button
            type="button"
            className="photon-button photon-button-default photon-button-micro"
            title="Find the previous match (Shift+Enter)"
            onClick={onFindPrevious}
          >
            Previous
          </button>
        </Localized>
        <Localized id="CodeFindBar--next-button" attrs={{ title: true }}>
          <button
            type="button"
            className="photon-button photon-button-default photon-button-micro"
            title="Find the next match (Enter)"
            onClick={onFindNext}
          >
            Next
          </button>
        </Localized>
        {this._renderCheckbox(
          'caseSensitive',
          'CodeFindBar--match-case',
          'Match case'
        )}
        {this._renderCheckbox(
          'regexp',
          'CodeFindBar--regexp',
          'Regular expression'
        )}
        {this._renderCheckbox(
          'wholeWord',
          'CodeFindBar--whole-word',
          'Whole words'
        )}
        <Localized id="CodeFindBar--close-button" attrs={{ title: true }}>
          <button
            type="button"
            className="photon-button photon-button-ghost codeFindBarCloseButton"
            title="Close the find bar"
            onClick={onClose}
          />
        </Localized>
      </div>
    );
  }
}
