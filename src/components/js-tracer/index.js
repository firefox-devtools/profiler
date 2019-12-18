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
  selectedThread,
  getShowJsTracerSummary,
  getSelectedThreadIndex,
} from 'selectors';
import { updatePreviewSelection } from '../../actions/profile-view';

import type { Profile, JsTracerTable, ThreadIndex } from '../../types/profile';
import type { ConnectedProps } from '../../utils/connect';

require('./index.css');

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
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

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => {
    return {
      profile: getProfile(state),
      threadIndex: getSelectedThreadIndex(state),
      jsTracerTable: selectedThread.getJsTracerTable(state),
      showJsTracerSummary: getShowJsTracerSummary(state),
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: JsTracer,
});
