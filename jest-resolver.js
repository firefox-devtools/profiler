/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Custom Jest resolver that respects the "browser" field in package.json
// This allows tests to use browser implementations instead of Node.js implementations
//
// Set JEST_ENVIRONMENT=node to use Node.js implementations (default: browser)

const fs = require('fs');
const path = require('path');

// Determine environment mode: "browser" or "node"
const USE_BROWSER = process.env.JEST_ENVIRONMENT !== 'node';

// Read package.json once at module load time
const PROJECT_ROOT = __dirname;
const BROWSER_MAPPINGS = parseBrowserMappingsFromPackageJson(PROJECT_ROOT);

module.exports = (request, options) => {
  const resolved = options.defaultResolver(request, options);

  if (USE_BROWSER) {
    return BROWSER_MAPPINGS[resolved] ?? resolved;
  }

  return resolved;
};

function parseBrowserMappingsFromPackageJson(projectRoot) {
  const browserMappings = {};
  const packageJsonPath = path.join(projectRoot, 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const browserField = packageJson.browser;

    if (browserField && typeof browserField === 'object') {
      // Pre-validate all browser mappings and convert to absolute paths
      for (const [source, target] of Object.entries(browserField)) {
        const absoluteSource = path.resolve(projectRoot, source);
        const absoluteTarget = path.resolve(projectRoot, target);

        if (!fs.existsSync(absoluteTarget)) {
          console.warn(
            `Warning: Browser mapping target does not exist: ${target}`
          );
          continue;
        }

        browserMappings[absoluteSource] = absoluteTarget;
      }
    }
  } catch (error) {
    console.error(`Error reading package.json for browser field: ${error}`);
  }
  return browserMappings;
}
