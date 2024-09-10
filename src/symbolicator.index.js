var fs = require('fs');

import { unserializeProfileOfArbitraryFormat } from './profile-logic/process-profile';
import { SymbolStore } from './profile-logic/symbol-store';
import {
    symbolicateProfile,
    applySymbolicationSteps
} from './profile-logic/symbolication';
import * as MozillaSymbolicationAPI from './profile-logic/mozilla-symbolication-api';
import { SymbolsNotFoundError } from './profile-logic/errors';

var argv = require('minimist')(process.argv.slice(2));
if (!('input' in argv 
  && 'output' in argv 
  && 'server' in argv))
{
  console.error("Missing mandatory argument. Usage: symbolicator.js --input <path/to/input.json> --output <path/to/output.json> --server <URI of symbolication server>");
  process.exit(1);
}

console.log(`Loading profile from ${argv.input}`);
var serializedProfile = JSON.parse(fs.readFileSync(argv.input, 'utf8'));
var profile = await unserializeProfileOfArbitraryFormat(serializedProfile);
if (profile === undefined) {
    throw new Error('Unable to parse the profile.');
}

/**
 * Simple 'in-memory' symbol DB that conforms to the same interface as SymbolStoreDB but
 * just stores everything in a simple dictionary instead of IndexedDB. The composite key
 * [debugName, breakpadId] is flattened to a string "debugName:breakpadId" to use as the
 * map key.
 */
class InMemorySymbolDB {

    _dict: Map<string, SymbolTableAsTuple>

    constructor() {
        this._dict = new Map();
    }

    _makeKey(debugName: String, breakpadId: string): string {
        return `${debugName}:${breakpadId}`;
    }

    storeSymbolTable(
        debugName: string,
        breakpadId: string,
        symbolTable: SymbolTableAsTuple
      ): Promise<void> {
        this._dict[this._makeKey(debugName, breakpadId)] = symbolTable;
        return new Promise((resolve, reject) => resolve());
      }

    getSymbolTable(
        debugName: string,
        breakpadId: string
      ): Promise<SymbolTableAsTuple> {
        return new Promise((resolve, reject) => {
            const key = this._makeKey(debugName, breakpadId);
            if (key in this._dict) {
                resolve(this._dict[key]);
            } else {
                reject(new SymbolsNotFoundError(
                    'The requested library does not exist in the database.',
                    { debugName, breakpadId }
                  ));
            }
        });
      }

    close(): Promise<void> { return new Promise((resolve, reject) => resolve()); }
};

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
            const response = await fetch(argv.server + path, {
              body: json,
              method: 'POST'
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

    requestSymbolsFromBrowser: async (requests) => {
        return new Promise((resolve, reject) => { resolve([]); });
    },

    requestSymbolTableFromBrowser: async (lib) => {
        return new Promise((resolve, reject) => { resolve([]); });
    },
  });

console.log("Symbolicating...");

const symbolicationStepsPerThread : Map<ThreadIndex, SymbolicationStepInfo[]> = new Map();
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

console.log("Applying collected symbolication steps...");

profile.threads = profile.threads.map((oldThread, threadIndex) => {
  const symbolicationSteps = symbolicationStepsPerThread.get(threadIndex);
  if (symbolicationSteps === undefined) {
    return oldThread;
  }
  const { thread, _ } = applySymbolicationSteps(oldThread, symbolicationSteps);
  return thread;
});

profile.meta.symbolicated = true;

console.log(`Saving profile to ${argv.output}`);
fs.writeFileSync(argv.output, JSON.stringify(profile));
console.log("Finished.");
process.exit(0);
