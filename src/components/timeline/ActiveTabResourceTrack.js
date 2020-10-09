/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { selectActiveTabTrack } from 'firefox-profiler/actions/profile-view';
import {
  getSelectedThreadIndexes,
  getSelectedTab,
} from 'firefox-profiler/selectors/url-state';
import explicitConnect from 'firefox-profiler/utils/connect';
import TrackThread from './TrackThread';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  ActiveTabTrackReference,
  TrackIndex,
  ActiveTabResourceTrack,
  InitialSelectedTrackReference,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {|
  +resourceTrack: ActiveTabResourceTrack,
  +trackIndex: TrackIndex,
  +setInitialSelected: (
    el: InitialSelectedTrackReference,
    forceScroll?: boolean
  ) => void,
|};

type StateProps = {|
  +isSelected: boolean,
|};

type DispatchProps = {|
  +selectActiveTabTrack: typeof selectActiveTabTrack,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {|
  isOpen: boolean,
  prevIsSelected?: boolean,
|};

class ActiveTabResourceTrackComponent extends PureComponent<Props, State> {
  _container: HTMLElement | null = null;
  _isInitialSelectedPane: boolean | null = null;
  constructor(props: Props) {
    super(props);
    this.state = {
      isOpen: props.isSelected,
    };
  }

  _onMouseUp = (
    clickedArea: 'timelineTrackResourceLabel' | 'timelineTrackRow'
  ) => (event: MouseEvent) => {
    const { isSelected } = this.props;
    const { isOpen } = this.state;

    if (event.button === 0) {
      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
      //Only toggle the resource track when the resource label is clicked
      if (clickedArea === 'timelineTrackResourceLabel') {
        if (isSelected || !isOpen) {
          // We have two different states for selected tracks and open tracks because
          // non selected tracks also can stay opened. We can only close the track if
          // the track is already selected.
          this.setState(prevState => {
            return { isOpen: !prevState.isOpen };
          });
        }
      }
      this.props.selectActiveTabTrack(this._getTrackReference());
    }
  };

  _getTrackReference(): ActiveTabTrackReference {
    const { trackIndex } = this.props;
    return { type: 'resource', trackIndex };
  }

  renderTrack() {
    const { resourceTrack } = this.props;
    const { isOpen } = this.state;
    switch (resourceTrack.type) {
      case 'sub-frame':
      case 'thread':
        return (
          <TrackThread
            threadsKey={resourceTrack.threadIndex}
            trackType={isOpen ? 'expanded' : 'condensed'}
            trackName={resourceTrack.name}
          />
        );
      default:
        console.error('Unhandled resourceTrack type', (resourceTrack: empty));
        return null;
    }
  }

  setIsInitialSelectedPane = (value: boolean) => {
    this._isInitialSelectedPane = value;
  };

  componentDidMount() {
    const container = this._container;
    if (container !== null) {
      if (this._isInitialSelectedPane) {
        // Handle the scrolling of the initial selected track into view.
        this.props.setInitialSelected(container);
      }

      // Add an event listener for the end of transition so we can make sure
      // opened tracks are still in the viewport.
      container.addEventListener('transitionend', this._scrollIfNecessary);
    }
  }

  componentWillUnmount() {
    const container = this._container;
    if (container !== null) {
      container.removeEventListener('transitionend', this._scrollIfNecessary);
    }
  }

  _scrollIfNecessary = () => {
    if (this.state.isOpen && this._container !== null) {
      this.props.setInitialSelected(this._container, true);
    }
  };

  _takeContainerRef = (el: HTMLElement | null) => {
    const { isSelected } = this.props;
    this._container = el;

    if (isSelected) {
      this.setIsInitialSelectedPane(true);
    }
  };

  render() {
    const { isSelected, resourceTrack } = this.props;
    const { isOpen } = this.state;

    let trackLabel;
    switch (resourceTrack.type) {
      case 'sub-frame':
        trackLabel = 'IFrame:';
        break;
      case 'thread':
        trackLabel = 'Thread:';
        break;
      default:
        throw assertExhaustiveCheck(
          resourceTrack,
          `Unhandled ActiveTabResourceTrack type.`
        );
    }

    return (
      <li
        ref={this._takeContainerRef}
        className="timelineTrack timelineTrackResource"
      >
        {/* This next div is used to mirror the structure of the TimelineGlobalTrack */}
        <div
          className={classNames('timelineTrackRow timelineTrackResourceRow', {
            selected: isSelected,
            opened: isOpen,
          })}
          onMouseUp={this._onMouseUp('timelineTrackRow')}
        >
          <div
            className="timelineTrackResourceLabel"
            onMouseUp={this._onMouseUp('timelineTrackResourceLabel')}
          >
            <span>{trackLabel}</span> {resourceTrack.name}
          </div>
          <div className="timelineTrackTrack">{this.renderTrack()}</div>
        </div>
      </li>
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state, { resourceTrack }) => {
    const threadIndex = resourceTrack.threadIndex;
    const selectedThreadIndexes = getSelectedThreadIndexes(state);
    const selectedTab = getSelectedTab(state);
    const isSelected =
      selectedThreadIndexes.has(threadIndex) && selectedTab !== 'network-chart';

    return {
      isSelected,
    };
  },
  mapDispatchToProps: {
    selectActiveTabTrack,
  },
  component: ActiveTabResourceTrackComponent,
});
