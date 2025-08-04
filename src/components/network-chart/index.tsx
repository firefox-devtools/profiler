/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { oneLine } from 'common-tags';
import * as React from 'react';
import memoize from 'memoize-immutable';

import explicitConnect from '../../utils/connect';
import { NetworkSettings } from '../shared/NetworkSettings';
import { VirtualList } from '../shared/VirtualList';
import { withSize } from '../shared/WithSize';
import { NetworkChartEmptyReasons } from './NetworkChartEmptyReasons';
import { NetworkChartRow } from './NetworkChartRow';
import { ContextMenuTrigger } from '../shared/ContextMenuTrigger';

import {
  getScrollToSelectionGeneration,
  getPreviewSelection,
  getPreviewSelectionRange,
} from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getSelectedThreadsKey } from '../../selectors/url-state';
import {
  changeSelectedNetworkMarker,
  changeRightClickedMarker,
  changeHoveredMarker,
} from '../../actions/profile-view';
import type { SizeProps } from '../shared/WithSize';
import type {
  NetworkPayload,
  Marker,
  MarkerIndex,
  StartEndRange,
  ThreadsKey,
  SelectionContext,
} from 'firefox-profiler/types';

import type { ConnectedProps } from '../../utils/connect';

import './index.css';

const ROW_HEIGHT = 16;

// The SizeProps are injected by the WithSize higher order component.
type DispatchProps = {
  readonly changeSelectedNetworkMarker: typeof changeSelectedNetworkMarker;
  readonly changeRightClickedMarker: typeof changeRightClickedMarker;
  readonly changeHoveredMarker: typeof changeHoveredMarker;
};

type StateProps = {
  readonly markerIndexes: MarkerIndex[];
  readonly getMarker: (param: MarkerIndex) => Marker;
  readonly selectedNetworkMarkerIndex: MarkerIndex | null;
  readonly rightClickedMarkerIndex: MarkerIndex | null;
  readonly hoveredMarkerIndexFromState: MarkerIndex | null;
  readonly disableOverscan: boolean;
  readonly timeRange: StartEndRange;
  readonly threadsKey: ThreadsKey;
  readonly scrollToSelectionGeneration: number;
};

type OwnProps = SizeProps;

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class NetworkChartImpl extends React.PureComponent<Props> {
  _virtualListRef = React.createRef<VirtualList<MarkerIndex>>();
  _memoizedGetSpecialItems = memoize(
    (
      selectedNetworkMarkerIndex,
      rightClickedMarkerIndex,
      hoveredMarkerIndex
    ) => {
      const specialItems = [undefined, undefined, undefined];

      if (selectedNetworkMarkerIndex !== null) {
        specialItems[0] = selectedNetworkMarkerIndex;
      }
      if (rightClickedMarkerIndex !== null) {
        specialItems[1] = rightClickedMarkerIndex;
      }
      if (hoveredMarkerIndex !== null) {
        specialItems[2] = hoveredMarkerIndex;
      }
      return specialItems;
    },
    { limit: 1 }
  );

  override componentDidMount() {
    this.focus();
    this.scrollSelectionIntoView();
  }

  override componentDidUpdate(prevProps: Props) {
    if (
      this.props.scrollToSelectionGeneration >
      prevProps.scrollToSelectionGeneration
    ) {
      this.scrollSelectionIntoView();
    }
  }

  focus() {
    if (this._virtualListRef.current) {
      this._virtualListRef.current.focus();
    }
  }

  _getSpecialItems = () => {
    const {
      selectedNetworkMarkerIndex,
      rightClickedMarkerIndex,
      hoveredMarkerIndexFromState,
    } = this.props;
    return this._memoizedGetSpecialItems(
      selectedNetworkMarkerIndex,
      rightClickedMarkerIndex,
      hoveredMarkerIndexFromState
    );
  };

  scrollSelectionIntoView() {
    const { selectedNetworkMarkerIndex, markerIndexes } = this.props;
    const list = this._virtualListRef.current;
    if (list && selectedNetworkMarkerIndex !== null) {
      const selectedRowIndex = markerIndexes.findIndex(
        (markerIndex) => markerIndex === selectedNetworkMarkerIndex
      );
      list.scrollItemIntoView(selectedRowIndex, 0);
    }
  }

  _onCopy = (_event: Event) => {
    // Not implemented.
  };

  _onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const hasModifier = event.ctrlKey || event.altKey;
    const isNavigationKey =
      event.key.startsWith('Arrow') ||
      event.key.startsWith('Page') ||
      event.key === 'Home' ||
      event.key === 'End';
    const isAsteriskKey = event.key === '*';
    const isEnterKey = event.key === 'Enter';

    if (hasModifier || (!isNavigationKey && !isAsteriskKey && !isEnterKey)) {
      // No key events that we care about were found, so don't try and handle them.
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    const selected = this.props.selectedNetworkMarkerIndex;
    const allRows = this.props.markerIndexes;
    const selectedRowIndex = allRows.findIndex(
      (markerIndex) => markerIndex === selected
    );

    if (selected === null || selectedRowIndex === -1) {
      // the first condition is redundant, but it makes flow happy
      this._selectWithKeyboard(allRows[0]);
      return;
    }
    if (isNavigationKey) {
      switch (event.key) {
        case 'ArrowUp': {
          if (event.metaKey) {
            // On MacOS this is a common shortcut for the Home gesture
            this._selectWithKeyboard(allRows[0]);
            break;
          }

          if (selectedRowIndex > 0) {
            this._selectWithKeyboard(allRows[selectedRowIndex - 1]);
          }
          break;
        }
        case 'ArrowDown': {
          if (event.metaKey) {
            // On MacOS this is a common shortcut for the End gesture
            this._selectWithKeyboard(allRows[allRows.length - 1]);
            break;
          }
          if (selectedRowIndex < allRows.length - 1) {
            this._selectWithKeyboard(allRows[selectedRowIndex + 1]);
          }
          break;
        }
        case 'PageUp': {
          if (selectedRowIndex > 0) {
            const nextRow = Math.max(0, selectedRowIndex - ROW_HEIGHT);
            this._selectWithKeyboard(allRows[nextRow]);
          }
          break;
        }
        case 'PageDown': {
          if (selectedRowIndex < allRows.length - 1) {
            const nextRow = Math.min(
              allRows.length - 1,
              selectedRowIndex + ROW_HEIGHT
            );
            this._selectWithKeyboard(allRows[nextRow]);
          }
          break;
        }
        case 'Home': {
          this._selectWithKeyboard(allRows[0]);
          break;
        }
        case 'End': {
          this._selectWithKeyboard(allRows[allRows.length - 1]);
          break;
        }
        default:
          throw new Error('Unhandled navigation key.');
      }
    }
  };

  _onRightClick = (selectedNetworkMarkerIndex: MarkerIndex) => {
    const { threadsKey, changeRightClickedMarker } = this.props;
    changeRightClickedMarker(threadsKey, selectedNetworkMarkerIndex);
  };

  _onLeftClick = (selectedNetworkMarkerIndex: MarkerIndex) => {
    this._onSelectionChange(selectedNetworkMarkerIndex, { source: 'pointer' });
  };

  _selectWithKeyboard(selectedNetworkMarkerIndex: MarkerIndex) {
    this._onSelectionChange(selectedNetworkMarkerIndex, { source: 'keyboard' });
  }

  _onSelectionChange = (
    selectedNetworkMarkerIndex: MarkerIndex,
    context: SelectionContext
  ) => {
    const { threadsKey, changeSelectedNetworkMarker } = this.props;
    changeSelectedNetworkMarker(
      threadsKey,
      selectedNetworkMarkerIndex,
      context
    );
  };

  _onRowHovered = (hoveredMarkerIndex: MarkerIndex | null) => {
    const { threadsKey, changeHoveredMarker } = this.props;
    changeHoveredMarker(threadsKey, hoveredMarkerIndex);
  };

  _onMouseLeaveRenderedList = () => {
    const { threadsKey, changeHoveredMarker } = this.props;
    changeHoveredMarker(threadsKey, null);
  };

  _shouldDisplayTooltips = () => this.props.rightClickedMarkerIndex === null;

  _renderRow = (markerIndex: MarkerIndex, index: number): React.ReactNode => {
    const {
      threadsKey,
      getMarker,
      rightClickedMarkerIndex,
      selectedNetworkMarkerIndex,
      hoveredMarkerIndexFromState,
      timeRange,
      width,
    } = this.props;
    const marker = getMarker(markerIndex);

    // Since our type definition for Marker can't refine to just Network
    // markers, extract the payload using an utility function.
    const networkPayload = _getNetworkPayloadOrNull(marker);
    if (networkPayload === null) {
      throw new Error(
        oneLine`
          The NetworkChart is supposed to only receive Network markers, but some other
          kind of marker payload was passed in.
        `
      );
    }

    return (
      <NetworkChartRow
        index={index}
        marker={marker}
        markerIndex={markerIndex}
        networkPayload={networkPayload}
        threadsKey={threadsKey}
        timeRange={timeRange}
        width={width}
        shouldDisplayTooltips={this._shouldDisplayTooltips}
        isRightClicked={rightClickedMarkerIndex === markerIndex}
        isHoveredFromState={hoveredMarkerIndexFromState === markerIndex}
        onRightClick={this._onRightClick}
        isSelected={selectedNetworkMarkerIndex === markerIndex}
        onLeftClick={this._onLeftClick}
        onHover={this._onRowHovered}
      />
    );
  };

  override render() {
    const {
      selectedNetworkMarkerIndex,
      markerIndexes,
      width,
      timeRange,
      disableOverscan,
    } = this.props;

    // We want to force a full rerender whenever the width or the range changes.
    // We compute a string using these values, so that when one of the value
    // changes the string changes and forces a rerender of the whole
    // VirtualList. See also the comments around this value in the VirtualList
    // component definition file.
    const forceRenderKey = `${timeRange.start}-${timeRange.end}-${width}`;

    return (
      <div
        className="networkChart"
        id="network-chart-tab"
        role="tabpanel"
        aria-labelledby="network-chart-tab-button"
      >
        <NetworkSettings />
        {markerIndexes.length === 0 ? (
          <NetworkChartEmptyReasons />
        ) : (
          <ContextMenuTrigger
            id="MarkerContextMenu"
            attributes={{ className: 'treeViewContextMenu' }}
          >
            <VirtualList
              className="treeViewBody"
              ariaRole="listbox"
              ariaLabel="List of all network markers"
              ariaActiveDescendant={
                selectedNetworkMarkerIndex !== null
                  ? `networkChartRowItem-${selectedNetworkMarkerIndex}`
                  : undefined
              }
              items={markerIndexes}
              renderItem={this._renderRow}
              itemHeight={ROW_HEIGHT}
              columnCount={1}
              focusable={true}
              specialItems={this._getSpecialItems()}
              containerWidth={width}
              forceRender={forceRenderKey}
              disableOverscan={disableOverscan}
              onCopy={this._onCopy}
              onKeyDown={this._onKeyDown}
              ref={this._virtualListRef}
              onMouseLeaveRenderedList={this._onMouseLeaveRenderedList}
            />
          </ContextMenuTrigger>
        )}
      </div>
    );
  }
}

/**
 * Wrap the component in the WithSize higher order component, as well as the redux
 * connected component.
 */
const ConnectedComponent = explicitConnect<OwnProps, StateProps, DispatchProps>(
  {
    mapStateToProps: (state) => ({
      markerIndexes:
        selectedThreadSelectors.getSearchFilteredNetworkMarkerIndexes(state),
      scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
      getMarker: selectedThreadSelectors.getMarkerGetter(state),
      selectedNetworkMarkerIndex:
        selectedThreadSelectors.getSelectedNetworkMarkerIndex(state),
      rightClickedMarkerIndex:
        selectedThreadSelectors.getRightClickedMarkerIndex(state),
      hoveredMarkerIndexFromState:
        selectedThreadSelectors.getHoveredMarkerIndex(state),
      timeRange: getPreviewSelectionRange(state),
      disableOverscan: getPreviewSelection(state).isModifying,
      threadsKey: getSelectedThreadsKey(state),
    }),
    mapDispatchToProps: {
      changeSelectedNetworkMarker,
      changeRightClickedMarker,
      changeHoveredMarker,
    },
    component: NetworkChartImpl,
  }
);

export const NetworkChart = withSize(ConnectedComponent);

/**
 * Our definition of markers does not currently have the ability to refine
 * the union of all payloads to one specific payload through the type definition.
 * This function does a runtime check to do so.
 */
function _getNetworkPayloadOrNull(marker: Marker): null | NetworkPayload {
  if (!marker.data || marker.data.type !== 'Network') {
    return null;
  }
  return marker.data;
}
