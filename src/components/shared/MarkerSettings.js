/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';
import classNames from 'classnames';
import { showMenu } from '@firefox-devtools/react-contextmenu';

import explicitConnect from 'firefox-profiler/utils/connect';
import { changeMarkersSearchString } from 'firefox-profiler/actions/profile-view';
import { getMarkersSearchString } from 'firefox-profiler/selectors/url-state';
import { getIsMarkerFiltersMenuVisible } from 'firefox-profiler/selectors/app';
import { PanelSearch } from './PanelSearch';
import { StackImplementationSetting } from 'firefox-profiler/components/shared/StackImplementationSetting';
import { MarkerFiltersContextMenu } from './MarkerFiltersContextMenu';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import 'firefox-profiler/components/shared/PanelSettingsList.css';
import './MarkerSettings.css';

type StateProps = {|
  +searchString: string,
  +isMarkerFiltersMenuVisible: boolean,
|};

type DispatchProps = {|
  +changeMarkersSearchString: typeof changeMarkersSearchString,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type State = {|
  // react-contextmenu library automatically hides the menu on mousedown even
  // if it's already visible. That's why we need to handle the mousedown event
  // as well and check if the menu is visible or not before it hides it.
  // Otherwise, if we check this in onClick event, the state will always be
  // `false` since the library already hid it on mousedown.
  +isFilterMenuVisibleOnMouseDown: boolean,
|};

class MarkerSettingsImpl extends PureComponent<Props, State> {
  _onSearch = (value: string) => {
    this.props.changeMarkersSearchString(value);
  };

  _onClickToggleFilterButton = (event: SyntheticMouseEvent<HTMLElement>) => {
    const { isFilterMenuVisibleOnMouseDown } = this.state;
    if (isFilterMenuVisibleOnMouseDown) {
      // Do nothing as we would like to hide the menu if the menu was already visible on mouse down.
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    // FIXME: Currently we assume that the context menu is 250px wide, but ideally
    // we should get the real width. It's not so easy though, because the context
    // menu is not rendered yet.
    const isRightAligned = rect.right > window.innerWidth - 250;

    showMenu({
      data: null,
      id: 'MarkerFiltersContextMenu',
      position: { x: isRightAligned ? rect.right : rect.left, y: rect.bottom },
      target: event.target,
    });
  };

  _onMouseDownToggleFilterButton = () => {
    this.setState({
      isFilterMenuVisibleOnMouseDown: this.props.isMarkerFiltersMenuVisible,
    });
  };

  render() {
    const { searchString, isMarkerFiltersMenuVisible } = this.props;
    return (
      <div className="markerSettings">
        <ul className="panelSettingsList">
          <StackImplementationSetting labelL10nId="StackSettings--stack-implementation-label" />
        </ul>
        <Localized
          id="MarkerSettings--panel-search"
          attrs={{ label: true, title: true }}
        >
          <PanelSearch
            className="markerSettingsSearchField"
            label="Filter Markers:"
            title="Only display markers that match a certain name"
            currentSearchString={searchString}
            onSearch={this._onSearch}
          />
        </Localized>
        <Localized id="MarkerSettings--marker-filters" attrs={{ title: true }}>
          <button
            className={classNames(
              'filterMarkersButton',
              'photon-button',
              'photon-button-ghost',
              {
                'photon-button-ghost--checked': isMarkerFiltersMenuVisible,
              }
            )}
            title="Marker filters"
            type="button"
            onClick={this._onClickToggleFilterButton}
            onMouseDown={this._onMouseDownToggleFilterButton}
            disabled={!searchString}
          />
        </Localized>
        <MarkerFiltersContextMenu />
      </div>
    );
  }
}

export const MarkerSettings = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    searchString: getMarkersSearchString(state),
    isMarkerFiltersMenuVisible: getIsMarkerFiltersMenuVisible(state),
  }),
  mapDispatchToProps: { changeMarkersSearchString },
  component: MarkerSettingsImpl,
});
