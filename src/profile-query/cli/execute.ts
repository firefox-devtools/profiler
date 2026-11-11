/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { expandMarkerHandleSpecs } from 'firefox-profiler/profile-query/marker-map';
import type { ProfileQuerier } from 'firefox-profiler/profile-query';
import type {
  ApplySourceMapResult,
  ClientCommand,
  CommandResult,
  ProfileSaveResult,
  WithContext,
} from './protocol';

/**
 * Commands that read or write local files. Only the profiler-cli daemon can
 * provide them.
 */
export type FileSystemCommands = {
  saveProfile(
    absPath: string,
    force: boolean
  ): Promise<WithContext<ProfileSaveResult>>;
  applySourceMap(
    absPath: string,
    sourceHandle?: string
  ): Promise<WithContext<ApplySourceMapResult>>;
};

function requireFileSystem(
  fileSystem: FileSystemCommands | null,
  commandName: string
): FileSystemCommands {
  if (fileSystem === null) {
    throw new Error(`${commandName} is not available here`);
  }
  return fileSystem;
}

/**
 * Run a profiler-cli command against a querier.
 */
export async function executeClientCommand(
  querier: ProfileQuerier,
  command: ClientCommand,
  fileSystem: FileSystemCommands | null
): Promise<string | CommandResult> {
  switch (command.command) {
    case 'profile':
      switch (command.subcommand) {
        case 'info':
          return querier.profileInfo(command.all, command.search);
        case 'meta':
          return querier.profileMeta();
        case 'threads':
          throw new Error('unimplemented');
        case 'logs':
          return querier.profileLogs(command.logFilters);
        case 'save':
          return requireFileSystem(fileSystem, 'profile save').saveProfile(
            command.path,
            command.force
          );
        case 'markers':
          return querier.profileMarkers(command.markerFilters);
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'thread':
      switch (command.subcommand) {
        case 'info':
          return querier.threadInfo(command.thread);
        case 'list':
          return querier.threadList(command.threadListOptions);
        case 'select':
          if (!command.thread) {
            throw new Error('thread handle required for thread select');
          }
          return querier.threadSelect(command.thread);
        case 'samples':
          return querier.threadSamples(
            command.thread,
            command.includeIdle,
            command.search,
            command.sampleFilters,
            command.strategy
          );
        case 'samples-top-down':
          return querier.threadSamplesTopDown(
            command.thread,
            command.callTreeOptions,
            command.includeIdle,
            command.search,
            command.sampleFilters,
            command.strategy
          );
        case 'samples-bottom-up':
          return querier.threadSamplesBottomUp(
            command.thread,
            command.callTreeOptions,
            command.includeIdle,
            command.search,
            command.sampleFilters,
            command.strategy
          );
        case 'markers':
          return querier.threadMarkers(command.thread, command.markerFilters);
        case 'functions':
          return querier.threadFunctions(
            command.thread,
            command.functionFilters,
            command.includeIdle,
            command.sampleFilters,
            command.strategy
          );
        case 'network':
          return querier.threadNetwork(command.thread, command.networkFilters);
        case 'page-load':
          return querier.threadPageLoad(
            command.thread,
            command.pageLoadOptions
          );
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'marker':
      switch (command.subcommand) {
        case 'info': {
          // Expand once here, so the single/multi result shape follows what
          // the specs actually resolve to: every spelling of one marker
          // ("m-1", "m-1,", "m-1..m-1") returns the single-marker shape.
          const specs = command.markers ?? [];
          const handles = expandMarkerHandleSpecs(specs);
          if (handles.length === 0) {
            throw new Error('marker handle required for marker info');
          }
          if (handles.length === 1) {
            return querier.markerInfo(handles[0]);
          }
          return querier.markerInfoMulti(specs);
        }
        case 'stack':
          if (!command.marker) {
            throw new Error('marker handle required for marker stack');
          }
          return querier.markerStack(command.marker);
        case 'select':
          throw new Error('unimplemented');
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'counter':
      switch (command.subcommand) {
        case 'list':
          return querier.counterList();
        case 'info':
          if (!command.counter) {
            throw new Error('counter handle required for counter info');
          }
          return querier.counterInfo(command.counter);
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'sample':
      switch (command.subcommand) {
        case 'info':
          throw new Error('unimplemented');
        case 'select':
          throw new Error('unimplemented');
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'function':
      switch (command.subcommand) {
        case 'info':
          if (!command.function) {
            throw new Error('function handle required for function info');
          }
          return querier.functionInfo(command.function);
        case 'expand':
          if (!command.function) {
            throw new Error('function handle required for function expand');
          }
          return querier.functionExpand(command.function);
        case 'select':
          throw new Error('unimplemented');
        case 'annotate':
          if (!command.function) {
            throw new Error('function handle required for function annotate');
          }
          return querier.functionAnnotate(
            command.function,
            command.annotateMode ?? 'src',
            command.symbolServerUrl,
            command.annotateContext ?? '2',
            command.strategy
          );
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'permalink':
      return querier.permalink({}, command.short ?? false);
    case 'strategy':
      return querier.strategySelect(command.strategy);
    case 'zoom':
      switch (command.subcommand) {
        case 'push':
          if (!command.range) {
            throw new Error('range parameter is required for zoom push');
          }
          return querier.pushViewRange(command.range);
        case 'pop':
          return querier.popViewRange();
        case 'clear':
          return querier.clearViewRange();
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'filter':
      switch (command.subcommand) {
        case 'push':
          if (!command.spec) {
            throw new Error('spec is required for filter push');
          }
          return querier.filterPush(command.spec, command.thread);
        case 'pop':
          return querier.filterPop(command.count ?? 1, command.thread);
        case 'list':
          return querier.filterList(command.thread);
        case 'clear':
          return querier.filterClear(command.thread);
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'sourcemap':
      switch (command.subcommand) {
        case 'sources':
          return querier.listSourceMapSources();
        case 'apply':
          if (!command.path) {
            throw new Error('path is required for sourcemap apply');
          }
          return requireFileSystem(
            fileSystem,
            'sourcemap apply'
          ).applySourceMap(command.path, command.to);
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'status':
      return querier.getStatus();
    default:
      throw assertExhaustiveCheck(command);
  }
}
