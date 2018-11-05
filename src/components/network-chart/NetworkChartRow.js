/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
import Tooltip from '../shared/Tooltip';
import copy from 'copy-to-clipboard';

import type { CssPixels } from '../../types/units';
import type { ThreadIndex } from '../../types/profile';
import type { TracingMarker } from '../../types/profile-derived';
import type { NetworkPayload } from '../../types/markers';

export type NetworkChartRowProps = {
  +index: number,
  +marker: TracingMarker,
  // Pass the payload in as well, since our types can't express a TracingMarker with
  // a specific payload.
  +networkPayload: NetworkPayload | null,
  +markerStyle: {
    [key: string]: string | number,
  },
  +threadIndex: ThreadIndex,
};

type State = {
  pageX: CssPixels,
  pageY: CssPixels,
  hovered: ?boolean,
};

class NetworkChartRow extends React.PureComponent<NetworkChartRowProps, State> {
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

  _cropNameToUrl = (name: string) => {
    const url = name.slice(name.indexOf(':') + 2);
    return url;
  };

  // copy URI
  _onDoubleClick = (_event: SyntheticEvent<>): void => {
    // strip marker name to url
    const uri = this._cropNameToUrl(this.props.marker.name);
    // copy url to clipboard
    copy(uri);
  };

  _shortenURI = (name: string) => {
    const loadIdIndex = name.indexOf(':') + 2; // Look for loadId
    const loadId = name.slice(0, loadIdIndex); // Load 123:

    try {
      const uri = new URL(name.slice(loadIdIndex)); // Strip loadId from name to get URI
      const uriProtocol = uri.protocol; // https:// || http://
      const uriDomain = uri.hostname; // abc.domain.xyz
      const uriPath = uri.pathname; // /folder1/folder2/
      const uriFilename = uri.pathname.slice(uri.pathname.lastIndexOf('/')); // filename.xy
      const uriParams = uri.search; // ?param=123
      const uriHash = uri.hash; // #hash

      return (
        <span>
          <span className="uriReq">{loadId}</span>
          <span className="uriOpt">{uriProtocol}</span>
          <span className="uriReq">{uriDomain}</span>
          {uriPath !== uriFilename ? (
            <span className="uriOpt">{uriPath}</span>
          ) : null}
          <span className="uriReq">{uriFilename}</span>
          {uriParams ? <span className="uriOpt">{uriParams}</span> : null}
          {uriHash ? <span className="uriOpt">{uriHash}</span> : null}
        </span>
      );
    } catch (e) {
      console.error('The network marker has no valid URL.');
    }
    return name;
  };

  render() {
    const { index, marker, markerStyle, networkPayload } = this.props;

    const evenOddClassName = index % 2 === 0 ? 'even' : 'odd';

    if (networkPayload === null) {
      return null;
    }
    const itemClassName =
      evenOddClassName + ' networkChartRowItem ' + networkPayload.status;

    return (
      <section className={itemClassName}>
        <div
          className="networkChartRowItemLabel"
          onDoubleClick={this._onDoubleClick}
        >
          {this._shortenURI(marker.name)}
        </div>
        <div
          className="networkChartRowItemBar"
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
}

export default NetworkChartRow;
