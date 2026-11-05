/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Runs profiler-cli (pq) command lines in the page, against the app's own
 * Redux store. Commands that select threads, zoom or push filters change the
 * UI just like the user doing it.
 */

import { Command, CommanderError } from 'commander';
import { ProfileQuerier } from 'firefox-profiler/profile-query';
import {
  registerQueryCommands,
  registerStatusCommands,
  permalinkFormat,
  type CommandContext,
} from 'firefox-profiler/profile-query/cli/commands';
import { executeClientCommand } from 'firefox-profiler/profile-query/cli/execute';
import { formatOutput } from 'firefox-profiler/profile-query/cli/output';
import { permalinkViewForCommand } from 'firefox-profiler/profile-query/cli/permalink-view';
import type { PermalinkOutcome } from 'firefox-profiler/profile-query/cli/protocol';
import type { QuerierStore } from 'firefox-profiler/profile-query/types';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import { getChatConversationId } from 'firefox-profiler/selectors/chat';
import type { GetState } from 'firefox-profiler/types';

export const MAX_COMMAND_OUTPUT_LENGTH = 32 * 1024;

const HELP_WIDTH = 100;

export type CommandLineResult = {
  text: string;
  isError: boolean;
};

/**
 * Split a command line into arguments like a POSIX shell would for the simple
 * cases: whitespace separates arguments, single quotes keep everything
 * literal, double quotes allow backslash escapes, and a backslash outside of
 * quotes escapes the next character. A leading `profiler-cli` or `pq` is
 * dropped.
 */
export function tokenizeCommandLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let hasToken = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
    } else if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === '\\' && i + 1 < line.length) {
        i++;
        current += line[i];
      } else {
        current += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      hasToken = true;
    } else if (char === '\\' && i + 1 < line.length) {
      i++;
      current += line[i];
      hasToken = true;
    } else if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
    } else {
      current += char;
      hasToken = true;
    }
  }

  if (quote !== null) {
    throw new Error(`Unterminated ${quote} quote in: ${line}`);
  }
  if (hasToken) {
    tokens.push(current);
  }
  if (tokens[0] === 'profiler-cli' || tokens[0] === 'pq') {
    tokens.shift();
  }
  return tokens;
}

// Some handles, such as m-N, are handed out as commands run, so they're only
// meaningful for the querier that handed them out. Keep one querier for the
// whole conversation, also when the profile object changes underneath it
// (e.g. when symbolication finishes). Loading another profile starts a new
// conversation, and with it a new querier.
const _queriers: WeakMap<
  GetState,
  { readonly conversationId: number; readonly querier: ProfileQuerier }
> = new WeakMap();

function _getQuerier(store: QuerierStore): ProfileQuerier {
  const state = store.getState();
  const conversationId = getChatConversationId(state);
  const cached = _queriers.get(store.getState);
  if (cached !== undefined && cached.conversationId === conversationId) {
    return cached.querier;
  }
  const querier = new ProfileQuerier(store, getProfileRootRange(state));
  _queriers.set(store.getState, { conversationId, querier });
  return querier;
}

function _truncate(text: string): string {
  if (text.length <= MAX_COMMAND_OUTPUT_LENGTH) {
    return text;
  }
  return (
    text.slice(0, MAX_COMMAND_OUTPUT_LENGTH) +
    `\n\n[Output truncated at ${MAX_COMMAND_OUTPUT_LENGTH} characters. Narrow it down with --limit, --search or a more specific command.]`
  );
}

/**
 * The `status` output for the current view: selected thread, committed ranges
 * and filters.
 */
export async function getCurrentViewStatus(
  store: QuerierStore
): Promise<string> {
  return formatOutput(await _getQuerier(store).getStatus(), false);
}

/**
 * Run one profiler-cli command line, e.g. `thread samples --limit 10`, and
 * return its text output. Usage errors, unknown commands and failing queries
 * come back with `isError: true` instead of throwing.
 */
export async function runProfilerCliCommand(
  store: QuerierStore,
  line: string
): Promise<CommandLineResult> {
  const output: string[] = [];
  let isError = false;

  let tokens;
  try {
    tokens = tokenizeCommandLine(line);
  } catch (error) {
    return { text: `Error: ${error.message}`, isError: true };
  }

  const querier = _getQuerier(store);

  const ctx: CommandContext = {
    async run(command, opts) {
      const result = await executeClientCommand(querier, command, null);
      const format = permalinkFormat(opts);
      let permalink: PermalinkOutcome | undefined;
      if (format !== undefined) {
        try {
          permalink = await querier.permalink(
            permalinkViewForCommand(command),
            format === 'short'
          );
        } catch (error) {
          permalink = { error: error.message };
        }
      }
      output.push(formatOutput(result, opts.json ?? false, permalink));
      return result;
    },
    print(text) {
      output.push(text);
    },
    setFailed() {
      isError = true;
    },
    args: tokens,
    fileSystem: null,
  };

  // Commander keeps parse state on the Command objects, so build a fresh
  // program for every command line. The overrides have to be set before the
  // subcommands are created, because subcommands copy them.
  const program = new Command();
  program
    .name('profiler-cli')
    .exitOverride()
    .configureOutput({
      writeOut: (str) => output.push(str.trimEnd()),
      writeErr: (str) => output.push(str.trimEnd()),
      getOutHelpWidth: () => HELP_WIDTH,
      getErrHelpWidth: () => HELP_WIDTH,
    })
    .helpOption('-h, --help', 'Show help')
    .helpCommand('help [command]', 'Show help for a command');
  registerStatusCommands(program, ctx);
  registerQueryCommands(program, ctx);

  if (tokens.length === 0) {
    program.outputHelp();
    return { text: _truncate(output.join('\n')), isError: true };
  }

  try {
    await program.parseAsync(tokens, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      // Help output goes through the same exception path as usage errors.
      if (
        error.code !== 'commander.helpDisplayed' &&
        error.code !== 'commander.help' &&
        error.code !== 'commander.version'
      ) {
        isError = true;
      }
    } else {
      isError = true;
      output.push(`Error: ${error.message}`);
    }
  }

  return { text: _truncate(output.join('\n')), isError };
}
