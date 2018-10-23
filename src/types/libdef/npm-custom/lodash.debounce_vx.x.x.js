/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
// This definition was adapted from lodash-es definition in
// https://github.com/flow-typed/flow-typed/blob/master/definitions/npm/lodash-es_v4.x.x/flow_v0.63.x-/lodash-es_v4.x.x.js

declare type $$lodash$$DebounceOptions = {
  leading?: boolean,
  maxWait?: number,
  trailing?: boolean,
};

declare module 'lodash.debounce' {
  declare export default function debounce<F: Function>(
    func: F,
    wait?: number,
    options?: $$lodash$$DebounceOptions
  ): F;
}
