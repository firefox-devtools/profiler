// Husky 9 passes git hook arguments as positional parameters. Older husky
// versions used the `HUSKY_GIT_PARAMS` environment variable, which we keep
// as a fallback for now to make it easier to move between branches.
const gitParams =
  process.argv.slice(2).join(' ') || process.env.HUSKY_GIT_PARAMS;

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
