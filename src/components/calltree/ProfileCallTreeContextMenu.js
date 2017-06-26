/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem, SubMenu } from 'react-contextmenu';
import actions from '../../actions';
import { connect } from 'react-redux';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import copy from 'copy-to-clipboard';

import type { IndexIntoFuncStackTable, FuncStackInfo } from '../../types/profile-derived';
import type { Thread } from '../../types/profile';

type Props = {
  thread: Thread,
  funcStackInfo: FuncStackInfo,
  selectedFuncStack: IndexIntoFuncStackTable,
}

class ProfileCallTreeContextMenu extends PureComponent {

  constructor(props: Props) {
    super(props);
    (this: any).handleClick = this.handleClick.bind(this);
  }

  copyFunctionName(): void {
    const {
      selectedFuncStack,
      thread: { stringTable, funcTable },
      funcStackInfo: { funcStackTable },
    } = this.props;

    const funcIndex = funcStackTable.func[selectedFuncStack];
    const stringIndex = funcTable.name[funcIndex];
    const name = stringTable.getString(stringIndex);
    copy(name);
  }

  copyStack(): void {
    const {
      selectedFuncStack,
      thread: { stringTable, funcTable },
      funcStackInfo: { funcStackTable },
    } = this.props;

    let stack = '';
    let funcStackIndex = selectedFuncStack;

    do {
      const funcIndex = funcStackTable.func[funcStackIndex];
      const stringIndex = funcTable.name[funcIndex];
      stack += stringTable.getString(stringIndex) + '\n';
      funcStackIndex = funcStackTable.prefix[funcStackIndex];
    } while (funcStackIndex !== -1);

    copy(stack);
  }

  handleClick(event: SyntheticEvent, data: { type: string }): void {
    switch (data.type) {
      case 'copyFunctionName':
        this.copyFunctionName();
        break;
      case 'copyStack':
        this.copyStack();
        break;
    }
  }

  render() {
    return (
      <ContextMenu id={'ProfileCallTreeContextMenu'}>
        <SubMenu title='Copy' hoverDelay={200}>
          <MenuItem onClick={this.handleClick} data={{type: 'copyFunctionName'}}>Function Name</MenuItem>
          <MenuItem onClick={this.handleClick} data={{type: 'copyStack'}}>Stack</MenuItem>
        </SubMenu>
      </ContextMenu>
    );
  }
}

export default connect(state => ({
  thread: selectedThreadSelectors.getFilteredThread(state),
  funcStackInfo: selectedThreadSelectors.getFuncStackInfo(state),
  selectedFuncStack: selectedThreadSelectors.getSelectedFuncStack(state),
}), actions)(ProfileCallTreeContextMenu);
