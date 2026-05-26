/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * CLI entry point for profiler-cli (Profiler CLI).
 *
 * Usage:
 *   profiler-cli load <PATH> [--session <id>]          Start a new daemon and load a profile
 *   profiler-cli profile info [--session <id>]         Print profile summary
 *   profiler-cli thread info [--thread <handle>]       Print thread information
 *   profiler-cli thread samples [--thread <handle>]    Show thread call tree and top functions
 *   profiler-cli stop [<id>] [--all]                   Stop the daemon
 *   profiler-cli session list                          List all running sessions
 *   profiler-cli session use <id>                      Switch the current session
 *
 * Build:
 *   yarn build-profiler-cli
 *
 * Run:
 *   profiler-cli <command>                              (if profiler-cli is in PATH)
 *   ./profiler-cli/dist/profiler-cli.js <command>  (direct invocation)
 */

import * as path from 'path';
import * as os from 'os';
import { Command } from 'commander';
import guideText from '../guide.txt';
import schemasText from '../schemas.txt';
import { startDaemon } from './daemon';
import { startNewDaemon, stopDaemon, sendCommand } from './client';
import { listSessions } from './session';
import { formatOutput } from './output';
import { addGlobalOptions } from './commands/shared';
import { VERSION } from './constants';
import { registerProfileCommand } from './commands/profile';
import { registerThreadCommand } from './commands/thread';
import { registerMarkerCommand } from './commands/marker';
import { registerFunctionCommand } from './commands/function';
import { registerZoomCommand } from './commands/zoom';
import { registerFilterCommand } from './commands/filter';
import { registerSessionCommand } from './commands/session';

// Read session directory from environment (only place this is read)
const SESSION_DIR =
  process.env.PROFILER_CLI_SESSION_DIR ||
  path.join(os.homedir(), '.profiler-cli');

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
    const symbolServerIdx = rawArgs.indexOf('--symbol-server');
    const symbolServerUrl =
      symbolServerIdx !== -1 ? rawArgs[symbolServerIdx + 1] : undefined;
    if (!profilePath) {
      console.error('Error: Profile path required for daemon mode');
      process.exit(1);
    }
    await startDaemon(SESSION_DIR, profilePath, sessionId, symbolServerUrl);
    return;
  }

  const program = new Command();
  program
    .name('profiler-cli')
    .description('Profiler CLI — query Firefox profiles from the terminal')
    .version(VERSION, '-V, --version', 'Print the version number')
    .helpOption('-h, --help', 'Show help')
    .addHelpCommand('help [command]', 'Show help for a command')
    .addHelpText(
      'after',
      `
Examples:
  profiler-cli load profile.json.gz
  profiler-cli profile info
  profiler-cli thread info
  profiler-cli thread samples
  profiler-cli thread functions --search GC --min-self 1
  profiler-cli thread markers --search DOMEvent --category Graphics
  profiler-cli zoom push 2.7,3.1
  profiler-cli filter push --excludes-function f-184
  profiler-cli status
  profiler-cli stop --all`
    );

  // Unknown commands
  program.on('command:*', (operands: string[]) => {
    console.error(`Error: Unknown command '${operands[0]}'\n`);
    program.outputHelp();
    process.exit(1);
  });

  // profiler-cli load <path>
  addGlobalOptions(
    program
      .command('load <path>')
      .description('Load a profile and start a daemon session')
      .option(
        '--symbol-server <url>',
        'Symbol server URL for symbolication (overrides URL param and default Mozilla server)'
      )
  ).action(async (profilePath: string, opts) => {
    console.log(`Loading profile from ${profilePath}...`);
    const sessionId = await startNewDaemon(
      SESSION_DIR,
      profilePath,
      opts.session,
      opts.symbolServer
    );
    console.log(`Session started: ${sessionId}`);
    const status = await sendCommand(
      SESSION_DIR,
      { command: 'status' },
      sessionId
    );
    console.log(formatOutput(status, opts.json ?? false));
  });

  // profiler-cli status
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

  // profiler-cli stop [id]
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

  // profiler-cli guide
  program
    .command('guide')
    .description('Show detailed usage guide (commands, patterns, tips)')
    .action(() => {
      console.log(guideText);
    });

  // profiler-cli schemas
  program
    .command('schemas')
    .description('Show JSON output schemas for all commands')
    .action(() => {
      console.log(schemasText);
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
