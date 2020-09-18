/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// This implements a Button that triggers a panel. The panel will have a small
// arrow pointing towards the button, which is implemented in ArrowPanel.
//
// All public API is exposed from this file. Other components should never be
// used directly.
//
// Here is a simple example:
//
// import { ButtonWithPanel } from // 'firefox-profiler/components/ButtonWithPanel';
// ...
// <ButtonWithPanel
//   className="MyButtonWithPanel"
//   buttonClassName="MyPanelButton"
//   panelClassName="MyPanel"
//   label="Click me!"
//   panelContent={<>
//     <p>We explain lots of useful things here.</p>
//     <p>If you want to know more <a href='/'>click here</a>.</p>
//   </>}
// />
//
// Here is an example with a ConfirmDialog, that implements a standard
// confirmation dialog, with a title and 2 buttons:
//
// import { ButtonWithPanel } from // 'firefox-profiler/components/ButtonWithPanel';
// ...
// <ButtonWithPanel
//   className="MyButtonWithPanel"
//   buttonClassName="MyPanelButton"
//   panelClassName="MyPanel"
//   label="Click me!"
//   onPanelOpen={this.onOpenConfirmDialog}
//   onPanelClose={this.onCloseConfirmDialog}
//   panelContent={
//     <ConfirmDialog
//       title="Delete Something"
//       confirmButtonText="Delete"
//       confirmButtonType="destructive"
//       cancelButtonText="Cancel"
//       onConfirmButtonClick={this.onConfirmDeletion}
//     >
//       Are you sure you want to delete uploaded data for this
//       profile? Links for shared copies will no longer work.
//     </ConfirmDialog>
//   }
// />

export { ButtonWithPanel } from './ButtonWithPanel';
export { ConfirmDialog } from './ConfirmDialog';
