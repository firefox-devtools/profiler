# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build Commands

- `yarn build` - Development build

### Development Server

- `yarn start` - Start development server on port 4242

### Testing

- `yarn test` - Run Jest tests
- `yarn test-all` - Run all tests including flow, lint, and license checks
- `yarn test-all:ci` - CI version of test-all
- `yarn test-debug` - Run tests with Node debugger

### Code Quality

- `yarn lint` - Run ESLint and Stylelint
- `yarn lint-fix` - Auto-fix linting issues
- `yarn flow` - Run Flow type checking
- `yarn prettier-run` - Check code formatting
- `yarn prettier-fix` - Auto-fix code formatting

### Specialized Builds

- `yarn build-symbolicator-cli` - Build symbolicator CLI tool
- `yarn build-profile-query` - Build profile query tool

## Architecture Overview

The Firefox Profiler is a React/Redux web application for visualizing performance profiles from the Gecko Profiler and other profilers. Key architectural components:

### Core Structure

- **React Components** (`src/components/`) - UI components organized by functionality (app, timeline, flame-graph, etc.)
- **Redux Store** (`src/reducers/`, `src/actions/`, `src/selectors/`) - State management
- **Profile Logic** (`src/profile-logic/`) - Core profiling data processing and analysis
- **Utilities** (`src/utils/`) - Shared utility functions

### Key Modules

- **Profile Processing** - Handles importing, converting, and processing profiles from various formats (Gecko, Chrome, Linux perf, etc.)
- **Visualization Components** - Timeline tracks, flame graphs, call trees, marker charts
- **Symbolication** - Symbol resolution for native code
- **URL State Management** - Profile sharing and permalink generation

### Data Flow

1. Profiles imported via drag-and-drop, URL, or browser connection
2. Raw profile data processed and transformed into internal format
3. Redux selectors compute derived data for visualization
4. React components render interactive profiling views
5. User interactions dispatch actions to update state

### Build System

- **Webpack** - Main bundler with separate configs for different build targets
- **Babel** - JavaScript compilation with Flow type stripping
- **Flow** - Static type checking (not TypeScript)
- **Jest** - Test runner with custom environment setup

## Development Notes

### Type System

This project uses Flow, not TypeScript. Type definitions are in `src/types/`.

### Testing

- Component tests use React Testing Library
- Unit tests for utilities and profile logic
- Integration tests for symbolicator CLI
- Custom Jest environment for web-specific APIs

### Localization

The project supports multiple locales using Fluent. Enable with `L10N=1` environment variable.

### Profile Formats

Supports importing profiles from:

- Gecko Profiler (Firefox)
- Chrome DevTools
- Linux perf
- Android simpleperf
- ART (Android Runtime)
- DHAT (heap profiler)

### Key Directories

- `src/profile-logic/import/` - Profile format importers
- `src/components/timeline/` - Timeline visualization components
- `src/components/shared/` - Reusable UI components
- `src/test/fixtures/` - Test data and mock profiles
