/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';
import { getTimelineTrackOrganization } from 'firefox-profiler/selectors';
import FullTimeline from '../timeline/FullTimeline';
import ActiveTabTimeline from '../timeline/ActiveTabTimeline';
import OriginsTimelineView from '../timeline/OriginsTimeline';
import { assertExhaustiveCheck } from '../../utils/flow';

import type { ConnectedProps } from '../../utils/connect';
import type { TimelineTrackOrganization } from 'firefox-profiler/types';

type StateProps = {|
  +timelineTrackOrganization: TimelineTrackOrganization,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class Timeline extends React.PureComponent<Props> {
  render() {
    const { timelineTrackOrganization } = this.props;
    switch (timelineTrackOrganization.type) {
      case 'full':
        return <FullTimeline />;
      case 'active-tab':
        return <ActiveTabTimeline />;
      case 'origins':
        return <OriginsTimelineView />;
      default:
        throw assertExhaustiveCheck(
          timelineTrackOrganization,
          `Unhandled ViewType`
        );
    }
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    timelineTrackOrganization: getTimelineTrackOrganization(state),
  }),
  component: Timeline,
});
