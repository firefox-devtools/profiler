/**
 * Various helpers for dealing with the profile as a data structure.
 */

export const resourceTypes = {
  unknown: 0,
  library: 1,
  addon: 2,
  webhost: 3,
  otherhost: 4,
  url: 5
};

/**
 * Takes the stack table and the frame table, creates a func stack table and
 * fixes up the funcStack field in the samples data.
 * @return object  The funcStackTable and the new samples object.
 */
export function createFuncStackTableAndFixupSamples(stackTable, frameTable, funcTable, samples) {
  let stackIndexToFuncStackIndex = new Map();
  const funcCount = funcTable.length;
  let prefixFuncStackAndFuncToFuncStackMap = new Map(); // prefixFuncStack * funcCount + func => funcStack
  let funcStackTable = { length: 0, prefix: [], func: [] };
  function addFuncStack(prefix, func) {
    const index = funcStackTable.length++;
    funcStackTable.prefix[index] = prefix;
    funcStackTable.func[index] = func;
  }
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixStack = stackTable.prefix[stackIndex];
    const prefixFuncStack = (prefixStack === null) ? null :
       stackIndexToFuncStackIndex.get(prefixStack);
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const prefixFuncStackAndFuncIndex = prefixFuncStack * funcCount + funcIndex;
    let funcStackIndex = prefixFuncStackAndFuncToFuncStackMap.get(prefixFuncStackAndFuncIndex);
    if (funcStackIndex === undefined) {
      funcStackIndex = funcStackTable.length;
      addFuncStack(prefixFuncStack, funcIndex);
      prefixFuncStackAndFuncToFuncStackMap.set(prefixFuncStackAndFuncIndex, funcStackIndex);
    }
    stackIndexToFuncStackIndex.set(stackIndex, funcStackIndex);
  }

  return {
    funcStackTable,
    samples: Object.assign({}, samples, {
      funcStack: samples.stack.map(stack => stackIndexToFuncStackIndex.get(stack))
    })
  };
}
