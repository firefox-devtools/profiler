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
  'web-code': 'MenuButtons--publish--source-code-preset-web-code',
  'selected-threads':
    'MenuButtons--publish--source-code-preset-selected-threads',
  'all-files': 'MenuButtons--publish--source-code-preset-all-files',
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
  readonly isExpanded: boolean;
};

/**
 * The "Include source code" checkbox of the publish panel, and below the other
 * checkboxes, a collapsible section with the presets, file tree and status
 * lines. The checkbox says whether any file is picked.
 */
class PublishSourceCodeSectionImpl extends React.PureComponent<Props, State> {
  // The section opens whenever the selection goes from nothing to something,
  // so that the user sees what will be shared. That includes the default
  // selection, which can arrive after the panel opens.
  override state: State = {
    isExpanded: this.props.sourceFilesToShare.size > 0,
  };

  override componentDidUpdate(prevProps: Props) {
    if (
      prevProps.sourceFilesToShare.size === 0 &&
      this.props.sourceFilesToShare.size > 0 &&
      !this.state.isExpanded
    ) {
      this.setState({ isExpanded: true });
    }
  }

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

  _onToggleSourceCode = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { mode, updateSourceFilesToShare } = this.props;
    if (e.target.checked) {
      this.props.turnOnSourceCodeSharing(mode);
      return;
    }
    updateSourceFilesToShare(mode, new Set());
    this.props.encodeSanitizedProfile(mode);
  };

  _onToggleExpanded = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    this.setState({ isExpanded: e.currentTarget.open });
  };

  _onFetchSourceFiles = () => {
    this.props.fetchSourceFilesToShare(this.props.mode);
  };

  // Keeps the picked files that are loaded, and unpicks the others, so that
  // sharing doesn't load anything more.
  _onLeaveOutUnloadedFiles = () => {
    const {
      mode,
      sourceFilesToShare,
      sourceFilesToFetch,
      updateSourceFilesToShare,
    } = this.props;
    const newSelection = new Set(sourceFilesToShare);
    for (const sourceIndex of sourceFilesToFetch) {
      newSelection.delete(sourceIndex);
    }
    updateSourceFilesToShare(mode, newSelection);
    this.props.encodeSanitizedProfile(mode);
  };

  _onCancelSourceFetch = () => {
    this.props.cancelSourceCodeFetch(this.props.mode);
  };

  _onPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { mode, sourceFilesForPresets, updateSourceFilesToShare } =
      this.props;
    // The 'custom' option is disabled, so only offered presets get here.
    const preset = e.target.value as OfferedSourceSharingPreset;
    updateSourceFilesToShare(mode, sourceFilesForPresets[preset], preset);
    this.props.encodeSanitizedProfile(mode);
  };

  // Under the tree, two lines that are always there, so that the panel
  // doesn't change height and move the Upload button: what will be included,
  // with an info icon for the files that are left out, then what still has to
  // be loaded, with buttons to load it now or leave it out. The second line is
  // empty when nothing has to be loaded. While loading runs, it shows the
  // progress and a cancel button instead.
  _renderStatusRows() {
    const {
      sourceCodeSharingSummary,
      sourceCodeSharingStats,
      sourceFilesToFetch,
    } = this.props;
    const { fileCount, uncompressedSize } = sourceCodeSharingSummary;
    // The size of the files that still have to be loaded isn't known yet.
    let l10nId = 'MenuButtons--publish--source-code-status';
    if (sourceFilesToFetch.size === fileCount) {
      l10nId = 'MenuButtons--publish--source-code-status-without-size';
    } else if (sourceFilesToFetch.size > 0) {
      l10nId = 'MenuButtons--publish--source-code-status-at-least';
    }
    return (
      <>
        <div className="publishPanelSourceCodeStatus">
          <span className="publishPanelSourceCodeSummary">
            <Localized
              id={l10nId}
              vars={{ fileCount, size: prettyBytes(uncompressedSize) }}
            >
              <span />
            </Localized>
          </span>
          <SourceCodeLeftOutInfo
            unavailableCount={sourceCodeSharingStats.unavailableFileCount}
          />
        </div>
        <div className="publishPanelSourceCodeStatus">
          {this._renderFetchStatus()}
        </div>
      </>
    );
  }

  _renderFetchStatus() {
    const { mode, sourceFilesToFetch, sourceCodeFetchState } = this.props;

    if (sourceCodeFetchState.isFetching) {
      return (
        <>
          <Localized
            id="MenuButtons--publish--source-code-loading"
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
            <Localized id="MenuButtons--publish--source-code-cancel-load">
              Cancel
            </Localized>
          </button>
        </>
      );
    }

    // The row stays, empty, so that the panel doesn't change height.
    if (sourceFilesToFetch.size === 0) {
      return null;
    }

    return (
      <>
        <Localized
          id={
            mode === 'download'
              ? 'MenuButtons--publish--source-code-status-to-load-when-saving'
              : 'MenuButtons--publish--source-code-status-to-load'
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
          <Localized id="MenuButtons--publish--source-code-load-now">
            Load now
          </Localized>
        </button>
        <button
          type="button"
          className="photon-button photon-button-micro"
          disabled={this._isUploading()}
          onClick={this._onLeaveOutUnloadedFiles}
        >
          <Localized id="MenuButtons--publish--source-code-leave-out">
            Leave out
          </Localized>
        </button>
      </>
    );
  }

  _renderPresets() {
    const { mode, activeSourceSharingPreset, sourceFilesForPresets } =
      this.props;
    const selectId = `publishPanelSourceCodePreset-${mode}`;

    return (
      <div className="publishPanelSourceCodePresets">
        <Localized id="MenuButtons--publish--source-code-preset-label">
          <label
            htmlFor={selectId}
            className="publishPanelSourceCodePresetsLabel"
          >
            Include:
          </label>
        </Localized>
        <select
          id={selectId}
          className="publishPanelSourceCodePresetSelect"
          value={activeSourceSharingPreset}
          disabled={this._isUploading()}
          onChange={this._onPresetChange}
        >
          {OFFERED_SOURCE_SHARING_PRESETS.map((preset) => (
            <Localized key={preset} id={PRESET_L10N_IDS[preset]}>
              <option
                value={preset}
                disabled={sourceFilesForPresets[preset].size === 0}
              />
            </Localized>
          ))}
          {/* "Custom" only reports the state of the tree, so it can't be
              picked, and it's only there while it applies. */}
          {activeSourceSharingPreset === 'custom' ? (
            <Localized id={PRESET_L10N_IDS.custom}>
              <option value="custom" disabled />
            </Localized>
          ) : null}
        </select>
      </div>
    );
  }

  override render() {
    const { mode, sourceFileTree, sourceFilesToShare, sourceCodeSharingStats } =
      this.props;
    const { isExpanded } = this.state;
    const isSourceCodeSharingOn = sourceFilesToShare.size > 0;
    // Nothing can be shared when no file is downloaded or fetchable.
    const hasNothingToPick = sourceCodeSharingStats.shareableFileCount === 0;

    return (
      <>
        {/* The tooltip goes on a wrapper rather than on the label, so that it
            doesn't become the checkbox's accessible name. */}
        <Localized
          id="MenuButtons--publish--source-code-nothing-to-include"
          attrs={{ title: hasNothingToPick }}
        >
          <div className="publishPanelDataChoices">
            <label
              className={classNames(
                'photon-label publishPanelDataChoicesLabel',
                { publishPanelLabelDisabled: hasNothingToPick }
              )}
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
              </span>
            </label>
          </div>
        </Localized>
        <details
          className="publishPanelSourceCodeDetails"
          open={isExpanded}
          onToggle={this._onToggleExpanded}
        >
          <summary className="publishPanelSourceCodeDetailsSummary">
            <Localized id="MenuButtons--publish--source-code-details-heading">
              <h3 className="photon-title-10 publishPanelSourceCodeDetailsHeading">
                Embedded source code
              </h3>
            </Localized>
          </summary>
          {/* The tree can be long, so it's only rendered while it's visible. */}
          {isExpanded ? (
            <div className="publishPanelSourceCodeDetailsContent">
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
              {this._renderStatusRows()}
            </div>
          ) : null}
        </details>
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
    sourceCodeSharingStats: getSourceCodeSharingStats(state, mode),
    sourceFilesToFetch: getSourceFilesToFetch(state, mode),
    sourceCodeFetchState: getSourceCodeFetchState(state, mode),
    sourceFileTree: getSourceFileTree(state, mode),
    sourceFilesToShare: getSourceFilesToShare(state, mode),
    sourceFilesForPresets: getSourceFilesForPresets(state, mode),
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
