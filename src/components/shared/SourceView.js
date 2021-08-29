/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import classNames from 'classnames';

import { VirtualList } from './VirtualList';

import type { CssPixels } from 'firefox-profiler/types';

import './SourceView.css';

const SourceViewHeader = () => {
  return (
    <div className="sourceViewHeader">
      <span
        className="sourceViewHeaderColumn sourceViewFixedColumn total"
        title="The “total” sample count includes a summary of every sample where this
line was observed to be on the stack. This includes the time where the
line was actually running, and the time spent in the callers from this
line."
      >
        Total
      </span>
      <span
        className="sourceViewHeaderColumn sourceViewFixedColumn self"
        title="The “self” sample count only includes the samples where the line was
the end of the stack. If this line called into other functions,
then the “other” functions’ counts are not included. The “self” count is useful
for understanding where time was actually spent in a program."
      >
        Self
      </span>
      <span className="sourceViewHeaderColumn sourceViewFixedColumn lineNumber"></span>
      <span className="sourceViewHeaderColumn sourceViewMainColumn source"></span>
    </div>
  );
};

interface SourceLineTimings {}

type SourceViewProps = {|
  +timings: SourceLineTimings,
  +source: string,
  +rowHeight: CssPixels,
|};

type LineNumber = number;

export class SourceView extends React.PureComponent<SourceViewProps> {
  _specialItems: [] = [];
  _visibleRows: LineNumber[];
  _sourceLines: string[];
  _list: VirtualList<LineNumber> | null = null;
  _takeListRef = (list: VirtualList<LineNumber> | null) => (this._list = list);

  constructor(props: SourceViewProps) {
    super(props);

    this._visibleRows = this._getAllVisibleRows(props);
    this._sourceLines = props.source.split('\n');
  }

  UNSAFE_componentWillReceiveProps(nextProps: SourceViewProps) {
    if (
      nextProps.source !== this.props.source ||
      nextProps.timings !== this.props.timings
    ) {
      this._visibleRows = this._getAllVisibleRows(nextProps);
      this._sourceLines = nextProps.source.split('\n');
    }
  }

  scrollLineIntoView(lineNumber: number) {
    if (this._list) {
      this._list.scrollItemIntoView(lineNumber - 1, 0);
    }
  }

  _renderRow = (lineNumber: LineNumber, index: number, columnIndex: number) => {
    const { rowHeight } = this.props;
    // React converts height into 'px' values, while lineHeight is valid in
    // non-'px' units.
    const rowHeightStyle = { height: rowHeight, lineHeight: `${rowHeight}px` };

    if (columnIndex === 0) {
      return (
        <div
          className={classNames('sourceViewRow', 'sourceViewRowFixedColumns')}
          style={rowHeightStyle}
        >
          <span className="sourceViewRowColumn sourceViewFixedColumn total"></span>
          <span className="sourceViewRowColumn sourceViewFixedColumn self"></span>
          <span className="sourceViewRowColumn sourceViewFixedColumn lineNumber">
            {lineNumber}
          </span>
        </div>
      );
    }

    return (
      <div
        className={classNames('treeViewRow', 'treeViewRowScrolledColumns')}
        style={rowHeightStyle}
      >
        <code>{this._sourceLines[index]}</code>
      </div>
    );
  };

  _getAllVisibleRows(props: SourceViewProps): LineNumber[] {
    return props.source.split('\n').map((_str, i) => i + 1);
  }

  focus() {
    if (this._list) {
      this._list.focus();
    }
  }

  render() {
    const { rowHeight } = this.props;
    return (
      <div className="sourceView">
        <SourceViewHeader />
        <VirtualList
          className="sourceViewBody"
          items={this._visibleRows}
          renderItem={this._renderRow}
          itemHeight={rowHeight}
          columnCount={2}
          focusable={true}
          specialItems={this._specialItems}
          disableOverscan={false}
          containerWidth={4000}
          ref={this._takeListRef}
        />
      </div>
    );
  }
}
