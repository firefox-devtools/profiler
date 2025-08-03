/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { PureComponent } from 'react';
import { MenuItem } from '@firefox-devtools/react-contextmenu';
import { Localized } from '@fluent/react';

import { ContextMenu } from './ContextMenu';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getMarkersSearchString,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors/url-state';
import { addTransformToStack } from 'firefox-profiler/actions/profile-view';

import { ThreadsKey } from 'firefox-profiler/types';
import { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {
  readonly onShow: () => void;
  readonly onHide: () => void;
};

type StateProps = {
  readonly searchString: string;
  readonly threadsKey: ThreadsKey;
};

type DispatchProps = {
  readonly addTransformToStack: typeof addTransformToStack;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class MarkerFiltersContextMenuImpl extends PureComponent<Props> {
  filterSamplesByMarker = () => {
    const { searchString, threadsKey, addTransformToStack } = this.props;
    addTransformToStack(threadsKey, {
      type: 'filter-samples',
      filterType: 'marker-search',
      filter: searchString,
    });
  };

  override render() {
    const { searchString, onShow, onHide } = this.props;
    return (
      <ContextMenu
        id="MarkerFiltersContextMenu"
        className="markerFiltersContextMenu"
        onShow={onShow}
        onHide={onHide}
      >
        <MenuItem onClick={this.filterSamplesByMarker}>
          <Localized
            id="MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching"
            vars={{ filter: searchString }}
            elems={{ strong: <strong /> }}
          >
            {/* Using a fragment here so we can have a strong tag inside. */}
            <>
              Drop samples outside of markers matching “
              <strong>${searchString}</strong>”
            </>
          </Localized>
        </MenuItem>
      </ContextMenu>
    );
  }
}

export const MarkerFiltersContextMenu = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    searchString: getMarkersSearchString(state),
    threadsKey: getSelectedThreadsKey(state),
  }),
  mapDispatchToProps: {
    addTransformToStack,
  },
  component: MarkerFiltersContextMenuImpl,
});
