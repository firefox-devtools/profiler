// @flow
type ValidWeakMapKey = Object | [];

/**
 * Memoize a function's results using a WeakMap and its first parameter.
 */
export function weakMemoize(fn: (ValidWeakMapKey, ...any) => any) {
  const memo = new WeakMap();
  return function (key: ValidWeakMapKey) {
    const cachedValue = memo.get(key);
    if (cachedValue === undefined) {
      const value = fn.apply(null, arguments);
      memo.set(key, value);
      return value;
    }
    return cachedValue;
  };
}
