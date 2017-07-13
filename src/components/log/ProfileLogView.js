/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import actions from '../../actions';
import type { Thread } from '../../types/profile';
import type { State } from '../../types/reducers';

type Props = {
  thread: Thread,
};

class ProfileLogView extends PureComponent {
  props: Props;

  render() {
    const { thread } = this.props;
    const { markers, stringTable } = thread;
    return (
      <div className="logViewWrapper">
        <pre className="logViewPre">
          {markers.data
            .map((data, markerIndex) => markerIndex)
            .filter(markerIndex => {
              const data = markers.data[markerIndex];
              return (
                data !== null &&
                data.type === 'tracing' &&
                data.category === 'log'
              );
            })
            .map(markerIndex => {
              return stringTable.getString(markers.name[markerIndex]);
            })
            .join('')}
        </pre>
      </div>
    );
  }
}

ProfileLogView.propTypes = {
  thread: PropTypes.object.isRequired,
};

export default connect(
  (state: State) => ({
    thread: selectedThreadSelectors.getRangeSelectionFilteredThread(state),
  }),
  actions
)(ProfileLogView);
