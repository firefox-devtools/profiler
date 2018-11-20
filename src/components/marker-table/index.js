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
  getScrollToSelectionGeneration,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { changeSelectedMarker } from '../../actions/profile-view';
import MarkerSettings from '../shared/MarkerSettings';
import { formatSeconds } from '../../utils/format-numbers';

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
  start: string,
  duration: string,
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
      const marker = this._markers[markerIndex];
      let category = 'unknown';
      let name = marker.name;
      if (marker.data) {
        const data = marker.data;

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
            } else if (data.category === 'DOMEvent') {
              name = data.eventType;
            }
            break;

          case 'UserTiming':
            category = name;
            name = data.name;
            break;
          case 'Bailout':
            category = 'Bailout';
            break;
          case 'Network':
            category = 'Network';
            break;
          default:
        }
      }

      displayData = {
        start: _formatStart(marker.start, this._zeroAt),
        duration: _formatDuration(marker.dur),
        name,
        category,
      };
      this._displayDataByIndex.set(markerIndex, displayData);
    }
    return displayData;
  }
}

function _formatStart(start: number, zeroAt) {
  return formatSeconds(start - zeroAt);
}

function _formatDuration(duration: number): string {
  if (duration === 0) {
    return '—';
  }
  let maximumFractionDigits = 1;
  if (duration < 0.01) {
    maximumFractionDigits = 3;
  } else if (duration < 1) {
    maximumFractionDigits = 2;
  }
  return (
    duration.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }) + 'ms'
  );
}

type StateProps = {|
  +threadIndex: ThreadIndex,
  +markers: TracingMarker[],
  +selectedMarker: IndexIntoTracingMarkers,
  +zeroAt: Milliseconds,
  +scrollToSelectionGeneration: number,
|};

type DispatchProps = {|
  +changeSelectedMarker: typeof changeSelectedMarker,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class MarkerTable extends PureComponent<Props> {
  _fixedColumns = [
    { propName: 'start', title: 'Start' },
    { propName: 'duration', title: 'Duration' },
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

  componentDidUpdate(prevProps) {
    if (
      this.props.scrollToSelectionGeneration >
      prevProps.scrollToSelectionGeneration
    ) {
      if (this._treeView) {
        this._treeView.scrollSelectionIntoView();
      }
    }
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
        <MarkerSettings />
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
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    markers: selectedThreadSelectors.getPreviewFilteredTracingMarkers(state),
    selectedMarker: selectedThreadSelectors.getSelectedMarkerIndex(state),
    zeroAt: getZeroAt(state),
  }),
  mapDispatchToProps: { changeSelectedMarker },
  component: MarkerTable,
};
export default explicitConnect(options);
