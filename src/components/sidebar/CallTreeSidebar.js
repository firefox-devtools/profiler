/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import explicitConnect from '../../utils/connect';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { getFunctionName } from '../../profile-logic/function-info';

import type {
  ConnectedProps,
  ExplicitConnectOptions,
} from '../../utils/connect';
import type { ThreadIndex } from '../../types/profile';
import type {
  CallNodeTable,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';
import type { Milliseconds } from '../../types/units';
import type { TimingsForPath } from '../../profile-logic/profile-data';

type SidebarDetailProps = {|
  +label: string,
  +children: React.Node,
|};

function SidebarDetail({ label, children }: SidebarDetailProps) {
  return (
    <React.Fragment>
      <div className="sidebar-label">{label}:</div>
      {children}
    </React.Fragment>
  );
}

type BreakdownProps = {|
  +data: $ReadOnly<{ [mode: string]: Milliseconds }>,
|};

// This stateless component is responsible for displaying the implementation
// breakdown. It also computes the percentage from the total time.
function Breakdown({ data }: BreakdownProps) {
  const dataArray = Object.keys(data)
    .sort()
    .map(implementation => ({ implementation, value: data[implementation] }));
  const totalTime = dataArray.reduce((result, item) => result + item.value, 0);

  return (
    <div className="sidebar-details">
      {dataArray.map(({ implementation, value }) => {
        const percentage = Math.round(value / totalTime * 100);

        return (
          <SidebarDetail label={implementation} key={implementation}>
            {value}ms ({percentage}%)
          </SidebarDetail>
        );
      })}
    </div>
  );
}

type StateProps = {|
  +selectedNodeIndex: IndexIntoCallNodeTable | null,
  +callNodeTable: CallNodeTable,
  +selectedThreadIndex: ThreadIndex,
  +name: string,
  +lib: string,
  +timings: TimingsForPath,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class CallTreeSidebar extends React.PureComponent<Props> {
  render() {
    const { selectedNodeIndex, name, lib, timings } = this.props;
    const {
      forPath: { selfTime, totalTime },
      forFunc: { selfTime: selfTimeForFunc, totalTime: totalTimeForFunc },
      rootTime,
    } = timings;

    if (selectedNodeIndex === null) {
      return (
        <div className="sidebar sidebar-calltree">
          Select a node to display some information about it.
        </div>
      );
    }

    const totalTimePercent = Math.round(totalTime.value / rootTime * 100);
    const selfTimePercent = Math.round(selfTime.value / rootTime * 100);
    const totalTimeForFuncPercent = Math.round(
      totalTimeForFunc.value / rootTime * 100
    );
    const selfTimeForFuncPercent = Math.round(
      selfTimeForFunc.value / rootTime * 100
    );

    return (
      <aside className="sidebar sidebar-calltree">
        <header className="sidebar-titlegroup">
          <h2 className="sidebar-title">{name}</h2>
          {lib ? <p className="sidebar-subtitle">{lib}</p> : null}
        </header>
        <h3 className="sidebar-title2">About the selected path</h3>
        <div className="sidebar-details">
          <SidebarDetail label="Running Time">
            {totalTime.value}ms ({totalTimePercent}%)
          </SidebarDetail>
          <SidebarDetail label="Self Time">
            {selfTime.value ? `${selfTime.value}ms (${selfTimePercent}%)` : '—'}
          </SidebarDetail>
        </div>
        {selfTime.breakdownByImplementation ? (
          <React.Fragment>
            <h4 className="sidebar-title3">Breakdown by implementation</h4>
            <Breakdown data={selfTime.breakdownByImplementation} />
          </React.Fragment>
        ) : null}
        <h3 className="sidebar-title2">This function across the entire tree</h3>
        <div className="sidebar-details">
          <SidebarDetail label="Running Time">
            {totalTimeForFunc.value}ms ({totalTimeForFuncPercent}%)
          </SidebarDetail>
          <SidebarDetail label="Self Time">
            {selfTimeForFunc.value
              ? `${selfTimeForFunc.value}ms (${selfTimeForFuncPercent}%)`
              : '—'}
          </SidebarDetail>
        </div>
      </aside>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => ({
    selectedNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(state),
    callNodeTable: selectedThreadSelectors.getCallNodeInfo(state).callNodeTable,
    selectedThreadIndex: getSelectedThreadIndex(state),
    name: getFunctionName(selectedNodeSelectors.getName(state)),
    lib: selectedNodeSelectors.getLib(state),
    timings: selectedNodeSelectors.getTimingsForSidebar(state),
  }),
  component: CallTreeSidebar,
};

export default explicitConnect(options);
