/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';

import LongestMarkers from './LongestMarkers';
import FrequentMarkers from './FrequentMarkers';
import FilteredMarkersList from './FilteredMarkersList';

import './View360.css';

type State = {|
  selectedFrequentMarker: string | null,
|};

export default class View360 extends React.PureComponent<{||}, State> {
  state = { selectedFrequentMarker: null };
  onFrequentMarkerSelect = (selectedMarker: string | null) => {
    this.setState({
      selectedFrequentMarker: selectedMarker,
    });
  };

  render() {
    return (
      <section className="view360">
        <div className="view360-overview">
          <LongestMarkers />
          <FrequentMarkers onMarkerSelect={this.onFrequentMarkerSelect} />
        </div>
        <div className="view360-details">
          <FilteredMarkersList filter={this.state.selectedFrequentMarker} />
        </div>
      </section>
    );
  }
}
