/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import JsTracerExpensiveChart from './ExpensiveChart';
import JsTracerSettings from './Settings';
import EmptyReasons from './EmptyReasons';

import { selectedThreadSelectors } from '../../reducers/profile-view';
import { getShowJsTracerSummary } from '../../reducers/url-state';
import { updatePreviewSelection } from '../../actions/profile-view';

import type { JsTracerTable } from '../../types/profile';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type StateProps = {|
  +jsTracerTable: JsTracerTable | null,
  +showJsTracerSummary: boolean,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type State = {|
  wasLoaderMounted: boolean,
|};

const LOADER_WAS_MOUNTED = { wasLoaderMounted: true };
const LOADER_HAS_NOT_BEEN_MOUNTED = { wasLoaderMounted: false };

// Keep track of all of the JsTracerTables seen. It's expensive to compute their
// timing information, so always display a loading screen first before passing them
// on to the the JsTracerExpensiveChart.
const _seenJsTracerTable: WeakSet<JsTracerTable> = new WeakSet();
const _seenJsTracerSummaryTable: WeakSet<JsTracerTable> = new WeakSet();

class JsTracer extends React.PureComponent<Props, State> {
  state: State = LOADER_HAS_NOT_BEEN_MOUNTED;

  _rafGeneration: number = 0;

  componentDidMount() {
    this._checkForNewJsTracerTable(this.props);
  }

  componentWillReceiveProps(props: Props) {
    this._checkForNewJsTracerTable(props);
  }

  /**
   * This method controls how a loader gets displayed to the user while the JsTracerTiming
   * information is computed.
   */
  _checkForNewJsTracerTable({
    jsTracerTable,
    showJsTracerSummary,
  }: Props): void {
    const weakset = showJsTracerSummary
      ? _seenJsTracerTable
      : _seenJsTracerSummaryTable;
    if (jsTracerTable !== null && !weakset.has(jsTracerTable)) {
      weakset.add(jsTracerTable);
      const rafGeneration = ++this._rafGeneration;
      requestAnimationFrame(() => {
        // Ensure the requested frame is the one after the React update.
        requestAnimationFrame(() => {
          if (rafGeneration === this._rafGeneration) {
            this.setState(LOADER_WAS_MOUNTED);
          }
        });
      });
      this.setState(LOADER_HAS_NOT_BEEN_MOUNTED);
    } else {
      this.setState(LOADER_WAS_MOUNTED);
    }
  }

  render() {
    const { jsTracerTable, showJsTracerSummary } = this.props;

    return (
      <div className="jsTracer">
        {jsTracerTable === null || jsTracerTable.events.length === 0 ? (
          <EmptyReasons />
        ) : (
          <>
            <JsTracerSettings />
            {this.state.wasLoaderMounted ? (
              <JsTracerExpensiveChart
                jsTracerTable={jsTracerTable}
                showJsTracerSummary={showJsTracerSummary}
              />
            ) : (
              <div className="jsTracerLoader">
                Re-constructing tracing information from{' '}
                {jsTracerTable.events.length.toLocaleString()} events. This
                might take a moment.
              </div>
            )}
          </>
        )}
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    return {
      jsTracerTable: selectedThreadSelectors.getJsTracerTable(state),
      showJsTracerSummary: getShowJsTracerSummary(state),
    };
  },
  mapDispatchToProps: { updatePreviewSelection },
  component: JsTracer,
};
export default explicitConnect(options);
