/**
 * Protocol for communication between pq client and daemon.
 * Messages are sent as line-delimited JSON over Unix domain sockets.
 */

// Re-export shared types from profile-query
export type {
  MarkerFilterOptions,
  FunctionFilterOptions,
  SessionContext,
  WithContext,
  StatusResult,
  FunctionExpandResult,
  FunctionInfoResult,
  ViewRangeResult,
  ThreadInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  CallTreeNode,
  CallTreeScoringStrategy,
  ThreadMarkersResult,
  ThreadFunctionsResult,
  DurationStats,
  RateStats,
  MarkerGroupData,
  MarkerInfoResult,
  MarkerStackResult,
  StackTraceData,
  ProfileInfoResult,
} from '../profile-query/types';
export type { CallTreeCollectionOptions } from '../profile-query/formatters/call-tree';

// Import types for use in type definitions
import type {
  MarkerFilterOptions,
  FunctionFilterOptions,
  WithContext,
  StatusResult,
  FunctionExpandResult,
  FunctionInfoResult,
  ViewRangeResult,
  ThreadInfoResult,
  MarkerStackResult,
  MarkerInfoResult,
  ProfileInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  ThreadMarkersResult,
  ThreadFunctionsResult,
} from '../profile-query/types';
import type { CallTreeCollectionOptions } from '../profile-query/formatters/call-tree';

export type ClientMessage =
  | { type: 'command'; command: ClientCommand }
  | { type: 'shutdown' }
  | { type: 'status' };

export type ClientCommand =
  | { command: 'profile'; subcommand: 'info' | 'threads' }
  | {
      command: 'thread';
      subcommand:
        | 'info'
        | 'select'
        | 'samples'
        | 'samples-top-down'
        | 'samples-bottom-up'
        | 'markers'
        | 'functions';
      thread?: string;
      markerFilters?: MarkerFilterOptions;
      functionFilters?: FunctionFilterOptions;
      callTreeOptions?: CallTreeCollectionOptions;
    }
  | {
      command: 'marker';
      subcommand: 'info' | 'select' | 'stack';
      marker?: string;
    }
  | { command: 'sample'; subcommand: 'info' | 'select'; sample?: string }
  | {
      command: 'function';
      subcommand: 'info' | 'select' | 'expand';
      function?: string;
    }
  | {
      command: 'zoom';
      subcommand: 'push' | 'pop' | 'clear';
      range?: string;
    }
  | { command: 'status' };

export type ServerResponse =
  | { type: 'success'; result: string | CommandResult }
  | { type: 'error'; error: string }
  | { type: 'loading' }
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
  | WithContext<ThreadInfoResult>
  | WithContext<MarkerStackResult>
  | WithContext<MarkerInfoResult>
  | WithContext<ProfileInfoResult>
  | WithContext<ThreadSamplesResult>
  | WithContext<ThreadSamplesTopDownResult>
  | WithContext<ThreadSamplesBottomUpResult>
  | WithContext<ThreadMarkersResult>
  | WithContext<ThreadFunctionsResult>;

export interface SessionMetadata {
  id: string;
  socketPath: string;
  logPath: string;
  pid: number;
  profilePath: string;
  createdAt: string;
  buildHash: string;
}
