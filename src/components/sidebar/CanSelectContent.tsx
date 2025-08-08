/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';

type Props = {
  readonly tagName?: string;
  readonly content: string;
  readonly className?: string;
};

export class CanSelectContent extends React.PureComponent<Props> {
  _selectContent(e: React.FocusEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    input.focus();
    input.select();
  }

  _unselectContent(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.setSelectionRange(0, 0);
  }

  override render() {
    const { tagName, content, className } = this.props;

    return React.createElement(
      tagName ?? 'div',
      {
        className: classNames(className, 'can-select-content'),
        title: `${content}\n(click to select)`,
      },
      <input
        value={content}
        className="can-select-content-input"
        onFocus={this._selectContent}
        onBlur={this._unselectContent}
        readOnly={true}
      />
    );
  }
}
