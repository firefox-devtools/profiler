// The "userAgent" is something like 'yarn/0.28.1 npm/? node/v8.4.0 linux x64'
// when ran with yarn. With npm it's similar, without the `yarn` part of course.
const userAgent = process.env.npm_config_user_agent;
if (!userAgent) {
  console.error('Error: this script cannot be run directly.');
  process.exit(-1);
}

const agents = userAgent.split(' ').reduce((agents, agent) => {
  const [key, value] = agent.split('/');
  agents[key] = value;
  return agents;
}, {});

const checks = [checkNode(), checkYarn()];

const successful = checks.every(returnValue => returnValue);
if (successful) {
  console.log(
    'All project requirements are satisfied, moving forward with the installation.'
  );
  process.exit(0);
}
process.exit(-1);

function checkNode() {
  // Node versions usually have a starting `v`.
  const strNodeVersion = agents.node.replace(/^v/, '');
  // parseFloat will get us major.minor and ignore the possible patch version, which is
  // enough for our needs because node versions very rarely (or never ?) have
  // patch versions.
  const nodeVersion = parseFloat(strNodeVersion);
  const expectedNodeVersion = parseExpectedNodeVersion();
  if (nodeVersion < expectedNodeVersion) {
    console.error(
      `This project expects at least Node version ${expectedNodeVersion}.`
    );
    console.error(
      'You can use a tool like `nvm` to install and manage installed node versions.\n'
    );
    return false;
  }
  return true;
}

function checkYarn() {
  if (!('yarn' in agents)) {
    console.error(
      'This project uses Yarn instead of npm, please run `yarn install` instead of `npm install`.\n'
    );
    displayYarnVersionExplanation('Additionally ');
    displayInstallationInformation();
    return false;
  }

  if (agents.yarn) {
    const version = agents.yarn;
    // Poor man's check, but effective enough :)
    if (version.startsWith('0.26.') || version.startsWith('0.27.')) {
      displayYarnVersionExplanation();
      displayInstallationInformation();
      return false;
    }
  }

  return true;
}

function parseExpectedNodeVersion() {
  // Let's fetch our minimal version from circleci's file
  const fs = require('fs');
  const circleConfig = fs.readFileSync('circle.yml', { encoding: 'utf8' });
  const expectedNodeVersion = /version:\s+([\d.]+)/.exec(circleConfig)[1];
  return parseFloat(expectedNodeVersion);
}

function displayYarnVersionExplanation(prefix = '') {
  console.error(
    `${prefix}Yarn versions 0.26 and 0.27 have a bug that makes them unfit with this project.`
  );
  console.error(
    'Please use either an earlier version like 0.25 or a newer version.'
  );
  console.error(
    'See https://github.com/devtools-html/perf.html/issues/439 for more information.\n'
  );
}

function displayInstallationInformation() {
  console.error(
    'To install a specific version of Yarn, you can use the following command:'
  );
  console.error(
    '\n    curl -o- -L https://yarnpkg.com/install.sh | bash -s -- --version 0.28.4\n'
  );
  console.error(
    'Please look at https://yarnpkg.com/docs/install for more alternatives.\n'
  );
}
