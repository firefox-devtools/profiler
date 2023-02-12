#!/bin/sh
# This script is primarily for running Firefox Profiler on a saved profile.

if [ "x$1" != "x" ]; then
  PROFILEPATH=$(realpath "$1")
fi
PWD=$(pwd)
SCRIPTPATH=$(realpath "$0")
SCRIPTDIR=$(dirname "$SCRIPTPATH")
cd "$SCRIPTDIR/.." || exit
if [ "x$1" = "x" ]; then
  yarn start
else
  yarn start "$PROFILEPATH"
fi
cd "$PWD" || exit
