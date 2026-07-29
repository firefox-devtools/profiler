/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';

import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getSourcesWithSourceMaps,
  getSourceMapSymbolicationStatus,
} from 'firefox-profiler/selectors/profile';
import { applySourceMapFile } from 'firefox-profiler/actions/source-map-symbolication';
import type { ApplySourceMapError } from 'firefox-profiler/actions/source-map-symbolication';
import { _fileReader } from 'firefox-profiler/actions/receive-profile';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  IndexIntoSourceTable,
  SourceMapSymbolicationStatus,
} from 'firefox-profiler/types';
import { basename } from 'firefox-profiler/profile-logic/source-map-matching';
import type { EligibleSource } from 'firefox-profiler/profile-logic/source-map-matching';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

type OwnProps = Readonly<{
  // Injectable for tests to bypass the DOM APIs.
  fileReader?: typeof _fileReader;
}>;

type StateProps = Readonly<{
  candidates: EligibleSource[];
  symbolicationStatus: SourceMapSymbolicationStatus;
}>;

type DispatchProps = Readonly<{
  applySourceMapFile: typeof applySourceMapFile;
}>;

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type ApplyState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | {
      phase: 'choosing';
      fileName: string;
      fileContents: string;
      candidates: EligibleSource[];
      selectedSourceIndex: IndexIntoSourceTable;
    }
  // `applied` distinguishes a successful symbolication from a run that matched
  // a source but changed nothing (no stack positions mapped). `filename` is the
  // bundle source the map was applied to, shown so the user can confirm the
  // match was correct.
  | { phase: 'done'; applied: boolean; filename: string }
  | { phase: 'error'; error: ApplySourceMapError };

/**
 * A button in the Profile Info panel that lets the user pick a source map file
 * from disk and run JS source map symbolication against it. This covers the
 * case where a profile carries sourceMapURLs but was loaded without a browser
 * connection (e.g. from a file), so nothing was fetched automatically.
 */
class ApplySourceMapButtonImpl extends React.PureComponent<Props, ApplyState> {
  override state: ApplyState = { phase: 'idle' };

  _fileInput: HTMLInputElement | null = null;

  _takeInputRef = (input: HTMLInputElement | null) => {
    this._fileInput = input;
  };

  _onButtonClick = () => {
    if (this._fileInput) {
      this._fileInput.click();
    }
  };

  _onFileChange = async () => {
    const file = this._fileInput?.files?.[0];
    if (this._fileInput) {
      // Reset so selecting the same file again re-triggers onChange.
      this._fileInput.value = '';
    }
    if (!file) {
      return;
    }

    const fileReader = this.props.fileReader ?? _fileReader;
    let text: string;
    try {
      text = await fileReader(file).asText();
    } catch (error) {
      console.error('Failed to read the selected source map file:', error);
      this.setState({ phase: 'error', error: 'invalid-source-map' });
      return;
    }

    await this._run(file.name, text);
  };

  _onSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedSourceIndex = Number(event.currentTarget.value);
    this.setState((state) =>
      state.phase === 'choosing' ? { ...state, selectedSourceIndex } : state
    );
  };

  _onConfirmSource = async () => {
    const state = this.state;
    if (state.phase !== 'choosing') {
      return;
    }
    await this._run(
      state.fileName,
      state.fileContents,
      state.selectedSourceIndex
    );
  };

  _onCancel = () => {
    this.setState({ phase: 'idle' });
  };

  async _run(
    fileName: string,
    fileContents: string,
    sourceIndex?: IndexIntoSourceTable
  ) {
    this.setState({ phase: 'working' });
    const result = await this.props.applySourceMapFile(
      fileName,
      fileContents,
      sourceIndex
    );
    switch (result.type) {
      case 'applied':
        this.setState({
          phase: 'done',
          applied: true,
          filename: result.filename,
        });
        break;
      case 'no-match':
        this.setState({
          phase: 'done',
          applied: false,
          filename: result.filename,
        });
        break;
      case 'ambiguous':
        this.setState({
          phase: 'choosing',
          fileName,
          fileContents,
          candidates: result.candidates,
          selectedSourceIndex: result.candidates[0].sourceIndex,
        });
        break;
      case 'error':
        this.setState({ phase: 'error', error: result.error });
        break;
      default:
        throw assertExhaustiveCheck(result);
    }
  }

  _renderStatus() {
    const state = this.state;
    switch (state.phase) {
      case 'idle':
      case 'working':
        return null;
      case 'done':
        return (
          <div
            className="metaInfoRow metaInfoSourceMapStatus"
            title={state.filename}
          >
            <span className="metaInfoLabel"></span>
            <Localized
              id={
                state.applied
                  ? 'MenuButtons--metaInfo--source-map-success'
                  : 'MenuButtons--metaInfo--source-map-no-match'
              }
              vars={{ filename: basename(state.filename) }}
            />
          </div>
        );
      case 'error':
        return (
          <div className="metaInfoRow metaInfoSourceMapStatus metaInfoSourceMapError">
            <span className="metaInfoLabel"></span>
            <Localized id={_sourceMapErrorL10nId(state.error)} />
          </div>
        );
      case 'choosing':
        return this._renderSourcePicker(state);
      default:
        throw assertExhaustiveCheck(state);
    }
  }

  _renderSourcePicker(state: Extract<ApplyState, { phase: 'choosing' }>) {
    return (
      <div className="metaInfoRow metaInfoSourceMapPicker">
        <span className="metaInfoLabel"></span>
        <div className="metaInfoSourceMapPickerBody">
          <Localized id="MenuButtons--metaInfo--source-map-choose-bundle">
            <div className="metaInfoSourceMapPickerLabel">
              Choose which bundle this source map applies to:
            </div>
          </Localized>
          <select
            className="metaInfoSourceMapPickerSelect"
            value={String(state.selectedSourceIndex)}
            onChange={this._onSelectChange}
          >
            {state.candidates.map((candidate) => (
              <option
                key={candidate.sourceIndex}
                value={String(candidate.sourceIndex)}
                title={candidate.filename}
              >
                {candidate.filename}
              </option>
            ))}
          </select>
          <div className="metaInfoSourceMapPickerButtons">
            <Localized id="MenuButtons--metaInfo--source-map-cancel">
              <button
                type="button"
                className="photon-button photon-button-default photon-button-micro"
                onClick={this._onCancel}
              >
                Cancel
              </button>
            </Localized>
            <Localized id="MenuButtons--metaInfo--source-map-apply">
              <button
                type="button"
                className="photon-button photon-button-primary photon-button-micro"
                onClick={this._onConfirmSource}
              >
                Apply
              </button>
            </Localized>
          </div>
        </div>
      </div>
    );
  }

  override render() {
    const { candidates, symbolicationStatus } = this.props;
    if (candidates.length === 0) {
      return null;
    }

    const busy =
      this.state.phase === 'working' || symbolicationStatus === 'SYMBOLICATING';

    return (
      <>
        <div className="metaInfoRow metaInfoSourceMapRow">
          <span className="metaInfoLabel">
            <Localized id="MenuButtons--metaInfo--source-maps">
              Source maps:
            </Localized>
          </span>
          <input
            className="metaInfoSourceMapFileInput"
            type="file"
            accept=".map,application/json"
            ref={this._takeInputRef}
            onChange={this._onFileChange}
          />
          <Localized
            id="MenuButtons--metaInfo--apply-source-map"
            attrs={{ title: true }}
          >
            <button
              type="button"
              className="photon-button photon-button-micro"
              onClick={this._onButtonClick}
              disabled={busy}
              title="Load a .map file from disk to symbolicate a minified JavaScript bundle, to recover original function names and source locations."
            >
              Apply source map…
            </button>
          </Localized>
        </div>
        {this._renderStatus()}
      </>
    );
  }
}

function _sourceMapErrorL10nId(error: ApplySourceMapError): string {
  switch (error) {
    case 'invalid-source-map':
      return 'MenuButtons--metaInfo--source-map-error-invalid';
    case 'no-eligible-sources':
      return 'MenuButtons--metaInfo--source-map-error-no-eligible';
    case 'symbolication-failed':
      return 'MenuButtons--metaInfo--source-map-error-failed';
    default:
      throw assertExhaustiveCheck(error);
  }
}

export const ApplySourceMapButton = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    candidates: getSourcesWithSourceMaps(state),
    symbolicationStatus: getSourceMapSymbolicationStatus(state),
  }),
  mapDispatchToProps: {
    applySourceMapFile,
  },
  component: ApplySourceMapButtonImpl,
});
