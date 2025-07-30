/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/* eslint-disable flowtype/no-weak-types */

declare module 'memoize-immutable' {
  declare interface CacheInstance<K, V> {
    has(K): boolean;
    get(K): V | void;
    set(K, V): CacheInstance<K, V>;
  }

  // TODO also support caches that come from immutable
  declare type CacheConfig<F> = {
    cache: CacheInstance<$Call<ExtractArgType, F>, $Call<ExtractReturnType, F>>,
  };

  declare type LimitConfig = {
    limit: number,
  };

  declare type ExtractArgType = <A>((...rest: A) => any) => A;
  declare type ExtractReturnType = <V>((...rest: any) => V) => V;

  declare module.exports: <F: Function>(
    fn: F,
    config?: CacheConfig<F> | LimitConfig
  ) => F;
}
