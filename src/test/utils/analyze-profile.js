// @flow
import type {
  Thread,
  IndexIntoFuncTable,
  IndexIntoStackTable,
} from '../../types/profile';

/**
 * Maps a thread's sample into the height of the stack.
 */
export function mapSamplesToStackHeight({
  samples,
  stackTable,
}: Thread): number[] {
  return samples.stack.map(stackIndexIn => {
    let stackIndex = stackIndexIn;
    let i = 0;
    while (stackIndex !== null) {
      i++;
      stackIndex = stackTable.prefix[stackIndex];
    }
    return i;
  });
}

/**
 * Maps a thread's samples to whether a given funcIndex is in its stack.
 */
export function mapSamplesToHasFunc(
  { samples, stackTable, frameTable }: Thread,
  funcIndex: IndexIntoFuncTable
): boolean[] {
  return samples.stack.map(stackIndexIn => {
    let stackIndex = stackIndexIn;
    while (stackIndex !== null) {
      const frameIndex = stackTable.frame[stackIndex];
      if (frameTable.func[frameIndex] === funcIndex) {
        return true;
      }
      stackIndex = stackTable.prefix[stackIndex];
    }
    return false;
  });
}

export function getFuncIndexByName(thread: Thread, name: string) {
  return thread.funcTable.name.indexOf(thread.stringTable.indexForString(name));
}

export function stackIsJS(thread: Thread, stackIndex: IndexIntoStackTable) {
  const frameIndex = thread.stackTable.frame[stackIndex];
  const funcIndex = thread.frameTable.func[frameIndex];
  return thread.funcTable.isJS[funcIndex];
}
