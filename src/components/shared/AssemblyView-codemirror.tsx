/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * This module wraps all the interaction with the CodeMirror API into a
 * AssemblyViewEditor class.
 *
 * This module is intended to be imported asynchronously, so that all the
 * CodeMirror code can be split into a separate bundle chunk.
 *
 * This file implements the following features:
 *  - Display assembly code.
 *  - Display a gutter with:
 *    - "Total" timings for each instruction
 *    - "Self" timings for each instruction
 *    - The address for each instruction
 *  - Highlight assembly code lines which have a non-zero timing, by applying
 *    a cm-nonZeroLine class to them. This highlight line goes across the entire
 *    width of the editor, it covers both the gutter and the main area.
 */
import { EditorView, gutter } from '@codemirror/view';
import {
  EditorState,
  StateField,
  StateEffect,
  Compartment,
} from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { classHighlighter } from '@lezer/highlight';
import clamp from 'clamp';

import type {
  AddressTimings,
  Address,
  LineTimings,
  LineNumber,
  DecodedInstruction,
} from 'firefox-profiler/types';

import { bisectionRight } from 'firefox-profiler/utils/bisect';
import {
  timingsExtension,
  updateTimingsEffect,
  StringMarker,
  createHighlightedLineExtension,
} from 'firefox-profiler/utils/codemirror-shared';

// An "effect" is like a redux action. This effect is used to replace the value
// of the state field addressToLineMapField.
const updateAddressToLineMapEffect = StateEffect.define<AddressToLineMap>();

// This "compartment" allows us to swap the highlighted line when it changes.
const highlightedLineConf = new Compartment();

// This "state field" stores the current AddressToLineMap. This field allows the
// instructionAddressGutter to map line numbers to addresses.
const addressToLineMapField = StateField.define<AddressToLineMap>({
  create() {
    return new AddressToLineMap([]);
  },
  update(instructionAddresses, transaction) {
    // Get the new value from an effect in the transaction.
    let newSortedAddresses = instructionAddresses;
    for (const effect of transaction.effects) {
      if (effect.is(updateAddressToLineMapEffect)) {
        newSortedAddresses = effect.value;
      }
    }
    return newSortedAddresses;
  },
});

// A gutter which displays the address of each instruction.
const instructionAddressGutter = gutter({
  class: 'cm-instruction-address-gutter',

  // Returns a gutter marker for this line, or null.
  lineMarker(view, line) {
    const lineNumber = view.state.doc.lineAt(line.from).number;
    const map = view.state.field(addressToLineMapField);
    const address = map.lineToAddress(lineNumber);
    return address !== null
      ? new StringMarker(`0x${address.toString(16)}`)
      : null;
  },

  // Returns true if the update affects the instruction addresses in the gutter.
  lineMarkerChange(update) {
    return update.transactions.some((t) =>
      t.effects.some((e) => e.is(updateAddressToLineMapEffect))
    );
  },
});

function instructionsToText(assemblyCode: DecodedInstruction[]): string {
  return assemblyCode.map((instr) => instr.decodedString).join('\n');
}

/**
 * This map is used to convert between instruction addresses and editor line
 * numbers.
 */
class AddressToLineMap {
  // The address of each instruction. This stays constant for the entire lifetime
  // of this AddressToLineMap instance.
  //
  // _instructionAddresses[0] contains the address of the instruction which is
  // displayed in line 1. (Line numbers are 1-based.)
  //
  // The addresses need to be ordered from low to high, so that the binary search
  // works.
  _instructionAddresses: Address[];

  constructor(instructionAddresses: Address[]) {
    this._instructionAddresses = instructionAddresses;
  }

  // Find the line which displays the instruction which covers `address`.
  // `address` doesn't need to be a perfect match for the instruction address;
  // for example, in the example below, address 0x10e4 is mapped to line 3:
  //
  // 1: 0x10da: mov r14, rdi
  // 2: 0x10dd: mov rdi, rsi
  // 3: 0x10e0: call _malloc_usable_size
  // 4: 0x10e5: test rax, rax
  // 5: 0x10e8: je loc_10f6
  addressToLine(address: Address): LineNumber | null {
    const insertionIndex = bisectionRight(this._instructionAddresses, address);
    if (insertionIndex === 0) {
      // address < instructionAddresses[0]
      return null;
    }

    const elementIndex = insertionIndex - 1;
    const lineNumber = elementIndex + 1;
    return lineNumber;
  }

  // Return the address of the instruction which is displayed in line `lineNumber`.
  lineToAddress(lineNumber: LineNumber): Address | null {
    if (lineNumber < 1 || lineNumber > this._instructionAddresses.length) {
      return null;
    }

    const elementIndex = lineNumber - 1;
    return this._instructionAddresses[elementIndex];
  }
}

function getInstructionAddresses(
  assemblyCode: DecodedInstruction[]
): Address[] {
  return assemblyCode.map((instr) => instr.address);
}

// Convert AddressTimings to LineTimings with the help of an AddressToLineMap.
function addressTimingsToLineTimings(
  addressTimings: AddressTimings,
  map: AddressToLineMap
): LineTimings {
  const totalLineHits = new Map<LineNumber, number>();
  for (const [address, hitCount] of addressTimings.totalAddressHits) {
    const line = map.addressToLine(address);
    if (line !== null) {
      const currentHitCount = totalLineHits.get(line) ?? 0;
      totalLineHits.set(line, currentHitCount + hitCount);
    }
  }

  const selfLineHits = new Map<LineNumber, number>();
  for (const [address, hitCount] of addressTimings.selfAddressHits) {
    const line = map.addressToLine(address);
    if (line !== null) {
      const currentHitCount = selfLineHits.get(line) ?? 0;
      selfLineHits.set(line, currentHitCount + hitCount);
    }
  }

  return { totalLineHits, selfLineHits };
}

export class AssemblyViewEditor {
  _view: EditorView;
  _addressToLineMap: AddressToLineMap;
  _addressTimings: AddressTimings;
  _highlightedAddress: Address | null;

  // Create a CodeMirror editor and add it as a child element of domParent.
  constructor(
    initialAssemblyCode: DecodedInstruction[],
    addressTimings: AddressTimings,
    highlightedAddress: Address | null,
    domParent: Element
  ) {
    this._addressToLineMap = new AddressToLineMap(
      getInstructionAddresses(initialAssemblyCode)
    );
    this._addressTimings = addressTimings;
    this._highlightedAddress = highlightedAddress;
    const highlightedLine =
      highlightedAddress !== null
        ? this._addressToLineMap.addressToLine(highlightedAddress)
        : null;
    let state = EditorState.create({
      doc: instructionsToText(initialAssemblyCode),
      extensions: [
        timingsExtension,
        addressToLineMapField,
        instructionAddressGutter,
        highlightedLineConf.of(createHighlightedLineExtension(highlightedLine)),
        syntaxHighlighting(classHighlighter),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    });
    const lineTimings = addressTimingsToLineTimings(
      this._addressTimings,
      this._addressToLineMap
    );
    state = state.update({
      effects: [
        updateAddressToLineMapEffect.of(this._addressToLineMap),
        updateTimingsEffect.of(lineTimings),
      ],
    }).state;
    this._view = new EditorView({
      state,
      parent: domParent,
    });
  }

  setContents(assemblyCode: DecodedInstruction[]) {
    this._addressToLineMap = new AddressToLineMap(
      getInstructionAddresses(assemblyCode)
    );
    const lineTimings = addressTimingsToLineTimings(
      this._addressTimings,
      this._addressToLineMap
    );
    // Recalculate the highlighted line based on the new address-to-line mapping.
    const highlightedLine =
      this._highlightedAddress !== null
        ? this._addressToLineMap.addressToLine(this._highlightedAddress)
        : null;
    // The CodeMirror way of replacing the entire contents is to insert new text
    // and overwrite the full range of existing text.
    const text = instructionsToText(assemblyCode);
    this._view.dispatch(
      this._view.state.update({
        changes: {
          insert: text,
          from: 0,
          to: this._view.state.doc.length,
        },
      })
    );
    this._view.dispatch({
      effects: [
        updateAddressToLineMapEffect.of(this._addressToLineMap),
        updateTimingsEffect.of(lineTimings),
        highlightedLineConf.reconfigure(
          createHighlightedLineExtension(highlightedLine)
        ),
      ],
    });
  }

  setTimings(addressTimings: AddressTimings) {
    // Update the value of the timings field by dispatching an updateTimingsEffect.
    this._addressTimings = addressTimings;
    const lineTimings = addressTimingsToLineTimings(
      this._addressTimings,
      this._addressToLineMap
    );
    this._view.dispatch({
      effects: updateTimingsEffect.of(lineTimings),
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

  scrollToAddress(address: Address) {
    const lineNumber = this._addressToLineMap.addressToLine(address);
    if (lineNumber !== null) {
      this.scrollToLine(lineNumber);
    }
  }

  scrollToAddressWithSpaceOnTop(address: Address, topSpaceLines: number) {
    const lineNumber = this._addressToLineMap.addressToLine(address);
    if (lineNumber !== null) {
      this.scrollToLine(lineNumber - topSpaceLines);
    }
  }

  setHighlightedInstruction(address: Address | null) {
    // Store the highlighted address so we can recalculate the line number
    // when the address-to-line mapping changes.
    this._highlightedAddress = address;
    // Convert the address to a line number and update the highlighted line.
    const lineNumber =
      address !== null ? this._addressToLineMap.addressToLine(address) : null;
    this._view.dispatch({
      effects: highlightedLineConf.reconfigure(
        createHighlightedLineExtension(lineNumber)
      ),
    });
  }
}
