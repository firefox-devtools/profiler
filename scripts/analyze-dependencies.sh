#!/bin/bash

# Dependency analysis script for TypeScript migration
# This is now a wrapper around the improved Node.js version
# Helps identify files with minimal dependencies for optimal conversion order

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Call the Node.js version with all arguments passed through
exec node "$SCRIPT_DIR/analyze-dependencies.js" "$@"