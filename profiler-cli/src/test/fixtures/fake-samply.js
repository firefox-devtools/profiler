/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A stand-in for `samply load`, used by the tests so they do not depend on
 * samply being installed. Behavior is picked with FAKE_SAMPLY_MODE:
 *
 *   serve (default)  Serve the file over HTTP and print the profiler URL the
 *                    way samply does, then wait to be killed.
 *   exit             Print a parse error to stderr and exit with code 1.
 *   hang             Never print a URL, never exit.
 *
 * FAKE_SAMPLY_PID_FILE receives this process's pid, and every HTTP request is
 * appended to FAKE_SAMPLY_REQUEST_LOG as "<method> <path>" when set.
 */

const http = require('http');
const fs = require('fs');

const mode = process.env.FAKE_SAMPLY_MODE || 'serve';
const file = process.argv[process.argv.length - 1];

if (process.env.FAKE_SAMPLY_PID_FILE) {
  fs.writeFileSync(process.env.FAKE_SAMPLY_PID_FILE, String(process.pid));
}

if (mode === 'exit') {
  console.error('Could not parse the input file as JSON: expected value');
  process.exit(1);
}

if (mode === 'hang') {
  console.log('Local server listening at http://127.0.0.1:0');
  setInterval(() => {}, 1000);
} else {
  const server = http.createServer((req, res) => {
    if (process.env.FAKE_SAMPLY_REQUEST_LOG) {
      fs.appendFileSync(
        process.env.FAKE_SAMPLY_REQUEST_LOG,
        `${req.method} ${req.url}\n`
      );
    }
    if (req.url.endsWith('/profile.json')) {
      res.setHeader('Content-Type', 'application/json');
      fs.createReadStream(file).pipe(res);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}/tok`;
    console.log(`Local server listening at ${base}`);
    console.log(
      `https://profiler.firefox.com/from-url/${encodeURIComponent(`${base}/profile.json`)}/?symbolServer=${encodeURIComponent(base)}`
    );
    console.log('Press Ctrl+C to stop.');
  });
}
