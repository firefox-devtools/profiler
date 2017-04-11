declare class WheelEvent extends MouseEvent {
  deltaX: number; // readonly
  deltaY: number; // readonly
  deltaZ: number; // readonly
  deltaMode: 0x00 | 0x01 | 0x02; // readonly
  DOM_DELTA_PIXEL: 0x00; // readonly
  DOM_DELTA_PAGE: 0x01; // readonly
  DOM_DELTA_LINE: 0x02; // readonly
}
