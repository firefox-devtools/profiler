// flow-typed signature: c1b1289b492ef8e892f40a744b17a9dd
// flow-typed version: 98d9b6a103/react-splitter-layout_v3.x.x/flow_>=v0.53.x

declare type $$reactsplitterlayout$$Props = {|
  +customClassName?: string,
  +vertical?: boolean,
  +percentage?: boolean,
  +primaryIndex?: 0 | 1,
  +primaryMinSize?: number,
  +secondaryMinSize?: number,
  +secondaryInitialSize?: number,
  +onDragStart?: () => mixed,
  +onDragEnd?: () => mixed,
  +onSecondaryPaneSizeChange?: number => mixed,
  +children: React$Node,
|};

declare module 'react-splitter-layout' {
  declare export default React$ComponentType<$$reactsplitterlayout$$Props>
}
