/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';
import type {
  AssemblyCodeStatus,
  IndexIntoSourceTable,
  Lib,
  SourceCodeStatus,
  Selector,
} from 'firefox-profiler/types';
import {
  getSourceViewSourceIndex,
  getAssemblyViewNativeSymbol,
} from './url-state';
import { getProfileOrNull } from './profile';

export const getSourceCodeCache: Selector<
  Map<IndexIntoSourceTable, SourceCodeStatus>
> = (state) => state.code.sourceCodeCache;

export const getSourceViewCode: Selector<SourceCodeStatus | void> =
  createSelector(
    getSourceCodeCache,
    getSourceViewSourceIndex,
    getProfileOrNull,
    (sourceCodeCache, sourceIndex, profile) => {
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
