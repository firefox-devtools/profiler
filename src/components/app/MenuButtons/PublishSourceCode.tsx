/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized, useLocalization } from '@fluent/react';

import {
  updateSourceFilesToShare,
  turnOnSourceCodeSharing,
  encodeSanitizedProfile,
} from 'firefox-profiler/actions/publish';
import {
  getUploadPhase,
  getActiveSourceSharingPreset,
  getSourceCodeSharingStats,
  getSourceCodeSharingSummary,
  getSourceFileTree,
  getSourceFilesForOfferedPresets,
  getSourceFilesToShare,
} from 'firefox-profiler/selectors/publish';
import { SourceFileTree } from './SourceFileTree';
import prettyBytes from 'firefox-profiler/utils/pretty-bytes';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import type {
  IndexIntoSourceTable,
  SharingMode,
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
  readonly publicCount: number;
};

/**
 * An info icon whose tooltip has a sentence for the listed files that can't be
 * downloaded from here, and one for the files left out because anybody can
 * download them, each only when there are any. The sentences are separate
 * messages so that each one carries a single plural.
 */
function SourceCodeLeftOutInfo({
  unavailableCount,
  publicCount,
}: SourceCodeLeftOutInfoProps) {
  const { l10n } = useLocalization();
  const sentences = [];
  if (unavailableCount > 0) {
    sentences.push(
      l10n.getString('MenuButtons--publish--source-code-left-out-unavailable', {
        unavailableCount,
      })
    );
  }
  if (publicCount > 0) {
    sentences.push(
      l10n.getString('MenuButtons--publish--source-code-left-out-public', {
        publicCount,
      })
    );
  }
  if (sentences.length === 0) {
    return null;
  }
  return (
    <span
      className="publishPanelSourceCodeInfoIcon"
      title={sentences.join('\n')}
    />
  );
}

type OwnProps = {
  readonly mode: SharingMode;
};

type StateProps = {
  readonly uploadPhase: UploadPhase;
  readonly sourceCodeSharingStats: SourceCodeSharingStats;
  readonly sourceFileTree: SourceFileTreeNode[];
  readonly sourceFilesToShare: ReadonlySet<IndexIntoSourceTable>;
  readonly sourceFilesForPresets: Map<
    OfferedSourceSharingPreset,
    ReadonlySet<IndexIntoSourceTable>
  >;
  readonly activeSourceSharingPreset: SourceSharingPreset;
  readonly sourceCodeSharingSummary: SourceCodeSharingSummary;
};

type DispatchProps = {
  readonly updateSourceFilesToShare: typeof updateSourceFilesToShare;
  readonly turnOnSourceCodeSharing: typeof turnOnSourceCodeSharing;
  readonly encodeSanitizedProfile: typeof encodeSanitizedProfile;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

/**
 * The "Include source code" checkbox of the publish panel, with the presets,
 * file tree and status line that come with it once it's on.
 */
class PublishSourceCodeSectionImpl extends React.PureComponent<Props> {
  _isUploading(): boolean {
    const { uploadPhase } = this.props;
    return uploadPhase === 'uploading' || uploadPhase === 'compressing';
  }

  _onToggleSourceFiles = (
    sourceIndexes: IndexIntoSourceTable[],
    selected: boolean
  ) => {
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
    const { mode, sourceFilesToShare, updateSourceFilesToShare } = this.props;
    if (sourceFilesToShare.size === 0) {
      this.props.turnOnSourceCodeSharing(mode);
      return;
    }
    updateSourceFilesToShare(mode, new Set());
    this.props.encodeSanitizedProfile(mode);
  };

  _onPresetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { mode, sourceFilesForPresets, updateSourceFilesToShare } =
      this.props;
    // The 'custom' radio is disabled, so only offered presets get here.
    const preset = e.target.value as OfferedSourceSharingPreset;
    const sourceIndexes = sourceFilesForPresets.get(preset);
    if (sourceIndexes === undefined) {
      return;
    }
    updateSourceFilesToShare(mode, sourceIndexes, preset);
    this.props.encodeSanitizedProfile(mode);
  };

  // One line under the tree: what will be included, and an info icon for the
  // files that are left out.
  _renderStatusRow() {
    const { sourceCodeSharingSummary, sourceCodeSharingStats } = this.props;
    const { unavailableFileCount, publiclyDownloadableFileCount } =
      sourceCodeSharingStats;

    return (
      <div className="publishPanelSourceCodeStatus">
        <span className="publishPanelSourceCodeSummary">
          <Localized
            id="MenuButtons--publish--source-code-status"
            vars={{
              fileCount: sourceCodeSharingSummary.fileCount,
              size: prettyBytes(sourceCodeSharingSummary.byteCount),
            }}
          >
            <span />
          </Localized>
        </span>
        <SourceCodeLeftOutInfo
          unavailableCount={unavailableFileCount}
          publicCount={publiclyDownloadableFileCount}
        />
      </div>
    );
  }

  _renderPresets() {
    const { mode, activeSourceSharingPreset, sourceFilesForPresets } =
      this.props;
    if (sourceFilesForPresets.size < 2) {
      return null;
    }

    const presets: SourceSharingPreset[] = [...sourceFilesForPresets.keys()];
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
            className="photon-label publishPanelSourceCodePresetLabel"
          >
            <input
              type="radio"
              className="photon-radio photon-radio-micro"
              name={`sourceCodePreset-${mode}`}
              value={preset}
              checked={activeSourceSharingPreset === preset}
              // "Custom" only reports the state of the tree.
              disabled={this._isUploading() || preset === 'custom'}
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
    const { fileCount, downloadedFileCount, downloadedByteCount } =
      this.props.sourceCodeSharingStats;
    const missingFileCount = fileCount - downloadedFileCount;
    const size = prettyBytes(downloadedByteCount);

    let l10nId = 'MenuButtons--publish--source-code-available';
    if (downloadedFileCount === 0) {
      l10nId = 'MenuButtons--publish--source-code-none-downloaded';
    } else if (missingFileCount > 0) {
      l10nId = 'MenuButtons--publish--source-code-partially-downloaded';
    }

    return (
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
  }

  override render() {
    const { sourceFileTree, sourceFilesToShare, sourceCodeSharingStats } =
      this.props;
    const isSharingSourceCode = sourceFilesToShare.size > 0;

    return (
      <>
        <label className="photon-label publishPanelDataChoicesLabel">
          <input
            type="checkbox"
            className="photon-checkbox photon-checkbox-default"
            onChange={this._onToggleSourceCode}
            checked={isSharingSourceCode}
            // Nothing can be shared when no file is downloaded.
            disabled={
              this._isUploading() ||
              sourceCodeSharingStats.downloadedFileCount === 0
            }
          />
          <span>
            <Localized id="MenuButtons--publish--renderCheckbox-label-source-code" />
            {isSharingSourceCode ? null : this._renderAvailability()}
          </span>
        </label>
        {isSharingSourceCode ? (
          <>
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
    sourceFileTree: getSourceFileTree(state),
    sourceFilesToShare: getSourceFilesToShare(state, mode),
    sourceFilesForPresets: getSourceFilesForOfferedPresets(state),
    activeSourceSharingPreset: getActiveSourceSharingPreset(state, mode),
    sourceCodeSharingSummary: getSourceCodeSharingSummary(state, mode),
  }),
  mapDispatchToProps: {
    updateSourceFilesToShare,
    turnOnSourceCodeSharing,
    encodeSanitizedProfile,
  },
  component: PublishSourceCodeSectionImpl,
});
