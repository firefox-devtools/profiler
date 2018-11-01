/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// TODO
// const { thread, getLabel, getCategory, stackTimingByDepth } = this.props;
// const stackTiming = stackTimingByDepth[depth];
//
// const duration =
//   stackTiming.end[stackTimingIndex] - stackTiming.start[stackTimingIndex];
//
// const stackIndex = stackTiming.stack[stackTimingIndex];
// const frameIndex = thread.stackTable.frame[stackIndex];
// const label = getLabel(thread, stackIndex);
// const category = getCategory(thread, frameIndex);
// const funcIndex = thread.frameTable.func[frameIndex];
//
// let resourceOrFileName = null;
// // Only JavaScript functions have a filename.
// const fileNameIndex = thread.funcTable.fileName[funcIndex];
// if (fileNameIndex !== null) {
//   // Because of our use of Grid Layout, all our elements need to be direct
//   // children of the grid parent. That's why we use arrays here, to add
//   // the elements as direct children.
//   resourceOrFileName = [
//     <div className="tooltipLabel" key="file">
//       File:
//     </div>,
//     thread.stringTable.getString(fileNameIndex),
//   ];
// } else {
//   const resourceIndex = thread.funcTable.resource[funcIndex];
//   if (resourceIndex !== -1) {
//     const resourceNameIndex = thread.resourceTable.name[resourceIndex];
//     if (resourceNameIndex !== -1) {
//       // Because of our use of Grid Layout, all our elements need to be direct
//       // children of the grid parent. That's why we use arrays here, to add
//       // the elements as direct children.
//       resourceOrFileName = [
//         <div className="tooltipLabel" key="resource">
//           Resource:
//         </div>,
//         thread.stringTable.getString(resourceNameIndex),
//       ];
//     }
//   }
// }
//
// return (
//   <div className="stackChartCanvasTooltip">
//     <div className="tooltipOneLine tooltipHeader">
//       <div className="tooltipTiming">{formatNumber(duration)}ms</div>
//       <div className="tooltipTitle">{label}</div>
//     </div>
//     <div className="tooltipDetails">
//       <div className="tooltipLabel">Category:</div>
//       <div>
//         <div
//           className="tooltipSwatch"
//           style={{ backgroundColor: category.color }}
//         />
//         {category.name}
//       </div>
//       {resourceOrFileName}
//     </div>
//   </div>
// );
