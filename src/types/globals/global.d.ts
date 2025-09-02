/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Added by webpack's DefinePlugin
declare const AVAILABLE_STAGING_LOCALES: string[] | null;

declare module 'firefox-profiler-res/*.js' {
  const content: string;
  export default content;
}

declare module '*.css' {}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}
