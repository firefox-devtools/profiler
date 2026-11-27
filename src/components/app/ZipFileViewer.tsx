/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import { Localized } from '@fluent/react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { DragAndDropOverlay } from './DragAndDrop';
import {
  changeSelectedZipFile,
  changeExpandedZipFile,
  viewProfileFromZip,
  viewProfileFromPathInZipFile,
  returnToZipFileList,
} from 'firefox-profiler/actions/zipped-profiles';
import {
  getZipFileState,
  getZipFileTree,
  getZipFileMaxDepth,
  getSelectedZipFileIndex,
  getExpandedZipFileIndexes,
  getZipFileErrorMessage,
} from 'firefox-profiler/selectors/zipped-profiles';
import { getPathInZipFileFromUrl } from 'firefox-profiler/selectors/url-state';
import { TreeView } from 'firefox-profiler/components/shared/TreeView';
import { ProfileViewer } from './ProfileViewer';
import { defaultTableViewOptions } from 'firefox-profiler/reducers/profile-view';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { ZipFileState } from 'firefox-profiler/types';
import type {
  ZipDisplayData,
  ZipFileTree,
  IndexIntoZipFileTable,
} from 'firefox-profiler/profile-logic/zip-files';

import './ZipFileViewer.css';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

type StateProps = {
  readonly zipFileState: ZipFileState;
  readonly pathInZipFile: string | null;
  readonly zipFileTree: ZipFileTree;
  readonly zipFileMaxDepth: number;
  readonly selectedZipFileIndex: IndexIntoZipFileTable | null;
  // In practice this should never contain null, but needs to support the
  // TreeView interface.
  readonly expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>;
  readonly zipFileErrorMessage: null | string;
};

type DispatchProps = {
  readonly changeSelectedZipFile: typeof changeSelectedZipFile;
  readonly changeExpandedZipFile: typeof changeExpandedZipFile;
  readonly viewProfileFromZip: typeof viewProfileFromZip;
  readonly viewProfileFromPathInZipFile: typeof viewProfileFromPathInZipFile;
  readonly returnToZipFileList: typeof returnToZipFileList;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

type ZipFileRowDispatchProps = {
  readonly viewProfileFromZip: typeof viewProfileFromZip;
};
type ZipFileRowOwnProps = {
  readonly displayData: ZipDisplayData;
};

type ZipFileRowProps = ConnectedProps<
  ZipFileRowOwnProps,
  {},
  ZipFileRowDispatchProps
>;

class ZipFileRowImpl extends React.PureComponent<ZipFileRowProps> {
  _handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const {
      viewProfileFromZip,
      displayData: { zipTableIndex },
    } = this.props;
    if (zipTableIndex !== null) {
      viewProfileFromZip(zipTableIndex);
    }
  };
  override render() {
    const { name, url } = this.props.displayData;
    if (!url) {
      return name;
    }

    return (
      <a href={url} onClick={this._handleClick}>
        {name}
      </a>
    );
  }
}

const ZipFileRow = explicitConnect<
  ZipFileRowOwnProps,
  {},
  ZipFileRowDispatchProps
>({
  // ZipFileRow is implemented as a connected component, only to provide access to
  // dispatch-wrapped actions. Please consider the performance impact of using
  // mapStateToProps here.
  mapDispatchToProps: {
    viewProfileFromZip,
  },
  component: ZipFileRowImpl,
});

/**
 * Fluent inserts variables before it parses the markup of a message, so escape
 * the untrusted path to keep it as plain text inside its element.
 */
function escapeFluentMarkup(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * This component is a viewer for zip files. It was built to load
 * multiple profiles recorded from Talos so that a user could navigate
 * to a particular one. However, it is a general purpose zip file
 * viewer to load profiles, so it can be used on arbitrary profiles.
 */
class ZipFileViewerImpl extends React.PureComponent<Props> {
  _fixedColumns = [];
  _mainColumn = { propName: 'name', titleL10nId: '', component: ZipFileRow };
  _treeView: TreeView<ZipDisplayData> | null = null;
  _takeTreeViewRef = (treeView: TreeView<ZipDisplayData> | null) => {
    this._treeView = treeView;
  };

  constructor(props: Props) {
    super(props);
    const { expandedZipFileIndexes, zipFileTree, changeExpandedZipFile } =
      this.props;
    if (expandedZipFileIndexes.length === 0 && zipFileTree) {
      changeExpandedZipFile([...zipFileTree.getAllDescendants(null)]);
    }
  }

  override componentDidMount() {
    const { zipFileState, pathInZipFile, zipFileTree } = this.props;
    if (zipFileState.phase === 'NO_ZIP_FILE' && pathInZipFile) {
      // Most likely the UrlState was deserialized from the URL, but the zip file
      // still hasn't actually been decompressed yet.
      if (!zipFileTree) {
        throw new Error(
          'The zipFileTree should exist if this component was mounted'
        );
      }
    }
    this.focus();
  }

  /**
   * This function keeps the ZipFileState in sync with the UrlState.
   * Loading zip files is asynchronous, while navigating URLs can
   * happen faster than zip files can be read and processed. This
   * method is what keeps the ZipFileViewer and ZipFileState in sync
   * with the UrlState.
   */
  override componentDidUpdate(prevProps: Props) {
    const {
      pathInZipFile,
      zipFileState,
      viewProfileFromPathInZipFile,
      returnToZipFileList,
    } = this.props;
    if (pathInZipFile !== zipFileState.pathInZipFile) {
      // The UrlState and ZipFileState are out of sync, they need to be
      // updated.

      if (pathInZipFile === null) {
        // The the UrlState has navigated away from the file, return
        // to the zip file list.
        returnToZipFileList();
      } else {
        // The UrlState was updated to view a zip file, but we haven't
        // started doing that.
        viewProfileFromPathInZipFile(pathInZipFile);
      }
    }
    if (
      prevProps.zipFileState.phase !== 'LIST_FILES_IN_ZIP_FILE' &&
      this.props.zipFileState.phase === 'LIST_FILES_IN_ZIP_FILE'
    ) {
      // Re-focus if listing zip files again.
      this.focus();
    }
  }

  focus() {
    const treeView = this._treeView;
    if (treeView) {
      treeView.focus();
    }
  }

  _renderMessage(message: React.ReactNode) {
    return (
      <section className="zipFileViewer">
        <div className="zipFileViewerSection">
          <header className="zipFileViewerHeader">
            <h1>Firefox Profiler</h1>
            <Localized id="ZipFileViewer--choose-profile">
              <p>Choose a profile from this archive</p>
            </Localized>
          </header>
          <div className="zipFileViewerMessage">{message}</div>
          <DragAndDropOverlay />
        </div>
      </section>
    );
  }

  _renderBackButton() {
    return (
      <Localized id="ZipFileViewer--back-to-archive-list" key="backButton">
        <button
          type="button"
          className="homeSectionInstallButton"
          onClick={this.props.returnToZipFileList}
        >
          ← Back to archive list
        </button>
      </Localized>
    );
  }

  _onEnterKey = (zipTableIndex: IndexIntoZipFileTable) => {
    this.props.viewProfileFromZip(zipTableIndex);
  };

  override render() {
    const {
      zipFileState,
      zipFileTree,
      zipFileMaxDepth,
      selectedZipFileIndex,
      expandedZipFileIndexes,
      changeSelectedZipFile,
      changeExpandedZipFile,
      pathInZipFile,
      zipFileErrorMessage,
    } = this.props;

    if (!zipFileTree) {
      console.error('No zipFileTree was found in a ZipFileViewer.');
      return null;
    }
    const { phase } = zipFileState;
    const displayedPath = '/' + (pathInZipFile ?? '');
    // This is text that comes from the URL, make sure it looks visually
    // distinct for guarding against someone doing anything too funky
    // with it.
    const untrustedFilePath = (
      <span className="zipFileViewerUntrustedFilePath" />
    );

    switch (phase) {
      case 'NO_ZIP_FILE':
        console.error(
          'Loaded the ZipFileViewer component when there is no archive file.'
        );
        return this._renderMessage(
          <Localized id="ZipFileViewer--error-no-archive">
            <span>Error: No archive file was found.</span>
          </Localized>
        );
      case 'LIST_FILES_IN_ZIP_FILE':
        return (
          <section className="zipFileViewer">
            <div className="zipFileViewerSection">
              <header className="zipFileViewerHeader">
                <h1>Firefox Profiler</h1>
                <Localized id="ZipFileViewer--choose-profile">
                  <p>Choose a profile from this archive</p>
                </Localized>
              </header>
              <TreeView
                maxNodeDepth={zipFileMaxDepth}
                tree={zipFileTree}
                fixedColumns={this._fixedColumns}
                mainColumn={this._mainColumn}
                onSelectionChange={changeSelectedZipFile}
                onExpandedNodesChange={changeExpandedZipFile}
                selectedNodeId={selectedZipFileIndex}
                expandedNodeIds={expandedZipFileIndexes}
                ref={this._takeTreeViewRef}
                rowHeight={30}
                indentWidth={15}
                onEnterKey={this._onEnterKey}
                viewOptions={defaultTableViewOptions}
              />
              <DragAndDropOverlay />
            </div>
          </section>
        );
      case 'PROCESS_PROFILE_FROM_ZIP_FILE':
        return this._renderMessage(
          <Localized id="ZipFileViewer--loading-profile">
            <span>Loading the profile from the archive…</span>
          </Localized>
        );
      case 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE':
        return this._renderMessage([
          <Localized
            id="ZipFileViewer--error-unable-to-load"
            key="message"
            vars={{ path: escapeFluentMarkup(displayedPath) }}
            elems={{ path: untrustedFilePath }}
          >
            <p>
              Unable to load the profile at this path:{' '}
              <span className="zipFileViewerUntrustedFilePath">
                {displayedPath}
              </span>
            </p>
          </Localized>,
          <p key="error">{zipFileErrorMessage}</p>,
          this._renderBackButton(),
        ]);
      case 'FILE_NOT_FOUND_IN_ZIP_FILE':
        return this._renderMessage([
          <Localized
            id="ZipFileViewer--error-file-not-found"
            key="message"
            vars={{ path: escapeFluentMarkup(displayedPath) }}
            elems={{ path: untrustedFilePath }}
          >
            <p>
              Failed to find a file in the zip at the following path:{' '}
              <span className="zipFileViewerUntrustedFilePath">
                {displayedPath}
              </span>
            </p>
          </Localized>,
          this._renderBackButton(),
        ]);
      case 'VIEW_PROFILE_IN_ZIP_FILE':
        return <ProfileViewer />;
      default:
        throw assertExhaustiveCheck(phase);
    }
  }
}

export const ZipFileViewer = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => {
    const zipFileTree = getZipFileTree(state);
    if (zipFileTree === null) {
      throw new Error(
        'The zipFileTree should exist if the ZipFileViewer is mounted.'
      );
    }
    return {
      zipFileState: getZipFileState(state),
      pathInZipFile: getPathInZipFileFromUrl(state),
      zipFileTree,
      zipFileMaxDepth: getZipFileMaxDepth(state),
      selectedZipFileIndex: getSelectedZipFileIndex(state),
      expandedZipFileIndexes: getExpandedZipFileIndexes(state),
      zipFileErrorMessage: getZipFileErrorMessage(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedZipFile,
    changeExpandedZipFile,
    viewProfileFromZip,
    viewProfileFromPathInZipFile,
    returnToZipFileList,
  },
  component: ZipFileViewerImpl,
});
