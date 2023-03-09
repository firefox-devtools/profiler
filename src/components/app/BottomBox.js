/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import classNames from 'classnames';

import { SourceView } from '../shared/SourceView';
import { CodeLoadingOverlay } from './CodeLoadingOverlay';
import { CodeErrorOverlay } from './CodeErrorOverlay';
import {
  getSourceViewFile,
  getSourceViewScrollGeneration,
} from 'firefox-profiler/selectors/url-state';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
} from 'firefox-profiler/selectors/per-thread';
import { closeBottomBox } from 'firefox-profiler/actions/profile-view';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import { getSourceViewCode } from 'firefox-profiler/selectors/code';
import { getPreviewSelection } from 'firefox-profiler/selectors/profile';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { LineTimings, SourceCodeStatus } from 'firefox-profiler/types';
import type { CodeErrorOverlayProps } from './CodeErrorOverlay';

import { Localized } from '@fluent/react';

import './BottomBox.css';

type StateProps = {|
  +sourceViewFile: string | null,
  +sourceViewCode: SourceCodeStatus | void,
  +globalLineTimings: LineTimings,
  +selectedCallNodeLineTimings: LineTimings,
  +sourceViewScrollGeneration: number,
  +disableOverscan: boolean,
|};

type DispatchProps = {|
  +closeBottomBox: typeof closeBottomBox,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

export function SourceCodeErrorOverlay({ errors }: CodeErrorOverlayProps) {
  return (
    <div className="sourceCodeErrorOverlay">
      <div>
        <Localized id="BottomBox--source-code-not-available-title">
          <h3>Source code not available</h3>
        </Localized>
        <Localized
          id="SourceView--source-not-available-text"
          elems={{
            a: (
              <a
                href="https://github.com/firefox-devtools/profiler/issues/3741"
                target="_blank"
                rel="noopener noreferrer"
              />
            ),
          }}
        >
          <p>
            See
            <a
              href="https://github.com/firefox-devtools/profiler/issues/3741"
              target="_blank"
              rel="noopener noreferrer"
            >
              issue #3741
            </a>
            for supported scenarios and planned improvements.
          </p>
        </Localized>
        <CodeErrorOverlay errors={errors} />
      </div>
    </div>
  );
}

class BottomBoxImpl extends React.PureComponent<Props> {
  _sourceView = React.createRef<SourceView>();

  _onClickCloseButton = () => {
    this.props.closeBottomBox();
  };

  render() {
    const {
      sourceViewFile,
      sourceViewCode,
      globalLineTimings,
      disableOverscan,
      sourceViewScrollGeneration,
      selectedCallNodeLineTimings,
    } = this.props;
    const sourceCode =
      sourceViewCode && sourceViewCode.type === 'AVAILABLE'
        ? sourceViewCode.code
        : '';
    const path =
      sourceViewFile !== null
        ? parseFileNameFromSymbolication(sourceViewFile).path
        : null;
    return (
      <div className="bottom-box">
        <div className="bottom-box-bar">
          <h3 className="bottom-box-title">{path ?? '(no file selected)'}</h3>
          <Localized id="SourceView--close-button" attrs={{ title: true }}>
            <button
              className={classNames(
                'bottom-close-button',
                'photon-button',
                'photon-button-ghost'
              )}
              title="Close the source view"
              type="button"
              onClick={this._onClickCloseButton}
            />
          </Localized>
        </div>
        <div className="bottom-main" id="bottom-main">
          {sourceViewFile !== null ? (
            <SourceView
              disableOverscan={disableOverscan}
              timings={globalLineTimings}
              sourceCode={sourceCode}
              filePath={path}
              scrollToHotSpotGeneration={sourceViewScrollGeneration}
              hotSpotTimings={selectedCallNodeLineTimings}
              ref={this._sourceView}
            />
          ) : null}
          {sourceViewCode !== undefined && sourceViewCode.type === 'LOADING' ? (
            <CodeLoadingOverlay source={sourceViewCode.source} />
          ) : null}
          {sourceViewCode !== undefined && sourceViewCode.type === 'ERROR' ? (
            <SourceCodeErrorOverlay errors={sourceViewCode.errors} />
          ) : null}
        </div>
      </div>
    );
  }
}

export const BottomBox = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    sourceViewFile: getSourceViewFile(state),
    sourceViewCode: getSourceViewCode(state),
    globalLineTimings: selectedThreadSelectors.getSourceViewLineTimings(state),
    selectedCallNodeLineTimings:
      selectedNodeSelectors.getSourceViewLineTimings(state),
    sourceViewScrollGeneration: getSourceViewScrollGeneration(state),
    disableOverscan: getPreviewSelection(state).isModifying,
  }),
  mapDispatchToProps: {
    closeBottomBox,
  },
  component: BottomBoxImpl,
});
