/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import classNames from 'classnames';

import { SourceView } from '../shared/SourceView';
import {
  getSourceViewFile,
  getSourceViewActivationGeneration,
  getSelectedTab,
} from 'firefox-profiler/selectors/url-state';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
  selectedFunctionTableNodeSelectors,
} from 'firefox-profiler/selectors/per-thread';
import { closeBottomBox } from 'firefox-profiler/actions/profile-view';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import { getSourceViewSource } from 'firefox-profiler/selectors/sources';
import { getPreviewSelection } from 'firefox-profiler/selectors/profile';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { LineTimings, FileSourceStatus } from 'firefox-profiler/types';

import { Localized } from '@fluent/react';

import './BottomBox.css';

type StateProps = {|
  +sourceViewFile: string | null,
  +sourceViewSource: FileSourceStatus | void,
  +globalLineTimings: LineTimings,
  +selectedCallNodeLineTimings: LineTimings,
  +sourceViewActivationGeneration: number,
  +disableOverscan: boolean,
|};

type DispatchProps = {|
  +closeBottomBox: typeof closeBottomBox,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type SourceStatusOverlayProps = {| status: FileSourceStatus |};

function SourceStatusOverlay({ status }: SourceStatusOverlayProps) {
  switch (status.type) {
    case 'AVAILABLE':
      return null; // No overlay if we have source code.
    case 'LOADING': {
      const { source } = status;
      switch (source.type) {
        case 'URL': {
          const { url } = source;
          let host;
          try {
            host = new URL(url).host;
          } catch (e) {
            host = url;
          }
          return (
            <Localized id="SourceView--loading-url" vars={{ host }}>
              <div className="sourceStatusOverlay loading">
                {`Waiting for ${host}…`}
              </div>
            </Localized>
          );
        }
        case 'BROWSER_CONNECTION': {
          return (
            <Localized id="SourceView--loading-browser-connection">
              <div className="sourceStatusOverlay loading">
                Waiting for browser…
              </div>
            </Localized>
          );
        }
        default:
          throw assertExhaustiveCheck(source.type);
      }
    }
    case 'ERROR': {
      return (
        <div className="sourceStatusOverlay error">
          <div>
            <Localized id="SourceView--source-not-available-title">
              <h3>Source not available</h3>
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
            <ul>
              {status.errors.map((error, key) => {
                switch (error.type) {
                  case 'NO_KNOWN_CORS_URL': {
                    return (
                      <Localized key={key} id="SourceView--no-known-cors-url">
                        <li>No known cross-origin-accessible URL.</li>
                      </Localized>
                    );
                  }
                  case 'NETWORK_ERROR': {
                    const { url, networkErrorMessage } = error;
                    return (
                      <Localized
                        key={key}
                        id="SourceView--network-error-when-obtaining-source"
                        vars={{ url, networkErrorMessage }}
                      >
                        <li>{`There was a network error when fetching the URL ${url}: ${networkErrorMessage}`}</li>
                      </Localized>
                    );
                  }
                  case 'BROWSER_CONNECTION_ERROR': {
                    const { browserConnectionErrorMessage } = error;
                    return (
                      <Localized
                        key={key}
                        id="SourceView--browser-connection-error-when-obtaining-source"
                        vars={{ browserConnectionErrorMessage }}
                      >
                        <li>{`Could not query the browser’s symbolication API: ${browserConnectionErrorMessage}`}</li>
                      </Localized>
                    );
                  }
                  case 'BROWSER_API_ERROR': {
                    const { apiErrorMessage } = error;
                    return (
                      <Localized
                        id="SourceView--browser-api-error-when-obtaining-source"
                        vars={{ apiErrorMessage }}
                      >
                        <li>{`The browser’s symbolication API returned an error: ${apiErrorMessage}`}</li>
                      </Localized>
                    );
                  }
                  case 'SYMBOL_SERVER_API_ERROR': {
                    const { apiErrorMessage } = error;
                    return (
                      <Localized
                        id="SourceView--local-symbol-server-api-error-when-obtaining-source"
                        vars={{ apiErrorMessage }}
                      >
                        <li>{`The local symbol server’s symbolication API returned an error: ${apiErrorMessage}`}</li>
                      </Localized>
                    );
                  }
                  case 'NOT_PRESENT_IN_ARCHIVE': {
                    const { url, pathInArchive } = error;
                    return (
                      <Localized
                        id="SourceView--not-in-archive-error-when-obtaining-source"
                        vars={{ url, pathInArchive }}
                      >
                        <li>{`The file ${pathInArchive} was not found in the archive from ${url}.`}</li>
                      </Localized>
                    );
                  }
                  case 'ARCHIVE_PARSING_ERROR': {
                    const { url, parsingErrorMessage } = error;
                    return (
                      <Localized
                        id="SourceView--archive-parsing-error-when-obtaining-source"
                        vars={{ url, parsingErrorMessage }}
                      >
                        <li>{`The archive at ${url} could not be parsed: ${parsingErrorMessage}`}</li>
                      </Localized>
                    );
                  }
                  default:
                    throw assertExhaustiveCheck(error.type);
                }
              })}
            </ul>
          </div>
        </div>
      );
    }
    default:
      throw assertExhaustiveCheck(status.type);
  }
}

class BottomBoxImpl extends React.PureComponent<Props> {
  _sourceView = React.createRef<SourceView>();

  _onClickCloseButton = () => {
    this.props.closeBottomBox();
  };

  render() {
    const {
      sourceViewFile,
      sourceViewSource,
      globalLineTimings,
      disableOverscan,
      sourceViewActivationGeneration,
      selectedCallNodeLineTimings,
    } = this.props;
    const source =
      sourceViewSource && sourceViewSource.type === 'AVAILABLE'
        ? sourceViewSource.source
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
              source={source}
              filePath={path}
              scrollToHotSpotGeneration={sourceViewActivationGeneration}
              hotSpotTimings={selectedCallNodeLineTimings}
              ref={this._sourceView}
            />
          ) : null}
          {sourceViewSource !== undefined &&
          sourceViewSource.type !== 'AVAILABLE' ? (
            <SourceStatusOverlay status={sourceViewSource} />
          ) : null}
        </div>
      </div>
    );
  }
}

export const BottomBox = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    sourceViewFile: getSourceViewFile(state),
    sourceViewSource: getSourceViewSource(state),
    globalLineTimings: selectedThreadSelectors.getSourceViewLineTimings(state),
    selectedCallNodeLineTimings:
      getSelectedTab(state) === 'function-table'
        ? selectedFunctionTableNodeSelectors.getSourceViewLineTimings(state)
        : selectedNodeSelectors.getSourceViewLineTimings(state),
    sourceViewActivationGeneration: getSourceViewActivationGeneration(state),
    disableOverscan: getPreviewSelection(state).isModifying,
  }),
  mapDispatchToProps: {
    closeBottomBox,
  },
  component: BottomBoxImpl,
});
