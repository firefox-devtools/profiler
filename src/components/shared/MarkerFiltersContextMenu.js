/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { MenuItem } from '@firefox-devtools/react-contextmenu';
import { Localized } from '@fluent/react';

import { ContextMenu } from './ContextMenu';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getMarkersSearchString,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors/url-state';
import { getIsMarkerFiltersMenuVisible } from 'firefox-profiler/selectors/app';
import { addTransformToStack } from 'firefox-profiler/actions/profile-view';
import { setMarkerFiltersMenuVisibility } from 'firefox-profiler/actions/app';

import type { ThreadsKey } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +searchString: string,
  +threadsKey: ThreadsKey,
  +isMarkerFiltersMenuVisible: boolean,
|};

type DispatchProps = {|
  +addTransformToStack: typeof addTransformToStack,
  +setMarkerFiltersMenuVisibility: typeof setMarkerFiltersMenuVisibility,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class MarkerFiltersContextMenuImpl extends PureComponent<Props> {
  _onShow = () => {
    this.props.setMarkerFiltersMenuVisibility(true);
  };

  _onHide = () => {
    this.props.setMarkerFiltersMenuVisibility(false);
  };

  filterSamplesByMarker = () => {
    const { searchString, threadsKey, addTransformToStack } = this.props;
    addTransformToStack(threadsKey, {
      type: 'filter-samples',
      filterType: 'marker-search',
      filter: searchString,
    });
  };

  render() {
    return (
      <ContextMenu
        id="MarkerFiltersContextMenu"
        className="markerFiltersContextMenu"
        onShow={this._onShow}
        onHide={this._onHide}
      >
        <MenuItem onClick={this.filterSamplesByMarker}>
          <Localized id="MarkerFiltersContextMenu--drop-samples-outside-of-filtered-markers">
            Drop samples outside of filtered markers
          </Localized>
        </MenuItem>
      </ContextMenu>
    );
  }
}

export const MarkerFiltersContextMenu = explicitConnect<
  {||},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    searchString: getMarkersSearchString(state),
    threadsKey: getSelectedThreadsKey(state),
    isMarkerFiltersMenuVisible: getIsMarkerFiltersMenuVisible(state),
  }),
  mapDispatchToProps: {
    addTransformToStack,
    setMarkerFiltersMenuVisibility,
  },
  component: MarkerFiltersContextMenuImpl,
});
