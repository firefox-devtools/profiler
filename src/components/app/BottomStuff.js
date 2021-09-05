/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';

import { SourceView } from '../shared/SourceView';
import { Reorderable } from '../shared/Reorderable';

import {
  getSourceTabs,
  getSelectedSourceTabFile,
  getSourceTabActivationGeneration,
} from 'firefox-profiler/selectors/url-state';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getSelectedSourceTabSource } from 'firefox-profiler/selectors/sources';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  LineTimings,
  SourceTabsState,
  FileSourceStatus,
} from 'firefox-profiler/types';

import { fetchSourceForFile } from 'firefox-profiler/actions/sources';
import {
  changeSelectedSourceTab,
  changeSourceTabOrder,
  closeSourceTab,
  closeBottomBox,
} from 'firefox-profiler/actions/profile-view';
import { parseFileNameFromSymbolication } from 'firefox-profiler/profile-logic/profile-data';

import './BottomStuff.css';
import classNames from 'classnames';

type StateProps = {|
  +globalLineTimings: LineTimings,
  +selectedCallNodeLineTimings: LineTimings,
  +sourceTabs: SourceTabsState,
  +selectedSourceTabFile: string | null,
  +selectedSourceTabSource: FileSourceStatus | void,
  +sourceTabActivationGeneration: number,
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

class BottomStuffImpl extends React.PureComponent<Props> {
  _sourceView: SourceView | null = null;
  _takeSourceViewRef = (sourceView: SourceView | null) => {
    this._sourceView = sourceView;
  };

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

  _onClickTab = e => {
    if (e.button !== 0 || e.target.matches('.bottom-tab-close-button')) {
      return;
    }
    const index = +e.currentTarget.dataset.index;
    this.props.changeSelectedSourceTab(index);
    e.preventDefault();
  };

  _onMouseDownCloseButton = e => {
    // Don't allow the Reorderable to see this event. We don't want dragging on the
    // close button to move the tab.
    e.stopPropagation();
  };

  _onClickTabCloseButton = e => {
    const { sourceTabs } = this.props;
    const index = +e.currentTarget.parentElement.dataset.index;
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
      changeSourceTabOrder,
    } = this.props;
    const source =
      selectedSourceTabSource && selectedSourceTabSource.type === 'AVAILABLE'
        ? selectedSourceTabSource.source
        : '';
    const selectedSourceTabFile =
      sourceTabs.selectedIndex !== null
        ? sourceTabs.tabs[sourceTabs.selectedIndex].file
        : null;
    return (
      <div className="bottom-stuff">
        <div className="bottom-tabs">
          <Reorderable
            tagName="ol"
            className="bottom-tabs-reorderable"
            grippyClassName="bottom-tab"
            order={sourceTabs.order}
            orient="horizontal"
            onChangeOrder={changeSourceTabOrder}
          >
            {sourceTabs.tabs.map((tab, index) => {
              const parsedName = parseFileNameFromSymbolication(tab.file);
              const path = parsedName.path;
              const file = path.slice(path.lastIndexOf('/') + 1);
              return (
                <li
                  key={index}
                  data-index={index}
                  className={classNames('bottom-tab', {
                    'bottom-tab--selected': index === sourceTabs.selectedIndex,
                  })}
                  onMouseDown={this._onClickTab}
                >
                  <span className="bottom-tab-text">{file}</span>
                  <button
                    className={classNames('bottom-tab-close-button')}
                    title={`Close ${file}`}
                    type="button"
                    onClick={this._onClickTabCloseButton}
                    onMouseDown={this._onMouseDownCloseButton}
                  />
                </li>
              );
            })}
          </Reorderable>
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
        <div className="bottom-main">
          {selectedSourceTabFile !== null ? (
            <SourceView
              key={selectedSourceTabFile}
              scrollRestorationKey={selectedSourceTabFile}
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

export const BottomStuff = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    globalLineTimings: selectedThreadSelectors.getLineTimings(state),
    selectedCallNodeLineTimings: selectedThreadSelectors.getLineTimingsForSelectedCallNode(
      state
    ),
    sourceTabActivationGeneration: getSourceTabActivationGeneration(state),
    sourceTabs: getSourceTabs(state),
    selectedSourceTabFile: getSelectedSourceTabFile(state),
    selectedSourceTabSource: getSelectedSourceTabSource(state),
  }),
  mapDispatchToProps: {
    fetchSourceForFile,
    changeSelectedSourceTab,
    changeSourceTabOrder,
    closeSourceTab,
    closeBottomBox,
  },
  component: BottomStuffImpl,
});
