/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';

import { SourceView } from '../shared/SourceView';

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
  componentDidMount() {
    this._triggerSourceLoadingIfNeeded();
  }
  componentDidUpdate() {
    this._triggerSourceLoadingIfNeeded();
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

  render() {
    const {
      globalLineTimings,
      selectedCallNodeLineTimings,
      sourceTabs,
      sourceTabActivationGeneration,
      selectedSourceTabSource,
    } = this.props;
    const source =
      selectedSourceTabSource && selectedSourceTabSource.type === 'AVAILABLE'
        ? selectedSourceTabSource.source
        : '';
    return (
      <div className="bottom-stuff">
        <div className="bottom-main">
          {selectedSourceTabSource !== undefined ? (
            <>
              <SourceView
                timings={globalLineTimings}
                timingsInformingScrolling={selectedCallNodeLineTimings}
                source={source}
                rowHeight={16}
                scrollToHotSpotGeneration={sourceTabActivationGeneration}
              />
              <SourceStatusOverlay status={selectedSourceTabSource} />
            </>
          ) : null}
        </div>
        <div className="bottom-tabs">
          {sourceTabs.tabs.map((tab, index) => {
            const parsedName = parseFileNameFromSymbolication(tab.file);
            const path = parsedName.path;
            const file = path.slice(path.lastIndexOf('/') + 1);
            return (
              <span
                key={index}
                className={classNames('bottom-tab', {
                  'bottom-tab--selected': index === sourceTabs.selectedIndex,
                })}
              >
                {file}
              </span>
            );
          })}
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
  mapDispatchToProps: { fetchSourceForFile },
  component: BottomStuffImpl,
});
