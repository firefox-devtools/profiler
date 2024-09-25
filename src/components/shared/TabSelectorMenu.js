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
import { getProfileFilterPageDataByTabID } from 'firefox-profiler/selectors/profile';

import type { TabID, ProfileFilterPageData } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +tabFilter: TabID | null,
  +pageDataByTabID: Map<TabID, ProfileFilterPageData> | null,
|};

type DispatchProps = {|
  +changeTabFilter: typeof changeTabFilter,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

import './TabSelectorMenu.css';

class TabSelectorMenuImpl extends React.PureComponent<Props> {
  _handleClick = (_event: SyntheticEvent<>, data: {| id: TabID |}): void => {
    this.props.changeTabFilter(data.id);
  };

  renderTabSelectorMenuContents() {
    const { pageDataByTabID, tabFilter } = this.props;
    if (!pageDataByTabID || pageDataByTabID.size === 0) {
      // There is no page data, return early.
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
        {[...pageDataByTabID].map(([tabID, pageData]) => (
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

export const TabSelectorMenu = explicitConnect<{||}, StateProps, DispatchProps>(
  {
    mapStateToProps: (state) => ({
      tabFilter: getTabFilter(state),
      pageDataByTabID: getProfileFilterPageDataByTabID(state),
    }),
    mapDispatchToProps: {
      changeTabFilter,
    },
    component: TabSelectorMenuImpl,
  }
);
