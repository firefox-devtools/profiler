/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { JsTracerChart } from './Chart';
import { JsTracerSettings } from './Settings';
import { JsTracerEmptyReasons } from './EmptyReasons';

import { getProfile } from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  getShowJsTracerSummary,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors/url-state';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';

import type {
  Profile,
  JsTracerTable,
  ThreadsKey,
} from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './index.css';

type DispatchProps = {
  readonly updatePreviewSelection: typeof updatePreviewSelection;
};

type StateProps = {
  readonly profile: Profile;
  readonly threadsKey: ThreadsKey;
  readonly jsTracerTable: JsTracerTable | null;
  readonly showJsTracerSummary: boolean;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class JsTracerImpl extends React.PureComponent<Props> {
  override render() {
    const { profile, jsTracerTable, showJsTracerSummary, threadsKey } =
      this.props;
    return (
      <div className="jsTracer">
        {jsTracerTable === null || jsTracerTable.events.length === 0 ? (
          <JsTracerEmptyReasons />
        ) : (
          <>
            <JsTracerSettings />
            <JsTracerChart
              profile={profile}
              jsTracerTable={jsTracerTable}
              showJsTracerSummary={showJsTracerSummary}
              threadsKey={threadsKey}
            />
          </>
        )}
      </div>
    );
  }
}

export const JsTracer = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => {
    return {
      profile: getProfile(state),
      threadsKey: getSelectedThreadsKey(state),
      jsTracerTable: selectedThreadSelectors.getJsTracerTable(state),
      showJsTracerSummary: getShowJsTracerSummary(state),
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: JsTracerImpl,
});
