/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @typedef {Object.<string, string>} AgentsVersion
 */

/*
 * This file is run when a user runs `yarn install`, before doing anything else.
 * We check that various tools we need have the correct version. For now we
 * check Node and Yarn.
 */
checkVersions();

function checkVersions() {
  // The "userAgent" is something like 'yarn/0.28.1 npm/? node/v8.4.0 linux x64'
  // when ran with yarn. With npm it's similar, without the `yarn` part of course.
  const userAgent = process.env.npm_config_user_agent;
  if (!userAgent) {
    console.error('Error: this script cannot be run directly.');
    process.exit(-1);
    return;
  }

  /** @type {AgentsVersion} */
  const agents = userAgent.split(' ').reduce((agents, agent) => {
    const [key, value] = agent.split('/');
    agents[key] = value;
    return agents;
  }, {});

  const checks = [checkNode(agents), checkYarn(agents)];

  const successful = checks.every((returnValue) => returnValue);
  if (successful) {
    console.log(
      'All project requirements are satisfied, moving forward with the installation.'
    );
    process.exit(0);
  }
  process.exit(-1);
}

// This function compares two string versions. This compares only major.minor
// and disrespect any textual prevision (like pre or beta).
function versionCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * @param {AgentsVersion} agents
 */
function checkNode(agents) {
  // Node versions usually have a starting `v`.
  const nodeVersion = agents.node.replace(/^v/, '');
  const expectedNodeVersion = parseExpectedNodeVersion();
  if (versionCompare(nodeVersion, expectedNodeVersion) < 0) {
    console.error(
      `This project expects at least Node version ${expectedNodeVersion} but version ${nodeVersion} is currently used.`
    );
    console.error(
      'You can use a tool like `nvm` to install and manage installed node versions.'
    );
    console.error(
      'You can look at https://github.com/nvm-sh/nvm to install this tool.\n'
    );
    console.error(
      'Once `nvm` is installed you can use the following commands to upgrade:\n' +
        'nvm install ' +
        expectedNodeVersion +
        '\n' +
        'nvm alias default ' +
        expectedNodeVersion +
        '\n'
    );
    return false;
  }
  return true;
}

/**
 * @param {AgentsVersion} agents
 */
function checkYarn(agents) {
  if (!('yarn' in agents)) {
    console.error(
      'This project uses Yarn instead of npm, please run `yarn install` instead of `npm install`.\n'
    );
    displayYarnVersionExplanation();
    displayInstallationInformation();
    return false;
  }

  if (agents.yarn) {
    const version = agents.yarn;
    if (versionCompare(version, '1.10') < 0) {
      displayYarnVersionExplanation();
      displayInstallationInformation();
      return false;
    }
  }

  return true;
}

function parseExpectedNodeVersion() {
  // Let's fetch our minimal version from GitHub Actions composite action file
  const fs = require('fs');
  const actionConfig = fs.readFileSync(
    '.github/actions/setup-node-and-install/action.yml',
    {
      encoding: 'utf8',
    }
  );
  const expectedNodeVersion = /node-version:\s*'([\d.]+)'/.exec(actionConfig);
  if (!expectedNodeVersion) {
    throw new Error(
      `Couldn't extract the node version from .github/actions/setup-node-and-install/action.yml.`
    );
  }
  return expectedNodeVersion[1];
}

function displayYarnVersionExplanation() {
  console.error(`This project supports only Yarn version 1.10 or newer.`);
}

function displayInstallationInformation() {
  console.error(
    'To install the latest version of Yarn, you can use the following command:'
  );
  console.error('\n    curl -o- -L https://yarnpkg.com/install.sh | bash -s\n');
  console.error(
    'Please look at https://yarnpkg.com/docs/install for more alternatives.\n'
  );
}
