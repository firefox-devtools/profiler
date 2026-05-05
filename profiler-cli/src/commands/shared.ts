/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Shared option helpers for profiler-cli commands.
 */

import type { Command } from 'commander';
import { Option } from 'commander';
import { collectStrings } from '../utils/parse';

/**
 * Parse a string as an integer and exit with an error if it is not a valid
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
    console.error(
      msg ??
        `Error: ${flagName} must be a ${min <= 0 ? 'non-negative' : 'positive'} integer`
    );
    process.exit(1);
  }
  return v;
}

/**
 * Parse a string as a float in [min, max] and exit with an error on failure.
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
    console.error(
      msg ??
        `Error: ${flagName} must be a number between ${min} and ${max === Infinity ? '∞' : max}`
    );
    process.exit(1);
  }
  return v;
}

/**
 * Returns true if the given subcommand was explicitly typed by the user.
 * Used to decide whether to print a "other subcommands" hint after a default action.
 *
 * e.g. `profiler-cli session`       -> wasExplicit('session', 'list') === false
 *      `profiler-cli session list`  -> wasExplicit('session', 'list') === true
 */
export function wasExplicit(parent: string, subcommand: string): boolean {
  const args = process.argv;
  const idx = args.lastIndexOf(parent);
  return idx !== -1 && args[idx + 1] === subcommand;
}

/**
 * Add --session and --json options to a command.
 */
export function addGlobalOptions(cmd: Command): Command {
  return cmd
    .option(
      '--session <id>',
      'Use a specific session (default: current session)'
    )
    .option('--json', 'Output results as JSON');
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
