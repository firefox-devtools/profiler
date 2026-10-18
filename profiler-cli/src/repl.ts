/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Interactive mode (`profiler-cli -i`): a prompt that runs one profiler-cli
 * command per line, so a human does not have to type "profiler-cli" each time.
 *
 * Each line is parsed by a fresh commander program, exactly as if it had been
 * passed on the command line.
 */

import * as readline from 'readline';
import { CommanderError } from 'commander';

/**
 * State shared between the prompt and the command actions.
 */
export type ReplState = {
  // The session that commands use when no --session is given. It is pinned
  // so that a "load" in another terminal does not redirect this prompt.
  sessionId: string | undefined;
  // Sessions started from this prompt. They are stopped when the prompt exits.
  ownedSessionIds: Set<string>;
};

/**
 * Split a line into arguments like a POSIX shell does, without expansions.
 * Supports single quotes, double quotes, and backslash escapes.
 * Throws on an unterminated quote or a trailing backslash.
 */
export function splitCommandLine(line: string): string[] {
  const args: string[] = [];
  let current = '';
  // Distinguishes an empty quoted argument ('') from no argument.
  let inArg = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      if (inArg) {
        args.push(current);
        current = '';
        inArg = false;
      }
      i++;
    } else if (ch === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) {
        throw new Error('Unterminated single quote');
      }
      current += line.slice(i + 1, end);
      inArg = true;
      i = end + 1;
    } else if (ch === '"') {
      inArg = true;
      i++;
      while (true) {
        if (i >= line.length) {
          throw new Error('Unterminated double quote');
        }
        const c = line[i];
        if (c === '"') {
          i++;
          break;
        }
        // Inside double quotes, backslash only escapes these characters.
        if (
          c === '\\' &&
          i + 1 < line.length &&
          '"\\$`'.includes(line[i + 1])
        ) {
          current += line[i + 1];
          i += 2;
        } else {
          current += c;
          i++;
        }
      }
    } else if (ch === '\\') {
      if (i + 1 >= line.length) {
        throw new Error('Trailing backslash');
      }
      current += line[i + 1];
      inArg = true;
      i += 2;
    } else {
      current += ch;
      inArg = true;
      i++;
    }
  }
  if (inArg) {
    args.push(current);
  }
  return args;
}

/**
 * Start the interactive prompt. If `initialArgs` is not empty, run it as the
 * first command. Returns when the user exits the prompt.
 *
 * `runArgs` must not call process.exit(). For commander, this means that the
 * program has to be created with exitOverride().
 */
export async function runRepl(
  state: ReplState,
  initialArgs: string[],
  runArgs: (args: string[]) => Promise<void>,
  stopSession: (sessionId: string) => Promise<void>
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
    historySize: 1000,
  });
  // Create the iterator now so that it buffers lines typed while the initial
  // command runs.
  const lines = rl[Symbol.asyncIterator]();
  let closed = false;
  rl.on('close', () => {
    closed = true;
  });
  const prompt = () => {
    if (!closed) {
      rl.prompt();
    }
  };

  let busy = false;
  let interruptedWhileBusy = false;
  rl.on('SIGINT', () => {
    if (busy) {
      if (interruptedWhileBusy) {
        // The command cannot be cancelled, so a second Ctrl-C quits.
        process.stdout.write('\n');
        process.exit(130);
      }
      interruptedWhileBusy = true;
      process.stdout.write(
        '\n(The command is still running. Press Ctrl-C again to quit.)\n'
      );
      return;
    }
    // Like a shell: discard the current line and show a fresh prompt.
    const hadInput = rl.line.length !== 0;
    rl.write(null, { ctrl: true, name: 'e' });
    rl.write(null, { ctrl: true, name: 'u' });
    process.stdout.write('\n');
    if (!hadInput) {
      console.log('(To exit, press Ctrl-D or type "exit".)');
    }
    rl.prompt();
  });

  // Errors are printed, never thrown, so the prompt keeps going.
  const run = async (args: string[]) => {
    busy = true;
    interruptedWhileBusy = false;
    try {
      await runArgs(args);
    } catch (error) {
      // Commander has already printed its own errors and the help text.
      if (!(error instanceof CommanderError)) {
        console.error(
          `Error: ${error instanceof Error ? error.message : error}`
        );
      }
    } finally {
      busy = false;
      // Some commands set a failing exit code after printing their output.
      // It must not become the exit code of the prompt.
      process.exitCode = undefined;
    }
  };

  let reachedEof = true;
  try {
    if (initialArgs.length !== 0) {
      await run(initialArgs);
    }
    if (process.stdin.isTTY) {
      console.log(
        'Type a profiler-cli command without "profiler-cli", "help" for a list of commands, or "exit" to quit.'
      );
    }
    prompt();
    for await (const line of lines) {
      let args;
      try {
        args = splitCommandLine(line);
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        prompt();
        continue;
      }
      if (args.length === 1 && (args[0] === 'exit' || args[0] === 'quit')) {
        reachedEof = false;
        break;
      }
      if (args.length !== 0) {
        await run(args);
      }
      prompt();
    }
  } finally {
    rl.close();
    // Leave the prompt on its own line when the user pressed Ctrl-D.
    if (reachedEof && process.stdin.isTTY) {
      process.stdout.write('\n');
    }
    for (const sessionId of state.ownedSessionIds) {
      try {
        await stopSession(sessionId);
      } catch (error) {
        console.error(
          `Error: Could not stop session ${sessionId}: ${error instanceof Error ? error.message : error}`
        );
      }
    }
  }
}
