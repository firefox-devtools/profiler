/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Strip any function arguments from the given string.
 *
 * If the function fails to determine that there are any parentheses to strip
 * it will return the original string.
 */
export function stripFunctionArguments(functionCall: string): string {
  // Remove known data that can appear at the start or the end of the string
  const s = functionCall
    // example: "(anonymous namespace)::get_registry() [clone .8847]"
    .replace(/ \[clone [^]+\]$/, '')
    // example: "SkPath::internalGetConvexity() const"
    .replace(/ const$/, '')
    // example:" static nsThread::ThreadFunc(void*)"
    .replace(/^static /, '');

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
        return s.substr(0, i);
      }
    }
  }
  return s;
}

export function removeTemplateInformation(functionName: string) {
  // The result for this function. This works as an accumulator.
  let result = '';
  // This keeps the depth in the tree of anchorness.
  let depth = 0;
  // This keeps the depth start of a template we'd like to remove. This is
  // useful to find the end of this template. This is null if we're not removing
  // any template yet.
  let templateStartDepth: null | number = null;
  // Start of a segment we'd like to keep
  let start = 0;

  // We start the loop at i = 1 because we don't want to extract any
  // template-like information starting at the beginning of the string:
  // templates can't occur before the name of a function, so this is certainly
  // an HTML tag like <script>.
  for (let i = 1; i < functionName.length; i++) {
    if (functionName[i] === '<') {
      if (functionName[i - 1] !== ' ' && functionName[i - 1] !== '.') {
        // We also don't want to extract template-like information with these
        // characteristics:
        // - that start after a space, as that won't likely be a real template
        //   information and probably rather an HTML tag name.
        // - that start after a dot, as that will likely be a java initializer
        if (templateStartDepth === null) {
          // Template information begins, save segment
          result += functionName.slice(start, i);
          // Start a new segment here to not lose the rest of the string
          // should we find no matching '>'
          start = i;
          // Remember the depth for this template start, so that we find the end
          // of this template just fine.
          templateStartDepth = depth;
        }
      }
      depth++;
    } else if (functionName[i] === '>') {
      depth--;
      if (depth === templateStartDepth) {
        // Template information ends, start of new segment
        start = i + 1;
        // Reset the "are we removing some template" information.
        templateStartDepth = null;
      }
    }
  }
  result += functionName.slice(start);
  return result;
}

export function getFunctionName(functionCall: string) {
  return removeTemplateInformation(stripFunctionArguments(functionCall));
}
