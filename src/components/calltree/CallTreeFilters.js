// @flow
import React, { PureComponent } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';

import ButtonWithPanel from '../shared/ButtonWithPanel';
import ArrowPanel from '../shared/ArrowPanel';
import {
  selectedThreadSelectors,
  getLastAddedFilter,
} from '../../reducers/profile-view';
import {
  getMergeFunctionsList,
  getMergeSubtreeList,
  getSelectedThreadIndex,
} from '../../reducers/url-state';
import { connect } from 'react-redux';
import classNames from 'classnames';
import {
  mergeFunction,
  unmergeFunction,
  mergeSubtree,
  unmergeSubtree,
} from '../../actions/profile-view';

import type { State, LastAddedFilter } from '../../types/reducers';
import type {
  Thread,
  ThreadIndex,
  IndexIntoFuncTable,
} from '../../types/profile';

import './CallTreeFilters.css';

const MERGE_FUNCTION_LABEL = 'merge function';
const MERGE_SUBTREE_LABEL = 'merge subtree';
const REMOVE_FILTER_LABEL = 'remove this filter';
const HINT_ENTER_TIMEOUT = 250;
const HINT_LEAVE_TIMEOUT = 200;
const HINT_ON_DECK_TIMEOUT = 1200;

type Props = {
  mergeFunction: typeof mergeFunction,
  unmergeFunction: typeof unmergeFunction,
  mergeSubtree: typeof mergeSubtree,
  unmergeSubtree: typeof unmergeSubtree,
  mergeFunctionsList: IndexIntoFuncTable[],
  mergeSubtreeList: IndexIntoFuncTable[],
  thread: Thread,
  threadIndex: ThreadIndex,
  lastAddedFilter: LastAddedFilter,
};

class CallTreeFilters extends PureComponent {
  props: Props;

  state: {
    hasAddedFuncAtLeastOnce: boolean,
    lastAddedFunc: string | null,
  };

  _timeoutID: number;
  _scroller: ?HTMLElement;

  constructor(props: Props) {
    super(props);
    (this: any)._renderItem = this._renderItem.bind(this);
    (this: any)._setScrollerElement = this._setScrollerElement.bind(this);
    (this: any)._setScrollerMaxHeight = this._setScrollerMaxHeight.bind(this);
    this._timeoutID = 0;

    this.state = {
      hasAddedFuncAtLeastOnce: false,
      lastAddedFunc: null,
    };
  }

  componentDidMount() {
    window.addEventListener('resize', this._setScrollerMaxHeight, false);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._setScrollerMaxHeight, false);
  }

  _setScrollerElement(scroller: HTMLElement) {
    this._scroller = scroller;
    this._setScrollerMaxHeight();
  }

  _setScrollerMaxHeight() {
    if (this._scroller) {
      // This number is fairly arbitrary, but leave some room at the bottom of the scroller.
      const BOTTOM_MARGIN = 20;
      const { top } = this._scroller.getBoundingClientRect();
      const height = window.innerHeight - top - BOTTOM_MARGIN;
      // Satisfy flow's null checks.
      if (this._scroller) {
        this._scroller.style.maxHeight = `${height}px`;
      }
    }
  }

  componentWillReceiveProps(nextProps: Props) {
    const { threadIndex, lastAddedFilter } = nextProps;
    if (this.props.lastAddedFilter !== nextProps.lastAddedFilter) {
      if (lastAddedFilter && threadIndex === lastAddedFilter.threadIndex) {
        this.setState({
          hasAddedFuncAtLeastOnce: true,
          lastAddedFunc: this._funcIndexToName(lastAddedFilter.funcIndex),
        });
        this._timeoutID++;
        const timeoutID = this._timeoutID;
        setTimeout(() => {
          if (timeoutID === this._timeoutID) {
            this.setState({ lastAddedFunc: null });
          }
        }, HINT_ON_DECK_TIMEOUT);
      }
    }
  }

  _renderItem({ id, name, type }) {
    return (
      <tr className="callTreeFiltersRow" key={type + id}>
        <td className="callTreeFiltersCell callTreeFiltersType">
          {type}
          <select
            className="callTreeFiltersSelect"
            value={type}
            onChange={(event: SyntheticInputEvent) =>
              this._changeFilterType(id, type, event.target.value)}
          >
            <option>
              {MERGE_FUNCTION_LABEL}
            </option>
            <option>
              {MERGE_SUBTREE_LABEL}
            </option>
            <option>
              {REMOVE_FILTER_LABEL}
            </option>
          </select>
        </td>
        <td className="callTreeFiltersCell callTreeFiltersAppliedWhere">
          Entire Thread
        </td>
        <td
          className="callTreeFiltersCell callTreeFiltersListItemName"
          title={name}
        >
          {name}
        </td>
      </tr>
    );
  }

  _changeFilterType(
    funcIndex: IndexIntoFuncTable,
    oldType: string,
    newType: string
  ) {
    const {
      unmergeFunction,
      mergeSubtree,
      unmergeSubtree,
      threadIndex,
    } = this.props;
    switch (oldType) {
      case MERGE_FUNCTION_LABEL:
        unmergeFunction(funcIndex, threadIndex);
        break;
      case MERGE_SUBTREE_LABEL:
        unmergeSubtree(funcIndex, threadIndex);
        break;
    }

    switch (newType) {
      case MERGE_FUNCTION_LABEL:
        mergeFunction(funcIndex, threadIndex);
        this.props.mergeFunction(funcIndex, threadIndex);
        break;
      case MERGE_SUBTREE_LABEL:
        mergeSubtree(funcIndex, threadIndex);
        break;
    }
  }

  _funcIndexToName(funcIndex: IndexIntoFuncTable) {
    const { thread } = this.props;
    return thread.stringTable.getString(thread.funcTable.name[funcIndex]);
  }

  _parseFilters() {
    const { mergeFunctionsList, mergeSubtreeList } = this.props;

    return [
      ...mergeFunctionsList.map(id => ({
        id,
        name: this._funcIndexToName(id),
        type: MERGE_FUNCTION_LABEL,
      })),
      ...mergeSubtreeList.map(id => ({
        id,
        name: this._funcIndexToName(id),
        type: MERGE_SUBTREE_LABEL,
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }

  render() {
    const filters = this._parseFilters();
    const { lastAddedFunc, hasAddedFuncAtLeastOnce } = this.state;
    const panelClass = classNames({
      callTreeFiltersFlash: hasAddedFuncAtLeastOnce && !lastAddedFunc,
      callTreeFilters: true,
    });

    return (
      <div>
        <CSSTransitionGroup
          transitionName="callTreeFiltersTransition"
          transitionEnterTimeout={HINT_ENTER_TIMEOUT}
          transitionLeaveTimeout={HINT_LEAVE_TIMEOUT}
          component="div"
          className="callTreeFiltersTransitionGroup"
        >
          {lastAddedFunc
            ? <div className="callTreeFiltersHintContainer" key={lastAddedFunc}>
                <div className="callTreeFiltersHint">
                  {lastAddedFunc}
                </div>
              </div>
            : null}
        </CSSTransitionGroup>
        <ButtonWithPanel
          className={panelClass}
          label="Filter"
          panel={
            <ArrowPanel
              className="callTreeFiltersPanel"
              title="Merged functions and subtrees"
              offsetDirection="left"
            >
              <div
                className="callTreeFiltersScroller"
                ref={this._setScrollerElement}
              >
                <table className="callTreeFiltersTable">
                  <thead>
                    <tr>
                      <th className="callTreeFiltersCellHeader">Filter</th>
                      <th className="callTreeFiltersCellHeader">Where</th>
                      <th className="callTreeFiltersCellHeader">Function</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filters.length > 0
                      ? filters.map(this._renderItem)
                      : <tr>
                          <td colSpan={3} className="callTreeFiltersEmpty">
                            <p className="callTreeFiltersEmptyP">
                              No filters are currently active. Right click on
                              the call tree, and merge individual functions or
                              entire subtrees into their callers in the call
                              tree. These filters help to hide away noisy
                              functions that get in the way of performance
                              analysis.
                            </p>
                          </td>
                        </tr>}
                  </tbody>
                </table>
              </div>
            </ArrowPanel>
          }
        />
      </div>
    );
  }
}

export default connect(
  (state: State) => {
    const threadIndex = getSelectedThreadIndex(state);
    return {
      thread: selectedThreadSelectors.getThread(state),
      threadIndex,
      lastAddedFilter: getLastAddedFilter(state),
      mergeFunctionsList: getMergeFunctionsList(state, threadIndex),
      mergeSubtreeList: getMergeSubtreeList(state, threadIndex),
    };
  },
  {
    mergeFunction,
    unmergeFunction,
    mergeSubtree,
    unmergeSubtree,
  }
)(CallTreeFilters);
