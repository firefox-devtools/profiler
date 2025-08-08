// Older versions of husky use `GIT_PARAMS`, newer versions use `HUSKY_GIT_PARAMS`.
// To make it easier to move between branches, we support both for now. We can
// remove this thin compatibility layer later.
const gitParams = process.env.GIT_PARAMS || process.env.HUSKY_GIT_PARAMS;
const [origHead, head, flag] = gitParams.split(' ');

// Flag is 1 if we moved between branches. Flag is 0 if we merely checked out a file from another branch.
if (flag !== '1') {
  process.exit();
}

require('./check-warn-yarn-changed.js')(origHead, head);
