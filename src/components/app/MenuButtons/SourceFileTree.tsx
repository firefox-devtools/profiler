/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';

import { Localized } from '@fluent/react';

import prettyBytes from 'firefox-profiler/utils/pretty-bytes';

import type {
  IndexIntoSourceTable,
  SourceFileTreeNode,
} from 'firefox-profiler/types';

import './SourceFileTree.css';

type CheckState = 'checked' | 'unchecked' | 'mixed';

function getCheckState(
  sourceIndexes: IndexIntoSourceTable[],
  selectedSourceIndexes: ReadonlySet<IndexIntoSourceTable>
): CheckState {
  let selectedCount = 0;
  for (const sourceIndex of sourceIndexes) {
    if (selectedSourceIndexes.has(sourceIndex)) {
      selectedCount++;
    }
  }
  if (selectedCount === 0) {
    return 'unchecked';
  }
  return selectedCount === sourceIndexes.length ? 'checked' : 'mixed';
}

type TriStateCheckboxProps = {
  readonly checkState: CheckState;
  readonly disabled?: boolean;
  readonly onChange: () => void;
  // Overrides the accessible name from the surrounding label, which can be
  // ambiguous, like a file name that appears in several directories.
  readonly ariaLabel?: string;
};

/**
 * A checkbox with a "mixed" state. The DOM only exposes it through the
 * `indeterminate` property, so it's set from a ref.
 */
class TriStateCheckbox extends React.PureComponent<TriStateCheckboxProps> {
  _input: HTMLInputElement | null = null;

  _takeInputRef = (input: HTMLInputElement | null) => {
    this._input = input;
    this._updateIndeterminate();
  };

  _updateIndeterminate() {
    if (this._input !== null) {
      this._input.indeterminate = this.props.checkState === 'mixed';
    }
  }

  override componentDidUpdate() {
    this._updateIndeterminate();
  }

  _onChange = () => {
    this.props.onChange();
  };

  override render() {
    const { checkState, disabled, ariaLabel } = this.props;
    return (
      <input
        type="checkbox"
        className="photon-checkbox photon-checkbox-default"
        ref={this._takeInputRef}
        checked={checkState === 'checked'}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={this._onChange}
      />
    );
  }
}

// The size column: the size of what's downloaded, or why there is none.
function _renderSize(node: SourceFileTreeNode) {
  if (node.downloadedFileCount > 0) {
    return prettyBytes(node.byteCount);
  }
  if (node.fetchableFileCount > 0) {
    return (
      <Localized id="MenuButtons--publish--source-code-not-downloaded">
        Not downloaded
      </Localized>
    );
  }
  if (node.availability === 'FAILED') {
    return (
      <Localized id="MenuButtons--publish--source-code-download-failed">
        Download failed
      </Localized>
    );
  }
  return (
    <Localized
      id="MenuButtons--publish--source-code-unavailable"
      attrs={{ title: true }}
    >
      <span title="Downloading this file requires the browser that recorded the profile or a local symbol server.">
        Unavailable
      </span>
    </Localized>
  );
}

type SourceFileTreeProps = {
  readonly nodes: SourceFileTreeNode[];
  readonly selectedSourceIndexes: ReadonlySet<IndexIntoSourceTable>;
  readonly disabled: boolean;
  // Called with the clicked row's source indexes, and whether they should all
  // become selected or deselected.
  readonly onToggle: (
    sourceIndexes: IndexIntoSourceTable[],
    selected: boolean
  ) => void;
};

/**
 * A plain nested list rather than the shared TreeView: the rows carry
 * checkboxes, there are no columns, and the list is short enough not to need
 * virtualization.
 */
export class SourceFileTree extends React.PureComponent<SourceFileTreeProps> {
  override render() {
    const { nodes, selectedSourceIndexes, disabled, onToggle } = this.props;
    return (
      <ul className="sourceFileTree">
        {nodes.map((node) => (
          <SourceFileTreeRow
            key={node.key}
            node={node}
            selectedSourceIndexes={selectedSourceIndexes}
            disabled={disabled}
            onToggle={onToggle}
          />
        ))}
      </ul>
    );
  }
}

type SourceFileTreeRowProps = {
  readonly node: SourceFileTreeNode;
  readonly selectedSourceIndexes: ReadonlySet<IndexIntoSourceTable>;
  readonly disabled: boolean;
  readonly onToggle: (
    sourceIndexes: IndexIntoSourceTable[],
    selected: boolean
  ) => void;
};

class SourceFileTreeRow extends React.PureComponent<
  SourceFileTreeRowProps,
  { isExpanded: boolean }
> {
  // Directories with nothing downloaded below them start folded, so that the
  // pickable files are in view.
  override state = { isExpanded: this.props.node.sourceIndexes.length > 0 };

  _onToggleExpansion = () => {
    this.setState(({ isExpanded }) => ({ isExpanded: !isExpanded }));
  };

  _onToggleCheckbox = () => {
    const { node, selectedSourceIndexes, onToggle } = this.props;
    const checkState = getCheckState(node.sourceIndexes, selectedSourceIndexes);
    // A partially selected row becomes fully selected, matching how the
    // checkbox looks after the click.
    onToggle(node.sourceIndexes, checkState !== 'checked');
  };

  override render() {
    const { node, selectedSourceIndexes, disabled, onToggle } = this.props;
    const { isExpanded } = this.state;
    const hasChildren = node.children.length > 0;
    const checkState = getCheckState(node.sourceIndexes, selectedSourceIndexes);
    // Nothing below this row is downloaded or fetchable, so nothing to pick.
    const isPickable = node.sourceIndexes.length > 0;

    return (
      <li className="sourceFileTreeItem">
        <div className="sourceFileTreeRow">
          {hasChildren ? (
            <button
              type="button"
              className={classNames('sourceFileTreeTwisty', {
                sourceFileTreeTwistyExpanded: isExpanded,
              })}
              onClick={this._onToggleExpansion}
              aria-label={node.label}
              aria-expanded={isExpanded}
            />
          ) : (
            <span className="sourceFileTreeTwistyPlaceholder" />
          )}
          <label className="sourceFileTreeLabel" title={node.path}>
            <TriStateCheckbox
              checkState={checkState}
              disabled={disabled || !isPickable}
              onChange={this._onToggleCheckbox}
              ariaLabel={node.path}
            />
            <span
              className={classNames('sourceFileTreeName', {
                sourceFileTreeNameFile:
                  node.availability !== null && isPickable,
              })}
            >
              {node.label}
            </span>
            <span className="sourceFileTreeSize">{_renderSize(node)}</span>
          </label>
        </div>
        {hasChildren && isExpanded ? (
          <ul className="sourceFileTree">
            {node.children.map((child) => (
              <SourceFileTreeRow
                key={child.key}
                node={child}
                selectedSourceIndexes={selectedSourceIndexes}
                disabled={disabled}
                onToggle={onToggle}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }
}
