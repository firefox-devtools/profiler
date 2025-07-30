/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { MenuItem } from '@firefox-devtools/react-contextmenu';
import { Localized } from '@fluent/react';
import classNames from 'classnames';

import { ContextMenu } from './ContextMenu';
import explicitConnect from 'firefox-profiler/utils/connect';
import { changeTabFilter } from 'firefox-profiler/actions/receive-profile';
import { getTabFilter } from '../../selectors/url-state';
import { getProfileFilterSortedPageData } from 'firefox-profiler/selectors/profile';
import { Icon } from 'firefox-profiler/components/shared/Icon';

import type { TabID, SortedTabPageData } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {
  +tabFilter: TabID | null,
  +sortedPageData: SortedTabPageData | null,
};

type DispatchProps = {
  +changeTabFilter: typeof changeTabFilter,
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

import './TabSelectorMenu.css';

class TabSelectorMenuImpl extends React.PureComponent<Props> {
  _handleClick = (_event: SyntheticEvent<>, data: { id: TabID }): void => {
    this.props.changeTabFilter(data.id);
  };

  renderTabSelectorMenuContents() {
    const { sortedPageData, tabFilter } = this.props;
    if (!sortedPageData || sortedPageData.length === 0) {
      return null;
    }

    return (
      <>
        <MenuItem
          onClick={this._handleClick}
          data={{ id: null }}
          attributes={{
            className: classNames('tabSelectorMenuItem', {
              checkable: true,
              checked: tabFilter === null,
            }),
            'aria-checked': tabFilter === null ? 'false' : 'true',
          }}
        >
          <Localized id="TabSelectorMenu--all-tabs-and-windows">
            All tabs and windows
          </Localized>
        </MenuItem>
        {sortedPageData.map(({ tabID, pageData }) => (
          <MenuItem
            key={tabID}
            onClick={this._handleClick}
            data={{ id: tabID }}
            attributes={{
              className: classNames('tabSelectorMenuItem', {
                checkable: true,
                checked: tabFilter === tabID,
              }),
              'aria-checked': tabFilter === tabID ? 'false' : 'true',
            }}
          >
            <Icon iconUrl={pageData.favicon} />
            {pageData.hostname}
          </MenuItem>
        ))}
      </>
    );
  }

  render() {
    return (
      <ContextMenu id="TabSelectorMenu" className="TabSelectorMenu">
        {this.renderTabSelectorMenuContents()}
      </ContextMenu>
    );
  }
}

export const TabSelectorMenu = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    tabFilter: getTabFilter(state),
    sortedPageData: getProfileFilterSortedPageData(state),
  }),
  mapDispatchToProps: {
    changeTabFilter,
  },
  component: TabSelectorMenuImpl,
});
