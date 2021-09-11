/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import memoize from 'memoize-one';

import { SourceView } from '../shared/SourceView';
import { Tabs } from './Tabs';

import {
  getSourceTabs,
  getSelectedSourceTabFile,
  getSourceTabActivationGeneration,
} from 'firefox-profiler/selectors/url-state';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getSelectedSourceTabSource } from 'firefox-profiler/selectors/sources';
import { getPreviewSelection } from 'firefox-profiler/selectors/profile';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  LineTimings,
  SourceTabsState,
  FileSourceStatus,
  SourceTab,
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

// ["a/b/hello", "c/d/world"] -> ["hello", "world"]
// ["a/b/hello", "c/d/hello"] -> ["b/hello", "d/hello"]
// ["a\\b/hello", "c/b\\hello"] -> ["b/hello", "b\\hello"]
function computeMinimalUniquePathTails(paths: string[]) {
  const pathsWithOffsets = paths.map(path => {
    const components = path.split(/[/\\]/);
    components.reverse();
    const offsets = [];
    let curOffset = path.length;
    for (const component of components) {
      curOffset -= component.length;
      offsets.push(curOffset);
      curOffset -= 1; // for the slash or backslash
    }
    return { path, offsets };
  });

  const collisions = new Set();
  const map = new Map();
  const subPaths = [];
  for (let i = 0; i < pathsWithOffsets.length; i++) {
    const pathWithOffsets = pathsWithOffsets[i];
    const { path, offsets } = pathWithOffsets;
    let depth = 0;
    while (depth < offsets.length) {
      const subPath = path.slice(offsets[depth]);
      if (!collisions.has(subPath)) {
        break;
      }
      depth++;
    }

    if (depth === offsets.length) {
      // Collided all the way to the full path.
      subPaths.push(path);
      continue;
    }

    let subPath = path.slice(offsets[depth]);
    const collidedIndex = map.get(subPath);
    if (collidedIndex === undefined) {
      map.set(subPath, i);
      subPaths.push(subPath);
      continue;
    }

    // collidedIndex < i
    // We collided on subPath. This is the first collision on subPath.
    collisions.add(subPath);
    map.delete(subPath);

    const collidedPath = pathsWithOffsets[collidedIndex].path;
    const collidedOffsets = pathsWithOffsets[collidedIndex].offsets;

    // We need to go at least 1 level deeper to make the subPaths different.
    depth++;

    while (depth < Math.min(offsets.length, collidedOffsets.length) + 1) {
      const subPath = path.slice(offsets[Math.min(depth, offsets.length - 1)]);
      const collidedSubPath = collidedPath.slice(
        collidedOffsets[Math.min(depth, collidedOffsets.length - 1)]
      );
      if (subPath !== collidedSubPath) {
        break;
      }
      collisions.add(subPath);
      depth++;
    }

    subPath = path.slice(offsets[Math.min(depth, offsets.length - 1)]);
    const collidedSubPath = collidedPath.slice(
      collidedOffsets[Math.min(depth, collidedOffsets.length - 1)]
    );
    if (subPath !== collidedSubPath) {
      map.set(collidedSubPath, collidedIndex);
      subPaths[collidedIndex] = collidedSubPath;
      map.set(subPath, i);
      subPaths.push(subPath);
      continue;
    }

    // The full paths must be identical.
    subPaths[collidedIndex] = collidedPath;
    subPaths.push(path);
  }

  return subPaths;
}

class BottomStuffImpl extends React.PureComponent<Props> {
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
      <div className="bottom-stuff">
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
    disableOverscan: getPreviewSelection(state).isModifying,
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
