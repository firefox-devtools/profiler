// flow-typed signature: c5aa20941637db181565c6b31deee152
// flow-typed version: c6154227d1/react-splitter-layout_v3.x.x/flow_>=v0.53.x <=v0.103.x

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
