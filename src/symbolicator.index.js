import {
    unserializeProfileOfArbitraryFormat,
} from './profile-logic/process-profile';

import { SymbolStore } from './profile-logic/symbol-store';

import {
    symbolicateProfile,
    applySymbolicationSteps
} from './profile-logic/symbolication';

import * as MozillaSymbolicationAPI from './profile-logic/mozilla-symbolication-api';

import { SymbolsNotFoundError } from './profile-logic/errors';

var argv = require('minimist')(process.argv.slice(2));
if (!('profile' in argv))
{
    console.error("--profile argument (path to profile file) must be supplied");
    process.exit(1);
}
if (!('server' in argv))
{
    console.error("--server argument (URL of symbol server) must be supplied");
    process.exit(1);
}

var fs = require('fs');
var serializedProfile = JSON.parse(fs.readFileSync(argv.profile, 'utf8'));
console.log(`Loaded profile from ${argv.profile}`);

var profile = await unserializeProfileOfArbitraryFormat(serializedProfile);
if (profile === undefined) {
    throw new Error('Unable to parse the profile.');
}

/**
 * Simple 'in-memory' symbol DB that conforms to the same interface as SymbolStoreDB but
 * just stores everything in a simple dictionary instead of IndexedDB
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

async function requestSymbolsWithCallback(
    symbolSupplierName: string,
    requests: LibSymbolicationRequest[],
    callback: (path: string, requestJson: string) => Promise<MixedObject>
  ) {
    for (const { lib } of requests) {
      console.log(`requestingSymbolTable(${lib.debugName})`);
    }
    try {
      return await MozillaSymbolicationAPI.requestSymbols(
        symbolSupplierName,
        requests,
        callback
      );
    } catch (e) {
      throw new Error(
        `There was a problem with the symbolication API request to the ${symbolSupplierName}: ${e.message}`
      );
    } finally {
      for (const { lib } of requests) {
        console.log(`receivedSymbolTableReply(${lib.debugName})`);
      }
    }
  }

const symbolStore = new SymbolStore(symbolStoreDB, {
    requestSymbolsFromServer: (requests) =>
      requestSymbolsWithCallback(
        'symbol server',
        requests,
        async (path, json) => {
          const response = await fetch(argv.server + path, {
            body: json,
            method: 'POST'
          });
          return response.json();
        }
      ),

    requestSymbolsFromBrowser: async (requests) => {
        return new Promise((resolve, reject) => { resolve([]); });
    },

    requestSymbolTableFromBrowser: async (lib) => {
        return new Promise((resolve, reject) => { resolve([]); });
    },
  });

const completionPromises = [];

await symbolicateProfile(
    profile,
    symbolStore,
    (
        threadIndex: ThreadIndex,
        symbolicationStepInfo: SymbolicationStepInfo
      ) => {
        completionPromises.push(
          new Promise((resolve) => {
            _symbolicationStepQueueSingleton.enqueueSingleSymbolicationStep(
              dispatch,
              threadIndex,
              symbolicationStepInfo,
              resolve
            );
          })
        );
      }
);

await Promise.all(completionPromises);