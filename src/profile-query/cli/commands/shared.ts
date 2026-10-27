/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Shared option helpers for profiler-cli commands.
 */

import type { Command } from 'commander';
import { Option } from 'commander';
import {
  CliUsageError,
  collectStrings,
} from 'firefox-profiler/profile-query/cli/parse';
import { CALL_TREE_SUMMARY_STRATEGIES } from 'firefox-profiler/profile-logic/profile-data';
import type {
  ClientCommand,
  CallTreeSummaryStrategy,
  CommandResult,
  PermalinkFormat,
} from 'firefox-profiler/profile-query/cli/protocol';

/**
 * Options shared by every command action via `addGlobalOptions`.
 */
export type GlobalOptions = {
  session?: string;
  json?: boolean;
  permalink?: boolean;
  shortPermalink?: boolean;
};

/**
 * Local file access for the commands that read or write files.
 */
export type CommandFileSystem = {
  /** Resolve a path typed by the user against the working directory. */
  resolvePath(path: string): string;
  exists(path: string): boolean;
  /** The platform's path separator. */
  sep: string;
};

/**
 * What the command definitions need from the environment that runs them: the
 * profiler-cli client, which sends commands to the daemon and prints to the
 * terminal, or the web app, which runs them on its own store.
 */
export type CommandContext = {
  /**
   * Run a command, print its formatted result, and return the result.
   */
  run(
    command: ClientCommand,
    opts: GlobalOptions
  ): Promise<string | CommandResult>;
  /** Print a line of extra output. */
  print(text: string): void;
  /** Report the command as failed without aborting it. */
  setFailed(): void;
  /** The arguments as typed, without the program name. */
  args: string[];
  /** Null where there is no file system, which leaves out the file commands. */
  fileSystem: CommandFileSystem | null;
};

/** Which permalink, if any, the global flags ask for. */
export function permalinkFormat(
  opts: GlobalOptions
): PermalinkFormat | undefined {
  if (opts.shortPermalink) {
    return 'short';
  }
  if (opts.permalink) {
    return 'long';
  }
  return undefined;
}

/**
 * Parse a string as an integer and throw a usage error if it is not a valid
 * integer >= min. Pass a custom `msg` to override the default error message.
 */
export function parseIntArg(
  flagName: string,
  value: string,
  min: number,
  msg?: string
): number {
  const v = parseInt(value, 10);
  if (isNaN(v) || v < min) {
    throw new CliUsageError(
      msg ??
        `${flagName} must be a ${min <= 0 ? 'non-negative' : 'positive'} integer`
    );
  }
  return v;
}

/**
 * Parse a string as a float in [min, max] and throw a usage error on failure.
 */
export function parseFloatArg(
  flagName: string,
  value: string,
  min: number,
  max: number = Infinity,
  msg?: string
): number {
  const v = parseFloat(value);
  if (isNaN(v) || v < min || v > max) {
    throw new CliUsageError(
      msg ??
        `${flagName} must be a number between ${min} and ${max === Infinity ? '∞' : max}`
    );
  }
  return v;
}

/**
 * Parse a strategy name and throw a usage error if it is not a valid strategy.
 */
export function parseStrategyArg(
  flagName: string,
  value: string
): CallTreeSummaryStrategy {
  if (!(CALL_TREE_SUMMARY_STRATEGIES as string[]).includes(value)) {
    throw new CliUsageError(
      `${flagName} must be one of: ${CALL_TREE_SUMMARY_STRATEGIES.join(', ')}`
    );
  }
  return value as CallTreeSummaryStrategy;
}

/**
 * As parseStrategyArg, but for the optional --strategy flag.
 */
export function parseOptionalStrategyArg(
  value: string | undefined
): CallTreeSummaryStrategy | undefined {
  return value === undefined
    ? undefined
    : parseStrategyArg('--strategy', value);
}

/**
 * Add the --strategy option to a command.
 */
export function addStrategyOption(cmd: Command): Command {
  return cmd.option(
    '--strategy <name>',
    `Data source to summarize: ${CALL_TREE_SUMMARY_STRATEGIES.join(', ')}. Allocation strategies report bytes instead of samples.`
  );
}

/**
 * Returns true if the given subcommand was explicitly typed by the user.
 * Used to decide whether to print a "other subcommands" hint after a default action.
 *
 * e.g. `profiler-cli filter`       -> wasExplicit(args, 'filter', 'list') === false
 *      `profiler-cli filter list`  -> wasExplicit(args, 'filter', 'list') === true
 */
export function wasExplicit(
  args: string[],
  parent: string,
  subcommand: string
): boolean {
  const idx = args.lastIndexOf(parent);
  return idx !== -1 && args[idx + 1] === subcommand;
}

/**
 * Add the --session option to a command.
 */
export function addSessionOption(cmd: Command): Command {
  return cmd.option(
    '--session <id>',
    'Use a specific session (default: current session)'
  );
}

/**
 * Add --session and --json options to a command.
 */
export function addGlobalOptions(cmd: Command): Command {
  return addSessionOption(cmd)
    .option('--json', 'Output results as JSON')
    .option(
      '--permalink',
      'Also print a profiler.firefox.com URL for the view this command shows'
    )
    .option(
      '--short-permalink',
      'Like --permalink, but shortened through share.firefox.dev'
    );
}

/**
 * Add all ephemeral sample filter options to a command.
 * Used by `thread samples`, `thread samples-top-down`, `thread samples-bottom-up`,
 * `thread functions`, and `filter push`.
 */
export function addSampleFilterOptions(cmd: Command): Command {
  return cmd
    .addOption(
      new Option(
        '--excludes-function <f-N>',
        'Drop samples containing this function'
      )
        .argParser(collectStrings)
        .default([])
    )
    .addOption(
      new Option('--merge <f-N,...>', 'Merge (remove) functions from stacks')
        .argParser(collectStrings)
        .default([])
    )
    .addOption(
      new Option('--root-at <f-N>', 'Re-root stacks at this function')
        .argParser(collectStrings)
        .default([])
    )
    .addOption(
      new Option(
        '--includes-function <f-N,...>',
        'Keep only samples whose stack contains any of these functions'
      )
        .argParser(collectStrings)
        .default([])
    )
    .addOption(
      new Option(
        '--includes-prefix <f-N,...>',
        'Keep only samples whose stack starts with this root-first sequence'
      )
        .argParser(collectStrings)
        .default([])
    )
    .addOption(
      new Option(
        '--includes-suffix <f-N>',
        'Keep only samples whose leaf frame is this function'
      )
        .argParser(collectStrings)
        .default([])
    )
    .option(
      '--during-marker',
      'Keep only samples during matching markers (requires --search)'
    )
    .option(
      '--outside-marker',
      'Keep only samples outside matching markers (requires --search)'
    );
}
