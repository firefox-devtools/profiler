/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';

type Props = {
  +tagName?: string,
  readonly content: string,
  +className?: string,
};

export class CanSelectContent extends React.PureComponent<Props> {
  _selectContent(e: React.MouseEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    input.focus();
    input.select();
  }

  _unselectContent(e: React.MouseEvent<HTMLInputElement>) {
    e.currentTarget.setSelectionRange(0, 0);
  }

  render() {
    const { tagName, content, className } = this.props;
    const TagName = tagName || 'div';

    return (
      <TagName
        className={classNames(className, 'can-select-content')}
        title={`${content}\n(click to select)`}
      >
        <input
          value={content}
          className="can-select-content-input"
          onFocus={this._selectContent}
          onBlur={this._unselectContent}
          readOnly={true}
        />
      </TagName>
    );
  }
}
