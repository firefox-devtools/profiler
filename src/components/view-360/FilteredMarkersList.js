/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';

import TreeView from '../shared/TreeView';
import {
  getZeroAt,
  selectedThreadSelectors,
} from '../../reducers/profile-view';
import { updatePreviewSelection } from '../../actions/profile-view';
import { getMarkerTree } from '../../profile-logic/marker-tree';
import explicitConnect from '../../utils/connect';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { Milliseconds } from '../../types/units';
import type { TracingMarker } from '../../types/profile-derived';

type OwnProps = {|
  +filter: string | null,
|};

type StateProps = {|
  +zeroAt: Milliseconds,
  +filteredMarkers: TracingMarker[] | null,
|};

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {|
  selectedMarker: number | null,
|};

class FilteredMarkersList extends React.PureComponent<Props, State> {
  state = { selectedMarker: null };
  _fixedColumns = [
    { propName: 'start', title: 'Start' },
    { propName: 'duration', title: 'Duration' },
    { propName: 'category', title: 'Category' },
  ];
  _mainColumn = { propName: 'name', title: '' };
  _expandedNodeIds: Array<number | null> = [];
  _onExpandedNodeIdsChange() {}

  _onSelectionChange = (selectedMarker: number) => {
    const { filteredMarkers, updatePreviewSelection } = this.props;

    this.setState({ selectedMarker });

    if (filteredMarkers) {
      // Flow wants this
      const marker = filteredMarkers[selectedMarker];
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: marker.start,
        selectionEnd: marker.dur ? marker.start + marker.dur : marker.start + 1,
      });
    }
  };

  render() {
    const { filteredMarkers, zeroAt } = this.props;
    const { selectedMarker } = this.state;

    const tree = getMarkerTree(filteredMarkers || [], zeroAt);

    return (
      <TreeView
        maxNodeDepth={0}
        tree={tree}
        fixedColumns={this._fixedColumns}
        mainColumn={this._mainColumn}
        onSelectionChange={this._onSelectionChange}
        onExpandedNodesChange={this._onExpandedNodeIdsChange}
        selectedNodeId={selectedMarker}
        expandedNodeIds={this._expandedNodeIds}
        contextMenuId="MarkersContextMenu"
        rowHeight={16}
        indentWidth={10}
      />
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state, { filter }) => ({
    filteredMarkers: filter
      ? selectedThreadSelectors.getCommittedRangeFilteredTracingMarkersFilteredByString(
          state,
          filter
        )
      : null,
    zeroAt: getZeroAt(state),
  }),
  mapDispatchToProps: { updatePreviewSelection },
  component: FilteredMarkersList,
};
export default explicitConnect(options);
