// @flow

export function timeCode(label: string, codeAsACallback: any => any): any {
  if (typeof performance !== 'undefined' &&
      process.env.NODE_ENV === 'development') {
    const start = performance.now();
    const result = codeAsACallback();
    const elapsed = Math.round(performance.now() - start);
    console.log(`${label} took ${elapsed}ms to execute.`);
    return result;
  }
  return codeAsACallback();
}
