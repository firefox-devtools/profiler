/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { ensureExists } from 'firefox-profiler/utils/types';
import type { LineTimings } from 'firefox-profiler/types';

import type { SourceViewEditor } from './SourceView-codemirror';

import './CodeView.css';

const SourceViewHeader = () => {
  return (
    <div className="codeViewHeader">
      <span
        className="codeViewHeaderColumn codeViewFixedColumn total"
        title="The “total” sample count includes a summary of every sample where this
line was observed to be on the stack. This includes the time where the
line was actually running, and the time spent in the callers from this
line."
      >
        Total
      </span>
      <span
        className="codeViewHeaderColumn codeViewFixedColumn self"
        title="The “self” sample count only includes the samples where the line was
the end of the stack. If this line called into other functions,
then the “other” functions’ counts are not included. The “self” count is useful
for understanding where time was actually spent in a program."
      >
        Self
      </span>
      <span className="codeViewHeaderColumn codeViewMainColumn source"></span>
    </div>
  );
};

type SourceViewProps = {
  readonly timings: LineTimings;
  readonly sourceCode: string;
  readonly filePath: string | null;
  readonly scrollGeneration: number;
  readonly scrollToLineNumber?: number;
  readonly highlightedLine: number | null;
  // 1-based line number for the start of the source in the full document.
  readonly startLine: number;
};

let editorModulePromise: Promise<any> | null = null;

// Remap absolute line timings to document-relative (1-based) line numbers.
// Timings keys are absolute line numbers; CodeMirror uses doc-relative line numbers.
function remapTimingsToRelative(
  timings: LineTimings,
  startLine: number
): LineTimings {
  if (startLine <= 1) {
    return timings;
  }
  const offset = startLine - 1;
  const totalLineHits = new Map<number, number>();
  for (const [line, hits] of timings.totalLineHits) {
    totalLineHits.set(line - offset, hits);
  }
  const selfLineHits = new Map<number, number>();
  for (const [line, hits] of timings.selfLineHits) {
    selfLineHits.set(line - offset, hits);
  }
  return { totalLineHits, selfLineHits };
}

export class SourceView extends React.PureComponent<SourceViewProps> {
  _ref = React.createRef<HTMLDivElement>();
  _editor: SourceViewEditor | null = null;

  _scrollToLine(lineNumber: number) {
    if (this._editor) {
      this._editor.scrollToLine(lineNumber);
    }
  }

  _toRelativeLine(absoluteLine: number): number {
    return Math.max(1, absoluteLine - (this.props.startLine - 1));
  }

  // Convert an absolute scroll-to line number to a doc-relative line number.
  _getRelativeScrollToLineNumber(): number | undefined {
    const { scrollToLineNumber } = this.props;
    return scrollToLineNumber === undefined
      ? undefined
      : this._toRelativeLine(scrollToLineNumber);
  }

  // Convert an absolute highlighted line number to a doc-relative line number.
  _getRelativeHighlightedLine(): number | null {
    const { highlightedLine } = this.props;
    return highlightedLine === null
      ? null
      : this._toRelativeLine(highlightedLine);
  }

  _getMaxLineNumber() {
    const { sourceCode, timings, startLine } = this.props;
    const sourceLines = sourceCode.split('\n');
    let maxLineNumber = sourceLines.length;
    if (maxLineNumber <= 1) {
      // We probably don't have the true source code yet, and don't really know
      // the true number of lines in this file.
      // Derive a maximum line number from the timings.
      // Add a bit of space at the bottom (10 rows) so that the scroll position
      // isn't too constrained - if the last known line is chosen as the "hot spot",
      // this extra space allows us to display it in the top half of the viewport,
      // if the viewport is small enough.
      // timings keys are absolute line numbers; convert to doc-relative count.
      const maxAbsoluteLine = Math.max(1, ...timings.totalLineHits.keys());
      maxLineNumber = Math.max(1, maxAbsoluteLine - startLine + 1) + 10;
    }
    return maxLineNumber;
  }

  _getSourceCodeOrFallback() {
    const { sourceCode } = this.props;
    if (sourceCode !== '') {
      return sourceCode;
    }
    return '\n'.repeat(this._getMaxLineNumber());
  }

  override render() {
    return (
      <div className="sourceView codeView">
        <SourceViewHeader />
        <div className="codeMirrorContainer" ref={this._ref}></div>
      </div>
    );
  }

  override componentDidMount() {
    // Load the module with all the @codemirror imports asynchronously, so that
    // it can be split into a separate bundle chunk.
    if (editorModulePromise === null) {
      editorModulePromise = import('./SourceView-codemirror');
    }
    (async () => {
      const codeMirrorModulePromise = ensureExists(editorModulePromise);
      const codeMirrorModule = await codeMirrorModulePromise;
      const domParent = this._ref.current;
      if (!domParent) {
        return;
      }
      const { SourceViewEditor } = codeMirrorModule;
      const editor = new SourceViewEditor(
        this._getSourceCodeOrFallback(),
        this.props.filePath,
        remapTimingsToRelative(this.props.timings, this.props.startLine),
        this._getRelativeHighlightedLine(),
        this.props.startLine,
        domParent
      );
      this._editor = editor;
      // If an explicit line number is provided, scroll to it. Otherwise, scroll to the hotspot.
      const relativeScrollTo = this._getRelativeScrollToLineNumber();
      if (relativeScrollTo !== undefined) {
        this._scrollToLine(Math.max(1, relativeScrollTo - 5));
      }
    })();
  }

  // CodeMirror's API is not based on React. When our props change, we need to
  // translate those changes into CodeMirror API calls manually.
  override componentDidUpdate(prevProps: SourceViewProps) {
    if (!this._editor) {
      return;
    }

    if (this.props.filePath !== prevProps.filePath) {
      this._editor.updateLanguageForFilePath(this.props.filePath);
    }

    const startLineChanged = this.props.startLine !== prevProps.startLine;
    if (startLineChanged) {
      this._editor.setStartLine(this.props.startLine);
    }

    let contentsChanged = false;
    if (
      this.props.sourceCode !== prevProps.sourceCode ||
      (this.props.sourceCode === '' &&
        prevProps.sourceCode === '' &&
        this.props.timings !== prevProps.timings)
    ) {
      this._editor.setContents(this._getSourceCodeOrFallback());
      contentsChanged = true;
    }

    if (
      contentsChanged ||
      this.props.scrollGeneration !== prevProps.scrollGeneration
    ) {
      // If an explicit line number is provided, scroll to it. Otherwise, scroll to the hotspot.
      const relativeScrollTo = this._getRelativeScrollToLineNumber();
      if (relativeScrollTo !== undefined) {
        this._scrollToLine(Math.max(1, relativeScrollTo - 5));
      }
    }

    if (this.props.timings !== prevProps.timings || startLineChanged) {
      this._editor.setTimings(
        remapTimingsToRelative(this.props.timings, this.props.startLine)
      );
    }

    if (
      this.props.highlightedLine !== prevProps.highlightedLine ||
      startLineChanged
    ) {
      this._editor.setHighlightedLine(this._getRelativeHighlightedLine());
    }
  }
}
