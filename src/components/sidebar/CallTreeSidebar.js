/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { getFunctionName } from '../../profile-logic/function-info';

import type { ExplicitConnectOptions } from '../../utils/connect';
import type { CallTree } from '../../profile-logic/call-tree';
import type { IndexIntoCallNodeTable } from '../../types/profile-derived';

type StateProps = {|
  +tree: CallTree,
  +selectedNodeIndex: IndexIntoCallNodeTable | null,
|};

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

class CallTreeSidebar extends React.PureComponent<StateProps> {
  render() {
    const { tree, selectedNodeIndex } = this.props;
    if (selectedNodeIndex === null) {
      return (
        <div className="sidebar sidebar-calltree">
          Select a node to display some information about it.
        </div>
      );
    }

    const data = tree.getDisplayData(selectedNodeIndex);
    // `data.selfTime` is a string, containing either a number or, if the value
    // is 0, is '—'. So we we use isNaN on purpose (instead of Number.isNaN), to
    // force a conversion and decide whether we should add the unit or keep the
    // character '—'.
    // We don't compare against '—' to avoid hardcoded values. In the future we
    // should have a dedicated method in `tree` to recover the values we need in
    // the format we need.
    const selfTime = isNaN(data.selfTime)
      ? data.selfTime
      : data.selfTime + 'ms';
    return (
      <aside className="sidebar sidebar-calltree">
        <hgroup className="sidebar-titlegroup">
          <h2 className="sidebar-title">{getFunctionName(data.name)}</h2>
          <h3 className="sidebar-subtitle">{data.lib}</h3>
        </hgroup>
        <div className="sidebar-details">
          <SidebarDetail label="Running Time">{data.totalTime}ms</SidebarDetail>
          <SidebarDetail label="Self Time">{selfTime}</SidebarDetail>
        </div>
      </aside>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => ({
    tree: selectedThreadSelectors.getCallTree(state),
    selectedNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(state),
  }),
  component: CallTreeSidebar,
};
export default explicitConnect(options);
