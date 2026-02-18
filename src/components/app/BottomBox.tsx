/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import SplitterLayout from 'react-splitter-layout';
import classNames from 'classnames';

import { SourceView } from '../shared/SourceView';
import { AssemblyView } from '../shared/AssemblyView';
import { FullscreenToggleButton } from './FullscreenToggleButton';
import { AssemblyViewToggleButton } from './AssemblyViewToggleButton';
import { AssemblyViewNativeSymbolNavigator } from './AssemblyViewNativeSymbolNavigator';
import { IonGraphView } from '../shared/IonGraphView';
import { CodeLoadingOverlay } from './CodeLoadingOverlay';
import { CodeErrorOverlay } from './CodeErrorOverlay';
import {
  getSourceViewScrollGeneration,
  getSourceViewScrollToLineNumber,
  getSourceViewHighlightedLine,
  getAssemblyViewIsOpen,
  getAssemblyViewNativeSymbol,
  getAssemblyViewScrollGeneration,
  getAssemblyViewScrollToInstructionAddress,
  getAssemblyViewHighlightedInstruction,
  getIsBottomBoxFullscreen,
} from 'firefox-profiler/selectors/url-state';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
} from 'firefox-profiler/selectors/per-thread';
import {
  closeBottomBox,
  toggleBottomBoxFullscreen,
} from 'firefox-profiler/actions/profile-view';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { closeBottomBox } from 'firefox-profiler/actions/profile-view';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import {
  getSourceViewCode,
  getAssemblyViewCode,
} from 'firefox-profiler/selectors/code';
import { getSourceViewFile } from 'firefox-profiler/selectors/profile';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  LineTimings,
  AddressTimings,
  SourceCodeStatus,
  AssemblyCodeStatus,
  NativeSymbolInfo,
  SourceCodeLoadingError,
  ApiQueryError,
} from 'firefox-profiler/types';
import type { CodeErrorOverlayProps } from './CodeErrorOverlay';

import { Localized } from '@fluent/react';

import './BottomBox.css';

type StateProps = {
  readonly isFullscreen: boolean;
  readonly sourceViewFile: string | null;
  readonly sourceViewCode: SourceCodeStatus | void;
  readonly sourceViewScrollGeneration: number;
  readonly sourceViewScrollToLineNumber?: number;
  readonly sourceViewHighlightedLine: number | null;
  readonly globalLineTimings: LineTimings;
  readonly assemblyViewIsOpen: boolean;
  readonly assemblyViewNativeSymbol: NativeSymbolInfo | null;
  readonly assemblyViewCode: AssemblyCodeStatus | void;
  readonly assemblyViewScrollGeneration: number;
  readonly assemblyViewScrollToInstructionAddress?: number;
  readonly assemblyViewHighlightedInstruction: number | null;
  readonly globalAddressTimings: AddressTimings;
};

type DispatchProps = {
  readonly closeBottomBox: typeof closeBottomBox;
  readonly toggleBottomBoxFullscreen: typeof toggleBottomBoxFullscreen;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

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

export function AssemblyCodeErrorOverlay({ errors }: CodeErrorOverlayProps) {
  return (
    <div className="assemblyCodeErrorOverlay">
      <div>
        <Localized id="BottomBox--assembly-code-not-available-title">
          <h3>Assembly code not available</h3>
        </Localized>
        <Localized
          id="BottomBox--assembly-code-not-available-text"
          elems={{
            a: (
              <a
                href="https://github.com/firefox-devtools/profiler/issues/4520"
                target="_blank"
                rel="noopener noreferrer"
              />
            ),
          }}
        >
          <p>
            See
            <a
              href="https://github.com/firefox-devtools/profiler/issues/4520"
              target="_blank"
              rel="noopener noreferrer"
            >
              issue #4520
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
  _assemblyView = React.createRef<AssemblyView>();

  override componentDidMount() {
    document.addEventListener('keydown', this._onKeyDown);
  }

  override componentWillUnmount() {
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.props.isFullscreen) {
      this.props.toggleBottomBoxFullscreen();
    }
  };

  _onClickCloseButton = () => {
    this.props.closeBottomBox();
    // Close the fullscreen if we're closing the bottom box
    if (this.props.isFullscreen) {
      this.props.toggleBottomBoxFullscreen();
    }
  };

  override render() {
    const {
      isFullscreen,
      sourceViewFile,
      sourceViewCode,
      globalLineTimings,
      sourceViewScrollGeneration,
      sourceViewScrollToLineNumber,
      sourceViewHighlightedLine,
      assemblyViewIsOpen,
      assemblyViewScrollGeneration,
      assemblyViewScrollToInstructionAddress,
      assemblyViewHighlightedInstruction,
      assemblyViewNativeSymbol,
      assemblyViewCode,
      globalAddressTimings,
    } = this.props;
    const sourceCode =
      sourceViewCode && sourceViewCode.type === 'AVAILABLE'
        ? sourceViewCode.code
        : '';
    const path =
      sourceViewFile !== null
        ? parseFileNameFromSymbolication(sourceViewFile).path
        : null;
    const assemblyCode =
      assemblyViewCode && assemblyViewCode.type === 'AVAILABLE'
        ? assemblyViewCode.instructions
        : [];
    const sourceIsIonGraph = path !== null && path.endsWith('iongraph.json');
    const displaySourceView = sourceViewFile !== null && !sourceIsIonGraph;
    const displayIonGraph = sourceViewFile !== null && sourceIsIonGraph;

    // The bottom box has one or more side-by-side panes.
    // At the moment it always has either one or two panes:
    //  - It always has the source view pane
    //  - It also has the assembly view pane, if the assembly view is open.

    // These trailing header buttons go into the bottom-box-bar of the last pane.
    const trailingHeaderButtons = (
      <div className="bottom-box-header-trailing-buttons">
        {assemblyViewIsOpen ? <AssemblyViewNativeSymbolNavigator /> : null}
        <AssemblyViewToggleButton />
        <FullscreenToggleButton />
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
    );

    return (
      <div
        className={classNames(
          'bottom-box',
          isFullscreen ? 'bottom-box-fullscreen' : null
        )}
      >
        <SplitterLayout percentage>
          <div className="bottom-box-pane">
            <div className="bottom-box-bar">
              <h3 className="bottom-box-title">{path ?? '(no source file)'}</h3>
              {assemblyViewIsOpen ? null : trailingHeaderButtons}
            </div>
            <div className="bottom-sourceview-wrapper">
              {displayIonGraph ? (
                <IonGraphView
                  timings={globalLineTimings}
                  sourceCode={sourceCode}
                />
              ) : null}
              {displaySourceView ? (
                <SourceView
                  timings={globalLineTimings}
                  sourceCode={sourceCode}
                  filePath={path}
                  scrollGeneration={sourceViewScrollGeneration}
                  scrollToLineNumber={sourceViewScrollToLineNumber}
                  highlightedLine={sourceViewHighlightedLine}
                  ref={this._sourceView}
                />
              ) : null}
              {sourceViewCode !== undefined &&
              sourceViewCode.type === 'LOADING' ? (
                <CodeLoadingOverlay source={sourceViewCode.source} />
              ) : null}
              {sourceViewCode !== undefined &&
              sourceViewCode.type === 'ERROR' ? (
                <SourceCodeErrorOverlay errors={sourceViewCode.errors} />
              ) : null}
            </div>
          </div>

          {assemblyViewIsOpen ? (
            <div className="bottom-box-pane">
              <div className="bottom-box-bar">
                <h3 className="bottom-box-title">
                  {assemblyViewNativeSymbol !== null
                    ? assemblyViewNativeSymbol.name
                    : '(no native symbol)'}
                </h3>
                {trailingHeaderButtons}
              </div>
              <div className="bottom-assemblyview-wrapper">
                {assemblyViewNativeSymbol !== null ? (
                  <AssemblyView
                    timings={globalAddressTimings}
                    assemblyCode={assemblyCode}
                    nativeSymbol={assemblyViewNativeSymbol}
                    scrollGeneration={assemblyViewScrollGeneration}
                    scrollToInstructionAddress={
                      assemblyViewScrollToInstructionAddress
                    }
                    highlightedInstruction={assemblyViewHighlightedInstruction}
                    ref={this._assemblyView}
                  />
                ) : null}
                {assemblyViewCode !== undefined &&
                assemblyViewCode.type === 'LOADING' ? (
                  <CodeLoadingOverlay source={assemblyViewCode.source} />
                ) : null}
                {assemblyViewCode !== undefined &&
                assemblyViewCode.type === 'ERROR' ? (
                  <AssemblyCodeErrorOverlay
                    errors={convertErrors(assemblyViewCode.errors)}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </SplitterLayout>
      </div>
    );
  }
}

function convertErrors(errors: ApiQueryError[]): SourceCodeLoadingError[] {
  // Copy the array so that the types work out.
  return errors.map((e) => e);
}

export const BottomBox = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    isFullscreen: getIsBottomBoxFullscreen(state),
    sourceViewFile: getSourceViewFile(state),
    sourceViewCode: getSourceViewCode(state),
    globalLineTimings: selectedThreadSelectors.getSourceViewLineTimings(state),
    sourceViewScrollGeneration: getSourceViewScrollGeneration(state),
    sourceViewScrollToLineNumber: getSourceViewScrollToLineNumber(state),
    sourceViewHighlightedLine: getSourceViewHighlightedLine(state),
    assemblyViewNativeSymbol: getAssemblyViewNativeSymbol(state),
    assemblyViewCode: getAssemblyViewCode(state),
    globalAddressTimings:
      selectedThreadSelectors.getAssemblyViewAddressTimings(state),
    assemblyViewScrollGeneration: getAssemblyViewScrollGeneration(state),
    assemblyViewScrollToInstructionAddress:
      getAssemblyViewScrollToInstructionAddress(state),
    assemblyViewHighlightedInstruction:
      getAssemblyViewHighlightedInstruction(state),
    assemblyViewIsOpen: getAssemblyViewIsOpen(state),
  }),
  mapDispatchToProps: {
    closeBottomBox,
    toggleBottomBoxFullscreen,
  },
  component: BottomBoxImpl,
});
