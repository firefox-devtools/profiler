// Type definitions for call-tree module
// Project: Firefox Profiler call tree logic
// Definitions by: Claude Code <https://claude.ai/code>

declare module './call-tree' {
  export const CallTree: any;
  export const CallTreeUtils: any;
  export const getCallNodeFromPath: any;
  export const getDisplayData: any;
  export const getCallNodeInfo: any;
}

declare module '../../../profile-logic/call-tree' {
  export const CallTree: any;
  export const CallTreeUtils: any;
  export const getCallNodeFromPath: any;
  export const getDisplayData: any;
  export const getCallNodeInfo: any;
}
