/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import explicitConnect from '../../utils/connect';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
  getProfileInterval,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
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
  TimingsForPath,
} from '../../profile-logic/profile-data';
import { formatMilliseconds } from '../../utils/format-numbers';

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
    const isIntervalInteger = false;

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

    return <Breakdown data={data} isIntervalInteger={isIntervalInteger} />;
  }
}

type BreakdownProps = {|
  +data: $ReadOnlyArray<{| group: string, value: Milliseconds |}>,
  +isIntervalInteger: boolean,
|};

// This stateless component is responsible for displaying the implementation
// breakdown. It also computes the percentage from the total time.
function Breakdown({ data, isIntervalInteger }: BreakdownProps) {
  const totalTime = data.reduce((result, item) => result + item.value, 0);

  return data.filter(({ value }) => value).map(({ group, value }) => {
    const percentage = Math.round(value / totalTime * 100);
    const maxFractionalDigits = isIntervalInteger ? 0 : 1;

    return (
      <SidebarDetail label={group} key={group}>
        {formatMilliseconds(value, 2, maxFractionalDigits)} ({percentage}%)
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
  +timings: TimingsForPath,
  +isIntervalInteger: boolean,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class CallTreeSidebar extends React.PureComponent<Props> {
  render() {
    const {
      selectedNodeIndex,
      name,
      lib,
      timings,
      isIntervalInteger,
    } = this.props;
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

    const maxFractionalDigits = isIntervalInteger ? 0 : 1;

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
          <SidebarDetail label="Running Time">
            {formatMilliseconds(totalTime.value, 2, maxFractionalDigits)} ({
              totalTimePercent
            }%)
          </SidebarDetail>
          <SidebarDetail label="Self Time">
            {selfTime.value
              ? `${formatMilliseconds(
                  selfTime.value,
                  2,
                  maxFractionalDigits
                )} (${selfTimePercent}%)`
              : '—'}
          </SidebarDetail>
          {totalTime.breakdownByImplementation ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – running time</h4>
              <ImplementationBreakdown
                breakdown={totalTime.breakdownByImplementation}
              />
            </React.Fragment>
          ) : null}
          {selfTime.breakdownByImplementation ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – self time</h4>
              <ImplementationBreakdown
                breakdown={selfTime.breakdownByImplementation}
              />
            </React.Fragment>
          ) : null}
          <h3 className="sidebar-title2">
            This function across the entire tree
          </h3>
          <SidebarDetail label="Running Time">
            {formatMilliseconds(totalTimeForFunc.value, 2, maxFractionalDigits)}{' '}
            ({totalTimeForFuncPercent}%)
          </SidebarDetail>
          <SidebarDetail label="Self Time">
            {selfTimeForFunc.value
              ? `${formatMilliseconds(
                  selfTimeForFunc.value,
                  2,
                  maxFractionalDigits
                )} (${selfTimeForFuncPercent}%)`
              : '—'}
          </SidebarDetail>
          {totalTimeForFunc.breakdownByImplementation ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – running time</h4>
              <ImplementationBreakdown
                breakdown={totalTimeForFunc.breakdownByImplementation}
              />
            </React.Fragment>
          ) : null}
          {selfTimeForFunc.breakdownByImplementation ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – self time</h4>
              <ImplementationBreakdown
                breakdown={selfTimeForFunc.breakdownByImplementation}
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
    isIntervalInteger: Number.isInteger(getProfileInterval(state)),
  }),
  component: CallTreeSidebar,
};

export default explicitConnect(options);
