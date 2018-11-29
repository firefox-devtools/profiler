/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';

import TreeView from '../shared/TreeView';
import {
  getCategories,
  selectedThreadSelectors,
} from '../../reducers/profile-view';
import { BasicTree } from '../../profile-logic/basic-tree';
import explicitConnect from '../../utils/connect';

import type { IndexIntoCategoryList, CategoryList } from '../../types/profile';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type CategoryIndexWithCount = {|
  +categoryIndex: IndexIntoCategoryList,
  +count: number,
|};

type DisplayData = {|
  +categoryName: string,
  +categoryColor: string,
  +count: string,
|};

class Tree extends BasicTree<CategoryIndexWithCount, DisplayData> {
  _categories: CategoryList;

  constructor(
    categoryList: CategoryIndexWithCount[],
    categories: CategoryList
  ) {
    super(categoryList);
    this._categories = categories;
  }

  getDisplayData(index: IndexIntoCategoryList): DisplayData {
    let displayData = this._displayDataByIndex.get(index);
    if (displayData === undefined) {
      const categoryInfo = this._data[index];
      const category = this._categories[categoryInfo.categoryIndex];

      displayData = {
        categoryName: category.name,
        categoryColor: category.color,
        count: categoryInfo.count + 'ms',
      };
      this._displayDataByIndex.set(index, displayData);
    }
    return displayData;
  }
}

type StateProps = {|
  +selfTimeByCategory: Array<CategoryIndexWithCount>,
  +categories: CategoryList,
|};

type DispatchProps = {||};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type State = {|
  selectedCategory: number | null,
|};

class SelftimeByCategory extends React.PureComponent<Props, State> {
  state = { selectedCategory: null };
  _fixedColumns = [{ propName: 'count', title: 'Count' }];
  _mainColumn = { propName: 'categoryName', title: 'Category' };
  _expandedNodeIds: Array<number | null> = [];
  _onExpandedNodeIdsChange() {}

  _onSelectionChange = (selectedCategory: number) => {
    this.setState({ selectedCategory });
  };

  render() {
    const { selfTimeByCategory, categories } = this.props;
    const { selectedCategory } = this.state;

    const tree = new Tree(selfTimeByCategory, categories);

    return (
      <TreeView
        maxNodeDepth={0}
        tree={tree}
        fixedColumns={this._fixedColumns}
        mainColumn={this._mainColumn}
        onSelectionChange={this._onSelectionChange}
        onExpandedNodesChange={this._onExpandedNodeIdsChange}
        selectedNodeId={selectedCategory}
        expandedNodeIds={this._expandedNodeIds}
        contextMenuId="MarkersContextMenu"
        rowHeight={16}
        indentWidth={10}
      />
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    selfTimeByCategory: selectedThreadSelectors.getSelftimeByCategoryOrdered(
      state
    ),
    categories: getCategories(state),
  }),
  component: SelftimeByCategory,
};
export default explicitConnect(options);
