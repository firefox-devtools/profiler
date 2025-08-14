/*
 * This implements a simple CLI to symbolicate profiles captured by the profiler
 * or by samply.
 *
 * To use it it first needs to be built:
 *   yarn build-symbolicator-cli
 *
 * Then it can be run from the `dist` directory:
 *   node dist/symbolicator-cli.js --input <input profile> --output <symbolicated profile> --server <symbol server URL>
 *
 * For example:
 *   node dist/symbolicator-cli.js --input samply-profile.json --output profile-symbolicated.json --server http://localhost:3000
 *
 */

import fs from 'fs';
import minimist from 'minimist';

import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import { SymbolStore } from '../profile-logic/symbol-store';
import {
  symbolicateProfile,
  applySymbolicationSteps,
} from '../profile-logic/symbolication';
import type { SymbolicationStepInfo } from '../profile-logic/symbolication';
import type { SymbolTableAsTuple } from '../profile-logic/symbol-store-db';
import * as MozillaSymbolicationAPI from '../profile-logic/mozilla-symbolication-api';
import { SymbolsNotFoundError } from '../profile-logic/errors';
import type { ThreadIndex } from '../types';

/**
 * Simple 'in-memory' symbol DB that conforms to the same interface as SymbolStoreDB but
 * just stores everything in a simple dictionary instead of IndexedDB. The composite key
 * [debugName, breakpadId] is flattened to a string "debugName:breakpadId" to use as the
 * map key.
 */
export class InMemorySymbolDB {
  _store: Map<string, SymbolTableAsTuple>;

  constructor() {
    this._store = new Map();
  }

  _makeKey(debugName: string, breakpadId: string): string {
    return `${debugName}:${breakpadId}`;
  }

  async storeSymbolTable(
    debugName: string,
    breakpadId: string,
    symbolTable: SymbolTableAsTuple
  ): Promise<void> {
    this._store.set(this._makeKey(debugName, breakpadId), symbolTable);
  }

  async getSymbolTable(
    debugName: string,
    breakpadId: string
  ): Promise<SymbolTableAsTuple> {
    const key = this._makeKey(debugName, breakpadId);
    const value = this._store.get(key);
    if (typeof value !== 'undefined') {
      return value;
    }
    throw new SymbolsNotFoundError(
      'The requested library does not exist in the database.',
      { debugName, breakpadId }
    );
  }

  async close(): Promise<void> {}
}

export interface CliOptions {
  input: string;
  output: string;
  server: string;
}

export async function run(options: CliOptions) {
  console.log(`Loading profile from ${options.input}`);
  const buffer = fs.readFileSync(options.input, null).buffer;
  const profile = await unserializeProfileOfArbitraryFormat(buffer);
  if (profile === undefined) {
    throw new Error('Unable to parse the profile.');
  }

  const symbolStoreDB = new InMemorySymbolDB();

  /**
   * SymbolStore implementation which just forwards everything to the symbol server in
   * MozillaSymbolicationAPI format. No support for getting symbols from 'the browser' as
   * there is no browser in this context.
   */
  const symbolStore = new SymbolStore(symbolStoreDB, {
    requestSymbolsFromServer: async (requests) => {
      for (const { lib } of requests) {
        console.log(`  Loading symbols for ${lib.debugName}`);
      }
      try {
        return await MozillaSymbolicationAPI.requestSymbols(
          'symbol server',
          requests,
          async (path, json) => {
            const response = await fetch(options.server + path, {
              body: json,
              method: 'POST',
            });
            return response.json();
          }
        );
      } catch (e) {
        throw new Error(
          `There was a problem with the symbolication API request to the symbol server: ${e.message}`
        );
      }
    },

    requestSymbolsFromBrowser: async () => {
      return [];
    },

    requestSymbolTableFromBrowser: async () => {
      throw new Error('Not supported in this context');
    },
  });

  console.log('Symbolicating...');

  const symbolicationStepsPerThread: Map<ThreadIndex, SymbolicationStepInfo[]> =
    new Map();
  await symbolicateProfile(
    profile,
    symbolStore,
    (
      threadIndex: ThreadIndex,
      symbolicationStepInfo: SymbolicationStepInfo
    ) => {
      let threadSteps = symbolicationStepsPerThread.get(threadIndex);
      if (threadSteps === undefined) {
        threadSteps = [];
        symbolicationStepsPerThread.set(threadIndex, threadSteps);
      }
      threadSteps.push(symbolicationStepInfo);
    }
  );

  console.log('Applying collected symbolication steps...');

  profile.threads = profile.threads.map((oldThread, threadIndex) => {
    const symbolicationSteps = symbolicationStepsPerThread.get(threadIndex);
    if (symbolicationSteps === undefined) {
      return oldThread;
    }
    const { thread } = applySymbolicationSteps(
      oldThread,
      profile.shared,
      symbolicationSteps
    );
    return thread;
  });

  profile.meta.symbolicated = true;

  console.log(`Saving profile to ${options.output}`);
  fs.writeFileSync(options.output, JSON.stringify(profile));
  console.log('Finished.');
}

export function makeOptionsFromArgv(processArgv: string[]): CliOptions {
  const argv = minimist(processArgv.slice(2));

  if (!('input' in argv && typeof argv.input === 'string')) {
    throw new Error(
      'Argument --input must be supplied with the path to the input profile'
    );
  }

  if (!('output' in argv && typeof argv.output === 'string')) {
    throw new Error(
      'Argument --output must be supplied with the path to the output profile'
    );
  }

  if (!('server' in argv && typeof argv.server === 'string')) {
    throw new Error(
      'Argument --server must be supplied with the URI of the symbol server endpoint'
    );
  }

  return {
    input: argv.input,
    output: argv.output,
    server: argv.server,
  };
}

if (!module.parent) {
  try {
    const options = makeOptionsFromArgv(process.argv);
    run(options).catch((err) => {
      throw err;
    });
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
