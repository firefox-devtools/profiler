/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli session` command.
 */

import type { Command } from 'commander';
import type { SessionMetadata } from '../protocol';
import { wasExplicit } from './shared';
import {
  cleanupIfDaemonGone,
  cleanupSession,
  describeSessionOwner,
  getCurrentSessionId,
  getSessionAge,
  getSessionOwner,
  listSessions,
  loadSessionMetadata,
  ownsSession,
  setCurrentSession,
  validateSession,
} from '../session';
import { explainUnreachableSession } from '../client';
import {
  SOCKET_SANDBOX_HINT,
  isPermissionErrno,
  toErrorMessage,
} from '../diagnostics';

export function registerSessionCommand(
  program: Command,
  sessionDir: string
): void {
  const session = program
    .command('session')
    .description('Manage daemon sessions');

  session
    .command('list', { isDefault: true })
    .description('List all running daemon sessions, with their owner and age')
    .action(async () => {
      const sessionIds = listSessions(sessionDir);
      let numCleaned = 0;
      const runningSessionMetadata = [];
      const unreachableSessions: Array<{
        metadata: SessionMetadata;
        error: NodeJS.ErrnoException;
      }> = [];

      for (const sessionId of sessionIds) {
        const metadata = await validateSession(sessionDir, sessionId);
        if (metadata !== null) {
          runningSessionMetadata.push(metadata);
          continue;
        }

        const staleMetadata = loadSessionMetadata(sessionDir, sessionId);
        if (staleMetadata === null) {
          // No metadata to tell us where the socket is, so there is nothing
          // left to protect.
          cleanupSession(sessionDir, sessionId);
          numCleaned++;
          continue;
        }

        const unreachable = await cleanupIfDaemonGone(
          sessionDir,
          sessionId,
          staleMetadata.socketPath
        );
        if (unreachable === null) {
          // The daemon answered on the retry, so the first check was a blip.
          runningSessionMetadata.push(staleMetadata);
        } else if (unreachable.cleanedUp) {
          numCleaned++;
        } else {
          unreachableSessions.push({
            metadata: staleMetadata,
            error: unreachable.error,
          });
        }
      }

      if (numCleaned !== 0) {
        console.log(`Cleaned up ${numCleaned} stale sessions.`);
        console.log();
      }

      runningSessionMetadata.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const currentSessionId = getCurrentSessionId(sessionDir);
      const owner = getSessionOwner();
      console.log(`Found ${runningSessionMetadata.length} running sessions:`);
      for (const metadata of runningSessionMetadata) {
        const isCurrent = metadata.id === currentSessionId;
        const marker = isCurrent ? '* ' : '  ';
        const age = getSessionAge(metadata);
        const mine = ownsSession(metadata, owner) ? ' (yours)' : '';
        console.log(
          `${marker}${metadata.id}, created at ${metadata.createdAt}${age === null ? '' : ` (${age} ago)`} [owner: ${describeSessionOwner(metadata)}${mine}, daemon pid: ${metadata.pid}]`
        );
      }

      if (unreachableSessions.length !== 0) {
        console.log();
        console.log(
          'Could not reach the following sessions. Their files were left in place because their daemons may still be running:'
        );
        for (const { metadata, error } of unreachableSessions) {
          console.log(
            `  ${metadata.id} [owner: ${describeSessionOwner(metadata)}, daemon pid: ${metadata.pid}]: ${toErrorMessage(error)}`
          );
        }
        if (unreachableSessions.some(({ error }) => isPermissionErrno(error))) {
          console.log(SOCKET_SANDBOX_HINT);
        }
        console.log(
          '"profiler-cli stop" needs the same socket, so kill these by pid if you no longer need them.'
        );
      }

      if (!wasExplicit('session', 'list')) {
        console.log('\nOther subcommands: profiler-cli session use <id>');
      }
    });

  session
    .command('use <id>')
    .description(
      'Switch the current session (shared with every caller of this session directory)'
    )
    .action(async (sessionId: string) => {
      const metadata = await validateSession(sessionDir, sessionId);
      if (metadata === null) {
        console.error(
          `Error: ${await explainUnreachableSession(sessionDir, sessionId)}`
        );
        process.exit(1);
      }
      setCurrentSession(sessionDir, sessionId);
      console.log(`Switched to session ${sessionId}`);
      // Switching this pointer also redirects other callers' unqualified
      // commands, so warn rather than doing it silently.
      const owner = getSessionOwner();
      if (!ownsSession(metadata, owner)) {
        console.log(
          `Note: session ${sessionId} is owned by ${describeSessionOwner(metadata)}, not you (${owner}).`
        );
      }
      console.log(
        'Note: the current session is shared state for this session directory. Pass --session <id> instead to avoid affecting other callers.'
      );
    });
}
