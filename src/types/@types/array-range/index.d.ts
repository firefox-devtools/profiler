// Type definitions for array-range v3.x.x
// Project: https://github.com/mattdesl/array-range
// Definitions by: Claude Code <https://claude.ai/code>

declare module 'array-range' {
  function range(end: number): number[];
  function range(start: number, end: number): number[];
  export = range;
}
