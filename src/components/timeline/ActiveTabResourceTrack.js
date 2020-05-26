/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { selectActiveTabTrack } from '../../actions/profile-view';
import {
  getSelectedThreadIndex,
  getSelectedTab,
} from '../../selectors/url-state';
import explicitConnect from '../../utils/connect';
import TrackThread from './TrackThread';
import { assertExhaustiveCheck } from '../../utils/flow';

import type { ActiveTabTrackReference } from '../../types/actions';
import type {
  TrackIndex,
  ActiveTabResourceTrack,
} from '../../types/profile-derived';
import type { ConnectedProps } from '../../utils/connect';

type OwnProps = {|
  +resourceTrack: ActiveTabResourceTrack,
  +trackIndex: TrackIndex,
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
  constructor(props: Props) {
    super(props);
    this.state = {
      isOpen: props.isSelected,
    };
  }

  _onMouseUp = (event: MouseEvent) => {
    const { isSelected } = this.props;
    const { isOpen } = this.state;

    if (event.button === 0) {
      // Don't allow clicks on the threads list to steal focus from the tree view.
      event.preventDefault();
      if (isSelected || !isOpen) {
        // We have two different states for selected tracks and open tracks because
        // non selected tracks also can stay opened. We can only close the track if
        // the track is already selected.
        this.setState(prevState => {
          return { isOpen: !prevState.isOpen };
        });
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
            threadIndex={resourceTrack.threadIndex}
            trackType={isOpen ? 'expanded' : 'condensed'}
          />
        );
      default:
        console.error('Unhandled resourceTrack type', (resourceTrack: empty));
        return null;
    }
  }

  render() {
    const { isSelected, resourceTrack } = this.props;
    const { isOpen } = this.state;

    let trackLabel;
    switch (resourceTrack.type) {
      case 'sub-frame':
        trackLabel = 'Frame:';
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
      <li className="timelineTrack timelineTrackResource">
        {/* This next div is used to mirror the structure of the TimelineGlobalTrack */}
        <div
          className={classNames('timelineTrackRow timelineTrackResourceRow', {
            selected: isSelected,
            opened: isOpen,
          })}
          onMouseUp={this._onMouseUp}
        >
          <div className="timelineTrackResourceLabel">
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
    const selectedThreadIndex = getSelectedThreadIndex(state);
    const selectedTab = getSelectedTab(state);
    const isSelected =
      threadIndex === selectedThreadIndex && selectedTab !== 'network-chart';

    return {
      isSelected,
    };
  },
  mapDispatchToProps: {
    selectActiveTabTrack,
  },
  component: ActiveTabResourceTrackComponent,
});
