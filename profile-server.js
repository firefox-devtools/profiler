/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
const http = require('node:http');
const fs = require('fs');
const path = require('path');

module.exports = {
  serveAndOpen(host, profilerUrl, profilePath, openOptions) {
    // Create a simple http server serving the profile file.
    const profileServer = http.createServer((_req, res) => {
      res.setHeader('Access-Control-Allow-Origin', profilerUrl);
      const fileStream = fs.createReadStream(profilePath);
      fileStream.pipe(res);
    });

    // Close the profile server on CTRL-C.
    process.on('SIGINT', () => profileServer.close());
    process.on('SIGTERM', () => profileServer.close());

    // Spin up the profile server.
    profileServer.listen(0, host, () => {
      const profileFromUrl = `${profilerUrl}/from-url/${encodeURIComponent(
        `http://${host}:${profileServer.address().port}/${encodeURIComponent(
          path.basename(profilePath)
        )}`
      )}`;
      import('open').then((open) => open.default(profileFromUrl, openOptions));
    });
  },
};
