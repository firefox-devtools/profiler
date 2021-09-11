/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import memoize from 'memoize-one';

import { SourceView } from '../shared/SourceView';
import { Reorderable } from '../shared/Reorderable';

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
// ["a\\b/hello", "c/d\\hello"] -> ["b/hello", "d\\hello"]
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
    const collidedI = map.get(subPath);
    if (collidedI === undefined) {
      map.set(subPath, i);
      subPaths.push(subPath);
      continue;
    }

    // We collided on subPath. This is the first collision on subPath.
    collisions.add(subPath);
    map.delete(subPath);

    const collidedPath = pathsWithOffsets[collidedI].path;
    const collidedOffsets = pathsWithOffsets[collidedI].offsets;

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
      map.set(collidedSubPath, collidedI);
      subPaths[collidedI] = collidedSubPath;
      map.set(subPath, i);
      subPaths.push(subPath);
      continue;
    }

    // The full paths must be identical.
    subPaths[collidedI] = collidedPath;
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

  _onTabsMouseDown = e => {
    // Don't focus the tab bar on mousedown.
    e.preventDefault();
  };

  _onTabsKeyDown = (event: SyntheticKeyboardEvent<>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }
    const { sourceTabs, changeSelectedSourceTab } = this.props;
    const { selectedIndex, tabs, order } = sourceTabs;

    if (tabs.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        if (selectedIndex === null) {
          changeSelectedSourceTab(
            event.key === 'ArrowLeft' ? order[order.length - 1] : order[0]
          );
        } else {
          const delta = event.key === 'ArrowLeft' ? -1 : 1;
          const selectedIndexInOrder = order.indexOf(selectedIndex);
          const newIndexInOrder = Math.max(
            0,
            Math.min(order.length - 1, selectedIndexInOrder + delta)
          );
          changeSelectedSourceTab(order[newIndexInOrder]);
        }
        break;
      case 'Home':
        changeSelectedSourceTab(order[0]);
        break;
      case 'End':
        changeSelectedSourceTab(order[order.length - 1]);
        break;
      default:
    }
  };

  render() {
    const {
      globalLineTimings,
      sourceTabs,
      selectedSourceTabSource,
      changeSourceTabOrder,
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
          <div
            className="bottom-box-tabs"
            tabIndex="0"
            onMouseDown={this._onTabsMouseDown}
            onKeyDown={this._onTabsKeyDown}
          >
            <Reorderable
              tagName="ol"
              className="bottom-tabs-reorderable"
              grippyClassName="bottom-tab"
              order={sourceTabs.order}
              orient="horizontal"
              onChangeOrder={changeSourceTabOrder}
            >
              {sourceTabs.tabs.map((tab, index) => {
                const file = minimalPaths[index];
                return (
                  <li
                    key={index}
                    data-index={index}
                    className={classNames('bottom-tab', {
                      'bottom-tab--selected':
                        index === sourceTabs.selectedIndex,
                    })}
                    role="tab"
                    aria-selected={index === sourceTabs.selectedIndex}
                    aria-controls="bottom-main"
                    onMouseDown={this._onClickTab}
                  >
                    <span className="bottom-tab-text">{file}</span>
                    <button
                      className={classNames('bottom-tab-close-button')}
                      title={`Close ${file}`}
                      type="button"
                      onClick={this._onClickTabCloseButton}
                      onMouseDown={this._onMouseDownCloseButton}
                      tabIndex={index === sourceTabs.selectedIndex ? 0 : -1}
                    />
                  </li>
                );
              })}
            </Reorderable>
          </div>
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
