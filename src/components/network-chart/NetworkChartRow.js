/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
import Tooltip from '../shared/Tooltip';

import type { CssPixels } from '../../types/units';
import type { ThreadIndex } from '../../types/profile';
import type { TracingMarker } from '../../types/profile-derived';
import type { MarkerPayload } from '../../types/markers';

type Props = {
  +marker: TracingMarker,
  +markerStyle: {
    [key: string]: string | number,
  },
  +index: number,
  +threadIndex: ThreadIndex,
};

type State = {
  pageX: CssPixels,
  pageY: CssPixels,
  hovered: ?boolean,
};

class NetworkChartRow extends React.PureComponent<Props, State> {
  state = {
    pageX: 0,
    pageY: 0,
    hovered: false,
  };

  _hoverIn = (event: SyntheticMouseEvent<>) => {
    const pageX = event.pageX;
    const pageY = event.pageY;

    this.setState({
      pageX,
      pageY,
      hovered: true,
    });
  };

  _hoverOut = () => {
    this.setState({
      hovered: false,
    });
  };

  _getMarkerData(marker: TracingMarker): ?MarkerPayload {
    if (marker.data === undefined && marker.data === null) {
      console.error('Network marker has no data!');
      return null;
    }
    return marker.data;
  }

  render() {
    const { marker, markerStyle } = this.props;

    const markerData = this._getMarkerData(marker);

    if (markerData !== null) {
      const itemClassName = ('item ' + markerData.status).toLowerCase();

      return (
        <section className={itemClassName}>
          <div className="itemLabel">{marker.name}</div>
          <div
            className="itemBar"
            style={markerStyle}
            onMouseEnter={this._hoverIn}
            onMouseLeave={this._hoverOut}
          >
            &nbsp;
          </div>
          {this.state.hovered ? (
            <Tooltip mouseX={this.state.pageX} mouseY={this.state.pageY}>
              <MarkerTooltipContents
                marker={marker}
                threadIndex={this.props.threadIndex}
              />
            </Tooltip>
          ) : null}
        </section>
      );
    }
    return null;
  }
}

export default NetworkChartRow;
