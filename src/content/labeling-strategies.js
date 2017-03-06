// @flow
import type { Thread, IndexIntoStackTable } from '../common/types/profile';

export type GetLabel = (Thread, IndexIntoStackTable) => string;

export function getFunctionName(thread: Thread, stackIndex: IndexIntoStackTable): string {
  const frameIndex = thread.stackTable.frame[stackIndex];
  const funcIndex = thread.frameTable.func[frameIndex];
  return thread.stringTable.getString(thread.funcTable.name[funcIndex]);
}

export function getImplementationName(thread: Thread, stackIndex: IndexIntoStackTable): string {
  const frameIndex = thread.stackTable.frame[stackIndex];
  const implementation = thread.frameTable.implementation[frameIndex];
  if (implementation) {
    return implementation === 'baseline' ? 'JS Baseline' : 'JS Ion';
  }
  const funcIndex = thread.frameTable.func[frameIndex];
  return thread.funcTable.isJS[funcIndex] ? 'JS Interpreter' : 'Platform';
}
