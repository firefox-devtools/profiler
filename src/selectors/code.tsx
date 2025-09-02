/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';
import type {
  AssemblyCodeStatus,
  Lib,
  SourceCodeStatus,
  Selector,
} from 'firefox-profiler/types';
import { getSourceViewFile, getAssemblyViewNativeSymbol } from './url-state';
import { getProfileOrNull } from './profile';

export const getSourceCodeCache: Selector<Map<string, SourceCodeStatus>> = (
  state
) => state.code.sourceCodeCache;

export const getSourceViewCode: Selector<SourceCodeStatus | void> =
  createSelector(
    getSourceCodeCache,
    getSourceViewFile,
    (sourceCodeCache, file) => (file ? sourceCodeCache.get(file) : undefined)
  );

export const getAssemblyCodeCache: Selector<Map<string, AssemblyCodeStatus>> = (
  state
) => state.code.assemblyCodeCache;

const getAssemblyViewNativeSymbolLib: Selector<Lib | null> = createSelector(
  getAssemblyViewNativeSymbol,
  getProfileOrNull,
  (nativeSymbol, profile) => {
    if (profile === null || nativeSymbol === null) {
      return null;
    }
    return profile.libs[nativeSymbol.libIndex];
  }
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
