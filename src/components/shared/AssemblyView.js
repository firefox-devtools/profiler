/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import { ensureExists } from 'firefox-profiler/utils/flow';
import type {
  AddressTimings,
  NativeSymbolInfo,
  DecodedInstruction,
} from 'firefox-profiler/types';
import { mapGetKeyWithMaxValue } from 'firefox-profiler/utils';

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
  +timings: AddressTimings,
  +assemblyCode: DecodedInstruction[],
  +disableOverscan: boolean,
  +nativeSymbol: NativeSymbolInfo | null,
  +scrollToHotSpotGeneration: number,
  +hotSpotTimings: AddressTimings,
};

let editorModulePromise: Promise<any> | null = null;

export class AssemblyView extends React.PureComponent<AssemblyViewProps> {
  _ref = React.createRef<HTMLDivElement>();
  _editor: AssemblyViewEditor | null = null;

  /**
   * Scroll to the line with the most hits, based on the timings in
   * timingsForScrolling.
   *
   * How is timingsForScrolling different from this.props.timings?
   * In the current implementation, this.props.timings are always the "global"
   * timings, i.e. they show the line hits for all samples in the current view,
   * regardless of the selected call node. However, when opening the assembly
   * view from a specific call node, you really want to see the code that's
   * relevant to that specific call node, or at least that specific function.
   * So timingsForScrolling are the timings that indicate just the line hits
   * in the selected call node. This means that the "hotspot" will be somewhere
   * in the selected function, and it will even be in the line that's most
   * relevant to that specific call node.
   *
   * Sometimes, timingsForScrolling can be completely empty. This happens, for
   * example, when the assembly view is showing a different file than the
   * selected call node's function's file, for example because we just loaded
   * from a URL and ended up with an arbitrary selected call node.
   * In that case, pick the hotspot from the global line timings.
   */
  _scrollToHotSpot(timingsForScrolling: AddressTimings) {
    const heaviestAddress =
      mapGetKeyWithMaxValue(timingsForScrolling.totalAddressHits) ??
      mapGetKeyWithMaxValue(this.props.timings.totalAddressHits);
    if (heaviestAddress !== undefined) {
      this._scrollToAddressWithSpaceOnTop(heaviestAddress, 5);
    }
  }

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

  render() {
    return (
      <div className="assemblyView codeView">
        <AssemblyViewHeader />
        <div className="codeMirrorContainer" ref={this._ref}></div>
      </div>
    );
  }

  componentDidMount() {
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
        this.props.nativeSymbol,
        this.props.timings,
        domParent
      );
      this._editor = editor;
      this._scrollToHotSpot(this.props.hotSpotTimings);
    })();
  }

  // CodeMirror's API is not based on React. When our props change, we need to
  // translate those changes into CodeMirror API calls manually.
  componentDidUpdate(prevProps: AssemblyViewProps) {
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
