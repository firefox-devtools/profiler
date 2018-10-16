/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// Disabling the call tree's sidebar until it's useful
// https://github.com/devtools-html/perf.html/issues/914
import * as React from 'react';
import classNames from 'classnames';

import CallTreeSidebar from './CallTreeSidebar';
import MarkerSidebar from './MarkerSidebar';

import type { TabSlug } from '../../app-logic/tabs-handling';

import './sidebar.css';

type CanCopyContentProps = {|
  +tagName?: string,
  +content: string,
  +className?: string,
|};

export class CanSelectContent extends React.PureComponent<CanCopyContentProps> {
  _selectContent(e: SyntheticMouseEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    input.focus();
    input.select();
  }

  _unselectContent(e: SyntheticMouseEvent<HTMLInputElement>) {
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

export default function selectSidebar(
  selectedTab: TabSlug
): React.ComponentType<{||}> | null {
  return {
    calltree: CallTreeSidebar,
    'flame-graph': CallTreeSidebar,
    'stack-chart': null,
    'marker-chart': null,
    'marker-table': MarkerSidebar, // MarkerSidebar
    'network-chart': null,
  }[selectedTab];
}
