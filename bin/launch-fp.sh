#!/bin/sh
# This script is primarily for running Firefox Profiler on a saved profile.
#
# For example:
#   launch-fp.sh CPU.20230124.095804.8433.0.001.cpuprofile
# will launch the Firefox Profiler server and open a browser tab with the above
# Node.js profile. If the profile is omitted:
#   launch-fp.sh
# then only the server will be launched.

SCRIPTPATH=$(realpath "$0")
SCRIPTDIR=$(dirname "$SCRIPTPATH")
NODE_ENV=development node "$SCRIPTDIR/../server.js" "$@"
