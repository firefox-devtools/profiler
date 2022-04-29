/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

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
import { EditorView, Decoration } from '@codemirror/view';
import {
  EditorState,
  StateField,
  StateEffect,
  Compartment,
} from '@codemirror/state';
import {
  lineNumbers,
  GutterMarker,
  gutter,
  gutterLineClass,
} from '@codemirror/gutter';
import { RangeSet } from '@codemirror/rangeset';
import { classHighlightStyle } from '@codemirror/highlight';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { javascript } from '@codemirror/lang-javascript';
import clamp from 'clamp';

import type { LineTimings } from 'firefox-profiler/types';
import { emptyLineTimings } from 'firefox-profiler/profile-logic/line-timings';

// This "compartment" allows us to swap the syntax highlighting language when
// the file path changes.
const languageConf = new Compartment();

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

// This gutter marker applies the "cm-nonZeroLine" class to gutter elements.
const nonZeroLineGutterMarker = new (class extends GutterMarker {
  elementClass = 'cm-nonZeroLine';
})();

// This "decoration" applies the "cm-nonZeroLine" class to the line of source
// code in the main editor contents (not the gutter).
const nonZeroLineDecoration = Decoration.line({ class: 'cm-nonZeroLine' });

// An "effect" is like a redux action. This effect is used to replace the value
// of the timingsField state field.
const updateTimingsEffect = StateEffect.define<LineTimings>();

// A "state field" for the timings.
const timingsField = StateField.define<LineTimings>({
  create() {
    return emptyLineTimings;
  },
  update(timings, transaction) {
    // This is like a reducer. Find an updateTimingsEffect in the transaction
    // and set this field to the timings in it.
    let newTimings = timings;
    for (const effect of transaction.effects) {
      if (effect.is(updateTimingsEffect)) {
        newTimings = effect.value;
      }
    }
    return newTimings;
  },
});

// Finds all lines with non-zero line timings, for the highlight line.
// The line numbers are then converted into "positions", i.e. character offsets
// in the document, for the start of the line.
// Then they are sorted, because our caller wants to have a sorted list.
function getSortedStartPositionsOfNonZeroLines(state: EditorState): number[] {
  const timings = state.field(timingsField);
  const nonZeroLines = new Set();
  for (const lineNumber of timings.totalLineHits.keys()) {
    nonZeroLines.add(lineNumber);
  }
  for (const lineNumber of timings.selfLineHits.keys()) {
    nonZeroLines.add(lineNumber);
  }
  const lineCount = state.doc.lines;
  const positions = [...nonZeroLines]
    .filter((l) => l <= lineCount)
    .map((lineNumber) => state.doc.line(lineNumber).from);
  positions.sort((a, b) => a - b);
  return positions;
}

// This is an "extension" which applies the "cm-nonZeroLine" class to all gutter
// elements for lines with non-zero timings. It is like a piece of derived state;
// it needs to be recomputed whenever one of the input states change. The input
// states are the editor contents ("doc") and the value of the timings field.
// The editor contents are relevant because the output is expressed in terms of
// positions, i.e. character offsets from the document start, and those positions
// need to be updated if the amount of text in a line changes. This happens when
// we replace the file placeholder content with the actual file content.
const nonZeroLineGutterHighlighter = gutterLineClass.compute(
  ['doc', timingsField],
  (state) => {
    const positions = getSortedStartPositionsOfNonZeroLines(state);
    return RangeSet.of(positions.map((p) => nonZeroLineGutterMarker.range(p)));
  }
);

// Same as the previous extension, but this one is for the main editor. There
// doesn't seem to be a way to set a class for the entire line, i.e. both the
// gutter elements and the main editor elements of that line.
const nonZeroLineDecorationHighlighter = EditorView.decorations.compute(
  ['doc', timingsField],
  (state) => {
    const positions = getSortedStartPositionsOfNonZeroLines(state);
    return RangeSet.of(positions.map((p) => nonZeroLineDecoration.range(p)));
  }
);

// This is a "gutter marker" which renders just a string and nothing else.
// It is used for the LineTimings annotations, i.e. for the numbers in the
// gutter.
class StringMarker extends GutterMarker {
  _s;

  constructor(s) {
    super();
    this._s = s;
  }

  toDOM() {
    return document.createTextNode(this._s);
  }
}

// The "extension" which manages the elements in the gutter for the "total"
// column.
const totalTimingsGutter = gutter({
  class: 'cm-total-timings-gutter',
  lineMarker(view, line) {
    // Return a gutter marker for this line, or null.
    const lineNumber = view.state.doc.lineAt(line.from).number;
    const timings = view.state.field(timingsField);
    const totalTime = timings.totalLineHits.get(lineNumber);
    return totalTime !== undefined ? new StringMarker(totalTime) : null;
  },
  lineMarkerChange(update) {
    // Return true if the update affects the total timings in the gutter.
    return update.transactions.some((t) =>
      t.effects.some((e) => e.is(updateTimingsEffect))
    );
  },
});

// The "extension" which manages the elements in the gutter for the "self"
// column.
const selfTimingsGutter = gutter({
  class: 'cm-self-timings-gutter',
  lineMarker(view, line) {
    // Return a gutter marker for this line, or null.
    const lineNumber = view.state.doc.lineAt(line.from).number;
    const timings = view.state.field(timingsField);
    const selfTime = timings.selfLineHits.get(lineNumber);
    return selfTime !== undefined ? new StringMarker(selfTime) : null;
  },
  lineMarkerChange(update) {
    // Return true if the update affects the self timings in the gutter.
    return update.transactions.some((t) =>
      t.effects.some((e) => e.is(updateTimingsEffect))
    );
  },
});

// All extensions which have to do with timings, grouped into one extension.
const timingsExtension = [
  timingsField,
  totalTimingsGutter,
  selfTimingsGutter,
  nonZeroLineGutterHighlighter,
  nonZeroLineDecorationHighlighter,
];

export class SourceViewEditor {
  _view: EditorView;

  // Create a CodeMirror editor and add it as a child element of domParent.
  constructor(
    initialText: string,
    path: string,
    timings: LineTimings,
    domParent: Element
  ) {
    let state = EditorState.create({
      doc: initialText,
      extensions: [
        timingsExtension,
        lineNumbers(),
        languageConf.of(_languageExtForPath(path)),
        classHighlightStyle,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
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
