/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import JsTracerChart from './Chart';
import JsTracerSettings from './Settings';
import EmptyReasons from './EmptyReasons';

import {
  getProfile,
  selectedThreadSelectors,
} from '../../reducers/profile-view';
import {
  getShowJsTracerSummary,
  getSelectedThreadIndex,
} from '../../reducers/url-state';
import { updatePreviewSelection } from '../../actions/profile-view';
import { changeSelectedTab } from '../../actions/app';

import type { Profile, JsTracerTable, ThreadIndex } from '../../types/profile';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
  +changeSelectedTab: typeof changeSelectedTab,
|};

type StateProps = {|
  +profile: Profile,
  +threadIndex: ThreadIndex,
  +jsTracerTable: JsTracerTable | null,
  +showJsTracerSummary: boolean,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class JsTracer extends React.PureComponent<Props> {
  _rafGeneration: number = 0;

  componentDidUpdate() {
    const { changeSelectedTab, jsTracerTable } = this.props;
    if (jsTracerTable === null) {
      // If the user switches to another thread that doesn't have JS Tracer information,
      // then switch to the calltree.
      changeSelectedTab('calltree');
    }
  }

  render() {
    const {
      profile,
      jsTracerTable,
      showJsTracerSummary,
      threadIndex,
    } = this.props;
    return (
      <div className="jsTracer">
        {jsTracerTable === null || jsTracerTable.events.length === 0 ? (
          <EmptyReasons />
        ) : (
          <>
            <JsTracerSettings />
            <JsTracerChart
              key={`${threadIndex}-${showJsTracerSummary ? 'true' : 'false'}`}
              profile={profile}
              jsTracerTable={jsTracerTable}
              showJsTracerSummary={showJsTracerSummary}
              threadIndex={threadIndex}
            />
          </>
        )}
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    return {
      profile: getProfile(state),
      threadIndex: getSelectedThreadIndex(state),
      jsTracerTable: selectedThreadSelectors.getJsTracerTable(state),
      showJsTracerSummary: getShowJsTracerSummary(state),
    };
  },
  mapDispatchToProps: { updatePreviewSelection, changeSelectedTab },
  component: JsTracer,
};
export default explicitConnect(options);
