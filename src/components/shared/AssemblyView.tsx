/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { ensureExists } from 'firefox-profiler/utils/types';
import type {
  AddressTimings,
  NativeSymbolInfo,
  DecodedInstruction,
} from 'firefox-profiler/types';

import type { AssemblyViewEditor } from './AssemblyView-codemirror';

import './CodeView.css';

const AssemblyViewHeader = () => {
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
      <span className="codeViewHeaderColumn codeViewMainColumn assembly"></span>
    </div>
  );
};

type AssemblyViewProps = {
  readonly timings: AddressTimings;
  readonly assemblyCode: DecodedInstruction[];
  readonly nativeSymbol: NativeSymbolInfo | null;
  readonly scrollGeneration: number;
  readonly scrollToInstructionAddress?: number;
  readonly highlightedInstruction?: number;
};

let editorModulePromise: Promise<any> | null = null;

export class AssemblyView extends React.PureComponent<AssemblyViewProps> {
  _ref = React.createRef<HTMLDivElement>();
  _editor: AssemblyViewEditor | null = null;

  _scrollToAddressWithSpaceOnTop(address: number, topSpaceLines: number) {
    if (this._editor) {
      this._editor.scrollToAddressWithSpaceOnTop(address, topSpaceLines);
    }
  }

  _getAssemblyCodeOrFallback(): DecodedInstruction[] {
    const { assemblyCode } = this.props;
    if (assemblyCode.length !== 0) {
      // We have assembly code for the selected symbol. Good.
      return assemblyCode;
    }

    // We don't have the true assembly code yet, and don't really know
    // at which address each instruction starts.
    // Compute a fallback by getting known addresses from the timings.

    const { timings, nativeSymbol } = this.props;
    const addresses = [...timings.totalAddressHits.keys()];

    // Also include the start address of the symbol, if it's not already present.
    if (
      nativeSymbol !== null &&
      !timings.totalAddressHits.has(nativeSymbol.address)
    ) {
      addresses.push(nativeSymbol.address);
    }

    addresses.sort((a, b) => a - b);

    // Create fallback assembly code where each known address is mapped to an
    // empty string instruction.
    return addresses.map((address) => ({
      address,
      decodedString: '',
    }));
  }

  override render() {
    return (
      <div className="assemblyView codeView">
        <AssemblyViewHeader />
        <div className="codeMirrorContainer" ref={this._ref}></div>
      </div>
    );
  }

  override componentDidMount() {
    // Load the module with all the @codemirror imports asynchronously, so that
    // it can be split into a separate bundle chunk.
    if (editorModulePromise === null) {
      editorModulePromise = import('./AssemblyView-codemirror');
    }
    (async () => {
      const codeMirrorModulePromise = ensureExists(editorModulePromise);
      const codeMirrorModule = await codeMirrorModulePromise;
      const domParent = this._ref.current;
      if (!domParent) {
        return;
      }
      const { AssemblyViewEditor } = codeMirrorModule;
      const editor = new AssemblyViewEditor(
        this._getAssemblyCodeOrFallback(),
        this.props.timings,
        this.props.highlightedInstruction ?? null,
        domParent
      );
      this._editor = editor;
      if (this.props.scrollToInstructionAddress !== undefined) {
        this._scrollToAddressWithSpaceOnTop(
          this.props.scrollToInstructionAddress,
          5
        );
      }
    })();
  }

  // CodeMirror's API is not based on React. When our props change, we need to
  // translate those changes into CodeMirror API calls manually.
  override componentDidUpdate(prevProps: AssemblyViewProps) {
    if (!this._editor) {
      return;
    }

    let contentsChanged = false;
    if (
      this.props.assemblyCode !== prevProps.assemblyCode ||
      (this.props.assemblyCode.length === 0 &&
        prevProps.assemblyCode.length === 0 &&
        this.props.timings !== prevProps.timings)
    ) {
      this._editor.setContents(this._getAssemblyCodeOrFallback());
      contentsChanged = true;
    }

    if (
      contentsChanged ||
      this.props.scrollGeneration !== prevProps.scrollGeneration
    ) {
      if (this.props.scrollToInstructionAddress !== undefined) {
        this._scrollToAddressWithSpaceOnTop(
          this.props.scrollToInstructionAddress,
          5
        );
      }
    }

    if (this.props.timings !== prevProps.timings) {
      this._editor.setTimings(this.props.timings);
    }

    if (
      this.props.highlightedInstruction !== prevProps.highlightedInstruction
    ) {
      this._editor.setHighlightedInstruction(
        this.props.highlightedInstruction ?? null
      );
    }
  }
}
