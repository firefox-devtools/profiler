/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

const fs = require('fs');
const path = require('path');
import { run } from '../../../symbolicator-cli';
import { completeSymbolTableAsTuple } from '../../fixtures/example-symbol-table';
import { SymbolsNotFoundError } from '../../../profile-logic/errors';

describe('symbolicator-cli tool', function(){

    async function runToTempFileAndReturnOutput(options)
    {
        const tempFile = path.join(__dirname, "temp.json");
        options.output = tempFile;

        try {
            await run(options);
            return JSON.parse(fs.readFileSync(tempFile));
        }
        finally {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
    }

    it('is symbolicating a trace correctly', async function() {
        const symbolsJson = fs.readFileSync('src/test/integration/symbolicator-cli/symbol-server-response.json');
        const expected = JSON.parse(fs.readFileSync('src/test/integration/symbolicator-cli/symbolicated.json'));

        window.fetch.post('http://symbol.server/symbolicate/v5', symbolsJson);    

        const options = {
            'input': 'src/test/integration/symbolicator-cli/unsymbolicated.json',
            'server': 'http://symbol.server'
        };

        const result = await runToTempFileAndReturnOutput(options);
    
        expect(result).toEqual(expected);
    });
})