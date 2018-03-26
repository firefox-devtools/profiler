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
    return (
      <div className="sidebar sidebar-calltree">
        <h2>
          <div className="sidebar-title">{getFunctionName(data.name)}</div>
          <div className="sidebar-subtitle">{data.lib}</div>
        </h2>
        <div className="sidebar-details">
          <SidebarDetail label="Running Time">{data.totalTime}ms</SidebarDetail>
          <SidebarDetail label="Self Time">
            {/* Note: using isNaN instead of Number.isNaN on purpose, to force a conversion */
            isNaN(data.selfTime) ? data.selfTime : data.selfTime + 'ms'}
          </SidebarDetail>
        </div>
      </div>
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
