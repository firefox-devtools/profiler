export const SIMPLEPERF = 'SIMPLEPERF';

export function verifyMagic(
  magic: string,
  traceBuffer: ArrayBufferLike
): boolean {
  return (
    new TextDecoder('utf8').decode(traceBuffer.slice(0, magic.length)) === magic
  );
}
