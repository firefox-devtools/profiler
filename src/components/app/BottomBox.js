/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import memoize from 'memoize-one';
import classNames from 'classnames';

import {
  getSourceTabs,
  getSelectedSourceTabFile,
  getSourceTabActivationGeneration,
} from 'firefox-profiler/selectors/url-state';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getSelectedSourceTabSource } from 'firefox-profiler/selectors/sources';
import { getPreviewSelection } from 'firefox-profiler/selectors/profile';
import { fetchSourceForFile } from 'firefox-profiler/actions/sources';
import {
  changeSelectedSourceTab,
  changeSourceTabOrder,
  closeSourceTab,
  closeBottomBox,
} from 'firefox-profiler/actions/profile-view';
import { parseFileNameFromSymbolication } from 'firefox-profiler/profile-logic/profile-data';
import { computeMinimalUniquePathTails } from 'firefox-profiler/utils/minimal-paths';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  LineTimings,
  SourceTabsState,
  FileSourceStatus,
  SourceTab,
} from 'firefox-profiler/types';

import { SourceView } from '../shared/SourceView';
import { Tabs } from './Tabs';

import './BottomBox.css';

type StateProps = {|
  +globalLineTimings: LineTimings,
  +selectedCallNodeLineTimings: LineTimings,
  +sourceTabs: SourceTabsState,
  +selectedSourceTabFile: string | null,
  +selectedSourceTabSource: FileSourceStatus | void,
  +sourceTabActivationGeneration: number,
  +disableOverscan: boolean,
|};

type DispatchProps = {|
  +fetchSourceForFile: typeof fetchSourceForFile,
  +changeSelectedSourceTab: typeof changeSelectedSourceTab,
  +changeSourceTabOrder: typeof changeSourceTabOrder,
  +closeSourceTab: typeof closeSourceTab,
  +closeBottomBox: typeof closeBottomBox,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

function SourceStatusOverlay({ status }: {| status: FileSourceStatus |}) {
  switch (status.type) {
    case 'LOADING': {
      const { url } = status;
      return (
        <div className="sourceStatusOverlay loading">
          Waiting for {new URL(url).host}...
        </div>
      );
    }
    case 'ERROR': {
      const { error } = status;
      return <div className="sourceStatusOverlay error">{error}</div>;
    }
    default:
      return null;
  }
}

class BottomBoxImpl extends React.PureComponent<Props> {
  _sourceView: SourceView | null = null;
  _takeSourceViewRef = (sourceView: SourceView | null) => {
    this._sourceView = sourceView;
  };

  _computeMinimalPathsMemoized = memoize((tabs: SourceTab[]): string[] =>
    computeMinimalUniquePathTails(
      tabs.map(tab => parseFileNameFromSymbolication(tab.file).path)
    )
  );

  componentDidMount() {
    this._triggerSourceLoadingIfNeeded();
    if (this._sourceView) {
      this._sourceView.scrollToHotSpot(this.props.selectedCallNodeLineTimings);
    }
  }

  componentDidUpdate(prevProps: Props) {
    this._triggerSourceLoadingIfNeeded();

    if (
      this._sourceView &&
      prevProps.sourceTabActivationGeneration <
        this.props.sourceTabActivationGeneration
    ) {
      this._sourceView.scrollToHotSpot(this.props.selectedCallNodeLineTimings);
    }
  }

  _triggerSourceLoadingIfNeeded() {
    const {
      selectedSourceTabFile,
      selectedSourceTabSource,
      fetchSourceForFile,
    } = this.props;
    if (selectedSourceTabFile && !selectedSourceTabSource) {
      fetchSourceForFile(selectedSourceTabFile);
    }
  }

  _onSelectTab = index => {
    this.props.changeSelectedSourceTab(index);
  };

  _onChangeTabOrder = order => {
    this.props.changeSourceTabOrder(order);
  };

  _onCloseTab = index => {
    const { sourceTabs } = this.props;
    const isOnlyTab = sourceTabs.tabs.length === 1;
    this.props.closeSourceTab(index);
    if (isOnlyTab) {
      this.props.closeBottomBox();
    }
  };

  _onClickCloseButton = () => {
    this.props.closeBottomBox();
  };

  render() {
    const {
      globalLineTimings,
      sourceTabs,
      selectedSourceTabSource,
      disableOverscan,
    } = this.props;
    const source =
      selectedSourceTabSource && selectedSourceTabSource.type === 'AVAILABLE'
        ? selectedSourceTabSource.source
        : '';
    const selectedSourceTabFile =
      sourceTabs.selectedIndex !== null
        ? sourceTabs.tabs[sourceTabs.selectedIndex].file
        : null;
    const minimalPaths = this._computeMinimalPathsMemoized(sourceTabs.tabs);
    return (
      <div className="bottom-box">
        <div className="bottom-box-bar">
          <Tabs
            className="bottom-box-tabs"
            tabs={minimalPaths}
            order={sourceTabs.order}
            selectedIndex={sourceTabs.selectedIndex}
            onSelectTab={this._onSelectTab}
            onCloseTab={this._onCloseTab}
            onChangeOrder={this._onChangeTabOrder}
            controlledElementIdForAria="bottom-main"
          />
          <button
            className={classNames(
              'bottom-close-button',
              'photon-button',
              'photon-button-ghost'
            )}
            title="Close the bottom box"
            type="button"
            onClick={this._onClickCloseButton}
          />
        </div>
        <div className="bottom-main" id="bottom-main">
          {selectedSourceTabFile !== null ? (
            <SourceView
              key={selectedSourceTabFile}
              scrollRestorationKey={selectedSourceTabFile}
              disableOverscan={disableOverscan}
              timings={globalLineTimings}
              source={source}
              rowHeight={16}
              ref={this._takeSourceViewRef}
            />
          ) : null}
          {selectedSourceTabSource !== undefined ? (
            <SourceStatusOverlay status={selectedSourceTabSource} />
          ) : null}
        </div>
      </div>
    );
  }
}

export const BottomBox = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    globalLineTimings: selectedThreadSelectors.getLineTimings(state),
    selectedCallNodeLineTimings: selectedThreadSelectors.getLineTimingsForSelectedCallNode(
      state
    ),
    sourceTabActivationGeneration: getSourceTabActivationGeneration(state),
    sourceTabs: getSourceTabs(state),
    selectedSourceTabFile: getSelectedSourceTabFile(state),
    selectedSourceTabSource: getSelectedSourceTabSource(state),
    disableOverscan: getPreviewSelection(state).isModifying,
  }),
  mapDispatchToProps: {
    fetchSourceForFile,
    changeSelectedSourceTab,
    changeSourceTabOrder,
    closeSourceTab,
    closeBottomBox,
  },
  component: BottomBoxImpl,
});
