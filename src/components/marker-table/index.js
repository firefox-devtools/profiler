/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import memoize from 'memoize-immutable';

import explicitConnect from '../../utils/connect';
import { TreeView } from '../shared/TreeView';
import { MarkerTableEmptyReasons } from './MarkerTableEmptyReasons';
import {
  getZeroAt,
  getScrollToSelectionGeneration,
  getMarkerSchemaByName,
  getCurrentTableViewOptions,
} from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getSelectedThreadsKey } from '../../selectors/url-state';
import {
  changeSelectedMarker,
  changeRightClickedMarker,
  changeTableViewOptions,
} from '../../actions/profile-view';
import { MarkerSettings } from '../shared/MarkerSettings';
import { formatSeconds, formatTimestamp } from '../../utils/format-numbers';

import './index.css';

import type {
  ThreadsKey,
  Marker,
  MarkerIndex,
  Milliseconds,
  MarkerSchemaByName,
  TableViewOptions,
  SelectionContext,
} from 'firefox-profiler/types';

import type { ConnectedProps } from '../../utils/connect';

// Limit how many characters in the description get sent to the DOM.
const MAX_DESCRIPTION_CHARACTERS = 500;

type MarkerDisplayData = {
  start: string,
  duration: string | null,
  name: string,
  details: string,
};

class MarkerTree {
  _getMarker: (MarkerIndex) => Marker;
  _markerIndexes: MarkerIndex[];
  _zeroAt: Milliseconds;
  _displayDataByIndex: Map<MarkerIndex, MarkerDisplayData>;
  _markerSchemaByName: MarkerSchemaByName;
  _getMarkerLabel: (MarkerIndex) => string;

  constructor(
    getMarker: (MarkerIndex) => Marker,
    markerIndexes: MarkerIndex[],
    zeroAt: Milliseconds,
    markerSchemaByName: MarkerSchemaByName,
    getMarkerLabel: (MarkerIndex) => string
  ) {
    this._getMarker = getMarker;
    this._markerIndexes = markerIndexes;
    this._zeroAt = zeroAt;
    this._displayDataByIndex = new Map();
    this._markerSchemaByName = markerSchemaByName;
    this._getMarkerLabel = getMarkerLabel;
  }

  getRoots(): MarkerIndex[] {
    return this._markerIndexes;
  }

  getChildren(markerIndex: MarkerIndex): MarkerIndex[] {
    return markerIndex === -1 ? this.getRoots() : [];
  }

  hasChildren(_markerIndex: MarkerIndex): boolean {
    return false;
  }

  getAllDescendants() {
    return new Set();
  }

  getParent(): MarkerIndex {
    // -1 isn't used, but needs to be compatible with the call tree.
    return -1;
  }

  getDepth() {
    return 0;
  }

  getDisplayData(markerIndex: MarkerIndex): MarkerDisplayData {
    let displayData = this._displayDataByIndex.get(markerIndex);
    if (displayData === undefined) {
      const marker = this._getMarker(markerIndex);
      let details = this._getMarkerLabel(markerIndex);

      if (details.length > MAX_DESCRIPTION_CHARACTERS) {
        // This was adapted from the log marker payloads as a general rule for
        // the marker table. This way no special handling is needed.
        details = details.substring(0, MAX_DESCRIPTION_CHARACTERS) + '…';
      }

      let duration = null;
      if (marker.incomplete) {
        duration = 'unknown';
      } else if (marker.end !== null) {
        duration = formatTimestamp(marker.end - marker.start);
      }

      displayData = {
        start: _formatStart(marker.start, this._zeroAt),
        duration,
        name: marker.name,
        details,
      };
      this._displayDataByIndex.set(markerIndex, displayData);
    }
    return displayData;
  }
}

function _formatStart(start: number, zeroAt) {
  return formatSeconds(start - zeroAt);
}

type StateProps = {
  +threadsKey: ThreadsKey,
  +getMarker: (MarkerIndex) => Marker,
  +markerIndexes: MarkerIndex[],
  +selectedMarker: MarkerIndex | null,
  +rightClickedMarkerIndex: MarkerIndex | null,
  +zeroAt: Milliseconds,
  +scrollToSelectionGeneration: number,
  +markerSchemaByName: MarkerSchemaByName,
  +getMarkerLabel: (MarkerIndex) => string,
  +tableViewOptions: TableViewOptions,
};

type DispatchProps = {
  +changeSelectedMarker: typeof changeSelectedMarker,
  +changeRightClickedMarker: typeof changeRightClickedMarker,
  +onTableViewOptionsChange: (TableViewOptions) => any,
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class MarkerTableImpl extends PureComponent<Props> {
  _fixedColumns = [
    {
      propName: 'start',
      titleL10nId: 'MarkerTable--start',
      minWidth: 30,
      initialWidth: 90,
      resizable: true,
    },
    {
      propName: 'duration',
      titleL10nId: 'MarkerTable--duration',
      minWidth: 30,
      initialWidth: 80,
      resizable: true,
    },
    {
      propName: 'name',
      titleL10nId: 'MarkerTable--name',
      minWidth: 30,
      initialWidth: 150,
      resizable: true,
    },
  ];
  _mainColumn = { propName: 'details', titleL10nId: 'MarkerTable--details' };
  _expandedNodeIds: Array<MarkerIndex | null> = [];
  _onExpandedNodeIdsChange = () => {};
  _treeView: ?TreeView<MarkerDisplayData>;
  _takeTreeViewRef = (treeView) => (this._treeView = treeView);

  getMarkerTree = memoize((...args) => new MarkerTree(...args), { limit: 1 });

  componentDidMount() {
    this.focus();
    if (this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
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

  _onSelectionChange = (
    selectedMarker: MarkerIndex,
    context: SelectionContext
  ) => {
    const { threadsKey, changeSelectedMarker } = this.props;
    changeSelectedMarker(threadsKey, selectedMarker, context);
  };

  _onRightClickSelection = (selectedMarker: MarkerIndex) => {
    const { threadsKey, changeRightClickedMarker } = this.props;
    changeRightClickedMarker(threadsKey, selectedMarker);
  };

  render() {
    const {
      getMarker,
      markerIndexes,
      zeroAt,
      selectedMarker,
      rightClickedMarkerIndex,
      markerSchemaByName,
      getMarkerLabel,
    } = this.props;
    const tree = this.getMarkerTree(
      getMarker,
      markerIndexes,
      zeroAt,
      markerSchemaByName,
      getMarkerLabel
    );
    return (
      <div
        className="markerTable"
        id="marker-table-tab"
        role="tabpanel"
        aria-labelledby="marker-table-tab-button"
      >
        <MarkerSettings />
        {markerIndexes.length === 0 ? (
          <MarkerTableEmptyReasons />
        ) : (
          <TreeView
            maxNodeDepth={0}
            tree={tree}
            fixedColumns={this._fixedColumns}
            mainColumn={this._mainColumn}
            onSelectionChange={this._onSelectionChange}
            onRightClickSelection={this._onRightClickSelection}
            onExpandedNodesChange={this._onExpandedNodeIdsChange}
            selectedNodeId={selectedMarker}
            rightClickedNodeId={rightClickedMarkerIndex}
            expandedNodeIds={this._expandedNodeIds}
            ref={this._takeTreeViewRef}
            contextMenuId="MarkerContextMenu"
            rowHeight={16}
            indentWidth={10}
            viewOptions={this.props.tableViewOptions}
            onViewOptionsChange={this.props.onTableViewOptionsChange}
          />
        )}
      </div>
    );
  }
}

export const MarkerTable = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    threadsKey: getSelectedThreadsKey(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    getMarker: selectedThreadSelectors.getMarkerGetter(state),
    markerIndexes: selectedThreadSelectors.getMarkerTableMarkerIndexes(state),
    selectedMarker: selectedThreadSelectors.getSelectedMarkerIndex(state),
    rightClickedMarkerIndex:
      selectedThreadSelectors.getRightClickedMarkerIndex(state),
    zeroAt: getZeroAt(state),
    markerSchemaByName: getMarkerSchemaByName(state),
    getMarkerLabel: selectedThreadSelectors.getMarkerTableLabelGetter(state),
    tableViewOptions: getCurrentTableViewOptions(state),
  }),
  mapDispatchToProps: {
    changeSelectedMarker,
    changeRightClickedMarker,
    onTableViewOptionsChange: (tableViewOptions) =>
      changeTableViewOptions('marker-table', tableViewOptions),
  },
  component: MarkerTableImpl,
});
