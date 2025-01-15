/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

declare module 'devtools-reps' {
  export const MODE: {
    readonly TINY: unique symbol;
    readonly SHORT: unique symbol;
    readonly LONG: unique symbol;
    readonly HEADER: unique symbol;
  };

  export const REPS: any;
  export function getRep(object: any, defaultRep?: any): any;

  export function parseURLEncodedText(text: string): any;
  export function parseURLParams(url: string): any;
  export function maybeEscapePropertyName(name: string): string;
  export function getGripPreviewItems(grip: any): any[];

  export const ValueSummaryReader: {
    getArgumentSummaries: (
      valuesBuffer: ArrayBuffer,
      shapes: Array<string[] | null>,
      valuesBufferIndex: number
    ) => any;
  };
}
