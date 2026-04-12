/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * CLI entry point for pq (Profile Querier).
 *
 * Usage:
 *   pq load <PATH> [--session <id>]          Start a new daemon and load a profile
 *   pq profile info [--session <id>]         Print profile summary
 *   pq thread info [--thread <handle>]       Print thread information
 *   pq thread samples [--thread <handle>]    Show thread call tree and top functions
 *   pq stop [<id>] [--all]                   Stop the daemon
 *   pq session list                          List all running sessions
 *   pq session use <id>                      Switch the current session
 *
 * Build:
 *   yarn build-profile-query-cli
 *
 * Run:
 *   pq <command>                    (if pq is in PATH)
 *   ./profile-query-cli/dist/pq.js <command>  (direct invocation)
 */

import * as path from 'path';
import * as os from 'os';
import { Command } from 'commander';
import guideText from '../guide.txt';
import { startDaemon } from './daemon';
import { startNewDaemon, stopDaemon, sendCommand } from './client';
import { listSessions } from './session';
import { formatOutput } from './output';
import { addGlobalOptions } from './commands/shared';
import { registerProfileCommand } from './commands/profile';
import { registerThreadCommand } from './commands/thread';
import { registerMarkerCommand } from './commands/marker';
import { registerFunctionCommand } from './commands/function';
import { registerZoomCommand } from './commands/zoom';
import { registerFilterCommand } from './commands/filter';
import { registerSessionCommand } from './commands/session';

// Read session directory from environment (only place this is read)
const SESSION_DIR =
  process.env.PQ_SESSION_DIR || path.join(os.homedir(), '.pq');

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  // Daemon escape hatch: spawned internally by startNewDaemon(), never shown in --help
  if (rawArgs.includes('--daemon')) {
    const daemonIdx = rawArgs.indexOf('--daemon');
    const profilePath = rawArgs.find(
      (a, i) => i > daemonIdx && !a.startsWith('-')
    );
    const sessionIdx = rawArgs.indexOf('--session');
    const sessionId = sessionIdx !== -1 ? rawArgs[sessionIdx + 1] : undefined;
    if (!profilePath) {
      console.error('Error: Profile path required for daemon mode');
      process.exit(1);
    }
    await startDaemon(SESSION_DIR, profilePath, sessionId);
    return;
  }

  const program = new Command();
  program
    .name('pq')
    .description('Profile Querier — query Firefox profiles from the terminal')
    .helpOption('-h, --help', 'Show help')
    .addHelpCommand('help [command]', 'Show help for a command')
    .addHelpText(
      'after',
      `
Examples:
  pq load profile.json.gz
  pq profile info
  pq thread info
  pq thread samples
  pq thread functions --search GC --min-self 1
  pq thread markers --search DOMEvent --category Graphics
  pq zoom push 2.7,3.1
  pq filter push --excludes-function f-184
  pq status
  pq stop --all`
    );

  // Bare `pq` with no arguments
  program.action(() => {
    console.error('Error: No command specified\n');
    program.outputHelp();
    process.exit(1);
  });

  // pq load <path>
  addGlobalOptions(
    program
      .command('load <path>')
      .description('Load a profile and start a daemon session')
  ).action(async (profilePath: string, opts) => {
    console.log(`Loading profile from ${profilePath}...`);
    const sessionId = await startNewDaemon(
      SESSION_DIR,
      profilePath,
      opts.session
    );
    console.log(`Session started: ${sessionId}`);
  });

  // pq status
  addGlobalOptions(
    program
      .command('status')
      .description(
        'Show session status (selected thread, zoom ranges, filters)'
      )
  ).action(async (opts) => {
    const result = await sendCommand(
      SESSION_DIR,
      { command: 'status' },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // pq stop [id]
  addGlobalOptions(
    program
      .command('stop [id]')
      .description(
        'Stop the current session, a specific session, or all with --all'
      )
      .option('--all', 'Stop all running sessions')
  ).action(async (idArg: string | undefined, opts) => {
    if (opts.all) {
      const sessionIds = listSessions(SESSION_DIR);
      await Promise.all(
        sessionIds.map((id: string) => stopDaemon(SESSION_DIR, id))
      );
    } else {
      const sessionId = idArg ?? opts.session;
      await stopDaemon(SESSION_DIR, sessionId);
    }
  });

  // pq guide
  program
    .command('guide')
    .description('Show detailed usage guide (commands, patterns, tips)')
    .action(() => {
      console.log(guideText);
    });

  registerProfileCommand(program, SESSION_DIR);
  registerThreadCommand(program, SESSION_DIR);
  registerMarkerCommand(program, SESSION_DIR);
  registerFunctionCommand(program, SESSION_DIR);
  registerZoomCommand(program, SESSION_DIR);
  registerFilterCommand(program, SESSION_DIR);
  registerSessionCommand(program, SESSION_DIR);

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});
