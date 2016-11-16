
export function getTasksByThread(taskTable, threadTable) {
  console.log('taskTable:', taskTable);
  const threadIndexToTaskIndicesMap = new Map();
  for (let threadIndex = 0; threadIndex < threadTable.length; threadIndex++) {
    const taskIndices = [];
    for (let taskIndex = 0; taskIndex < taskTable.length; taskIndex++) {
      if (taskTable.threadIndex[taskIndex] === threadIndex) {
        taskIndices.push(taskIndex);
      }
    }
    const afterEnd = 1477254572877 * 2;
    taskIndices.sort((a, b) => (taskTable.beginTime[a] || afterEnd) - (taskTable.beginTime[b] || afterEnd));
    threadIndexToTaskIndicesMap.set(threadIndex, taskIndices);
  }
  return threadIndexToTaskIndicesMap;
}
