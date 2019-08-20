/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * Strip any function arguments from the given string.
 *
 * If the function fails to determine that there are any parentheses to strip
 * it will return the original string.
 */
export function stripFunctionArguments(functionCall: string): string {
  // Remove known data that can appear at the end of the string
  const s = functionCall.replace(/ \[clone [^]+\]$/, '').replace(/ const$/, '');
  if (s[s.length - 1] !== ')') {
    return functionCall;
  }

  // Start from the right parenthesis at the end of the string and
  // then iterate towards the beginning until we find the matching
  // left parenthesis.
  let depth = 0;
  for (let i = s.length - 1; i > 0; i--) {
    if (s[i] === ')') {
      depth++;
    } else if (s[i] === '(') {
      depth--;
      if (depth === 0) {
        return functionCall.substr(0, i);
      }
    }
  }
  return functionCall;
}

export function removeTemplateInformation(functionName: string) {
  let result = '';
  let depth = 0;
  let start = 0; // Start of a segment we'd like to keep
  // We start the loop at i = 1 because we don't want to extract any
  // template-like information starting at the beginning of the string:
  // templates can't occur before the name of a function, so this is certainly
  // an HTML tag like <script>.
  for (let i = 1; i < functionName.length; i++) {
    // We also don't want to extract template-like information that start after
    // a space, as that won't likely be a real template information and
    // probably rather an HTML tag name.
    if (functionName[i] === '<' && functionName[i - 1] !== ' ') {
      if (depth === 0) {
        // Template information begins, save segment
        result += functionName.substr(start, i - start);
        // Start a new segment here to not lose the rest of the string
        // should we find no matching '>'
        start = i;
      }
      depth++;
    } else if (functionName[i] === '>') {
      depth--;
      if (depth === 0) {
        // Template information ends, start of new segment
        start = i + 1;
      }
    }
  }
  result += functionName.substr(start);
  return result;
}

export function getFunctionName(functionCall: string) {
  return removeTemplateInformation(stripFunctionArguments(functionCall));
}
