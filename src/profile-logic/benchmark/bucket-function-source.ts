/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Finds the code of the JS function of a bucket, so that the benchmark
 * comparison can show it under the bucket's flame graphs. This only works for
 * profiles which contain the JS sources, see embed-js-sources.ts.
 */

import { getFormatDialectForPath } from '../js-format/dialect';
import { FuncFlag } from '../../types/profile';

import type { FunctionSourceRequest } from '../js-format/function-source';
import type {
  IndexIntoFuncTable,
  IndexIntoSourceTable,
  Profile,
} from '../../types';

export type FunctionSourceView = {
  // The path or URL of the file, for display and syntax highlighting.
  filename: string;
  sourceIndex: IndexIntoSourceTable;
  // The 1-based line of the start of the source in its file. For inline
  // scripts, the code only covers the script, not the whole file.
  sourceStartLine: number;
  request: FunctionSourceRequest;
};

export type BucketFunctionSources = {
  // The code as it was written, from the source map. Null if the function
  // isn't source-mapped, or if the profile doesn't contain the original code.
  original: FunctionSourceView | null;
  // The code that the browser ran, pretty-printed. For functions that aren't
  // source-mapped, this is the only code, and it's only pretty-printed if it
  // looks minified.
  generated: FunctionSourceView | null;
};

function _getFunctionSourceView(
  profile: Profile,
  sourceIndex: IndexIntoSourceTable,
  line: number,
  column: number,
  format: FunctionSourceRequest['format']
): FunctionSourceView | null {
  const { sources, stringArray } = profile.shared;
  const code = sources.content[sourceIndex];
  if (code === null) {
    return null;
  }
  const filename = stringArray[sources.filename[sourceIndex]];
  const dialect = getFormatDialectForPath(filename);
  if (dialect === null) {
    return null;
  }
  // Line and column are relative to the start of the file, but the code of
  // an inline script starts somewhere inside the file.
  const startLine = sources.startLine[sourceIndex];
  const startColumn = sources.startColumn[sourceIndex];
  const relativeLine = line - startLine + 1;
  const relativeColumn = relativeLine === 1 ? column - startColumn + 1 : column;
  return {
    filename,
    sourceIndex,
    sourceStartLine: startLine,
    request: {
      code,
      dialect,
      line: relativeLine,
      column: relativeColumn,
      format,
    },
  };
}

export function getBucketFunctionSources(
  profile: Profile,
  funcIndex: IndexIntoFuncTable
): BucketFunctionSources {
  const { funcTable, sourceLocationTable } = profile.shared;
  const flags = funcTable.flags[funcIndex];
  const requiredFlags =
    FuncFlag.IsJS | FuncFlag.HasSource | FuncFlag.HasLine | FuncFlag.HasColumn;
  if ((flags & requiredFlags) !== requiredFlags) {
    return { original: null, generated: null };
  }

  let original = null;
  const isSourceMapped = (flags & FuncFlag.HasOriginalLocation) !== 0;
  if (isSourceMapped) {
    const location = funcTable.originalLocation[funcIndex];
    original = _getFunctionSourceView(
      profile,
      sourceLocationTable.source[location],
      sourceLocationTable.line[location],
      sourceLocationTable.column[location],
      'never'
    );
  }
  const generated = _getFunctionSourceView(
    profile,
    funcTable.source[funcIndex],
    funcTable.lineNumber[funcIndex],
    funcTable.columnNumber[funcIndex],
    isSourceMapped ? 'always' : 'auto'
  );
  return { original, generated };
}
