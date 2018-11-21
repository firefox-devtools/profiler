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
import { getMarkerTree } from '../../profile-logic/marker-tree';

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

import type { MarkerDisplayData } from '../../profile-logic/marker-tree';

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
    const tree = getMarkerTree(markers, zeroAt);
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
