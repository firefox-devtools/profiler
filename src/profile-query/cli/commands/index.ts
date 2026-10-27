/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Command } from 'commander';
import { registerProfileCommand } from './profile';
import { registerThreadCommand } from './thread';
import { registerMarkerCommand } from './marker';
import { registerFunctionCommand } from './function';
import { registerCounterCommand } from './counter';
import { registerStrategyCommand } from './strategy';
import { registerZoomCommand } from './zoom';
import { registerFilterCommand } from './filter';
import { registerSourcemapCommand } from './sourcemap';
import type { CommandContext } from './shared';

export type {
  CommandContext,
  CommandFileSystem,
  GlobalOptions,
} from './shared';
export { permalinkFormat } from './shared';
export { registerStatusCommands } from './status';

/**
 * Register the commands that query the loaded profile, except `status` and
 * `permalink`, which profiler-cli lists next to its session commands (see
 * `registerStatusCommands`). Session management (load, stop, session) stays
 * with the profiler-cli entry point.
 */
export function registerQueryCommands(
  program: Command,
  ctx: CommandContext
): void {
  registerProfileCommand(program, ctx);
  registerThreadCommand(program, ctx);
  registerMarkerCommand(program, ctx);
  registerFunctionCommand(program, ctx);
  registerCounterCommand(program, ctx);
  registerStrategyCommand(program, ctx);
  registerZoomCommand(program, ctx);
  registerFilterCommand(program, ctx);
  registerSourcemapCommand(program, ctx);
}
