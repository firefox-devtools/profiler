/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import { StackSettings } from 'firefox-profiler/components/shared/StackSettings';
import { TransformNavigator } from 'firefox-profiler/components/shared/TransformNavigator';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import type { CallNodeInfo, IndexIntoCallNodeTable } from '../../types';
import type { CallTree as CallTreeType } from 'firefox-profiler/profile-logic/call-tree';
import { CallTree } from './CallTree';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  changeSelectedFunctionTableCallNode,
  changeSelectedCallNode,
} from 'firefox-profiler/actions/profile-view';
import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';

type StateProps = {|
  +tabslug: TabSlug,
  +tree: CallTreeType,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +rightClickedCallNodeIndex: IndexIntoCallNodeTable | null,
  +expandedCallNodeIndexes: Array<IndexIntoCallNodeTable | null>,
  +callNodeMaxDepth: number,
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileFunctionTableViewImpl extends PureComponent<Props> {
  render() {
    return (
      <div
        className="functionTableAndSidebarWrapper"
        role="tabpanel"
        aria-labelledby="function-table-tab-button"
      >
        <StackSettings hideInvertCallstack={true} />
        <TransformNavigator />
        <CallTree {...this.props} />
      </div>
    );
  }
}

const _emptyExpandedCallNodexIndexes = [];

export const ProfileFunctionTableView = explicitConnect<
  {||},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    tabslug: 'function-table',
    tree: selectedThreadSelectors.getFunctionTableCallTree(state),
    callNodeInfo:
      selectedThreadSelectors.getFunctionTableCallNodeInfoWithFuncMapping(state)
        .callNodeInfo,
    selectedCallNodeIndex:
      selectedThreadSelectors.getSelectedFunctionTableCallNodeIndex(state),
    // right clicking is not supported for now
    // as most of the transformations do not make sense in this context
    rightClickedCallNodeIndex: null,
    // we cannot expand any call nodes
    expandedCallNodeIndexes: _emptyExpandedCallNodexIndexes,
    callNodeMaxDepth: 0,
  }),
  mapDispatchToProps: {
    changeSelectedCallNode: changeSelectedFunctionTableCallNode,
  },
  component: ProfileFunctionTableViewImpl,
});
