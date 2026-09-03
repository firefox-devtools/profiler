/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { FunctionList } from './FunctionList';
import { CalleesCallTree, CallersCallTree } from './FuncPanelCallTree';
import { DisclosureBox } from 'firefox-profiler/components/shared/DisclosureBox';
import { FuncPanelViewToggle } from './FuncPanelViewToggle';
import { StackSettings } from 'firefox-profiler/components/shared/StackSettings';
import { TransformNavigator } from 'firefox-profiler/components/shared/TransformNavigator';
import { ResizableWithSplitter } from '../shared/ResizableWithSplitter';
import { getFunctionListSectionsOpen } from 'firefox-profiler/selectors/url-state';
import { changeFunctionListSectionOpen } from 'firefox-profiler/actions/profile-view';

import type { FunctionListSectionsOpenState } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './ProfileFunctionListView.css';

type StateProps = {
  readonly sectionsOpen: FunctionListSectionsOpenState;
};

type DispatchProps = {
  readonly changeFunctionListSectionOpen: typeof changeFunctionListSectionOpen;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class ProfileFunctionListViewImpl extends React.PureComponent<Props> {
  _onCalleesToggle = (isOpen: boolean) => {
    this.props.changeFunctionListSectionOpen('callees', isOpen);
  };
  _onCallersToggle = (isOpen: boolean) => {
    this.props.changeFunctionListSectionOpen('callers', isOpen);
  };

  override render() {
    const { sectionsOpen } = this.props;
    return (
      <div
        className="treeAndSidebarWrapper"
        id="function-list-tab"
        role="tabpanel"
        aria-labelledby="function-list-tab-button"
      >
        <StackSettings hideInvertCallstack />
        <TransformNavigator />
        <div className="functionListViewWrapper">
          <FunctionList />
          <ResizableWithSplitter
            className="funcPanels"
            splitterPosition="start"
            controlledProperty="width"
            percent={true}
            initialSize="50%"
          >
            <DisclosureBox
              label="Callees"
              isOpen={sectionsOpen.callees}
              onToggle={this._onCalleesToggle}
              headerActions={
                <FuncPanelViewToggle
                  panel="callees"
                  flameGraphStartsAtBottom={true}
                />
              }
            >
              <CalleesCallTree />
            </DisclosureBox>
            <DisclosureBox
              label="Callers"
              isOpen={sectionsOpen.callers}
              onToggle={this._onCallersToggle}
              headerActions={
                <FuncPanelViewToggle
                  panel="callers"
                  flameGraphStartsAtBottom={false}
                />
              }
            >
              <CallersCallTree />
            </DisclosureBox>
          </ResizableWithSplitter>
        </div>
      </div>
    );
  }
}

export const ProfileFunctionListView = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    sectionsOpen: getFunctionListSectionsOpen(state),
  }),
  mapDispatchToProps: {
    changeFunctionListSectionOpen,
  },
  component: ProfileFunctionListViewImpl,
});
