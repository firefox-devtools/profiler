/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
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
import { assertExhaustiveCheck } from '../../utils/types';
import copy from 'copy-to-clipboard';

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
  start: string;
  duration: string | null;
  name: string;
  details: string;
};

class MarkerTree {
  _getMarker: (param: MarkerIndex) => Marker;
  _markerIndexes: MarkerIndex[];
  _zeroAt: Milliseconds;
  _displayDataByIndex: Map<MarkerIndex, MarkerDisplayData>;
  _markerSchemaByName: MarkerSchemaByName;
  _getMarkerLabel: (param: MarkerIndex) => string;

  constructor(
    getMarker: (param: MarkerIndex) => Marker,
    markerIndexes: MarkerIndex[],
    zeroAt: Milliseconds,
    markerSchemaByName: MarkerSchemaByName,
    getMarkerLabel: (param: MarkerIndex) => string
  ) {
    this._getMarker = getMarker;
    this._markerIndexes = markerIndexes;
    this._zeroAt = zeroAt;
    this._displayDataByIndex = new Map();
    this._markerSchemaByName = markerSchemaByName;
    this._getMarkerLabel = getMarkerLabel;
  }

  copyTable = (
    format: 'plain' | 'markdown',
    onExceeedMaxCopyRows: (rows: number, maxRows: number) => void
  ) => {
    const lines = [];

    const startLabel = 'Start';
    const durationLabel = 'Duration';
    const nameLabel = 'Name';
    const detailsLabel = 'Details';

    const header = [startLabel, durationLabel, nameLabel, detailsLabel];

    let maxStartLength = startLabel.length;
    let maxDurationLength = durationLabel.length;
    let maxNameLength = nameLabel.length;

    const MAX_COPY_ROWS = 10000;

    let roots = this.getRoots();
    if (roots.length > MAX_COPY_ROWS) {
      onExceeedMaxCopyRows(roots.length, MAX_COPY_ROWS);
      roots = roots.slice(0, MAX_COPY_ROWS);
    }

    for (const index of roots) {
      const data = this.getDisplayData(index);
      const duration = data.duration ?? '';

      maxStartLength = Math.max(data.start.length, maxStartLength);
      maxDurationLength = Math.max(duration.length, maxDurationLength);
      maxNameLength = Math.max(data.name.length, maxNameLength);

      lines.push([
        data.start,
        // Use "u" instead, to make the table aligned with fixed-width text.
        duration.replace(/μ/g, 'u'),
        data.name,
        data.details,
      ]);
    }

    let text = '';
    switch (format) {
      case 'plain': {
        const formatter = ([start, duration, name, details]: string[]) => {
          const line = [
            start.padStart(maxStartLength, ' '),
            duration.padStart(maxDurationLength, ' '),
            name.padStart(maxNameLength, ' '),
          ];
          if (details) {
            line.push(details);
          }
          return line.join('  ');
        };

        text += formatter(header) + '\n' + lines.map(formatter).join('\n');
        break;
      }
      case 'markdown': {
        const formatter = ([start, duration, name, details]: string[]) => {
          const line = [
            start.padStart(maxStartLength, ' '),
            duration.padStart(maxDurationLength, ' '),
            name.padStart(maxNameLength, ' '),
            details,
          ];
          return '| ' + line.join(' | ') + ' |';
        };
        const sep =
          '|' +
          [
            '-'.repeat(maxStartLength + 1) + ':',
            '-'.repeat(maxDurationLength + 1) + ':',
            '-'.repeat(maxNameLength + 1) + ':',
            '-'.repeat(9),
          ].join('|') +
          '|';
        text =
          formatter(header) +
          '\n' +
          sep +
          '\n' +
          lines.map(formatter).join('\n');
        break;
      }
      default:
        throw assertExhaustiveCheck(format);
    }

    copy(text);
  };

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

function _formatStart(start: number, zeroAt: number) {
  return formatSeconds(start - zeroAt);
}

type StateProps = {
  readonly threadsKey: ThreadsKey;
  readonly getMarker: (param: MarkerIndex) => Marker;
  readonly markerIndexes: MarkerIndex[];
  readonly selectedMarker: MarkerIndex | null;
  readonly rightClickedMarkerIndex: MarkerIndex | null;
  readonly zeroAt: Milliseconds;
  readonly scrollToSelectionGeneration: number;
  readonly markerSchemaByName: MarkerSchemaByName;
  readonly getMarkerLabel: (param: MarkerIndex) => string;
  readonly tableViewOptions: TableViewOptions;
};

type DispatchProps = {
  readonly changeSelectedMarker: typeof changeSelectedMarker;
  readonly changeRightClickedMarker: typeof changeRightClickedMarker;
  readonly onTableViewOptionsChange: (param: TableViewOptions) => any;
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
  _treeView: TreeView<MarkerDisplayData> | null = null;
  _takeTreeViewRef = (treeView: TreeView<MarkerDisplayData> | null) =>
    (this._treeView = treeView);

  getMarkerTree = memoize(
    (
      getMarker: any,
      markerIndexes: any,
      zeroAt: any,
      markerSchemaByName: any,
      getMarkerLabel: any
    ) =>
      new MarkerTree(
        getMarker,
        markerIndexes,
        zeroAt,
        markerSchemaByName,
        getMarkerLabel
      ),
    { limit: 1 }
  );

  override componentDidMount() {
    this.focus();
    if (this._treeView) {
      this._treeView.scrollSelectionIntoView();
    }
  }

  override componentDidUpdate(prevProps: Props) {
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

  override render() {
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
        <MarkerSettings copyTable={tree.copyTable} />
        {markerIndexes.length === 0 ? (
          <MarkerTableEmptyReasons />
        ) : (
          <TreeView
            maxNodeDepth={0}
            tree={tree as any}
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
