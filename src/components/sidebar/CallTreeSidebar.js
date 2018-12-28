/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import explicitConnect from '../../utils/connect';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
} from '../../selectors/per-thread';
import { getSelectedThreadIndex } from '../../selectors/url-state';
import { getFunctionName } from '../../profile-logic/function-info';
import { assertExhaustiveCheck } from '../../utils/flow';
import CanSelectContent from './CanSelectContent';

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
import type {
  BreakdownByImplementation,
  StackImplementation,
  CountsForPath,
} from '../../profile-logic/profile-data';

type SidebarDetailProps = {|
  +label: string,
  +children: React.Node,
|};

function SidebarDetail({ label, children }: SidebarDetailProps) {
  return (
    <React.Fragment>
      <div className="sidebar-label">{label}:</div>
      <div className="sidebar-value">{children}</div>
    </React.Fragment>
  );
}

type ImplementationBreakdownProps = {|
  +breakdown: BreakdownByImplementation,
|};

// This component is responsible for displaying the breakdown data specific to
// the JavaScript engine and native code implementation.
class ImplementationBreakdown extends React.PureComponent<
  ImplementationBreakdownProps
> {
  _orderedImplementations: $ReadOnlyArray<StackImplementation> = [
    'native',
    'interpreter',
    'baseline',
    'ion',
    'unknown',
  ];

  _labelizeImplementation(implementation: StackImplementation): string {
    switch (implementation) {
      case 'ion':
      case 'baseline':
        return `JavaScript JIT (${implementation})`;
      case 'interpreter':
        return 'JavaScript interpreter';
      case 'native':
        return 'Native code';
      case 'unknown':
        return implementation;
      default:
        throw assertExhaustiveCheck(implementation);
    }
  }

  render() {
    const { breakdown } = this.props;
    const data = [];

    for (const implementation of this._orderedImplementations) {
      const value = breakdown[implementation];
      if (!value && implementation === 'unknown') {
        continue;
      }

      data.push({
        group: this._labelizeImplementation(implementation),
        value: value || 0,
      });
    }

    return <Breakdown data={data} />;
  }
}

type BreakdownProps = {|
  +data: $ReadOnlyArray<{| group: string, value: Milliseconds |}>,
|};

// This stateless component is responsible for displaying the implementation
// breakdown. It also computes the percentage from the total time.
function Breakdown({ data }: BreakdownProps) {
  const totalCount = data.reduce((result, item) => result + item.value, 0);

  return data.filter(({ value }) => value).map(({ group, value }) => {
    const percentage = Math.round(value / totalCount * 100);

    return (
      <SidebarDetail label={group} key={group}>
        {value} ({percentage}%)
      </SidebarDetail>
    );
  });
}

type StateProps = {|
  +selectedNodeIndex: IndexIntoCallNodeTable | null,
  +callNodeTable: CallNodeTable,
  +selectedThreadIndex: ThreadIndex,
  +name: string,
  +lib: string,
  +timings: CountsForPath,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class CallTreeSidebar extends React.PureComponent<Props> {
  render() {
    const { selectedNodeIndex, name, lib, timings } = this.props;
    const {
      forPath: { selfCount, totalCount },
      forFunc: { selfCount: selfCountForFunc, totalCount: totalTimeForFunc },
      rootTime,
    } = timings;

    if (selectedNodeIndex === null) {
      return (
        <div className="sidebar sidebar-calltree">
          Select a node to display some information about it.
        </div>
      );
    }

    const totalCountPercent = Math.round(totalCount.value / rootTime * 100);
    const selfCountPercent = Math.round(selfCount.value / rootTime * 100);
    const totalTimeForFuncPercent = Math.round(
      totalTimeForFunc.value / rootTime * 100
    );
    const selfCountForFuncPercent = Math.round(
      selfCountForFunc.value / rootTime * 100
    );

    return (
      <aside className="sidebar sidebar-calltree">
        <div className="sidebar-contents-wrapper">
          <header className="sidebar-titlegroup">
            <CanSelectContent
              tagName="h2"
              className="sidebar-title"
              content={name}
            />
            {lib ? (
              <CanSelectContent
                tagName="p"
                className="sidebar-subtitle"
                content={lib}
              />
            ) : null}
          </header>
          <h3 className="sidebar-title2">This selected call node</h3>
          <SidebarDetail label="Running Count">
            {totalCount.value} ({totalCountPercent}%)
          </SidebarDetail>
          <SidebarDetail label="Self Count">
            {selfCount.value
              ? `${selfCount.value} (${selfCountPercent}%)`
              : '—'}
          </SidebarDetail>
          {totalCount.breakdownByImplementation ? (
            <React.Fragment>
              <h4 className="sidebar-title3">
                Implementation – running sample count
              </h4>
              <ImplementationBreakdown
                breakdown={totalCount.breakdownByImplementation}
              />
            </React.Fragment>
          ) : null}
          {selfCount.breakdownByImplementation ? (
            <React.Fragment>
              <h4 className="sidebar-title3">
                Implementation – self sample count
              </h4>
              <ImplementationBreakdown
                breakdown={selfCount.breakdownByImplementation}
              />
            </React.Fragment>
          ) : null}
          <h3 className="sidebar-title2">
            This function across the entire tree
          </h3>
          <SidebarDetail label="Running Count">
            {totalTimeForFunc.value} ({totalTimeForFuncPercent}%)
          </SidebarDetail>
          <SidebarDetail label="Self Count">
            {selfCountForFunc.value
              ? `${selfCountForFunc.value} (${selfCountForFuncPercent}%)`
              : '—'}
          </SidebarDetail>
          {totalTimeForFunc.breakdownByImplementation ? (
            <React.Fragment>
              <h4 className="sidebar-title3">
                Implementation – running sample count
              </h4>
              <ImplementationBreakdown
                breakdown={totalTimeForFunc.breakdownByImplementation}
              />
            </React.Fragment>
          ) : null}
          {selfCountForFunc.breakdownByImplementation ? (
            <React.Fragment>
              <h4 className="sidebar-title3">
                Implementation – self sample count
              </h4>
              <ImplementationBreakdown
                breakdown={selfCountForFunc.breakdownByImplementation}
              />
            </React.Fragment>
          ) : null}
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
