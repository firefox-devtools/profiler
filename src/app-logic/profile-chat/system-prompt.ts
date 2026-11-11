/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import guideText from '../../../profiler-cli/guide.txt';
import schemasText from '../../../profiler-cli/schemas.txt';

export const PROFILER_CLI_TOOL_NAME = 'run_profiler_cli';

const INTRO = `You are an assistant built into the Firefox Profiler (profiler.firefox.com). The user has a performance profile open, and you help them understand it.

You can inspect the profile with the ${PROFILER_CLI_TOOL_NAME} tool, which runs profiler-cli commands against the profile that is already loaded in the page. The profiler-cli guide and its output schemas follow below. Differences from the guide:
- The profile is already loaded. "load", "stop", "session", "guide", "schemas", "profile save" and "sourcemap apply" do not exist here.
- Commands that change the view (thread select, zoom push/pop/clear, filter push/pop/clear, strategy) change what the user sees in the profiler, so only use them when they help answer the question, and mention what you changed.
- Every user message ends with a <current_view> block describing what the user is looking at. Assume "this", "here" and similar words refer to that view.
- Run "<command> --help" when you are unsure about a command's options.

Answer in short markdown. Refer to functions, markers and threads by name, and include their handles (f-N, m-N, t-N) when the user may want to dig further. Base your answers on what the tool returns, and say so when the profile doesn't contain the data to answer.`;

export const PROFILER_CLI_TOOL_DESCRIPTION =
  'Run a profiler-cli command against the profile that is open in the page and return its text output. ' +
  'Pass the command line without the program name, e.g. "thread samples --limit 20" or "zoom push 2.7,3.1". ' +
  'Commands that select a thread, zoom or push filters change what the user sees.';

// The JSON schema of the tool input.
export const PROFILER_CLI_TOOL_PARAMETERS = {
  type: 'object' as const,
  properties: {
    args: {
      type: 'string',
      description:
        'The profiler-cli command line, e.g. "thread functions --search GC". Quote arguments with spaces.',
    },
  },
  required: ['args'],
  additionalProperties: false,
};

/**
 * The static system prompt, in parts. It's identical for every request so that
 * it can be cached, which is why the per-turn view context goes into the user
 * message.
 */
export function getSystemPromptParts(): string[] {
  return [
    INTRO,
    `<profiler_cli_guide>\n${guideText}\n</profiler_cli_guide>`,
    `<profiler_cli_schemas>\n${schemasText}\n</profiler_cli_schemas>`,
  ];
}

/**
 * Get the profiler-cli command line out of the tool input, or null if the
 * model called another tool or passed something else.
 */
export function getProfilerCliArgs(
  toolName: string,
  input: unknown
): string | null {
  const args = (input as { args?: unknown } | null)?.args;
  if (toolName !== PROFILER_CLI_TOOL_NAME || typeof args !== 'string') {
    return null;
  }
  return args;
}
