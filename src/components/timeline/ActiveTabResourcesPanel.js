/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import explicitConnect from '../../utils/connect';
import { withSize } from '../shared/WithSize';
import { getIsActiveTabResourcesOpen } from '../../selectors/url-state';
import { toggleResourcesPanel } from '../../actions/app';
import { ACTIVE_TAB_TIMELINE_RESOURCES_HEADER_HEIGHT } from '../../app-logic/constants';

import type { SizeProps } from '../shared/WithSize';
import type { LocalTrack } from '../../types/profile-derived';
import type { ConnectedProps } from '../../utils/connect';

type OwnProps = {|
  +resourceTracks: LocalTrack[],
  +setIsInitialSelectedPane: (value: boolean) => void,
|};

type StateProps = {|
  isActiveTabResourcesOpen: boolean,
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
      isActiveTabResourcesOpen,
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
            opened: isActiveTabResourcesOpen,
          })}
        >
          Resources ({resourceTracks.length})
        </div>
        {isActiveTabResourcesOpen ? (
          <ol className="timelineResourceTracks">
            {/* TODO: Add the Resource tracks here */}
          </ol>
        ) : null}
      </div>
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    isActiveTabResourcesOpen: getIsActiveTabResourcesOpen(state),
  }),
  mapDispatchToProps: { toggleResourcesPanel },
  component: withSize<Props>(ActiveTabResourcesPanel),
});
