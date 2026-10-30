/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import classNames from 'classnames';

import { SourceView } from '../shared/SourceView';
import { AssemblyView } from '../shared/AssemblyView';
import { FullscreenToggleButton } from './FullscreenToggleButton';
import { ResizableWithSplitter } from '../shared/ResizableWithSplitter';
import { AssemblyViewToggleButton } from './AssemblyViewToggleButton';
import { GeneratedSourceViewToggleButton } from './GeneratedSourceViewToggleButton';
import { PrettyPrintToggleButton } from './PrettyPrintToggleButton';
import { AssemblyViewNativeSymbolNavigator } from './AssemblyViewNativeSymbolNavigator';
import { IonGraphView } from '../shared/IonGraphView';
import { CodeLoadingOverlay } from './CodeLoadingOverlay';
import { CodeErrorOverlay } from './CodeErrorOverlay';
import {
  getSourceViewScrollGeneration,
  getSourceViewScrollToLineNumber,
  getSourceViewHighlightedLine,
  getSourceViewScrollToColumnNumber,
  getSourceViewHighlightedColumn,
  getSourceViewIsPrettyPrinted,
  getGeneratedSourceViewScrollGeneration,
  getGeneratedSourceViewScrollToLineNumber,
  getGeneratedSourceViewHighlightedLine,
  getGeneratedSourceViewScrollToColumnNumber,
  getGeneratedSourceViewHighlightedColumn,
  getGeneratedSourceViewIsPrettyPrinted,
  getAssemblyViewIsOpen,
  getAssemblyViewNativeSymbol,
  getAssemblyViewScrollGeneration,
  getAssemblyViewScrollToInstructionAddress,
  getAssemblyViewHighlightedInstruction,
  getIsBottomBoxFullscreen,
} from 'firefox-profiler/selectors/url-state';
import {
  closeBottomBox,
  toggleBottomBoxFullscreen,
  setSourceViewPrettyPrint,
  setGeneratedSourceViewPrettyPrint,
} from 'firefox-profiler/actions/profile-view';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import {
  getSourceViewCode,
  getGeneratedSourceViewCode,
  getAssemblyViewCode,
  getSourceViewFormatDialect,
  getGeneratedSourceViewFormatDialect,
  getSourceViewFormatting,
  getGeneratedSourceViewFormatting,
} from 'firefox-profiler/selectors/code';
import type { SourceViewFormatting } from 'firefox-profiler/profile-logic/js-format/formatted-source';
import {
  getSourceViewFile,
  getSourceViewStartLine,
  getGeneratedSourceViewFile,
  getGeneratedSourceViewStartLine,
} from 'firefox-profiler/selectors/profile';
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
  readonly sourceViewScrollToColumnNumber?: number;
  readonly sourceViewHighlightedColumn: number | null;
  readonly sourceViewStartLine: number;
  readonly sourceViewCanPrettyPrint: boolean;
  readonly sourceViewIsPrettyPrinted: boolean;
  readonly sourceViewFormatting: SourceViewFormatting | null;
  readonly globalLineTimings: LineTimings;
  readonly generatedSourceViewFile: string | null;
  readonly generatedSourceViewCode: SourceCodeStatus | void;
  readonly generatedSourceViewScrollGeneration: number;
  readonly generatedSourceViewScrollToLineNumber?: number;
  readonly generatedSourceViewHighlightedLine: number | null;
  readonly generatedSourceViewScrollToColumnNumber?: number;
  readonly generatedSourceViewHighlightedColumn: number | null;
  readonly generatedSourceViewStartLine: number;
  readonly generatedSourceViewCanPrettyPrint: boolean;
  readonly generatedSourceViewIsPrettyPrinted: boolean;
  readonly generatedSourceViewFormatting: SourceViewFormatting | null;
  readonly generatedLineTimings: LineTimings;
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
  readonly setSourceViewPrettyPrint: typeof setSourceViewPrettyPrint;
  readonly setGeneratedSourceViewPrettyPrint: typeof setGeneratedSourceViewPrettyPrint;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

type DisplayedLines = {
  formattedLines: string[] | null;
  startLine: number;
  scrollToLineNumber?: number;
  highlightedLine: number | null;
};

/**
 * The line numbers in the state refer to the code as it is. If the code is
 * pretty-printed, convert them to the lines of the formatted code. The
 * formatted code starts at line 1, even for inline scripts.
 */
function _getDisplayedLines(
  formatting: SourceViewFormatting | null,
  startLine: number,
  scrollToLineNumber: number | undefined,
  scrollToColumnNumber: number | undefined,
  highlightedLine: number | null,
  highlightedColumn: number | null
): DisplayedLines {
  if (formatting === null) {
    return {
      formattedLines: null,
      startLine,
      scrollToLineNumber,
      highlightedLine,
    };
  }
  const { lines, mapPositionToLine } = formatting;
  return {
    formattedLines: lines,
    startLine: 1,
    scrollToLineNumber:
      scrollToLineNumber !== undefined
        ? mapPositionToLine(scrollToLineNumber, scrollToColumnNumber ?? null)
        : undefined,
    highlightedLine:
      highlightedLine !== null
        ? mapPositionToLine(highlightedLine, highlightedColumn)
        : null,
  };
}

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
  _generatedSourceView = React.createRef<SourceView>();
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

  _onChangeSourceViewPrettyPrint = (isPrettyPrinted: boolean) => {
    this.props.setSourceViewPrettyPrint(isPrettyPrinted);
  };

  _onChangeGeneratedSourceViewPrettyPrint = (isPrettyPrinted: boolean) => {
    this.props.setGeneratedSourceViewPrettyPrint(isPrettyPrinted);
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
      sourceViewScrollToColumnNumber,
      sourceViewHighlightedColumn,
      sourceViewStartLine,
      sourceViewCanPrettyPrint,
      sourceViewIsPrettyPrinted,
      sourceViewFormatting,
      generatedSourceViewFile,
      generatedSourceViewCode,
      generatedSourceViewScrollGeneration,
      generatedSourceViewScrollToLineNumber,
      generatedSourceViewHighlightedLine,
      generatedSourceViewScrollToColumnNumber,
      generatedSourceViewHighlightedColumn,
      generatedSourceViewStartLine,
      generatedSourceViewCanPrettyPrint,
      generatedSourceViewIsPrettyPrinted,
      generatedSourceViewFormatting,
      generatedLineTimings,
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
    const generatedSourceCode =
      generatedSourceViewCode && generatedSourceViewCode.type === 'AVAILABLE'
        ? generatedSourceViewCode.code
        : '';
    const generatedPath =
      generatedSourceViewFile !== null
        ? parseFileNameFromSymbolication(generatedSourceViewFile).path
        : null;
    // generatedSourceViewFile is only non-null if the generated source view
    // is open and the current function is source-mapped.
    const displayGeneratedSourceView = generatedPath !== null;
    const sourceViewLines = _getDisplayedLines(
      sourceViewFormatting,
      sourceViewStartLine,
      sourceViewScrollToLineNumber,
      sourceViewScrollToColumnNumber,
      sourceViewHighlightedLine,
      sourceViewHighlightedColumn
    );
    const generatedSourceViewLines = _getDisplayedLines(
      generatedSourceViewFormatting,
      generatedSourceViewStartLine,
      generatedSourceViewScrollToLineNumber,
      generatedSourceViewScrollToColumnNumber,
      generatedSourceViewHighlightedLine,
      generatedSourceViewHighlightedColumn
    );

    // The bottom box has one or more side-by-side panes:
    //  - It always has the source view pane.
    //  - It has the generated source view pane, if the generated source view
    //    is open and the function is source-mapped. This pane shows the code
    //    that the browser runs, for example a minified JS bundle.
    //  - It has the assembly view pane, if the assembly view is open.

    // These trailing header buttons go into the bottom-box-bar of the last pane.
    const trailingHeaderButtons = (
      <div className="bottom-box-header-trailing-buttons">
        {assemblyViewIsOpen ? <AssemblyViewNativeSymbolNavigator /> : null}
        <GeneratedSourceViewToggleButton />
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
        <div className="bottom-box-pane">
          <div className="bottom-box-bar">
            <h3 className="bottom-box-title">{path ?? '(no source file)'}</h3>
            <div className="bottom-box-header-buttons">
              {displaySourceView && sourceViewCanPrettyPrint ? (
                <PrettyPrintToggleButton
                  isPrettyPrinted={sourceViewIsPrettyPrinted}
                  onChange={this._onChangeSourceViewPrettyPrint}
                />
              ) : null}
              {assemblyViewIsOpen || displayGeneratedSourceView
                ? null
                : trailingHeaderButtons}
            </div>
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
                formattedLines={sourceViewLines.formattedLines}
                filePath={path}
                scrollGeneration={sourceViewScrollGeneration}
                scrollToLineNumber={sourceViewLines.scrollToLineNumber}
                highlightedLine={sourceViewLines.highlightedLine}
                startLine={sourceViewLines.startLine}
                ref={this._sourceView}
              />
            ) : null}
            {sourceViewCode !== undefined &&
            sourceViewCode.type === 'LOADING' ? (
              <CodeLoadingOverlay source={sourceViewCode.source} />
            ) : null}
            {sourceViewCode !== undefined && sourceViewCode.type === 'ERROR' ? (
              <SourceCodeErrorOverlay errors={sourceViewCode.errors} />
            ) : null}
          </div>
        </div>

        {displayGeneratedSourceView ? (
          <ResizableWithSplitter
            splitterPosition="start"
            controlledProperty="width"
            percent={true}
            initialSize={assemblyViewIsOpen ? '33%' : '50%'}
          >
            <div className="bottom-box-pane">
              <div className="bottom-box-bar">
                <Localized
                  id="GeneratedSourceView--title"
                  vars={{ path: generatedPath }}
                >
                  <h3 className="bottom-box-title">
                    {`Generated: ${generatedPath}`}
                  </h3>
                </Localized>
                <div className="bottom-box-header-buttons">
                  {generatedSourceViewCanPrettyPrint ? (
                    <PrettyPrintToggleButton
                      isPrettyPrinted={generatedSourceViewIsPrettyPrinted}
                      onChange={this._onChangeGeneratedSourceViewPrettyPrint}
                    />
                  ) : null}
                  {assemblyViewIsOpen ? null : trailingHeaderButtons}
                </div>
              </div>
              <div className="bottom-sourceview-wrapper">
                <SourceView
                  timings={generatedLineTimings}
                  sourceCode={generatedSourceCode}
                  formattedLines={generatedSourceViewLines.formattedLines}
                  filePath={generatedPath}
                  scrollGeneration={generatedSourceViewScrollGeneration}
                  scrollToLineNumber={
                    generatedSourceViewLines.scrollToLineNumber
                  }
                  highlightedLine={generatedSourceViewLines.highlightedLine}
                  startLine={generatedSourceViewLines.startLine}
                  ref={this._generatedSourceView}
                />
                {generatedSourceViewCode !== undefined &&
                generatedSourceViewCode.type === 'LOADING' ? (
                  <CodeLoadingOverlay source={generatedSourceViewCode.source} />
                ) : null}
                {generatedSourceViewCode !== undefined &&
                generatedSourceViewCode.type === 'ERROR' ? (
                  <SourceCodeErrorOverlay
                    errors={generatedSourceViewCode.errors}
                  />
                ) : null}
              </div>
            </div>
          </ResizableWithSplitter>
        ) : null}

        {assemblyViewIsOpen ? (
          <ResizableWithSplitter
            splitterPosition="start"
            controlledProperty="width"
            percent={true}
            initialSize={displayGeneratedSourceView ? '33%' : '50%'}
          >
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
          </ResizableWithSplitter>
        ) : null}
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
    sourceViewScrollToColumnNumber: getSourceViewScrollToColumnNumber(state),
    sourceViewHighlightedColumn: getSourceViewHighlightedColumn(state),
    sourceViewStartLine: getSourceViewStartLine(state),
    sourceViewCanPrettyPrint: getSourceViewFormatDialect(state) !== null,
    sourceViewIsPrettyPrinted: getSourceViewIsPrettyPrinted(state),
    sourceViewFormatting: getSourceViewFormatting(state),
    generatedSourceViewFile: getGeneratedSourceViewFile(state),
    generatedSourceViewCode: getGeneratedSourceViewCode(state),
    generatedLineTimings:
      selectedThreadSelectors.getGeneratedSourceViewLineTimings(state),
    generatedSourceViewScrollGeneration:
      getGeneratedSourceViewScrollGeneration(state),
    generatedSourceViewScrollToLineNumber:
      getGeneratedSourceViewScrollToLineNumber(state),
    generatedSourceViewHighlightedLine:
      getGeneratedSourceViewHighlightedLine(state),
    generatedSourceViewScrollToColumnNumber:
      getGeneratedSourceViewScrollToColumnNumber(state),
    generatedSourceViewHighlightedColumn:
      getGeneratedSourceViewHighlightedColumn(state),
    generatedSourceViewStartLine: getGeneratedSourceViewStartLine(state),
    generatedSourceViewCanPrettyPrint:
      getGeneratedSourceViewFormatDialect(state) !== null,
    generatedSourceViewIsPrettyPrinted:
      getGeneratedSourceViewIsPrettyPrinted(state),
    generatedSourceViewFormatting: getGeneratedSourceViewFormatting(state),
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
    setSourceViewPrettyPrint,
    setGeneratedSourceViewPrettyPrint,
  },
  component: BottomBoxImpl,
});
