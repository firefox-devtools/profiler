/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Protocol for communication between profiler-cli client and daemon.
 * Messages are sent as line-delimited JSON over Unix domain sockets.
 *
 * The commands and their results are shared with the in-browser executor and
 * live in src/profile-query/cli/protocol.ts.
 */

export type * from 'firefox-profiler/profile-query/cli/protocol';

import type {
  ClientCommand,
  CommandResult,
  PermalinkFormat,
  PermalinkOutcome,
} from 'firefox-profiler/profile-query/cli/protocol';

export type ClientMessage =
  | {
      type: 'command';
      command: ClientCommand;
      /** Also build a profiler.firefox.com URL for the view this command shows. */
      permalink?: PermalinkFormat;
    }
  | { type: 'shutdown' }
  | { type: 'status' };

export type ServerResponse =
  | {
      type: 'success';
      result: string | CommandResult;
      permalink?: PermalinkOutcome;
    }
  | { type: 'error'; error: string }
  | { type: 'loading' }
  | { type: 'symbolicating' }
  | { type: 'ready' };

export interface SessionMetadata {
  id: string;
  socketPath: string;
  logPath: string;
  pid: number;
  profilePath: string;
  createdAt: string;
  buildHash: string;
}
