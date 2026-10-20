/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized, useLocalization } from '@fluent/react';
import classNames from 'classnames';

import {
  updateSourceFilesToShare,
  fetchSourceFilesToShare,
  cancelSourceCodeFetch,
  turnOnSourceCodeSharing,
  encodeSanitizedProfile,
} from 'firefox-profiler/actions/publish';
import {
  getUploadPhase,
  getActiveSourceSharingPreset,
  getSourceCodeSharingStats,
  getSourceFilesToFetch,
  getSourceCodeFetchState,
  getSourceCodeSharingSummary,
  getSourceFileTree,
  getSourceFilesForPresets,
  getSourceFilesToShare,
} from 'firefox-profiler/selectors/publish';
import { SourceFileTree } from './SourceFileTree';
import { OFFERED_SOURCE_SHARING_PRESETS } from 'firefox-profiler/profile-logic/source-sharing';
import prettyBytes from 'firefox-profiler/utils/pretty-bytes';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import type {
  IndexIntoSourceTable,
  SharingMode,
  SourceCodeFetchState,
  SourceCodeSharingStats,
  SourceCodeSharingSummary,
  SourceFileTreeNode,
  OfferedSourceSharingPreset,
  SourceSharingPreset,
  UploadPhase,
} from 'firefox-profiler/types';

const PRESET_L10N_IDS: Record<SourceSharingPreset, string> = {
  'current-file': 'MenuButtons--publish--source-code-preset-current-file',
  'selected-threads':
    'MenuButtons--publish--source-code-preset-selected-threads',
  'all-files': 'MenuButtons--publish--source-code-preset-all-available-files',
  custom: 'MenuButtons--publish--source-code-preset-custom',
};

type SourceCodeLeftOutInfoProps = {
  readonly unavailableCount: number;
};

/**
 * An info icon whose tooltip says how many of the listed files can't be
 * downloaded from here, when there are any.
 */
function SourceCodeLeftOutInfo({
  unavailableCount,
}: SourceCodeLeftOutInfoProps) {
  const { l10n } = useLocalization();
  if (unavailableCount === 0) {
    return null;
  }
  return (
    <span
      className="publishPanelSourceCodeInfoIcon"
      title={l10n.getString(
        'MenuButtons--publish--source-code-left-out-unavailable',
        { unavailableCount }
      )}
    />
  );
}

type OwnProps = {
  readonly mode: SharingMode;
};

type StateProps = {
  readonly uploadPhase: UploadPhase;
  readonly sourceCodeSharingStats: SourceCodeSharingStats;
  readonly sourceFilesToFetch: ReadonlySet<IndexIntoSourceTable>;
  readonly sourceCodeFetchState: SourceCodeFetchState;
  readonly sourceFileTree: SourceFileTreeNode[];
  readonly sourceFilesToShare: ReadonlySet<IndexIntoSourceTable>;
  readonly sourceFilesForPresets: Record<
    OfferedSourceSharingPreset,
    ReadonlySet<IndexIntoSourceTable>
  >;
  readonly activeSourceSharingPreset: SourceSharingPreset;
  readonly sourceCodeSharingSummary: SourceCodeSharingSummary;
};

type DispatchProps = {
  readonly updateSourceFilesToShare: typeof updateSourceFilesToShare;
  readonly fetchSourceFilesToShare: typeof fetchSourceFilesToShare;
  readonly cancelSourceCodeFetch: typeof cancelSourceCodeFetch;
  readonly turnOnSourceCodeSharing: typeof turnOnSourceCodeSharing;
  readonly encodeSanitizedProfile: typeof encodeSanitizedProfile;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {
  readonly isSourceCodeSharingOn: boolean;
};

/**
 * The "Include source code" checkbox of the publish panel, with the presets,
 * file tree and status line that come with it once it's on.
 */
class PublishSourceCodeSectionImpl extends React.PureComponent<Props, State> {
  // Unchecking every file keeps the option on, so that the tree stays open
  // while the user edits it. The panel unmounts this when it closes, so it
  // comes back off if nothing is picked.
  override state: State = {
    isSourceCodeSharingOn: this.props.sourceFilesToShare.size > 0,
  };

  _isUploading(): boolean {
    const { uploadPhase } = this.props;
    return uploadPhase === 'uploading' || uploadPhase === 'compressing';
  }

  _onToggleSourceFiles = (sourceIndexes: Int32Array, selected: boolean) => {
    const { mode, sourceFilesToShare, updateSourceFilesToShare } = this.props;
    const newSelection = new Set(sourceFilesToShare);
    for (const sourceIndex of sourceIndexes) {
      if (selected) {
        newSelection.add(sourceIndex);
      } else {
        newSelection.delete(sourceIndex);
      }
    }
    updateSourceFilesToShare(mode, newSelection);
    this.props.encodeSanitizedProfile(mode);
  };

  // Turning sharing on picks the narrowest preset rather than every file, so
  // that opting in doesn't share more than the user looked at.
  _onToggleSourceCode = () => {
    const { mode, updateSourceFilesToShare } = this.props;
    if (!this.state.isSourceCodeSharingOn) {
      this.setState({ isSourceCodeSharingOn: true });
      this.props.turnOnSourceCodeSharing(mode);
      return;
    }
    this.setState({ isSourceCodeSharingOn: false });
    updateSourceFilesToShare(mode, new Set());
    this.props.encodeSanitizedProfile(mode);
  };

  _onFetchSourceFiles = () => {
    this.props.fetchSourceFilesToShare(this.props.mode);
  };

  _onCancelSourceFetch = () => {
    this.props.cancelSourceCodeFetch(this.props.mode);
  };

  _onPresetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { mode, sourceFilesForPresets, updateSourceFilesToShare } =
      this.props;
    // The 'custom' radio is disabled, so only offered presets get here.
    const preset = e.target.value as OfferedSourceSharingPreset;
    updateSourceFilesToShare(mode, sourceFilesForPresets[preset], preset);
    this.props.encodeSanitizedProfile(mode);
  };

  // Under the tree: what will be included, with an info icon for the files that
  // are left out, then what still has to be downloaded, with a button to do it
  // now. While a download runs, its progress and a cancel instead.
  _renderStatusRow() {
    const {
      mode,
      sourceFilesToFetch,
      sourceCodeFetchState,
      sourceCodeSharingSummary,
      sourceCodeSharingStats,
    } = this.props;
    const { unavailableFileCount } = sourceCodeSharingStats;

    if (sourceCodeFetchState.isFetching) {
      return (
        <div className="publishPanelSourceCodeStatus">
          <Localized
            id="MenuButtons--publish--source-code-fetching"
            vars={{
              completedCount: sourceCodeFetchState.completedCount,
              totalCount: sourceCodeFetchState.totalCount,
            }}
          >
            <span className="publishPanelSourceCodeSummary" />
          </Localized>
          <button
            type="button"
            className="photon-button photon-button-micro"
            onClick={this._onCancelSourceFetch}
          >
            <Localized id="MenuButtons--publish--source-code-cancel-fetch">
              Cancel
            </Localized>
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="publishPanelSourceCodeStatus">
          <span className="publishPanelSourceCodeSummary">
            <Localized
              id="MenuButtons--publish--source-code-status"
              vars={{
                fileCount: sourceCodeSharingSummary.fileCount,
                size: prettyBytes(sourceCodeSharingSummary.uncompressedSize),
              }}
            >
              <span />
            </Localized>
          </span>
          <SourceCodeLeftOutInfo unavailableCount={unavailableFileCount} />
        </div>
        {sourceFilesToFetch.size > 0 ? (
          <div className="publishPanelSourceCodeStatus">
            <Localized
              id={
                mode === 'download'
                  ? 'MenuButtons--publish--source-code-status-to-fetch-before-saving'
                  : 'MenuButtons--publish--source-code-status-to-fetch'
              }
              vars={{ fileCount: sourceFilesToFetch.size }}
            >
              <span className="publishPanelSourceCodeSummary" />
            </Localized>
            <button
              type="button"
              className="photon-button photon-button-micro"
              disabled={this._isUploading()}
              onClick={this._onFetchSourceFiles}
            >
              <Localized id="MenuButtons--publish--source-code-fetch-now">
                Fetch now
              </Localized>
            </button>
          </div>
        ) : null}
      </>
    );
  }

  _renderPresets() {
    const { mode, activeSourceSharingPreset, sourceFilesForPresets } =
      this.props;
    // Presets that would select nothing stay in place, disabled, so that the
    // row doesn't change shape as files get fetched or the options change.
    const presets: SourceSharingPreset[] = [...OFFERED_SOURCE_SHARING_PRESETS];
    if (activeSourceSharingPreset === 'custom') {
      presets.push('custom');
    }

    return (
      <fieldset className="publishPanelSourceCodePresets">
        <Localized id="MenuButtons--publish--source-code-preset-legend">
          <legend className="publishPanelSourceCodePresetsLegend">
            Include:
          </legend>
        </Localized>
        {presets.map((preset) => (
          <label
            key={preset}
            className={classNames(
              'photon-label publishPanelSourceCodePresetLabel',
              {
                publishPanelLabelDisabled:
                  preset !== 'custom' &&
                  sourceFilesForPresets[preset].size === 0,
              }
            )}
          >
            <input
              type="radio"
              className="photon-radio photon-radio-micro"
              name={`sourceCodePreset-${mode}`}
              value={preset}
              checked={activeSourceSharingPreset === preset}
              // "Custom" only reports the state of the tree.
              disabled={
                this._isUploading() ||
                preset === 'custom' ||
                sourceFilesForPresets[preset].size === 0
              }
              onChange={this._onPresetChange}
            />
            <Localized id={PRESET_L10N_IDS[preset]} />
          </label>
        ))}
      </fieldset>
    );
  }

  // Shown next to the checkbox while it's off, so that the amount of source
  // code on offer is visible without turning the option on.
  _renderAvailability() {
    const {
      fileCount,
      downloadedFileCount,
      downloadedUncompressedSize,
      shareableFileCount,
    } = this.props.sourceCodeSharingStats;
    const missingFileCount = fileCount - downloadedFileCount;
    const size = prettyBytes(downloadedUncompressedSize);

    let l10nId = 'MenuButtons--publish--source-code-available';
    if (downloadedFileCount === 0) {
      l10nId = 'MenuButtons--publish--source-code-none-fetched';
    } else if (missingFileCount > 0) {
      l10nId = 'MenuButtons--publish--source-code-partially-fetched';
    }

    const availability = (
      <Localized
        id={l10nId}
        vars={{
          fileCount: downloadedFileCount,
          totalFileCount: fileCount,
          size,
        }}
      >
        <span className="publishPanelSourceCodeAvailable" />
      </Localized>
    );
    if (shareableFileCount > 0) {
      return availability;
    }
    // The tooltip goes on this part only, so that it doesn't replace the
    // checkbox's accessible name.
    return (
      <Localized
        id="MenuButtons--publish--source-code-nothing-to-include"
        attrs={{ title: true }}
      >
        <span>{availability}</span>
      </Localized>
    );
  }

  override render() {
    const { mode, sourceFileTree, sourceFilesToShare, sourceCodeSharingStats } =
      this.props;
    const { isSourceCodeSharingOn } = this.state;
    // Nothing can be shared when no file is downloaded or fetchable.
    const hasNothingToPick = sourceCodeSharingStats.shareableFileCount === 0;

    return (
      <>
        <label
          className={classNames('photon-label publishPanelDataChoicesLabel', {
            publishPanelLabelDisabled: hasNothingToPick,
          })}
        >
          <input
            type="checkbox"
            className="photon-checkbox photon-checkbox-default"
            onChange={this._onToggleSourceCode}
            checked={isSourceCodeSharingOn}
            disabled={this._isUploading() || hasNothingToPick}
          />
          <span>
            <Localized id="MenuButtons--publish--renderCheckbox-label-source-code" />
            {isSourceCodeSharingOn ? null : this._renderAvailability()}
          </span>
        </label>
        {isSourceCodeSharingOn ? (
          <>
            {mode === 'upload' ? (
              <div className="photon-message-bar photon-message-bar-warning photon-message-bar-inner-content publishPanelSourceCodeNotice">
                <Localized id="MenuButtons--publish--source-code-rights-notice">
                  <div className="photon-message-bar-inner-text">
                    These files will be public. Only include code you have the
                    right to share.
                  </div>
                </Localized>
              </div>
            ) : null}
            {this._renderPresets()}
            <div className="publishPanelSourceFileTreeContainer">
              <SourceFileTree
                nodes={sourceFileTree}
                selectedSourceIndexes={sourceFilesToShare}
                disabled={this._isUploading()}
                onToggle={this._onToggleSourceFiles}
              />
            </div>
            {this._renderStatusRow()}
          </>
        ) : null}
      </>
    );
  }
}

export const PublishSourceCodeSection = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, { mode }) => ({
    uploadPhase: getUploadPhase(state),
    sourceCodeSharingStats: getSourceCodeSharingStats(state),
    sourceFilesToFetch: getSourceFilesToFetch(state, mode),
    sourceCodeFetchState: getSourceCodeFetchState(state, mode),
    sourceFileTree: getSourceFileTree(state),
    sourceFilesToShare: getSourceFilesToShare(state, mode),
    sourceFilesForPresets: getSourceFilesForPresets(state),
    activeSourceSharingPreset: getActiveSourceSharingPreset(state, mode),
    sourceCodeSharingSummary: getSourceCodeSharingSummary(state, mode),
  }),
  mapDispatchToProps: {
    updateSourceFilesToShare,
    fetchSourceFilesToShare,
    cancelSourceCodeFetch,
    turnOnSourceCodeSharing,
    encodeSanitizedProfile,
  },
  component: PublishSourceCodeSectionImpl,
});
