/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';
import type {
  AssemblyCodeStatus,
  IndexIntoSourceTable,
  Lib,
  Profile,
  SourceCodeStatus,
  SourceFormattingStatus,
  Selector,
} from 'firefox-profiler/types';
import {
  getSourceViewSourceIndex,
  getSourceViewIsPrettyPrinted,
  getGeneratedSourceViewSourceIndex,
  getGeneratedSourceViewIsPrettyPrinted,
  getAssemblyViewNativeSymbol,
} from './url-state';
import {
  getProfileOrNull,
  getSourceViewFile,
  getSourceViewStartLine,
  getSourceViewStartColumn,
  getGeneratedSourceViewFile,
  getGeneratedSourceViewStartLine,
  getGeneratedSourceViewStartColumn,
} from './profile';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import {
  type JsDialect,
  getFormatDialectForPath,
} from 'firefox-profiler/profile-logic/js-format/dialect';
import {
  type SourceViewFormatting,
  createSourceViewFormatting,
} from 'firefox-profiler/profile-logic/js-format/formatted-source';

export const getSourceCodeCache: Selector<
  Map<IndexIntoSourceTable, SourceCodeStatus>
> = (state) => state.code.sourceCodeCache;

function _getCodeForSource(
  sourceCodeCache: Map<IndexIntoSourceTable, SourceCodeStatus>,
  sourceIndex: IndexIntoSourceTable | null,
  profile: Profile | null
): SourceCodeStatus | void {
  if (sourceIndex === null) {
    return undefined;
  }
  // Prefer source content stored in the profile (from source map sourcesContent),
  // so the source view works offline and when sharing profiles.
  const inlineCode = profile?.shared.sources.content[sourceIndex];
  if (inlineCode !== null && inlineCode !== undefined) {
    return { type: 'AVAILABLE', code: inlineCode };
  }
  return sourceCodeCache.get(sourceIndex);
}

export const getSourceViewCode: Selector<SourceCodeStatus | void> =
  createSelector(
    getSourceCodeCache,
    getSourceViewSourceIndex,
    getProfileOrNull,
    _getCodeForSource
  );

export const getGeneratedSourceViewCode: Selector<SourceCodeStatus | void> =
  createSelector(
    getSourceCodeCache,
    getGeneratedSourceViewSourceIndex,
    getProfileOrNull,
    _getCodeForSource
  );

export const getSourceFormattingCache: Selector<
  Map<IndexIntoSourceTable, SourceFormattingStatus>
> = (state) => state.code.sourceFormattingCache;

// The dialect for pretty-printing the source, or null if the source can't be
// pretty-printed because it isn't JavaScript.
function _getFormatDialectForFile(file: string | null): JsDialect | null {
  if (file === null) {
    return null;
  }
  return getFormatDialectForPath(parseFileNameFromSymbolication(file).path);
}

export const getSourceViewFormatDialect: Selector<JsDialect | null> =
  createSelector(getSourceViewFile, _getFormatDialectForFile);

export const getGeneratedSourceViewFormatDialect: Selector<JsDialect | null> =
  createSelector(getGeneratedSourceViewFile, _getFormatDialectForFile);

function _getFormatting(
  isPrettyPrinted: boolean,
  dialect: JsDialect | null,
  sourceIndex: IndexIntoSourceTable | null,
  codeStatus: SourceCodeStatus | void,
  formattingCache: Map<IndexIntoSourceTable, SourceFormattingStatus>,
  startLine: number,
  startColumn: number
): SourceViewFormatting | null {
  if (
    !isPrettyPrinted ||
    dialect === null ||
    sourceIndex === null ||
    codeStatus === undefined ||
    codeStatus.type !== 'AVAILABLE'
  ) {
    return null;
  }
  const formattingStatus = formattingCache.get(sourceIndex);
  if (formattingStatus === undefined) {
    return null;
  }
  return createSourceViewFormatting(
    codeStatus.code,
    formattingStatus,
    startLine,
    startColumn
  );
}

/**
 * The pretty-printed code for the source view, or null if the source view
 * shows the code as it is. While the format worker is busy, this contains
 * partially-formatted code.
 */
export const getSourceViewFormatting: Selector<SourceViewFormatting | null> =
  createSelector(
    getSourceViewIsPrettyPrinted,
    getSourceViewFormatDialect,
    getSourceViewSourceIndex,
    getSourceViewCode,
    getSourceFormattingCache,
    getSourceViewStartLine,
    getSourceViewStartColumn,
    _getFormatting
  );

export const getGeneratedSourceViewFormatting: Selector<SourceViewFormatting | null> =
  createSelector(
    getGeneratedSourceViewIsPrettyPrinted,
    getGeneratedSourceViewFormatDialect,
    getGeneratedSourceViewSourceIndex,
    getGeneratedSourceViewCode,
    getSourceFormattingCache,
    getGeneratedSourceViewStartLine,
    getGeneratedSourceViewStartColumn,
    _getFormatting
  );

export type SourceFormattingRequest = {
  sourceIndex: IndexIntoSourceTable;
  code: string;
  dialect: JsDialect;
};

function _getFormattingRequest(
  isPrettyPrinted: boolean,
  dialect: JsDialect | null,
  sourceIndex: IndexIntoSourceTable | null,
  codeStatus: SourceCodeStatus | void,
  formattingCache: Map<IndexIntoSourceTable, SourceFormattingStatus>
): SourceFormattingRequest | null {
  if (
    !isPrettyPrinted ||
    dialect === null ||
    sourceIndex === null ||
    codeStatus === undefined ||
    codeStatus.type !== 'AVAILABLE' ||
    formattingCache.has(sourceIndex)
  ) {
    return null;
  }
  return { sourceIndex, code: codeStatus.code, dialect };
}

// The source that needs to be formatted for the source view, if the source
// view is pretty-printed and the formatting hasn't started yet.
export const getSourceViewFormattingRequest: Selector<SourceFormattingRequest | null> =
  createSelector(
    getSourceViewIsPrettyPrinted,
    getSourceViewFormatDialect,
    getSourceViewSourceIndex,
    getSourceViewCode,
    getSourceFormattingCache,
    _getFormattingRequest
  );

export const getGeneratedSourceViewFormattingRequest: Selector<SourceFormattingRequest | null> =
  createSelector(
    getGeneratedSourceViewIsPrettyPrinted,
    getGeneratedSourceViewFormatDialect,
    getGeneratedSourceViewSourceIndex,
    getGeneratedSourceViewCode,
    getSourceFormattingCache,
    _getFormattingRequest
  );

export const getAssemblyCodeCache: Selector<Map<string, AssemblyCodeStatus>> = (
  state
) => state.code.assemblyCodeCache;

const getAssemblyViewNativeSymbolLib: Selector<Lib | null> = createSelector(
  getAssemblyViewNativeSymbol,
  getProfileOrNull,
  (nativeSymbol, profile) => {
    if (
      profile === null ||
      nativeSymbol === null ||
      profile.libs.length === 0
    ) {
      return null;
    }
    return profile.libs[nativeSymbol.libIndex];
  }
);

export const getIsAssemblyViewAvailable: Selector<boolean> = createSelector(
  getAssemblyViewNativeSymbol,
  getAssemblyViewNativeSymbolLib,
  (nativeSymbol, lib) => nativeSymbol !== null && lib !== null
);

export const getAssemblyViewCode: Selector<AssemblyCodeStatus | void> =
  createSelector(
    getAssemblyCodeCache,
    getAssemblyViewNativeSymbol,
    getAssemblyViewNativeSymbolLib,
    (assemblyMap, nativeSymbol, lib) => {
      if (nativeSymbol === null || lib === null) {
        return undefined;
      }
      const { debugName, breakpadId } = lib;
      const hexAddress = nativeSymbol.address.toString(16);
      const nativeSymbolKey = `${debugName}/${breakpadId}/${hexAddress}`;
      return assemblyMap.get(nativeSymbolKey);
    }
  );
