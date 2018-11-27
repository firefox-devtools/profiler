/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';

import TreeView from '../shared/TreeView';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import explicitConnect from '../../utils/connect';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { FrequentMarkerInfo } from '../../types/reducers';

type StateProps = {|
  +frequentMarkers: FrequentMarkerInfo[],
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;
type State = {|
  selectedLine: number | null,
|};

class FrequentMarkerTree {
  _frequentMarkers: FrequentMarkerInfo[];

  constructor(frequentMarkers: FrequentMarkerInfo[]) {
    this._frequentMarkers = frequentMarkers;
  }

  getRoots(): number[] {
    return Array.from({ length: this._frequentMarkers.length }, (_, i) => i);
  }

  getChildren(index: number): number[] {
    return index === -1 ? this.getRoots() : [];
  }

  hasChildren(_index: number): boolean {
    return false;
  }

  getAllDescendants(): Set<number> {
    return new Set();
  }

  getParent(): number {
    // -1 isn't used, but needs to be compatible with the call tree.
    return -1;
  }

  getDepth(): number {
    return 0;
  }

  hasSameNodeIds(tree: FrequentMarkerTree): boolean {
    return this._frequentMarkers === tree._frequentMarkers;
  }

  getDisplayData(index: number): FrequentMarkerInfo {
    return this._frequentMarkers[index];
  }
}

class FrequentMarkers extends React.PureComponent<Props, State> {
  state = { selectedLine: null };

  _fixedColumns = [{ propName: 'name', title: 'Name' }];
  _mainColumn = { propName: 'count', title: '' };
  _expandedNodeIds: Array<number | null> = [];
  _onExpandedNodeIdsChange() {}

  _onSelectionChange = (selectedLine: number) => {
    this.setState({ selectedLine });
  };

  render() {
    const { frequentMarkers } = this.props;
    const { selectedLine } = this.state;

    const tree = new FrequentMarkerTree(frequentMarkers);

    return (
      <TreeView
        maxNodeDepth={0}
        tree={tree}
        fixedColumns={this._fixedColumns}
        mainColumn={this._mainColumn}
        onSelectionChange={this._onSelectionChange}
        onExpandedNodesChange={this._onExpandedNodeIdsChange}
        selectedNodeId={selectedLine}
        expandedNodeIds={this._expandedNodeIds}
        contextMenuId="MarkersContextMenu"
        rowHeight={16}
        indentWidth={10}
      />
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => ({
    frequentMarkers: selectedThreadSelectors.getPreviewFilteredFrequentMarkers(
      state
    ),
  }),
  component: FrequentMarkers,
};
export default explicitConnect(options);
