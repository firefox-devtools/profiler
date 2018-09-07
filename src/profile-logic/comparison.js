/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { UniqueStringArray } from '../utils/unique-string-array';

import type {
  IndexIntoCategoryList,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
  IndexIntoResourceTable,
  IndexIntoLibs,
  CategoryList,
  FuncTable,
  FrameTable,
  Lib,
  SamplesTable,
  ResourceTable,
  Thread,
} from '../types/profile';

type TranslationMapForCategories = Map<
  IndexIntoCategoryList,
  IndexIntoCategoryList
>;
export function mergeCategories(
  categories1: CategoryList,
  categories2: CategoryList
): {
  categories: CategoryList,
  translationMaps: TranslationMapForCategories[],
} {
  const newCategories = [];
  const translationMaps = [];

  [categories1, categories2].forEach(categories => {
    const translationMap = new Map();
    const insertedCategories: Map<string, IndexIntoCategoryList> = new Map();

    categories.forEach((category, i) => {
      const { name } = category;
      const insertedCategoryIndex = insertedCategories.get(name);
      if (insertedCategoryIndex !== undefined) {
        translationMap.set(i, insertedCategoryIndex);
        return;
      }

      translationMap.set(i, newCategories.length);
      insertedCategories.set(name, newCategories.length);
      newCategories.push(category);
    });
  });

  return { categories: newCategories, translationMaps };
}

export function getComparisonThread(
  translationMapForCategories: TranslationMapForCategories[],
  thread1: Thread,
  thread2: Thread
): Thread {
  const newStringTable = new UniqueStringArray();
  const newSamples: SamplesTable = {
    responsiveness: [],
    stack: [],
    time: [],
    interval: [],
    rss: [],
    uss: [],
    length: 0,
  };

  type FuncTableTranslationMap = Map<IndexIntoFuncTable, IndexIntoFuncTable>;
  type ResourceTableTranslationMap = Map<
    IndexIntoResourceTable,
    IndexIntoResourceTable
  >;
  type FrameTableTranslationMap = Map<IndexIntoFrameTable, IndexIntoFrameTable>;
  type LibTranslationMap = Map<IndexIntoLibs, IndexIntoLibs>;

  function computeNewLibTable(
    ...threads: Thread[]
  ): { libs: Lib[], translationMaps: LibTranslationMap[] } {
    const mapOfInsertedLibs: Map<string, IndexIntoLibs> = new Map();

    const translationMaps = [];
    const newLibTable = [];

    threads.forEach(thread => {
      const translationMap = new Map();
      const { libs } = thread;

      libs.forEach((lib, i) => {
        const insertedLibKey = [lib.name, lib.debugName].join('#');
        const insertedLibIndex = mapOfInsertedLibs.get(insertedLibKey);
        if (insertedLibIndex !== undefined) {
          translationMap.set(i, insertedLibIndex);
          return;
        }

        translationMap.set(i, newLibTable.length);
        mapOfInsertedLibs.set(insertedLibKey, newLibTable.length);

        newLibTable.push({
          start: lib.start,
          end: lib.end,
          offset: lib.offset,
          arch: lib.arch,
          name: lib.name,
          path: lib.path,
          debugName: lib.debugName,
          debugPath: lib.debugPath,
          breakpadId: lib.breakpadId,
        });
      });

      translationMaps.push(translationMap);
    });

    return { libs: newLibTable, translationMaps };
  }

  function computeNewResourceTable(
    translationMapsForLibs: LibTranslationMap[],
    ...threads: Thread[]
  ): {
    resourceTable: ResourceTable,
    translationMaps: ResourceTableTranslationMap[],
  } {
    const translationMaps = [];
    const newResourceTable: ResourceTable = {
      lib: [],
      name: [],
      host: [],
      type: [],
      length: 0,
    };

    threads.forEach((thread, threadIndex) => {
      const translationMap = new Map();
      const { resourceTable, stringTable } = thread;
      const libTranslationMap = translationMapsForLibs[threadIndex];

      for (let i = 0; i < resourceTable.length; i++) {
        const libIndex = resourceTable.lib[i];
        const newLibIndex =
          typeof libIndex === 'number' && libIndex >= 0
            ? libTranslationMap.get(libIndex)
            : null;

        const nameIndex = resourceTable.name[i];
        const newName =
          nameIndex >= 0 ? stringTable.getString(nameIndex) : null;

        const hostIndex = resourceTable.host[i];
        const newHost =
          hostIndex !== undefined && hostIndex >= 0
            ? stringTable.getString(hostIndex)
            : undefined;

        translationMap.set(i, newResourceTable.length);

        newResourceTable.lib.push(newLibIndex);
        newResourceTable.name.push(
          newName === null ? -1 : newStringTable.indexForString(newName)
        );
        newResourceTable.host.push(
          newHost === undefined
            ? undefined
            : newStringTable.indexForString(newHost)
        );
        newResourceTable.type.push(resourceTable.type[i]);
        newResourceTable.length++;
      }

      translationMaps.push(translationMap);
    });

    return { resourceTable: newResourceTable, translationMaps };
  }

  function computeNewFuncTable(
    translationMapsForResourceTable: ResourceTableTranslationMap[],
    ...threads: Thread[]
  ): { funcTable: FuncTable, translationMaps: FuncTableTranslationMap[] } {
    const translationMaps = [];
    const newFuncTable: FuncTable = {
      address: [],
      isJS: [],
      length: 0,
      name: [],
      resource: [],
      fileName: [],
      lineNumber: [],
    };

    threads.forEach((thread, threadIndex) => {
      const { funcTable, stringTable } = thread;
      const translationMap = new Map();
      const resourceTranslationMap =
        translationMapsForResourceTable[threadIndex];

      for (let i = 0; i < funcTable.length; i++) {
        const fileNameIndex = funcTable.fileName[i];
        const fileName =
          fileNameIndex === null ? null : stringTable.getString(fileNameIndex);
        const lineNumber = funcTable.lineNumber[i];

        newFuncTable.address.push(funcTable.address[i]);
        newFuncTable.isJS.push(funcTable.isJS[i]);
        newFuncTable.name.push(
          newStringTable.indexForString(
            stringTable.getString(funcTable.name[i])
          )
        );
        const newResourceIndex = resourceTranslationMap.get(
          funcTable.resource[i]
        );
        newFuncTable.resource.push(
          newResourceIndex === undefined ? -1 : newResourceIndex
        );
        newFuncTable.fileName.push(
          fileName === null ? null : newStringTable.indexForString(fileName)
        );
        newFuncTable.lineNumber.push(lineNumber === null ? null : lineNumber);
        translationMap.set(i, newFuncTable.length);
        newFuncTable.length++;
      }

      translationMaps.push(translationMap);
    });

    return { funcTable: newFuncTable, translationMaps };
  }

  function computeNewFrameTable(
    translationMapsForFuncTable: FuncTableTranslationMap[],
    ...threads: Thread[]
  ): { frameTable: FrameTable, translationMaps: FrameTableTranslationMap[] } {
    const translationMaps = [];
    const newFrameTable: FrameTable = {
      address: [],
      category: [],
      func: [],
      implementation: [],
      line: [],
      column: [],
      optimizations: [],
      length: 0,
    };

    threads.forEach((thread, threadIndex) => {
      const { frameTable, stringTable } = thread;

      for (let i = 0; i < frameTable.length; i++) {
        const translationMap = new Map();
        const funcTranslationMap = translationMapsForFuncTable[threadIndex];
      }
    });

    return { frameTable: newFrameTable, translationMaps };
  }

  const {
    libs: newLibTable,
    translationMaps: translationMapsForLibs,
  } = computeNewLibTable(thread1, thread2);
  const {
    resourceTable: newResourceTable,
    translationMaps: translationMapsForResourceTable,
  } = computeNewResourceTable(translationMapsForLibs, thread1, thread2);
  const {
    funcTable: newFuncTable,
    translationMaps: translationMapsForFuncTable,
  } = computeNewFuncTable(translationMapsForResourceTable, thread1, thread2);
  const {
    frameTable: newFrameTable,
    translationMaps: translationMapsForFrameTable,
  } = computeNewFrameTable(translationMapsForFuncTable, thread1, thread2);

  const mergedThread = {
    processType: 'comparison',
    processStartupTime: Math.min(
      thread1.processStartupTime,
      thread2.processStartupTime
    ),
    processShutdownTime:
      Math.max(
        thread1.processShutdownTime || 0,
        thread2.processShutdownTime || 0
      ) || null,
    registerTime: Math.min(thread1.registerTime, thread2.registerTime),
    unregisterTime:
      Math.max(thread1.unregisterTime || 0, thread2.unregisterTime || 0) ||
      null,
    pausedRanges: [],
    name: 'Diff between 1 and 2',
    pid: 'Diff between 1 and 2',
    tid: undefined,
    samples: newSamples,
    markers: {
      data: [],
      name: [],
      time: [],
      length: 0,
    },
    stackTable: {
      frame: [],
      category: [],
      prefix: [],
      length: 0,
    },
    frameTable: newFrameTable,
    // Strings for profiles are collected into a single table, and are referred to by
    // their index by other tables.
    stringTable: newStringTable,
    libs: newLibTable,
    funcTable: newFuncTable,

    resourceTable: newResourceTable,
  };

  return mergedThread;
}
