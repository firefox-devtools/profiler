/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import TreeView from '../shared/TreeView';
import {
  getZeroAt,
  selectedThreadSelectors,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { changeSelectedMarker } from '../../actions/profile-view';
import Settings from './Settings';

import './index.css';

import type { ThreadIndex } from '../../types/profile';
import type {
  TracingMarker,
  IndexIntoTracingMarkers,
} from '../../types/profile-derived';
import type { Milliseconds } from '../../types/units';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type MarkerDisplayData = {|
  timestamp: string,
  name: string,
  category: string,
|};

class MarkerTree {
  _markers: TracingMarker[];
  _zeroAt: Milliseconds;
  _displayDataByIndex: Map<IndexIntoTracingMarkers, MarkerDisplayData>;

  constructor(markers: TracingMarker[], zeroAt: Milliseconds) {
    this._markers = markers;
    this._zeroAt = zeroAt;
    this._displayDataByIndex = new Map();
  }

  getRoots(): IndexIntoTracingMarkers[] {
    const markerIndices = [];
    for (let i = 0; i < this._markers.length; i++) {
      markerIndices.push(i);
    }
    return markerIndices;
  }

  getChildren(markerIndex: IndexIntoTracingMarkers): IndexIntoTracingMarkers[] {
    return markerIndex === -1 ? this.getRoots() : [];
  }

  hasChildren(_markerIndex: IndexIntoTracingMarkers): boolean {
    return false;
  }

  getAllDescendants() {
    return new Set();
  }

  getParent(): IndexIntoTracingMarkers {
    // -1 isn't used, but needs to be compatible with the call tree.
    return -1;
  }

  getDepth() {
    return 0;
  }

  hasSameNodeIds(tree) {
    return this._markers === tree._markers;
  }

  getDisplayData(markerIndex: IndexIntoTracingMarkers): MarkerDisplayData {
    let displayData = this._displayDataByIndex.get(markerIndex);
    if (displayData === undefined) {
      const markers = this._markers;
      let category = 'unknown';
      let name = markers[markerIndex].name;
      if (markers[markerIndex].data) {
        const data = markers[markerIndex].data;

        if (typeof data.category === 'string') {
          category = data.category;
        }

        switch (data.type) {
          case 'tracing':
            if (category === 'log') {
              // name is actually the whole message that was sent to fprintf_stderr. Would you consider that.
              if (name.length > 100) {
                name = name.substring(0, 100) + '...';
              }
            } else {
              name = `[${data.interval}] ${name}`;
            }
            break;

          case 'UserTiming':
            name = `${name} [${data.name}]`;
            break;
          default:
        }
      }

      displayData = {
        timestamp: `${(
          (markers[markerIndex].start - this._zeroAt) /
          1000
        ).toFixed(3)}s`,
        name,
        category,
      };
      this._displayDataByIndex.set(markerIndex, displayData);
    }
    return displayData;
  }
}

type StateProps = {|
  +threadIndex: ThreadIndex,
  +markers: TracingMarker[],
  +selectedMarker: IndexIntoTracingMarkers,
  +zeroAt: Milliseconds,
|};

type DispatchProps = {|
  +changeSelectedMarker: typeof changeSelectedMarker,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class MarkerTable extends PureComponent<Props> {
  _fixedColumns = [
    { propName: 'timestamp', title: 'Time Stamp' },
    { propName: 'category', title: 'Category' },
  ];
  _mainColumn = { propName: 'name', title: '' };
  _expandedNodeIds: Array<IndexIntoTracingMarkers | null> = [];
  _onExpandedNodeIdsChange = () => {};
  _treeView: ?TreeView<MarkerDisplayData>;
  _takeTreeViewRef = treeView => (this._treeView = treeView);

  componentDidMount() {
    this.focus();
  }

  focus() {
    const treeView = this._treeView;
    if (treeView) {
      treeView.focus();
    }
  }

  _onSelectionChange = (selectedMarker: IndexIntoTracingMarkers) => {
    const { threadIndex, changeSelectedMarker } = this.props;
    changeSelectedMarker(threadIndex, selectedMarker);
  };

  render() {
    const { markers, zeroAt, selectedMarker } = this.props;
    const tree = new MarkerTree(markers, zeroAt);
    return (
      <div className="markerTable">
        <Settings />
        <TreeView
          maxNodeDepth={0}
          tree={tree}
          fixedColumns={this._fixedColumns}
          mainColumn={this._mainColumn}
          onSelectionChange={this._onSelectionChange}
          onExpandedNodesChange={this._onExpandedNodeIdsChange}
          selectedNodeId={selectedMarker}
          expandedNodeIds={this._expandedNodeIds}
          ref={this._takeTreeViewRef}
          contextMenuId="MarkersContextMenu"
          rowHeight={16}
          indentWidth={10}
        />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    threadIndex: getSelectedThreadIndex(state),
    markers: selectedThreadSelectors.getSearchFilteredTracingMarkers(state),
    selectedMarker: selectedThreadSelectors.getViewOptions(state)
      .selectedMarker,
    zeroAt: getZeroAt(state),
  }),
  mapDispatchToProps: { changeSelectedMarker },
  component: MarkerTable,
};
export default explicitConnect(options);
