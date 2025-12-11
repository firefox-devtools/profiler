export const SIMPLEPERF = 'SIMPLEPERF';

export function verifyMagic(magic: string, traceBuffer: Uint8Array): boolean {
  return (
    new TextDecoder('utf8').decode(traceBuffer.slice(0, magic.length)) === magic
  );
}
