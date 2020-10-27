/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import explicitConnect from 'firefox-profiler/utils/connect';
import { withSize } from 'firefox-profiler/components//shared/WithSize';
import { getIsActiveTabResourcesPanelOpen } from 'firefox-profiler/selectors/url-state';
import { getActiveTabResourcesThreadsKey } from 'firefox-profiler/selectors/profile';
import { toggleResourcesPanel } from 'firefox-profiler/actions/app';
import { ACTIVE_TAB_TIMELINE_RESOURCES_HEADER_HEIGHT } from 'firefox-profiler/app-logic/constants';
import ActiveTabTimelineResourceTrack from './ActiveTabResourceTrack';
import TrackThread from './TrackThread';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type {
  ActiveTabResourceTrack,
  InitialSelectedTrackReference,
  ThreadsKey,
} from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {|
  +resourceTracks: ActiveTabResourceTrack[],
  +setInitialSelected: (
    el: InitialSelectedTrackReference,
    forceScroll?: boolean
  ) => void,
|};

type StateProps = {|
  isActiveTabResourcesPanelOpen: boolean,
  resourcesThreadsKey: ThreadsKey,
|};

type DispatchProps = {|
  +toggleResourcesPanel: typeof toggleResourcesPanel,
|};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
|};

class ActiveTabResourcesPanel extends React.PureComponent<Props> {
  render() {
    const {
      resourceTracks,
      toggleResourcesPanel,
      isActiveTabResourcesPanelOpen,
      setInitialSelected,
      resourcesThreadsKey,
    } = this.props;
    return (
      <div
        className="timelineResources"
        style={{
          '--resources-header-height': `${ACTIVE_TAB_TIMELINE_RESOURCES_HEADER_HEIGHT}px`,
        }}
      >
        <div
          onClick={toggleResourcesPanel}
          className={classNames('timelineResourcesHeader', {
            opened: isActiveTabResourcesPanelOpen,
          })}
        >
          Resources ({resourceTracks.length})
          <TrackThread
            threadsKey={resourcesThreadsKey}
            trackType="condensed"
            trackName="Merged resource tracks"
          />
        </div>
        {isActiveTabResourcesPanelOpen ? (
          <ol className="timelineResourceTracks">
            {resourceTracks.map((resourceTrack, trackIndex) => (
              <ActiveTabTimelineResourceTrack
                key={trackIndex}
                resourceTrack={resourceTrack}
                trackIndex={trackIndex}
                setInitialSelected={setInitialSelected}
              />
            ))}
          </ol>
        ) : null}
      </div>
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    isActiveTabResourcesPanelOpen: getIsActiveTabResourcesPanelOpen(state),
    resourcesThreadsKey: getActiveTabResourcesThreadsKey(state),
  }),
  mapDispatchToProps: { toggleResourcesPanel },
  component: withSize<Props>(ActiveTabResourcesPanel),
});
