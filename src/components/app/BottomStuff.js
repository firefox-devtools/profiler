/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';

import { SourceView } from '../shared/SourceView';

import {
  getSourceTabs,
  getSelectedSourceTabFile,
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
  +lineTimings: LineTimings | null,
  +sourceTabs: SourceTabsState,
  +selectedSourceTabFile: string | null,
  +selectedSourceTabSource: FileSourceStatus | void,
|};

type DispatchProps = {|
  +fetchSourceForFile: typeof fetchSourceForFile,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

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
      lineTimings,
      sourceTabs,
      selectedSourceTabFile,
      selectedSourceTabSource,
    } = this.props;
    const source =
      selectedSourceTabSource && selectedSourceTabSource.type === 'AVAILABLE'
        ? selectedSourceTabSource.source
        : '';
    return (
      <div className="bottom-stuff">
        <div className="bottom-main">
          {lineTimings !== null ? (
            <SourceView
              timings={lineTimings}
              source={source}
              rowHeight={16}
              key={selectedSourceTabFile}
            />
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
    lineTimings: selectedThreadSelectors.getLineTimings(state),
    sourceTabs: getSourceTabs(state),
    selectedSourceTabFile: getSelectedSourceTabFile(state),
    selectedSourceTabSource: getSelectedSourceTabSource(state),
  }),
  mapDispatchToProps: { fetchSourceForFile },
  component: BottomStuffImpl,
});
