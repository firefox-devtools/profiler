/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Prints the code of the function at a position in a JS file, the same way
 * that the benchmark comparison shows it under a bucket's flame graphs.
 *
 *   node node-tools-dist/extract-function-source.js app.js:17:4406
 *   node node-tools-dist/extract-function-source.js --format never app.js 17 4406
 *
 * Line and column are 1-based. --format is one of always, never or auto
 * (default: auto, which pretty-prints the code if it looks minified).
 */

import fs from 'fs';
import minimist from 'minimist';
import { extractFunctionSource } from '../profile-logic/js-format/function-source';
import type { FunctionFormatMode } from '../profile-logic/js-format/function-source';
import { getFormatDialectForPath } from '../profile-logic/js-format/dialect';

const FORMAT_MODES: FunctionFormatMode[] = ['always', 'never', 'auto'];

function usage(message: string): never {
  console.error(message);
  console.error(
    'Usage: extract-function-source [--format always|never|auto] <file>:<line>:<column>\n' +
      '       extract-function-source [--format always|never|auto] <file> <line> <column>'
  );
  process.exit(1);
}

function parsePosition(args: string[]): {
  path: string;
  line: number;
  column: number;
} {
  let parts;
  if (args.length === 1) {
    const match = /^(.*):(\d+):(\d+)$/.exec(args[0]);
    if (match === null) {
      usage(`Expected <file>:<line>:<column>, got ${args[0]}`);
    }
    parts = match.slice(1);
  } else if (args.length === 3) {
    parts = args;
  } else {
    usage('Expected a file, a line and a column.');
  }
  const [path, lineString, columnString] = parts;
  const line = Number(lineString);
  const column = Number(columnString);
  if (!Number.isInteger(line) || !Number.isInteger(column)) {
    usage('The line and the column must be integers.');
  }
  return { path, line, column };
}

function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['format'],
    default: { format: 'auto' },
  });
  const format = argv.format as FunctionFormatMode;
  if (!FORMAT_MODES.includes(format)) {
    usage(`Unknown format mode: ${argv.format}`);
  }
  const { path, line, column } = parsePosition(argv._.map(String));
  const dialect = getFormatDialectForPath(path);
  if (dialect === null) {
    usage(`${path} isn't a JS file.`);
  }

  const code = fs.readFileSync(path, 'utf8');
  const functionSource = extractFunctionSource({
    code,
    dialect,
    line,
    column,
    format,
  });
  if (functionSource === null) {
    console.error(`There's no function at ${path}:${line}:${column}.`);
    process.exit(1);
  }

  const { lines, firstLine } = functionSource;
  if (firstLine === null) {
    console.log(lines.join('\n'));
    return;
  }
  const lastLine = firstLine + lines.length - 1;
  const width = String(lastLine).length;
  for (let i = 0; i < lines.length; i++) {
    console.log(`${String(firstLine + i).padStart(width)}  ${lines[i]}`);
  }
}

main();
