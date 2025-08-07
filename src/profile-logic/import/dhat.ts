/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Profile,
  Pid,
  Bytes,
  IndexIntoFuncTable,
  IndexIntoStackTable,
} from 'firefox-profiler/types';

import {
  getEmptyProfile,
  getEmptyThread,
  getEmptyUnbalancedNativeAllocationsTable,
} from 'firefox-profiler/profile-logic/data-structures';

import { StringTable } from 'firefox-profiler/utils/string-table';
import { coerce, ensureExists } from 'firefox-profiler/utils/flow';

/**
 * DHAT is a heap memory analysis tool in valgrind. It's also available as rust component.
 * https://github.com/nnethercote/dhat-rs
 *
 * The format is defined in:
 *
 * git clone git://sourceware.org/git/valgrind.git
 * dhat/dh_main.c
 */
type DhatJson = $ReadOnly<{
  // Version number of the format. Incremented on each
  // backwards-incompatible change. A mandatory integer.
  dhatFileVersion: 2;

  // The invocation mode. A mandatory, free-form string.
  mode: 'heap';

  // The verb used before above stack frames, i.e. "<verb> at {". A
  // mandatory string.
  verb: 'Allocated';

  // Are block lifetimes recorded? Affects whether some other fields are
  // present. A mandatory boolean.
  bklt: boolean;

  // Are block accesses recorded? Affects whether some other fields are
  // present. A mandatory boolean.
  bkacc: boolean;

  // Byte/bytes/blocks-position units. Optional strings. "byte", "bytes",
  // and "blocks" are the values used if these fields are omitted.
  bu: 'byte';
  bsu: 'bytes';
  bksu: 'blocks';

  // Time units (individual and 1,000,000x). Mandatory strings.
  tu: 'instrs';
  Mtu: 'Minstr';

  // The "short-lived" time threshold, measures in "tu"s.
  // - bklt=true: a mandatory integer.
  // - bklt=false: omitted.
  tuth: 500;

  // The executed command. A mandatory string.
  cmd: string;

  // The process ID. A mandatory integer.
  pid: Pid;

  // The time at the end of execution (t-end). A mandatory integer.
  te: InstructionCounts;

  // The time of the global max (t-gmax).
  // - bklt=true: a mandatory integer.
  // - bklt=false: omitted.
  tg: InstructionCounts;

  // The program points. A mandatory array.
  pps: ProgramPoint[];

  // Frame table. A mandatory array of strings.
  // e.g.
  //  [
  //   '[root]',
  //   '0x4AA1D9F: _nl_normalize_codeset (l10nflist.c:332)',
  //   '0x4A9B414: _nl_load_locale_from_archive (loadarchive.c:173)',
  //   '0x4A9A2BE: _nl_find_locale (findlocale.c:153)'
  // ],
  ftbl: string[];
}>;

type ProgramPoint = $ReadOnly<{
  // Total bytes and blocks. Mandatory integers.
  tb: Bytes;
  tbk: Blocks;

  // Total lifetimes of all blocks allocated at this PP.
  // - bklt=true: a mandatory integer.
  // - bklt=false: omitted.
  tl: InstructionCounts;

  // The maximum bytes and blocks for this PP.
  // - bklt=true: mandatory integers.
  // - bklt=false: omitted.
  mb: Bytes;
  mbk: Blocks;

  // The bytes and blocks at t-gmax for this PP.
  // - bklt=true: mandatory integers.
  // - bklt=false: omitted.
  gb: Bytes;
  gbk: Blocks;

  // The bytes and blocks at t-end for this PP.
  // - bklt=true: mandatory integers.
  // - bklt=false: omitted.
  eb: Bytes;
  ebk: Blocks;

  // The reads and writes of blocks for this PP.
  // - bkacc=true: mandatory integers.
  // - bkacc=false: omitted.
  rb: ReadCount;
  wb: WriteCount;

  // The exact accesses of blocks for this PP. Only used when all
  // allocations are the same size and sufficiently small. A negative
  // element indicates run-length encoding of the following integer.
  // E.g. `-3, 4` means "three 4s in a row".
  // - bkacc=true: an optional array of integers.
  // - bkacc=false: omitted.
  //
  // e.g. [5, -3, 4, 2]
  acc: number[];

  // Frames. Each element is an index into the "ftbl" array above.
  // The array is ordered from leaf to root.
  // - All modes: A mandatory array of integers.
  fs: IndexIntoDhatFrames[];
}>;

// All units of time are in instruction counts.
// Per: https://valgrind.org/docs/manual/dh-manual.html
//   As with the Massif heap profiler, DHAT measures program progress by counting
//   instructions, and so presents all age/time related figures as instruction counts.
//   This sounds a little odd at first, but it makes runs repeatable in a way which
//   is not possible if CPU time is used.
type InstructionCounts = number;
type Blocks = number;
type IndexIntoDhatFrames = number;
type ReadCount = number;
type WriteCount = number;

/**
 * The dhat convertor converts to the processed profile format, rather than to the Gecko
 * format, as it needs the UnbalancedNativeAllocationsTable type, which is unavailable
 * in the Gecko format. In the Gecko format, that data comes in the form of markers, which
 * would be awkard to target.
 */
export function attemptToConvertDhat(json: unknown): Profile | null {
  if (!json || typeof json !== 'object') {
    return null;
  }

  if (
    !('dhatFileVersion' in json) ||
    typeof json.dhatFileVersion !== 'number'
  ) {
    // This is not a dhat file.
    return null;
  }

  const { dhatFileVersion } = json;
  if (dhatFileVersion !== 2) {
    throw new Error(
      `This importer only supports dhat version 2. The file provided was version ${dhatFileVersion}.`
    );
  }
  const dhat = coerce<mixed, DhatJson>(json);

  const profile = getEmptyProfile();
  profile.meta.product = dhat.cmd + ' (dhat)';
  profile.meta.importedFrom = `dhat`;
  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);

  const allocationsTable = getEmptyUnbalancedNativeAllocationsTable();
  const { funcTable, stackTable, frameTable } = getEmptyThread();

  const funcKeyToFuncIndex = new Map<string, IndexIntoFuncTable>();

  // dhat profiles do no support categories. Fill the category and subcategory information
  // with 0s.
  const otherCategory = 0;
  const otherSubCategory = 0;

  // Insert a root function that is the command that was run.
  funcTable.name.push(stringTable.indexForString(dhat.cmd));
  funcTable.isJS.push(false);
  funcTable.relevantForJS.push(false);
  funcTable.resource.push(-1);
  funcTable.fileName.push(null);
  funcTable.lineNumber.push(null);
  funcTable.columnNumber.push(null);
  const rootFuncIndex = funcTable.length++;

  frameTable.address.push(-1);
  frameTable.line.push(null);
  frameTable.column.push(null);
  frameTable.category.push(otherCategory);
  frameTable.subcategory.push(otherSubCategory);
  frameTable.innerWindowID.push(null);
  frameTable.nativeSymbol.push(null);
  frameTable.inlineDepth.push(0);
  frameTable.func.push(rootFuncIndex);
  const rootFrameIndex = frameTable.length++;

  stackTable.frame.push(rootFrameIndex);
  stackTable.prefix.push(null);
  const rootStackIndex = stackTable.length++;

  // Convert the frame table.
  for (let funcName of dhat.ftbl) {
    let fileName = dhat.cmd;
    let address = -1;
    let line = null;
    let column = null;

    const result = funcName.match(
      /^0x([0-9a-f]+): (.+) \((?:in )?(.+?)(?::(\d+))?(?::(\d+))?\)$/i
    );
    // ^0x([0-9a-f]+): (.+) \((?:in )?(.+?)(?::(\d+))?(?::(\d+))?\)$ Regex
    //    (1        )  (2 )           (3  )    (4  )      (5  )        Capture groups
    // ^                                                           $   Start to end
    //               :      \(                                   \)    Some raw characters
    //    ([0-9a-f]+)                                                  Match the address, e.g. 10250148c
    //                 (.+)                                            Match the function name
    //                        (?:in )?                                 There can be an optional "in "
    //                                (.+?)                            Match the filename
    //                                     (?:      )?                 Optionally include the line
    //                                         (\d+)                   Match the line number
    //                                                (?:      )?      Optionally include the column
    //                                                    (\d+)        Match the column number

    // Example input: "0x10250148c: alloc::vec::Vec<T,A>::append_elements (vec.rs:1469:9)"
    // Capture groups:   111111111  2222222222222222222222222222222222222  333333 4444 5

    // Example input: "0x484DE30: memalign (in /usr/libexec/valgrind/vgpreload_dhat-amd64-linux.so)"
    // Capture groups:   1111111  22222222     333333333333333333333333333333333333333333333333333

    // Example input: "0x58E297: marian::io::binary::loadItems(void const*) (binary.cpp:74)"
    // Capture groups:   111111  222222222222222222222222222222222222222222  3333333333 44
    if (result) {
      address = parseInt(result[1], 16);
      funcName = result[2];
      fileName = result[3];
      line = result[4] ? Number(result[4]) : null;
      column = result[5] ? Number(result[5]) : null;
    }
    // If the above regex doesn't match, just use the raw funcName, without additional
    // information.

    const funcKey = `${funcName} ${fileName}`;

    let funcIndex = funcKeyToFuncIndex.get(funcKey);
    if (funcIndex === undefined) {
      funcTable.name.push(stringTable.indexForString(funcName));
      funcTable.isJS.push(false);
      funcTable.relevantForJS.push(false);
      funcTable.resource.push(-1);
      funcTable.fileName.push(stringTable.indexForString(fileName));
      funcTable.lineNumber.push(line);
      funcTable.columnNumber.push(column);
      funcIndex = funcTable.length++;
      funcKeyToFuncIndex.set(funcKey, funcIndex);
    }

    frameTable.address.push(address);
    frameTable.line.push(line);
    frameTable.column.push(column);
    frameTable.category.push(otherCategory);
    frameTable.subcategory.push(otherSubCategory);
    frameTable.innerWindowID.push(null);
    frameTable.nativeSymbol.push(null);
    frameTable.inlineDepth.push(0);
    frameTable.func.push(funcIndex);
    frameTable.length++;
  }

  const totalBytes: Bytes[] = [];
  const maximumBytes: Bytes[] = [];
  const bytesAtGmax: Bytes[] = [];
  const endBytes: Bytes[] = [];

  // Maps prefixes to their descendents (more specific prefixes).
  const postfix: Map<IndexIntoStackTable | null, IndexIntoStackTable[]> =
    new Map();

  for (const pp of dhat.pps) {
    let stackIndex = 0;
    let prefix = rootStackIndex;

    // Go from root to tip on the backtrace.
    for (let i = pp.fs.length - 1; i >= 0; i--) {
      // The dhat frame indexes matches match the processed profile indexes, but are
      // offset by 1 to add a root function.
      const frameIndex = pp.fs[i] + 1;
      const funcIndex = ensureExists(
        frameTable.func[frameIndex],
        'Expected to find a funcIndex from a frameIndex'
      );

      // We want this to be the fallback, so that a stack index gets created when the 'if' below fails,
      // or when we don't find a matching frame inside that loop.
      stackIndex = stackTable.length;

      // List of possible stack indexes to look for.
      const candidateStackTables = postfix.get(prefix);
      if (candidateStackTables) {
        // Start searching for a stack index.
        for (const sliceStackIndex of candidateStackTables) {
          const nextFrameIndex = stackTable.frame[sliceStackIndex];
          // No need to look for the prefix, since candidateStackTables already takes that into account.
          if (frameTable.func[nextFrameIndex] === funcIndex) {
            stackIndex = sliceStackIndex;
            break;
          }
        }
      }

      if (stackIndex === stackTable.length) {
        // No stack index was found, add on a new one.
        stackTable.frame.push(frameIndex);
        stackTable.prefix.push(prefix);

        if (candidateStackTables) {
          // Append us to the list of possible stack indexes of our parent.
          candidateStackTables.push(stackIndex);
        } else {
          // We are the first descendents of our parent.
          postfix.set(prefix, [stackIndex]);
        }

        // The stack index already points to this spot.
        stackTable.length++;
      }

      prefix = stackIndex;
    }

    // Skip pushing onto the allocation weights, as each byte type will be added
    // as a separate thread.
    totalBytes.push(pp.tb);
    maximumBytes.push(pp.mb);
    bytesAtGmax.push(pp.gb);
    endBytes.push(pp.eb);

    allocationsTable.time.push(0);
    allocationsTable.stack.push(stackIndex);
    allocationsTable.length++;
  }

  profile.threads = [
    { name: 'Total Bytes', weight: totalBytes },
    { name: 'Maximum Bytes', weight: maximumBytes },
    { name: 'Bytes at Global Max', weight: bytesAtGmax },
    { name: 'Bytes at End', weight: endBytes },
  ].map(({ name, weight }, i) => {
    const thread = getEmptyThread();

    // This profile contains 4 threads with the same pid, and different tids.
    // We rely on tids to be unique in some parts of the profiler code.
    thread.pid = dhat.pid;
    thread.tid = i;
    thread.name = name;

    thread.funcTable.name = funcTable.name.slice();
    thread.funcTable.isJS = funcTable.isJS.slice();
    thread.funcTable.relevantForJS = funcTable.relevantForJS.slice();
    thread.funcTable.resource = funcTable.resource.slice();
    thread.funcTable.fileName = funcTable.fileName.slice();
    thread.funcTable.lineNumber = funcTable.lineNumber.slice();
    thread.funcTable.columnNumber = funcTable.columnNumber.slice();
    thread.funcTable.length = funcTable.length;

    thread.frameTable.address = frameTable.address.slice();
    thread.frameTable.line = frameTable.line.slice();
    thread.frameTable.column = frameTable.column.slice();
    thread.frameTable.category = frameTable.category.slice();
    thread.frameTable.subcategory = frameTable.subcategory.slice();
    thread.frameTable.innerWindowID = frameTable.innerWindowID.slice();
    thread.frameTable.func = frameTable.func.slice();
    thread.frameTable.length = frameTable.length;

    thread.stackTable.frame = stackTable.frame.slice();
    thread.stackTable.prefix = stackTable.prefix.slice();
    thread.stackTable.length = stackTable.length;

    thread.nativeAllocations = {
      time: allocationsTable.time.slice(),
      stack: allocationsTable.stack.slice(),
      weight,
      weightType: 'bytes',
      length: allocationsTable.length,
    };

    return thread;
  });

  return profile;
}
