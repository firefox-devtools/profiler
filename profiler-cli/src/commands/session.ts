/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli session` command.
 */

import type { Command } from 'commander';
import { wasExplicit } from './shared';
import {
  cleanupSession,
  getCurrentSessionId,
  listSessions,
  setCurrentSession,
  validateSession,
} from '../session';

export function registerSessionCommand(
  program: Command,
  sessionDir: string
): void {
  const session = program
    .command('session')
    .description('Manage daemon sessions');

  session
    .command('list', { isDefault: true })
    .description('List all running daemon sessions')
    .action(async () => {
      const sessionIds = listSessions(sessionDir);
      let numCleaned = 0;
      const runningSessionMetadata = [];

      for (const sessionId of sessionIds) {
        const metadata = await validateSession(sessionDir, sessionId);
        if (metadata === null) {
          cleanupSession(sessionDir, sessionId);
          numCleaned++;
          continue;
        }
        runningSessionMetadata.push(metadata);
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
      console.log(`Found ${runningSessionMetadata.length} running sessions:`);
      for (const metadata of runningSessionMetadata) {
        const isCurrent = metadata.id === currentSessionId;
        const marker = isCurrent ? '* ' : '  ';
        console.log(
          `${marker}${metadata.id}, created at ${metadata.createdAt} [daemon pid: ${metadata.pid}]`
        );
      }

      if (!wasExplicit('session', 'list')) {
        console.log('\nOther subcommands: profiler-cli session use <id>');
      }
    });

  session
    .command('use <id>')
    .description('Switch the current session')
    .action(async (sessionId: string) => {
      const metadata = await validateSession(sessionDir, sessionId);
      if (metadata === null) {
        console.error(`Error: session "${sessionId}" not found or not running`);
        process.exit(1);
      }
      setCurrentSession(sessionDir, sessionId);
      console.log(`Switched to session ${sessionId}`);
    });
}
