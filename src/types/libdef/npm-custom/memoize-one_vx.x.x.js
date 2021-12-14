// @flow

declare module 'memoize-one' {
  // This was directly copied from .node_modules/memoize-one/dist/memoize-one.cjs.js.flow

  declare type EqualityFn = (newArgs: mixed[], lastArgs: mixed[]) => boolean;

  // default export
  declare export default function memoizeOne<ResultFn: (...any[]) => mixed>(
    fn: ResultFn,
    isEqual?: EqualityFn
  ): ResultFn;
}
