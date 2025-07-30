/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import { ensureExists } from 'firefox-profiler/utils/flow';
import { mapGetKeyWithMaxValue } from 'firefox-profiler/utils';
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
  readonly timings: LineTimings,
  readonly sourceCode: string,
  readonly disableOverscan: boolean,
  readonly filePath: string | null,
  readonly scrollToHotSpotGeneration: number,
  readonly hotSpotTimings: LineTimings,
};

let editorModulePromise: Promise<any> | null = null;

export class SourceView extends React.PureComponent<SourceViewProps> {
  _ref = React.createRef<HTMLDivElement>();
  _editor: SourceViewEditor | null = null;

  /**
   * Scroll to the line with the most hits, based on the timings in
   * timingsForScrolling.
   *
   * How is timingsForScrolling different from this.props.timings?
   * In the current implementation, this.props.timings are always the "global"
   * timings, i.e. they show the line hits for all samples in the current view,
   * regardless of the selected call node. However, when opening the source
   * view from a specific call node, you really want to see the code that's
   * relevant to that specific call node, or at least that specific function.
   * So timingsForScrolling are the timings that indicate just the line hits
   * in the selected call node. This means that the "hotspot" will be somewhere
   * in the selected function, and it will even be in the line that's most
   * relevant to that specific call node.
   *
   * Sometimes, timingsForScrolling can be completely empty. This happens, for
   * example, when the source view is showing a different file than the
   * selected call node's function's file, for example because we just loaded
   * from a URL and ended up with an arbitrary selected call node.
   * In that case, pick the hotspot from the global line timings.
   */
  _scrollToHotSpot(timingsForScrolling: LineTimings) {
    const heaviestLine =
      mapGetKeyWithMaxValue(timingsForScrolling.totalLineHits) ??
      mapGetKeyWithMaxValue(this.props.timings.totalLineHits);
    if (heaviestLine !== undefined) {
      this._scrollToLine(heaviestLine - 5);
    }
  }

  _scrollToLine(lineNumber: number) {
    if (this._editor) {
      this._editor.scrollToLine(lineNumber);
    }
  }

  _getMaxLineNumber() {
    const { sourceCode, timings } = this.props;
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
      maxLineNumber = Math.max(1, ...timings.totalLineHits.keys()) + 10;
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

  render() {
    return (
      <div className="sourceView codeView">
        <SourceViewHeader />
        <div className="codeMirrorContainer" ref={this._ref}></div>
      </div>
    );
  }

  componentDidMount() {
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
        this.props.timings,
        domParent
      );
      this._editor = editor;
      this._scrollToHotSpot(this.props.hotSpotTimings);
    })();
  }

  // CodeMirror's API is not based on React. When our props change, we need to
  // translate those changes into CodeMirror API calls manually.
  componentDidUpdate(prevProps: SourceViewProps) {
    if (!this._editor) {
      return;
    }

    if (this.props.filePath !== prevProps.filePath) {
      this._editor.updateLanguageForFilePath(this.props.filePath);
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
      this.props.scrollToHotSpotGeneration !==
        prevProps.scrollToHotSpotGeneration
    ) {
      this._scrollToHotSpot(this.props.hotSpotTimings);
    }

    if (this.props.timings !== prevProps.timings) {
      this._editor.setTimings(this.props.timings);
    }
  }
}
