/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  EditorView,
  Decoration,
  GutterMarker,
  gutter,
  gutterLineClass,
} from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { StateField, StateEffect, RangeSet } from '@codemirror/state';

import type { LineTimings } from 'firefox-profiler/types';

import { emptyLineTimings } from 'firefox-profiler/profile-logic/line-timings';

// This gutter marker applies the "cm-nonZeroLine" class to gutter elements.
const nonZeroLineGutterMarker = new (class extends GutterMarker {
  override elementClass = 'cm-nonZeroLine';
})();

// This "decoration" applies the "cm-nonZeroLine" class to the line of assembly
// code in the main editor contents (not the gutter).
const nonZeroLineDecoration = Decoration.line({ class: 'cm-nonZeroLine' });

// An "effect" is like a redux action. This effect is used to replace the value
// of the timingsField state field.
export const updateTimingsEffect = StateEffect.define<LineTimings>();

// Gutter marker for highlighting a specific line.
const highlightedLineGutterMarker = new (class extends GutterMarker {
  override elementClass = 'cm-highlightedLine';
})();

// Decoration for highlighting a specific line.
const highlightedLineDecoration = Decoration.line({
  class: 'cm-highlightedLine',
});

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
  const nonZeroLines = new Set<number>();
  for (const lineNumber of timings.totalLineHits.keys()) {
    nonZeroLines.add(lineNumber);
  }
  for (const lineNumber of timings.selfLineHits.keys()) {
    nonZeroLines.add(lineNumber);
  }
  const lineCount = state.doc.lines;
  const positions = Array.from(nonZeroLines)
    .filter((l) => l >= 1 && l <= lineCount)
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

// Creates extensions for highlighting a specific line number.
function createHighlightedLineExtension(lineNumber: number | null) {
  if (lineNumber === null) {
    return [];
  }
  const gutterHighlighter = gutterLineClass.compute(['doc'], (state) => {
    if (lineNumber < 1 || lineNumber > state.doc.lines) {
      return RangeSet.empty;
    }
    const pos = state.doc.line(lineNumber).from;
    return RangeSet.of([highlightedLineGutterMarker.range(pos)]);
  });
  const decorationHighlighter = EditorView.decorations.compute(
    ['doc'],
    (state) => {
      if (lineNumber < 1 || lineNumber > state.doc.lines) {
        return RangeSet.empty;
      }
      const pos = state.doc.line(lineNumber).from;
      return RangeSet.of([highlightedLineDecoration.range(pos)]);
    }
  );
  return [gutterHighlighter, decorationHighlighter];
}

// This is a "gutter marker" which renders just a string and nothing else.
// It is used for the AddressTimings annotations, i.e. for the numbers in the
// gutter.
export class StringMarker extends GutterMarker {
  _s: string;

  constructor(s: string) {
    super();
    this._s = s;
  }

  override toDOM() {
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
    return totalTime !== undefined ? new StringMarker(String(totalTime)) : null;
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
    return selfTime !== undefined ? new StringMarker(String(selfTime)) : null;
  },
  lineMarkerChange(update) {
    // Return true if the update affects the self timings in the gutter.
    return update.transactions.some((t) =>
      t.effects.some((e) => e.is(updateTimingsEffect))
    );
  },
});

// All extensions which have to do with timings, grouped into one extension.
export const timingsExtension = [
  timingsField,
  totalTimingsGutter,
  selfTimingsGutter,
  nonZeroLineGutterHighlighter,
  nonZeroLineDecorationHighlighter,
];

export { createHighlightedLineExtension };
