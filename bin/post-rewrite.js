// Older versions of husky use `GIT_PARAMS`, newer versions use `HUSKY_GIT_PARAMS`.
// To make it easier to move between branches, we support both for now. We can
// remove this thin compatibility layer later.
const gitParams = process.env.GIT_PARAMS || process.env.HUSKY_GIT_PARAMS;

// This is either 'rebase' or 'amend'.
if (gitParams !== 'rebase') {
  process.exit();
}

const checkWarnYarnChanged = require('./check-warn-yarn-changed.js');

const { createInterface } = require('readline');

const rl = createInterface({
  input: process.stdin,
});

rl.on('line', (line) => {
  const [origHead, head] = line.split(' ');
  checkWarnYarnChanged(origHead, head).then(
    (changed) => changed && process.exit()
  );
});
