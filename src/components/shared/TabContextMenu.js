/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { MenuItem } from '@firefox-devtools/react-contextmenu';
import classNames from 'classnames';

import { ContextMenu } from './ContextMenu';
import explicitConnect from 'firefox-profiler/utils/connect';
import { changeTabFilter } from 'firefox-profiler/actions/receive-profile';
import { getTabFilter } from '../../selectors/url-state';
import { getProfileFilterSortedPageData } from 'firefox-profiler/selectors/profile';

import type { TabID } from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { SortedTabPageData } from 'firefox-profiler/selectors/profile';

type StateProps = {|
  +tabFilter: TabID | null,
  +sortedPageData: SortedTabPageData | null,
|};

type DispatchProps = {|
  +changeTabFilter: typeof changeTabFilter,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

import './TabContextMenu.css';

class TabContextMenuImpl extends React.PureComponent<Props> {
  _handleClick = (event: SyntheticEvent<>, data: { id: TabID }): void => {
    this.props.changeTabFilter(data.id);
  };

  renderContextMenuContents() {
    const { sortedPageData, tabFilter } = this.props;
    if (!sortedPageData) {
      return null;
    }

    return (
      <>
        <MenuItem
          key={0}
          onClick={this._handleClick}
          data={{ id: null }}
          attributes={{
            className: classNames('tabContextMenuItem', {
              checkable: true,
              checked: tabFilter === null,
            }),
            'aria-checked': tabFilter === null ? 'false' : 'true',
          }}
        >
          Full Profile
        </MenuItem>
        {sortedPageData.map(({ tabID, pageData }) => (
          <MenuItem
            key={tabID}
            onClick={this._handleClick}
            data={{ id: tabID }}
            attributes={{
              className: classNames('tabContextMenuItem', {
                checkable: true,
                checked: tabFilter === tabID,
              }),
              'aria-checked': tabFilter === tabID ? 'false' : 'true',
            }}
          >
            {pageData.hostname}
          </MenuItem>
        ))}
      </>
    );
  }

  render() {
    return (
      <ContextMenu id="TabContextMenu" className="TabContextMenu">
        {this.renderContextMenuContents()}
      </ContextMenu>
    );
  }
}

export const TabContextMenu = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => {
    const tabFilter = getTabFilter(state);
    const sortedPageData = getProfileFilterSortedPageData(state);
    return {
      tabFilter,
      sortedPageData,
    };
  },
  mapDispatchToProps: {
    changeTabFilter,
  },
  component: TabContextMenuImpl,
});
