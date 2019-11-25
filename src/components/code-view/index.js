/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import TreeView from '../shared/TreeView';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getScrollToSelectionGeneration } from '../../selectors/profile';
import { getSelectedThreadIndex } from '../../selectors/url-state';
import {
  changeExpandedCodeLines,
  changeSelectedCodeLine,
} from '../../actions/profile-view';
import memoize from 'memoize-immutable';

import type { Thread, ThreadIndex } from '../../types/profile';
import type { IndexIntoCallNodeTable } from '../../types/profile-derived';
import type { ConnectedProps } from '../../utils/connect';
import type { CallTree } from '../../profile-logic/call-tree';

require('./index.css');

const FIXED_SCRIPT_LOCATION =
  'http://localhost:4242/92196893a1cdcf9d6cfb.bundle.js';

type CodeLine = number;

export class CodeViewTree {
  _code: string[];
  _thread: Thread;
  _callTree: CallTree;
  // The index of the line of code.
  _codeLinesIndexes: CodeLine[];
  // These are arrays that are like: {[CodeLine]: Timing}
  _selfTimes: number[];
  _runningTimes: number[];

  constructor(
    resourceName: string,
    code: string,
    thread: Thread,
    callTree: CallTree
  ) {
    this._code = code.split('\n');
    this._thread = thread;
    this._callTree = callTree;
    this._selfTimes = Array(this._code.length).fill(0);
    this._runningTimes = Array(this._code.length).fill(0);

    // Compute the self and running times per line in the script.
    this._computeTimingRecursive(callTree.getRoots());

    // Build up an array of indexes, as needed by the TreeView interface.
    // this._codeLinesIndexes = [];
    // for (let i = 0; i < code.length; i++) {
    //   this._codeLinesIndexes[i] = i;
    // }

    // Only build up an array of indexes that have timing.
    this._codeLinesIndexes = [];
    for (let i = 0; i < code.length; i++) {
      if (this._runningTimes[i] > 0) {
        this._codeLinesIndexes.push(i);
      }
    }
  }

  _computeTimingRecursive(callNodes: IndexIntoCallNodeTable[]): void {
    const { funcTable, stringTable } = this._thread;
    for (const callNodeIndex of callNodes) {
      const { selfTime, totalTime, funcIndex } = this._callTree.getNodeData(
        callNodeIndex
      );
      const fileNameIndex = funcTable.fileName[funcIndex];
      const lineNumber = funcTable.lineNumber[funcIndex];
      if (
        fileNameIndex !== null &&
        lineNumber !== null &&
        stringTable.getString(fileNameIndex) === FIXED_SCRIPT_LOCATION
      ) {
        // Line number is 1 based, while arrays are 0 based.
        this._selfTimes[lineNumber - 1] += selfTime;
        this._runningTimes[lineNumber - 1] += totalTime;
      }

      this._computeTimingRecursive(this._callTree.getChildren(callNodeIndex));
    }
  }

  getRoots(): CodeLine[] {
    return this._codeLinesIndexes;
  }

  getChildren(codeLine: CodeLine): CodeLine[] {
    if (codeLine === -1) {
      return this.getRoots();
    }
    const children = [];
    for (let i = codeLine + 1; i < this._code.length; i++) {
      if (this._runningTimes[i] > 0) {
        break;
      }
      children.push(i);
    }
    return children;
  }

  hasChildren(codeLine: CodeLine): boolean {
    return (
      // This running time is not zero.
      this._runningTimes[codeLine] !== 0 &&
      // And the next running time is zero, the line is collapsed into this one.
      this._runningTimes[codeLine + 1] === 0
    );
  }

  getAllDescendants(codeLine: CodeLine): Set<CodeLine> {
    return new Set(this.getChildren(codeLine));
  }

  getParent(codeLine: CodeLine): CodeLine {
    for (let i = codeLine - 1; i >= 0; i--) {
      if (this._runningTimes[i] > 0) {
        return i;
      }
    }
    return -1;
  }

  getDepth(codeLine: CodeLine) {
    // TODO
    return this._runningTimes[codeLine] === 0 ? 1 : 0;
  }

  hasSameNodeIds(tree: CodeViewTree) {
    return this._codeLinesIndexes === tree._codeLinesIndexes;
  }

  getDisplayData(codeLine: CodeLine): * {
    const selfTime = this._selfTimes[codeLine];
    const runningTime = this._runningTimes[codeLine];
    return {
      codeText: <pre>{this._code[codeLine]}</pre>,
      codeSelfTime: selfTime === 0 ? '–' : selfTime,
      codeRunningTime: runningTime === 0 ? '–' : runningTime,
    };
  }
}

class CodeViewTable extends React.PureComponent<{|
  code: string,
  thread: Thread,
  threadIndex: ThreadIndex,
  scrollToSelectionGeneration: number,
  callTree: CallTree,
  changeExpandedCodeLines: typeof changeExpandedCodeLines,
  changeSelectedCodeLine: typeof changeSelectedCodeLine,
  selectedCodeLine: null | CodeLine,
  expandedCodeLines: Array<null | CodeLine>,
|}> {
  _fixedColumns = [
    { propName: 'codeSelfTime', title: 'Self Time' },
    { propName: 'codeRunningTime', title: 'Running Time' },
  ];
  _mainColumn = { propName: 'codeText', title: 'Code' };
  _expandedNodeIds: Array<CodeLine | null> = [];
  _treeView: ?TreeView<*>;
  _takeTreeViewRef = treeView => (this._treeView = treeView);

  getCodeViewTree = memoize((...args) => new CodeViewTree(...args), {
    limit: 1,
  });

  componentDidMount() {
    this.focus();
  }

  componentDidUpdate(prevProps) {
    if (
      this.props.scrollToSelectionGeneration >
      prevProps.scrollToSelectionGeneration
    ) {
      if (this._treeView) {
        this._treeView.scrollSelectionIntoView();
      }
    }
  }

  focus() {
    const treeView = this._treeView;
    if (treeView) {
      treeView.focus();
    }
  }

  _onSelectionChange = (selectedCodeLine: CodeLine) => {
    const { threadIndex, changeSelectedCodeLine } = this.props;
    changeSelectedCodeLine(threadIndex, selectedCodeLine);
  };

  _onExpandedNodesChange = (selectedCodeLines: Array<null | CodeLine>) => {
    const { threadIndex, changeExpandedCodeLines } = this.props;
    changeExpandedCodeLines(threadIndex, selectedCodeLines);
  };

  _onRightClickSelection = (_selectedCodeLine: CodeLine) => {
    // const { threadIndex, changeRightClickedCodeLine } = this.props;
    // changeRightClickedCodeLine(threadIndex, selectedCodeLine);
  };

  render() {
    const {
      code,
      thread,
      callTree,
      selectedCodeLine,
      expandedCodeLines,
    } = this.props;
    const tree = this.getCodeViewTree(
      FIXED_SCRIPT_LOCATION,
      code,
      thread,
      callTree
    );
    return (
      <div
        className="codeViewTable"
        id="code-view-tab"
        role="tabpanel"
        aria-labelledby="code-view-tab-button"
      >
        {/* <CodeViewSettings /> */}
        {code.length === 0 ? (
          'The code text is empty.'
        ) : (
          <TreeView
            maxNodeDepth={0}
            tree={tree}
            fixedColumns={this._fixedColumns}
            mainColumn={this._mainColumn}
            onSelectionChange={this._onSelectionChange}
            onRightClickSelection={this._onRightClickSelection}
            onExpandedNodesChange={this._onExpandedNodesChange}
            selectedNodeId={selectedCodeLine}
            expandedNodeIds={expandedCodeLines}
            rightClickedNodeId={null}
            ref={this._takeTreeViewRef}
            contextMenuId="MarkerContextMenu"
            rowHeight={16}
            indentWidth={10}
          />
        )}
      </div>
    );
  }
}

type State = {|
  code: string | null,
  error: string | null,
|};

type DispatchProps = {|
  changeExpandedCodeLines: typeof changeExpandedCodeLines,
  changeSelectedCodeLine: typeof changeSelectedCodeLine,
|};

type StateProps = {|
  thread: Thread,
  threadIndex: ThreadIndex,
  callTree: CallTree,
  scrollToSelectionGeneration: number,
  expandedCodeLines: Array<null | CodeLine>,
  selectedCodeLine: CodeLine | null,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class CodeView extends React.PureComponent<Props, State> {
  _rafGeneration: number = 0;

  constructor(props) {
    super(props);
    this.state = {
      code: null,
      error: null,
    };
    this.getCode();
  }

  async getCode() {
    try {
      const response = await fetch('/92196893a1cdcf9d6cfb.bundle.js.txt');
      this.setState({
        code: await response.text(),
      });
    } catch (error) {
      this.setState({
        error: `Unable to load the code: ${error.toString()}`,
      });
    }
  }

  render() {
    const { code, error } = this.state;
    if (error) {
      return <div className="jsTracer">Code View</div>;
    }

    if (!code) {
      return <div className="jsTracer">Loading the code</div>;
    }

    const {
      thread,
      threadIndex,
      scrollToSelectionGeneration,
      callTree,
      changeExpandedCodeLines,
      changeSelectedCodeLine,
      expandedCodeLines,
      selectedCodeLine,
    } = this.props;

    return (
      <CodeViewTable
        code={code}
        thread={thread}
        threadIndex={threadIndex}
        callTree={callTree}
        scrollToSelectionGeneration={scrollToSelectionGeneration}
        changeExpandedCodeLines={changeExpandedCodeLines}
        changeSelectedCodeLine={changeSelectedCodeLine}
        expandedCodeLines={expandedCodeLines}
        selectedCodeLine={selectedCodeLine}
      />
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => {
    return {
      thread: selectedThreadSelectors.getFilteredThread(state),
      threadIndex: getSelectedThreadIndex(state),
      callTree: selectedThreadSelectors.getCallTree(state),
      scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
      expandedCodeLines: selectedThreadSelectors.getExpandedCodeLines(state),
      selectedCodeLine: selectedThreadSelectors.getSelectedCodeLine(state),
    };
  },
  mapDispatchToProps: {
    changeExpandedCodeLines,
    changeSelectedCodeLine,
  },
  component: CodeView,
});
