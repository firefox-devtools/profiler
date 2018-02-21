/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect, {
  type ExplicitConnectOptions,
  type ConnectedProps,
} from '../../utils/connect';
import {
  procureInitialInterestingExpandedNodes,
  type ZipFileTree,
  type IndexIntoZipFileTable,
} from '../../profile-logic/zip-files';
import {
  changeSelectedZipFile,
  changeExpandedZipFile,
  viewProfileFromZip,
  returnToZipFileList,
  showErrorForNoFileInZip,
} from '../../actions/app';
import {
  getZipFileState,
  getZipFileTree,
  getZipFileTable,
  getZipFileMaxDepth,
  getSelectedZipFileIndex,
  getExpandedZipFileIndexes,
} from '../../reducers/app';
import { getZipFilePathFromUrl } from '../../reducers/url-state';
import TreeView from '../shared/TreeView';
import ProfileViewer from './ProfileViewer';
import type { ZipFileState } from '../../types/reducers';
import type {
  ZipFileTable,
  ZipDisplayData,
} from '../../profile-logic/zip-files';
import './ZipFileViewer.css';

type StateProps = {|
  +zipFileState: ZipFileState,
  +zipFilePathFromUrl: string | null,
  +zipFileTree: ZipFileTree,
  +zipFileTable: ZipFileTable,
  +zipFileMaxDepth: number,
  +selectedZipFileIndex: IndexIntoZipFileTable | null,
  // In practice this should never contain null, but needs to support the
  // TreeView interface.
  +expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>,
|};

type DispatchProps = {|
  +changeSelectedZipFile: typeof changeSelectedZipFile,
  +changeExpandedZipFile: typeof changeExpandedZipFile,
  +viewProfileFromZip: typeof viewProfileFromZip,
  +returnToZipFileList: typeof returnToZipFileList,
  +showErrorForNoFileInZip: typeof showErrorForNoFileInZip,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type ZipFileSharedRowProps = {|
  +viewProfileFromZip: typeof viewProfileFromZip,
|};
type ZipFileRowProps = {|
  +sharedRowProps: ZipFileSharedRowProps,
  +displayData: ZipDisplayData,
|};

class ZipFileRow extends React.PureComponent<ZipFileRowProps> {
  _handleClick = (event: SyntheticMouseEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const {
      sharedRowProps: { viewProfileFromZip },
      displayData: { zipTableIndex },
    } = this.props;
    if (zipTableIndex !== null) {
      viewProfileFromZip(zipTableIndex);
    }
  };
  render() {
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

/**
 * This component is a viewer for zip files. It was built to load
 * multiple profiles recorded from Talos so that a user could navigate
 * to a particular one. However, it is a general purpose zip file
 * viewer to load profiles, so it can be used on arbitrary profiles.
 */
class ZipFileViewer extends React.PureComponent<Props> {
  _fixedColumns = [];
  _mainColumn = { propName: 'name', title: '', component: ZipFileRow };
  _appendageButtons = ['focusCallstackButton'];
  _treeView: ?TreeView<
    IndexIntoZipFileTable,
    ZipDisplayData,
    ZipFileSharedRowProps
  >;
  _takeTreeViewRef = treeView => (this._treeView = treeView);

  componentWillMount() {
    const {
      expandedZipFileIndexes,
      zipFileTree,
      changeExpandedZipFile,
    } = this.props;
    if (expandedZipFileIndexes.length === 0 && zipFileTree) {
      changeExpandedZipFile(
        procureInitialInterestingExpandedNodes(zipFileTree)
      );
    }
  }

  componentDidMount() {
    const { zipFileState, zipFilePathFromUrl, zipFileTree } = this.props;
    if (zipFileState.phase === 'NONE' && zipFilePathFromUrl) {
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
  componentWillReceiveProps(nextProps: Props) {
    const {
      zipFilePathFromUrl,
      zipFileState,
      viewProfileFromZip,
      zipFileTable,
      returnToZipFileList,
      showErrorForNoFileInZip,
    } = nextProps;

    if (zipFilePathFromUrl !== zipFileState.zipFilePath) {
      // The UrlState and ZipFileState are out of sync, they need to be
      // updated.

      if (zipFilePathFromUrl === null) {
        // The the UrlState has navigated away from the file, return
        // to the zip file list.
        returnToZipFileList();
      } else {
        // The UrlState was updated to view a zip file, but we haven't
        // started doing that.
        const zipFileIndex = zipFileTable.path.indexOf(zipFilePathFromUrl);
        if (zipFileIndex === -1) {
          showErrorForNoFileInZip(zipFilePathFromUrl);
        } else {
          viewProfileFromZip(zipFileIndex);
        }
      }
    }
  }

  focus() {
    const treeView = this._treeView;
    if (treeView) {
      treeView.focus();
    }
  }

  _onAppendageButtonClick = (zipFileIndex: IndexIntoZipFileTable | null) => {
    if (zipFileIndex !== null) {
      this.props.viewProfileFromZip(zipFileIndex);
    }
  };

  _renderMessage(message: React.Node) {
    return (
      <section className="zipFileViewer">
        <div className="zipFileViewerSection">
          <header className="zipFileViewerHeader">
            <h1>perf.html</h1>
            <p>Choose a profile from this zip file</p>
          </header>
          <div className="zipFileViewerMessage">{message}</div>
        </div>
      </section>
    );
  }

  _renderBackButton() {
    return (
      <button
        key="backButton"
        type="button"
        className="homeSectionInstallButton"
        onClick={this.props.returnToZipFileList}
      >
        ← Back to zip file list
      </button>
    );
  }

  render() {
    const {
      zipFileState,
      zipFileTree,
      zipFileMaxDepth,
      selectedZipFileIndex,
      expandedZipFileIndexes,
      changeSelectedZipFile,
      changeExpandedZipFile,
      zipFilePathFromUrl,
      viewProfileFromZip,
    } = this.props;

    if (!zipFileTree) {
      console.error('No zipFileTree was found in a ZipFileViewer.');
      return null;
    }
    const { phase } = zipFileState;

    switch (phase) {
      case 'NO_ZIP_FILE':
        console.error(
          'Loaded the ZipFileViewer component when there is no zip file.'
        );
        return this._renderMessage(<span>Error: No zip file was found.</span>);
      case 'LIST_FILES_IN_ZIP_FILE':
        return (
          <section className="zipFileViewer">
            <div className="zipFileViewerSection">
              <header className="zipFileViewerHeader">
                <h1>perf.html</h1>
                <p>Choose a profile from this zip file</p>
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
                appendageButtons={this._appendageButtons}
                onAppendageButtonClick={this._onAppendageButtonClick}
                ref={this._takeTreeViewRef}
                contextMenuId={'MarkersContextMenu'}
                rowHeight={30}
                indentWidth={15}
                sharedRowProps={{
                  viewProfileFromZip,
                }}
              />
            </div>
          </section>
        );
      case 'PROCESS_PROFILE_FROM_ZIP_FILE':
        return this._renderMessage(
          <span>Loading the profile from the zip file...</span>
        );
      case 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE':
        return this._renderMessage([
          <span key="message">
            Are you sure this is a profile? Failed to process the file in the
            zip file at the following path:
          </span>,
          <span className="zipFileViewerUntrustedFilePath" key="path">
            /{
              // This is text that comes from the URL, make sure it looks visually
              // distinct for guarding against someone doing anything too funky
              // with it.
              zipFilePathFromUrl
            }
          </span>,
          this._renderBackButton(),
        ]);
      case 'FILE_NOT_FOUND_IN_ZIP_FILE':
        return this._renderMessage([
          <span key="message">
            Failed to find a file in the zip at the following path:
          </span>,
          <span className="zipFileViewerUntrustedFilePath" key="path">
            /{
              // This is text that comes from the URL, make sure it looks visually
              // distinct for guarding against someone doing anything too funky
              // with it.
              zipFilePathFromUrl
            }
          </span>,
          this._renderBackButton(),
        ]);
      case 'VIEW_PROFILE_IN_ZIP_FILE':
        return <ProfileViewer />;
      default:
        (phase: empty); // eslint-disable-line no-unused-expressions
        throw new Error('Unknown zip file phase.');
    }
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const zipFileTree = getZipFileTree(state);
    if (zipFileTree === null) {
      throw new Error(
        'The zipFileTree should exist if the ZipFileViewer is mounted.'
      );
    }
    const zipFileTable = getZipFileTable(state);
    if (zipFileTable === null) {
      throw new Error(
        'The zipFileTable should exist if the ZipFileViewer is mounted.'
      );
    }
    return {
      zipFileState: getZipFileState(state),
      zipFilePathFromUrl: getZipFilePathFromUrl(state),
      zipFileTable: zipFileTable,
      zipFileTree,
      zipFileMaxDepth: getZipFileMaxDepth(state),
      selectedZipFileIndex: getSelectedZipFileIndex(state),
      expandedZipFileIndexes: getExpandedZipFileIndexes(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedZipFile,
    changeExpandedZipFile,
    viewProfileFromZip,
    returnToZipFileList,
    showErrorForNoFileInZip,
  },
  component: ZipFileViewer,
};

export default explicitConnect(options);
