/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { FunctionList } from './FunctionList';
import { SelfWing } from './SelfWing';
import { UpperWing, LowerWing } from './WingTreeView';
import { DisclosureBox } from 'firefox-profiler/components/shared/DisclosureBox';
import { WingViewToggle } from './WingViewToggle';
import { StackSettings } from 'firefox-profiler/components/shared/StackSettings';
import { TransformNavigator } from 'firefox-profiler/components/shared/TransformNavigator';
import { ResizableWithSplitter } from '../shared/ResizableWithSplitter';
import { getFunctionListSectionsOpen } from 'firefox-profiler/selectors/url-state';
import { changeFunctionListSectionOpen } from 'firefox-profiler/actions/profile-view';

import type { FunctionListSectionsOpenState } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './Butterfly.css';

type StateProps = {
  readonly sectionsOpen: FunctionListSectionsOpenState;
};

type DispatchProps = {
  readonly changeFunctionListSectionOpen: typeof changeFunctionListSectionOpen;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class ProfileFunctionListViewImpl extends React.PureComponent<Props> {
  _onDescendantsToggle = (isOpen: boolean) => {
    this.props.changeFunctionListSectionOpen('descendants', isOpen);
  };
  _onAncestorsToggle = (isOpen: boolean) => {
    this.props.changeFunctionListSectionOpen('ancestors', isOpen);
  };
  _onSelfToggle = (isOpen: boolean) => {
    this.props.changeFunctionListSectionOpen('self', isOpen);
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
        <div className="butterflyWrapper">
          <FunctionList />
          <ResizableWithSplitter
            className="butterflyWings"
            splitterPosition="start"
            controlledProperty="width"
            percent={true}
            initialSize="50%"
          >
            <DisclosureBox
              label="Descendants"
              isOpen={sectionsOpen.descendants}
              onToggle={this._onDescendantsToggle}
              headerActions={<WingViewToggle wing="upper" />}
            >
              <UpperWing />
            </DisclosureBox>
            <DisclosureBox
              label="Ancestors"
              isOpen={sectionsOpen.ancestors}
              onToggle={this._onAncestorsToggle}
              headerActions={<WingViewToggle wing="lower" />}
            >
              <LowerWing />
            </DisclosureBox>
            <DisclosureBox
              label="Self"
              isOpen={sectionsOpen.self}
              onToggle={this._onSelfToggle}
              headerActions={<WingViewToggle wing="self" />}
            >
              <SelfWing />
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
