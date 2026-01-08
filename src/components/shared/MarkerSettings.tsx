/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import { Localized } from '@fluent/react';
import classNames from 'classnames';
import { showMenu } from '@firefox-devtools/react-contextmenu';

import explicitConnect from 'firefox-profiler/utils/connect';
import { changeMarkersSearchString } from 'firefox-profiler/actions/profile-view';
import { getMarkersSearchString } from 'firefox-profiler/selectors/url-state';
import { getProfileUsesMultipleStackTypes } from 'firefox-profiler/selectors/profile';
import { PanelSearch } from './PanelSearch';
import { StackImplementationSetting } from 'firefox-profiler/components/shared/StackImplementationSetting';
import { MarkerFiltersContextMenu } from './MarkerFiltersContextMenu';
import { MarkerCopyTableContextMenu } from './MarkerCopyTableContextMenu';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import 'firefox-profiler/components/shared/PanelSettingsList.css';
import './MarkerSettings.css';

type OwnProps = {
  readonly copyTable?: (
    format: 'plain' | 'markdown',
    onExceeedMaxCopyRows: (rows: number, maxRows: number) => void
  ) => void;
};

type StateProps = {
  readonly searchString: string;
  readonly allowSwitchingStackType: boolean;
};

type DispatchProps = {
  readonly changeMarkersSearchString: typeof changeMarkersSearchString;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {
  readonly isMarkerFiltersMenuVisible: boolean;
  // react-contextmenu library automatically hides the menu on mousedown even
  // if it's already visible. That's why we need to handle the mousedown event
  // as well and check if the menu is visible or not before it hides it.
  // Otherwise, if we check this in onClick event, the state will always be
  // `false` since the library already hid it on mousedown.
  readonly isFilterMenuVisibleOnMouseDown: boolean;
  readonly isMarkerCopyTableMenuVisible: boolean;
  readonly isCopyTableMenuVisibleOnMouseDown: boolean;
  readonly copyTableWarningRows: number | null;
  readonly copyTableWarningMaxRows: number | null;
};

class MarkerSettingsImpl extends PureComponent<Props, State> {
  _copyTableWarningTimeout: NodeJS.Timeout | null = null;

  override state = {
    isMarkerFiltersMenuVisible: false,
    isFilterMenuVisibleOnMouseDown: false,
    isMarkerCopyTableMenuVisible: false,
    isCopyTableMenuVisibleOnMouseDown: false,
    copyTableWarningRows: null,
    copyTableWarningMaxRows: null,
  };

  _onSearch = (value: string) => {
    this.props.changeMarkersSearchString(value);
  };

  _onClickToggleFilterButton = (event: React.MouseEvent<HTMLElement>) => {
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

  _onClickToggleCopyTableMenu = (event: React.MouseEvent<HTMLElement>) => {
    const { isCopyTableMenuVisibleOnMouseDown } = this.state;
    if (isCopyTableMenuVisibleOnMouseDown) {
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
      id: 'MarkerCopyTableContextMenu',
      position: { x: isRightAligned ? rect.right : rect.left, y: rect.bottom },
      target: event.target,
    });
  };

  _onCopyTable = (format: 'plain' | 'markdown') => {
    const { copyTable } = this.props;
    if (!copyTable) {
      return;
    }

    copyTable(format, (rows: number, maxRows: number) => {
      this.setState({
        copyTableWarningRows: rows,
        copyTableWarningMaxRows: maxRows,
      });
      if (this._copyTableWarningTimeout) {
        clearTimeout(this._copyTableWarningTimeout);
      }
      this._copyTableWarningTimeout = setTimeout(() => {
        this.setState({
          copyTableWarningRows: null,
          copyTableWarningMaxRows: null,
        });
      }, 3000);
    });
  };

  _onShowFiltersContextMenu = () => {
    this.setState({ isMarkerFiltersMenuVisible: true });
  };

  _onHideFiltersContextMenu = () => {
    this.setState({ isMarkerFiltersMenuVisible: false });
  };

  _onShowCopyTableContextMenu = () => {
    this.setState({ isMarkerCopyTableMenuVisible: true });
  };

  _onHideCopyTableContextMenu = () => {
    this.setState({ isMarkerCopyTableMenuVisible: false });
  };

  _onMouseDownToggleFilterButton = () => {
    this.setState((state) => ({
      isFilterMenuVisibleOnMouseDown: state.isMarkerFiltersMenuVisible,
    }));
  };

  _onMouseDownToggleCopyTableMenu = () => {
    this.setState((state) => ({
      isCopyTableMenuVisibleOnMouseDown: state.isMarkerCopyTableMenuVisible,
    }));
  };

  override render() {
    const { searchString, allowSwitchingStackType, copyTable } = this.props;
    const {
      isMarkerFiltersMenuVisible,
      isMarkerCopyTableMenuVisible,
      copyTableWarningRows,
      copyTableWarningMaxRows,
    } = this.state;

    return (
      <div className="markerSettings">
        <ul className="panelSettingsList">
          {allowSwitchingStackType ? (
            <li className="panelSettingsListItem">
              <StackImplementationSetting labelL10nId="StackSettings--stack-implementation-label" />
            </li>
          ) : null}
        </ul>
        {copyTable ? (
          <Localized id="MarkerSettings--copy-table" attrs={{ title: true }}>
            <button
              className={classNames(
                'copyTableButton',
                'photon-button',
                'photon-button-ghost',
                {
                  'photon-button-ghost--checked': isMarkerCopyTableMenuVisible,
                }
              )}
              title="Copy table as text"
              type="button"
              onClick={this._onClickToggleCopyTableMenu}
              onMouseDown={this._onMouseDownToggleCopyTableMenu}
            />
          </Localized>
        ) : null}
        {copyTableWarningRows !== null && copyTableWarningMaxRows !== null ? (
          <div className="copyTableButtonWarningWrapper">
            <div className="photon-message-bar photon-message-bar-warning copyTableButtonWarning">
              <div className="photon-message-bar-inner-content">
                <Localized
                  id="MarkerSettings--copy-table-exceeed-max-rows"
                  vars={{
                    rows: copyTableWarningRows,
                    maxRows: copyTableWarningMaxRows,
                  }}
                >
                  <div className="photon-message-bar-inner-text">
                    {`The number of rows exceeds the limit: ${copyTableWarningRows} > ${copyTableWarningMaxRows}. Only the first ${copyTableWarningMaxRows} rows will be copied.`}
                  </div>
                </Localized>
              </div>
            </div>
          </div>
        ) : null}
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
        <MarkerFiltersContextMenu
          onShow={this._onShowFiltersContextMenu}
          onHide={this._onHideFiltersContextMenu}
        />
        <MarkerCopyTableContextMenu
          onShow={this._onShowCopyTableContextMenu}
          onHide={this._onHideCopyTableContextMenu}
          onCopy={this._onCopyTable}
        />
      </div>
    );
  }
}

export const MarkerSettings = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    searchString: getMarkersSearchString(state),
    allowSwitchingStackType: getProfileUsesMultipleStackTypes(state),
  }),
  mapDispatchToProps: { changeMarkersSearchString },
  component: MarkerSettingsImpl,
});
