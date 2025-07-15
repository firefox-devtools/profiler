// @flow

export const SIMPLEPERF = 'SIMPLEPERF';

export function verifyMagic(magic: string, traceBuffer: ArrayBuffer): boolean {
  return (
    new TextDecoder('utf8').decode(traceBuffer.slice(0, magic.length)) === magic
  );
}
