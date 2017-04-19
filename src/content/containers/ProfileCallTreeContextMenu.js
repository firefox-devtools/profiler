// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem, SubMenu } from 'react-contextmenu';
import actions from '../actions';
import { connect } from 'react-redux';
import { selectedThreadSelectors } from '../reducers/profile-view';
import copy from 'copy-to-clipboard';

import type { IndexIntoFuncStackTable, FuncStackInfo } from '../../common/types/profile-derived';
import type { Thread } from '../../common/types/profile';

type Props = {
  contextMenuId: string,
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
    const { contextMenuId } = this.props;

    return (
      <ContextMenu id={contextMenuId}>
        <SubMenu title='Copy' hoverDelay='200'>
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
