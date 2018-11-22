/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import clamp from 'clamp';
import { oneLine } from 'common-tags';
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import explicitConnect from '../../utils/connect';
import MarkerSettings from '../shared/MarkerSettings';
import VirtualList from '../shared/VirtualList';
import { withSize } from '../shared/WithSize';
import NetworkChartEmptyReasons from './NetworkChartEmptyReasons';
import NetworkChartRow from './NetworkChartRow';
import memoize from 'memoize-immutable';
import MixedTupleMap from 'mixedtuplemap';

import {
  selectedThreadSelectors,
  getCommittedRange,
  getProfileInterval,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { updatePreviewSelection } from '../../actions/profile-view';

import type { SizeProps } from '../shared/WithSize';
import type { NetworkPayload } from '../../types/markers';
import type {
  TracingMarker,
  MarkerTimingRows,
} from '../../types/profile-derived';
import type { Milliseconds, CssPixels } from '../../types/units';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { NetworkChartRowProps } from './NetworkChartRow';

require('./index.css');

const ROW_HEIGHT = 16;

// The SizeProps are injected by the WithSize higher order component.
type OwnProps = SizeProps;

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type StateProps = {|
  +markers: TracingMarker[],
  +networkTimingRows: MarkerTimingRows,
  +maxNetworkRows: number,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +threadIndex: number,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

/*
 * The VirtualListRows only re-render when their items have changed. This information
 * is derived from the current props, which includes time range, container sizing,
 * and the marker information itself. In order to properly update the rows,
 * provide a memoized function that can compute this on the fly.
 */
const _getVirtualListItemsMemoized = memoize(_getVirtualListItems, {
  cache: new MixedTupleMap(),
});

class NetworkChart extends React.PureComponent<Props> {
  _onCopy = (_event: Event) => {
    // No implemented.
  };

  _onKeyDown = (_event: KeyboardEvent) => {
    // No implemented.
  };

  render() {
    const { markers } = this.props;
    return (
      <div className="networkChart">
        <MarkerSettings />
        {markers.length === 0 ? (
          <NetworkChartEmptyReasons />
        ) : (
          <VirtualList
            className="treeViewBody"
            items={_getVirtualListItemsMemoized(this.props)}
            renderItem={_renderRow}
            itemHeight={ROW_HEIGHT}
            columnCount={1}
            focusable={true}
            specialItems={[]}
            containerWidth={3000}
            disableOverscan={false}
            onCopy={this._onCopy}
            onKeyDown={this._onKeyDown}
          />
        )}
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const networkTimingRows = selectedThreadSelectors.getNetworkChartTiming(
      state
    );
    return {
      markers: selectedThreadSelectors.getMergedNetworkChartTracingMarkers(
        state
      ),
      networkTimingRows,
      maxNetworkRows: networkTimingRows.length,
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      threadIndex: getSelectedThreadIndex(state),
    };
  },
  component: NetworkChart,
};

/**
 * Wrap the component in the WithSize higher order component, as well as the redux
 * connected component.
 */
export default withSize(explicitConnect(options));

/**
 * The VirtualListRow only re-renders when the props change, so pass in a pure function
 * rather than a method, so it is clear to not use `this.props`, as this would bypass
 * the update cycle, and rows would not be correctly re-rendered.
 */
function _renderRow(rowProps: NetworkChartRowProps): React.Node {
  return <NetworkChartRow {...rowProps} />;
}

/**
 * Our definition of tracing markers does not currently have the ability to refine
 * the union of all payloads to one specific payload through the type definition.
 * This function does a runtime check to do so.
 */
function _getNetworkPayloadOrNull(
  marker: TracingMarker
): null | NetworkPayload {
  if (!marker.data || marker.data.type !== 'Network') {
    return null;
  }
  return marker.data;
}

/**
 * Convert the time for a network marker into the CssPixels to be used on the screen.
 * This function takes into account the range used, as well as the container sizing
 * as passed in by the WithSize component.
 */
function _timeToCssPixels(props: Props, time: Milliseconds): CssPixels {
  const { timeRange, width } = props;
  const timeRangeTotal = timeRange.end - timeRange.start;
  const innerContainerWidth =
    width - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT;

  const markerPosition =
    (time - timeRange.start) / timeRangeTotal * innerContainerWidth +
    TIMELINE_MARGIN_LEFT;

  // Keep the value bounded to the available viewport area.
  return clamp(markerPosition, 0, width);
}

/**
 * Compute the NetworkChartRowProps for each marker. See _getVirtualListItemsMemoized
 * for more information.
 */
function _getVirtualListItems(props: Props): NetworkChartRowProps[] {
  const { markers, threadIndex } = props;
  return markers.map((marker, markerIndex) => {
    // Since our type definition for TracingMarker can't refine to just Network
    // markers, extract the payload.
    const networkPayload = _getNetworkPayloadOrNull(marker);
    if (networkPayload === null) {
      console.error(
        oneLine`
          The NetworkChart is supposed to only receive Network markers, but some other
          kind of marker payload was passed in.
        `
      );
      return {
        index: markerIndex,
        marker,
        threadIndex,
        networkPayload: null,
        markerStyle: {},
      };
    }
    // Compute the positioning of the network markers.
    const startPosition = _timeToCssPixels(props, networkPayload.startTime);
    const endPosition = _timeToCssPixels(props, networkPayload.endTime);

    // Set min-width for marker bar.
    let markerWidth = endPosition - startPosition;
    if (markerWidth < 1) {
      markerWidth = 2.5;
    }

    return {
      index: markerIndex,
      marker,
      networkPayload,
      threadIndex,
      markerStyle: {
        left: startPosition,
        width: markerWidth,
      },
    };
  });
}
