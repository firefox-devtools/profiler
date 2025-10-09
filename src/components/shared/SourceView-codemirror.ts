/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * This module wraps all the interaction with the CodeMirror API into a
 * SourceViewEditor class.
 *
 * This module is intended to be imported asynchronously, so that all the
 * CodeMirror code can be split into a separate bundle chunk.
 *
 * This file implements the following features:
 *  - Display source code with syntax highlighting.
 *  - Display a gutter with:
 *    - "Total" timings for each line
 *    - "Self" timings for each line
 *    - The line number for each line
 *  - Highlight source code lines which have a non-zero timing, by applying
 *    a cm-nonZeroLine class to them. This highlight line goes across the entire
 *    width of the editor, it covers both the gutter and the main area.
 */
import { EditorView, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { classHighlighter } from '@lezer/highlight';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { javascript } from '@codemirror/lang-javascript';
import clamp from 'clamp';

import type { LineTimings } from 'firefox-profiler/types';
import {
  timingsExtension,
  updateTimingsEffect,
  createHighlightedLineExtension,
} from 'firefox-profiler/utils/codemirror-shared';

// This "compartment" allows us to swap the syntax highlighting language when
// the file path changes.
const languageConf = new Compartment();

// This "compartment" allows us to swap the highlighted line when it changes.
const highlightedLineConf = new Compartment();

// Detect the right language based on the file extension.
function _languageExtForPath(
  path: string | null
): any /* LanguageSupport | [] */ {
  if (path === null) {
    return [];
  }
  if (path.endsWith('.rs')) {
    return rust();
  }
  if (
    path.endsWith('.js') ||
    path.endsWith('.jsm') ||
    path.endsWith('.jsx') ||
    path.endsWith('.mjs') ||
    path.endsWith('.ts') ||
    path.endsWith('.tsx')
  ) {
    return javascript();
  }
  if (
    path.endsWith('.c') ||
    path.endsWith('.cc') ||
    path.endsWith('.cpp') ||
    path.endsWith('.cxx') ||
    path.endsWith('.h') ||
    path.endsWith('.hpp') ||
    path.endsWith('.m') ||
    path.endsWith('.mm')
  ) {
    return cpp();
  }
  return [];
}

// Adjustments to make a CodeMirror editor work as a non-editable code viewer.
const codeViewerExtension = [
  // Make the editor non-editable.
  EditorView.editable.of(false),
  // Allow tabbing to the view (to an element *inside* the scroller so that the
  // up / down keys trigger scrolling), and take focus on mousedown.
  EditorView.contentAttributes.of({ tabindex: '0' }),
];

export class SourceViewEditor {
  _view: EditorView;

  // Create a CodeMirror editor and add it as a child element of domParent.
  constructor(
    initialText: string,
    path: string,
    timings: LineTimings,
    highlightedLine: number | null,
    domParent: Element
  ) {
    let state = EditorState.create({
      doc: initialText,
      extensions: [
        timingsExtension,
        lineNumbers(),
        languageConf.of(_languageExtForPath(path)),
        highlightedLineConf.of(createHighlightedLineExtension(highlightedLine)),
        syntaxHighlighting(classHighlighter),
        codeViewerExtension,
      ],
    });
    state = state.update({
      effects: updateTimingsEffect.of(timings),
    }).state;
    this._view = new EditorView({
      state,
      parent: domParent,
    });
  }

  updateLanguageForFilePath(path: string | null) {
    this._view.dispatch({
      effects: languageConf.reconfigure(_languageExtForPath(path)),
    });
  }

  setContents(text: string) {
    // The CodeMirror way of replacing the entire contents is to insert new text
    // and overwrite the full range of existing text.
    this._view.dispatch(
      this._view.state.update({
        changes: {
          insert: text,
          from: 0,
          to: this._view.state.doc.length,
        },
      })
    );
  }

  setTimings(timings: LineTimings) {
    // Update the value of the timings field by dispatching an updateTimingsEffect.
    this._view.dispatch({
      effects: updateTimingsEffect.of(timings),
    });
  }

  setHighlightedLine(lineNumber: number | null) {
    // Update the highlighted line by reconfiguring the compartment.
    this._view.dispatch({
      effects: highlightedLineConf.reconfigure(
        createHighlightedLineExtension(lineNumber)
      ),
    });
  }

  scrollToLine(lineNumber: number) {
    // Clamp the line number to the document's line count.
    lineNumber = clamp(lineNumber, 1, this._view.state.doc.lines);

    // Convert the line number into a position.
    const pos = this._view.state.doc.line(lineNumber).from;
    // Dispatch the scroll action.
    this._view.dispatch({
      effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 }),
    });
    // Trigger a measure flush, to work around
    // https://github.com/codemirror/codemirror.next/issues/676
    this._view.coordsAtPos(0);
  }
}
