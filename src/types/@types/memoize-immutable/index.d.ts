/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

declare module 'memoize-immutable' {
  export interface CacheInstance<K, V> {
    has(key: K): boolean;
    get(key: K): V | undefined;
    set(key: K, value: V): CacheInstance<K, V>;
  }

  // Extract the argument types as a tuple
  type ExtractArgType<F> = F extends (...args: infer A) => any ? A : never;

  // Extract the return type
  type ExtractReturnType<F> = F extends (...args: any[]) => infer R ? R : never;

  // Config with custom cache instance
  export type CacheConfig<F extends (...args: any[]) => any> = {
    cache: CacheInstance<ExtractArgType<F>, ExtractReturnType<F>>;
  };

  // Simple limit config
  export type LimitConfig = {
    limit: number;
  };

  // Main export: memoized version of the function
  const memoizeImmutable: <F extends (...args: any[]) => any>(
    fn: F,
    config?: CacheConfig<F> | LimitConfig
  ) => F;

  export default memoizeImmutable;
}
