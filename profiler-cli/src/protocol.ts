/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Protocol for communication between profiler-cli client and daemon.
 * Messages are sent as line-delimited JSON over Unix domain sockets.
 */

// Re-export shared types from profile-query
export type {
  MarkerFilterOptions,
  FlatMarkerItem,
  FunctionFilterOptions,
  SampleFilterSpec,
  FilterEntry,
  FilterStackResult,
  SessionContext,
  WithContext,
  StatusResult,
  FunctionExpandResult,
  FunctionInfoResult,
  FunctionAnnotateResult,
  AnnotateMode,
  ViewRangeResult,
  ThreadInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  CallTreeNode,
  CallTreeScoringStrategy,
  ThreadMarkersResult,
  ThreadNetworkResult,
  NetworkRequestEntry,
  NetworkPhaseTimings,
  ThreadFunctionsResult,
  ThreadPageLoadResult,
  NavigationMilestone,
  PageLoadResourceEntry,
  PageLoadCategoryEntry,
  JankPeriod,
  JankFunction,
  DurationStats,
  RateStats,
  MarkerGroupData,
  MarkerInfoResult,
  MarkerStackResult,
  StackTraceData,
  ProfileInfoResult,
  ProfileLogsResult,
  ThreadSelectResult,
} from '../../src/profile-query/types';
export type { CallTreeCollectionOptions } from '../../src/profile-query/formatters/call-tree';

// Import types for use in type definitions
import type {
  MarkerFilterOptions,
  FunctionFilterOptions,
  SampleFilterSpec,
  WithContext,
  StatusResult,
  FunctionExpandResult,
  FunctionInfoResult,
  FunctionAnnotateResult,
  AnnotateMode,
  ViewRangeResult,
  ThreadInfoResult,
  MarkerStackResult,
  MarkerInfoResult,
  ProfileInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  ThreadMarkersResult,
  ThreadNetworkResult,
  ThreadFunctionsResult,
  ThreadPageLoadResult,
  FilterStackResult,
  ProfileLogsResult,
  ThreadSelectResult,
} from '../../src/profile-query/types';
import type { CallTreeCollectionOptions } from '../../src/profile-query/formatters/call-tree';

export type ClientMessage =
  | { type: 'command'; command: ClientCommand }
  | { type: 'shutdown' }
  | { type: 'status' };

export type ClientCommand =
  | {
      command: 'profile';
      subcommand: 'info' | 'threads';
      all?: boolean;
      search?: string;
    }
  | {
      command: 'profile';
      subcommand: 'logs';
      logFilters?: {
        thread?: string;
        module?: string;
        level?: string;
        search?: string;
        limit?: number;
      };
    }
  | {
      command: 'thread';
      subcommand:
        | 'info'
        | 'select'
        | 'samples'
        | 'samples-top-down'
        | 'samples-bottom-up'
        | 'markers'
        | 'functions'
        | 'network'
        | 'page-load';
      thread?: string;
      includeIdle?: boolean;
      search?: string;
      markerFilters?: MarkerFilterOptions;
      functionFilters?: FunctionFilterOptions;
      callTreeOptions?: CallTreeCollectionOptions;
      networkFilters?: {
        searchString?: string;
        minDuration?: number;
        maxDuration?: number;
        limit?: number;
      };
      pageLoadOptions?: {
        navigationIndex?: number;
        jankLimit?: number;
      };
      /** Ephemeral sample filters applied only to this command invocation */
      sampleFilters?: SampleFilterSpec[];
    }
  | {
      command: 'marker';
      subcommand: 'info' | 'select' | 'stack';
      marker?: string;
    }
  | { command: 'sample'; subcommand: 'info' | 'select'; sample?: string }
  | {
      command: 'function';
      subcommand: 'info' | 'select' | 'expand' | 'annotate';
      function?: string;
      annotateMode?: AnnotateMode;
      symbolServerUrl?: string;
      /** "file", "function", or a number of context lines (e.g. "2") */
      annotateContext?: string;
    }
  | {
      command: 'zoom';
      subcommand: 'push' | 'pop' | 'clear';
      range?: string;
    }
  | {
      command: 'filter';
      subcommand: 'push' | 'pop' | 'list' | 'clear';
      thread?: string;
      spec?: SampleFilterSpec;
      count?: number;
    }
  | { command: 'status' };

export type ServerResponse =
  | { type: 'success'; result: string | CommandResult }
  | { type: 'error'; error: string }
  | { type: 'loading' }
  | { type: 'symbolicating' }
  | { type: 'ready' };

/**
 * CommandResult is a union of all possible structured result types.
 * Commands can return either a string (legacy) or a structured result.
 */
export type CommandResult =
  | StatusResult
  | WithContext<FunctionExpandResult>
  | WithContext<FunctionInfoResult>
  | ViewRangeResult
  | FilterStackResult
  | WithContext<ThreadInfoResult>
  | WithContext<MarkerStackResult>
  | WithContext<MarkerInfoResult>
  | WithContext<ProfileInfoResult>
  | WithContext<ThreadSamplesResult>
  | WithContext<ThreadSamplesTopDownResult>
  | WithContext<ThreadSamplesBottomUpResult>
  | WithContext<ThreadMarkersResult>
  | WithContext<ThreadFunctionsResult>
  | WithContext<ThreadNetworkResult>
  | WithContext<FunctionAnnotateResult>
  | WithContext<ProfileLogsResult>
  | WithContext<ThreadPageLoadResult>
  | WithContext<ThreadSelectResult>;

export interface SessionMetadata {
  id: string;
  socketPath: string;
  logPath: string;
  pid: number;
  profilePath: string;
  createdAt: string;
  buildHash: string;
}
