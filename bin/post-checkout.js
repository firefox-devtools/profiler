// Husky 9 passes git hook arguments as positional parameters. Older husky
// versions used the `HUSKY_GIT_PARAMS` environment variable, which we keep
// as a fallback for now to make it easier to move between branches.
const gitParams =
  process.argv.slice(2).join(' ') || process.env.HUSKY_GIT_PARAMS;
const [origHead, head, flag] = gitParams.split(' ');

// Flag is 1 if we moved between branches. Flag is 0 if we merely checked out a file from another branch.
if (flag !== '1') {
  process.exit();
}

require('./check-warn-yarn-changed.js')(origHead, head);
