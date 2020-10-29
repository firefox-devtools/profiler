#!/bin/sh
# This script will undeploy the last deployed version.

# Exit with an error if any command exits with an error.
set -e

# This function outputs the command as well as executes it.
echo_and_exec_cmd() {
  echo "[exec] $*"
  "$@"
}

# This tries to find the upstream remote name
UPSTREAM=$(git remote -v | grep -E 'devtools-html/perf\.html|firefox-devtools/profiler' | head -1 | awk '{ print $1 }')
if [ -z "$UPSTREAM" ] ; then
  echo 1>&2 "Error: couldn't find the upstream remote. Is it well configured?"
  echo 1>&2 "We're looking for either devtools-html/perf.html or firefox-devtools/profiler."
  exit 1
fi

# This looks at your working directory, to error early if it's dirty.
git_status=$(LC_ALL=C git status --porcelain --ignore-submodules -unormal 2>&1)
if [ -n "$git_status" ] ; then
  echo 1>&2 "Error: your working directory contains uncommitted changes."
  echo 1>&2 "Please commit all your changes before running this script."
  exit 1
fi

# Now to the real stuff.
echo "This script will reset the production branch on the remote '$UPSTREAM' to the previous version."
printf "Are you sure?"
read -r enter

echo ">>> Fetching upstream $UPSTREAM"
echo_and_exec_cmd git fetch "$UPSTREAM"

echo ">>> Resetting to the previous commit"
echo_and_exec_cmd git checkout "$UPSTREAM/production"
echo_and_exec_cmd git reset --hard HEAD^

echo ">>> Running tests"
echo_and_exec_cmd yarn
echo_and_exec_cmd yarn test-all

echo ">>> Force-pushing to $UPSTREAM's production branch. Note you'll need to disable
branch protection for this to succeed."
echo "Go to https://github.com/firefox-devtools/profiler/settings/branches and enable force pushing."
printf "Hit enter when you are ready."
read -r enter
echo_and_exec_cmd git push -f --no-verify "$UPSTREAM" HEAD:production

echo "Please re-enable now the force push protection on https://github.com/firefox-devtools/profiler/settings/branches"
printf "Hit enter when you are ready."
# shellcheck disable=SC2034
read -r enter

echo ">>> Going back to your previous banch"
echo_and_exec_cmd git checkout -

echo ">>> Done!"
