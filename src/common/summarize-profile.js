/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { timeCode } from './time-code';
import type { Profile, Thread, IndexIntoStackTable } from './types/profile';

export type Summary = { [id: string]: number };
type StacksInCategory = { [id: string]: { [id: string]: number } }
type SummarySegment = {
  percentage: {[id: string]: number},
  samples: {[id: string]: number},
}
type RollingSummary = SummarySegment[];
type Categories = Array<(string|null)>;
type ThreadCategories = Categories[];

/**
 * Categories is a list that includes the necessary information to match a sample to
 * a category. This list will need to be adjusted as the engine implementation switches.
 * Each category definition is a tuple that takes the following form:
 *
 * [
 *   matchType, // The type of match to perform (exact, stem, prefix, or substring).
 *   pattern, // The pattern that should match the sample name.
 *   category, // The category to finally label the sample.
 * ]
 */

const categories = [
  ['exact', 'js::RunScript', 'script'],
  ['stem', 'js::Nursery::collect', 'GC'],
  ['stem', 'js::GCRuntime::collect', 'GC'],
  ['prefix', 'mozilla::RestyleManager::', 'restyle'],
  ['substring', 'RestyleManager', 'restyle'],
  ['stem', 'PresShell::ProcessReflowCommands', 'layout'],
  ['prefix', 'nsCSSFrameConstructor::', 'frameconstruction'],
  ['stem', 'PresShell::DoReflow', 'layout'],
  ['substring', '::compileScript(', 'script'],

  ['prefix', 'nsCycleCollector', 'CC'],
  ['prefix', 'nsPurpleBuffer', 'CC'],
  ['substring', 'pthread_mutex_lock', 'wait'], // eg __GI___pthread_mutex_lock
  ['prefix', 'nsRefreshDriver::IsWaitingForPaint', 'paint'], // arguable, I suppose
  ['stem', 'PresShell::Paint', 'paint'],
  ['prefix', '__poll', 'wait'],
  ['prefix', '__pthread_cond_wait', 'wait'],
  ['stem', 'PresShell::DoUpdateApproximateFrameVisibility', 'layout'], // could just as well be paint
  ['substring', 'mozilla::net::', 'network'],
  ['stem', 'nsInputStreamReadyEvent::Run', 'network'],

  // ['stem', 'NS_ProcessNextEvent', 'eventloop'],
  ['exact', 'nsJSUtil::EvaluateString', 'script'],
  ['prefix', 'js::frontend::Parser', 'script.parse'],
  ['prefix', 'js::jit::IonCompile', 'script.compile.ion'],
  ['prefix', 'js::jit::BaselineCompiler::compile', 'script.compile.baseline'],

  ['prefix', 'CompositorBridgeParent::Composite', 'paint'],
  ['prefix', 'mozilla::layers::PLayerTransactionParent::Read(', 'messageread'],

  ['prefix', 'mozilla::dom::', 'dom'],
  ['prefix', 'nsDOMCSSDeclaration::', 'restyle'],
  ['prefix', 'nsHTMLDNS', 'network'],
  ['substring', 'IC::update(', 'script.icupdate'],
  ['prefix', 'js::jit::CodeGenerator::link(', 'script.link'],

  ['exact', 'base::WaitableEvent::Wait()', 'idle'],
  // TODO - if mach_msg_trap is called by RunCurrentEventLoopInMode, then it
  // should be considered idle time. Add a fourth entry to this tuple
  // for child checks?
  ['exact', 'mach_msg_trap', 'wait'],

  ['prefix', 'Interpret(', 'script.execute.interpreter'],
];

export function summarizeProfile(profile: Profile) {
  return timeCode('summarizeProfile', () => {
    const threadCategories: ThreadCategories = categorizeThreadSamples(profile);
    const rollingSummaries:RollingSummary[] = calculateRollingSummaries(profile, threadCategories);
    const summaries = summarizeCategories(profile, threadCategories);

    return profile.threads.map((thread, i) => ({
      threadIndex: i,
      threadName: thread.name,
      rollingSummary: rollingSummaries[i],
      summary: summaries[i],
    }));
  });
}

/**
 * Return a function that categorizes a function name. The categories
 * are cached between calls.
 * @returns {function} Function categorizer.
 */
function functionNameCategorizer(numFunctions): (number, number[], string[]) => string {
  const cache = new Array(numFunctions);
  cache.fill('', 0, numFunctions);

  // Compile set of categories into a single regular expression that produces
  // the pattern (whether it's a prefix, stem, substring, or exact match).

  const patternToCategory = new Map();

  const matchPatterns = {
    prefix: [],
    stem: [],
    substring: [],
    exact: [],
  };

  for (const [matchType, pattern, category] of categories) {
    patternToCategory.set(pattern, category);
    let pat = pattern.replace(/\W/g, '\\$&');
    if (matchType === 'stem') {
      pat += '\\b';
    }
    matchPatterns[matchType].push(pat);
  }

  const regex = new RegExp('^(?:' + matchPatterns.prefix.join('|') + ')'
                           + '|(?:' + matchPatterns.substring.join('|') + ')'
                           + '|\\b(?:' + matchPatterns.stem.join('|') + ')'
                           + '|^(?:' + matchPatterns.exact.join('|') + ')$');

  return function functionNameToCategory(funcIndex, funcNames, stringArray) {
    const existingCategory = cache[funcIndex];
    if (existingCategory !== '') {
      return existingCategory;
    }

    const match = stringArray[funcNames[funcIndex]].match(regex);
    if (match) {
      const category = patternToCategory.get(match[0]) || 'internal error';
      cache[funcIndex] = category;
      return category;
    }

    cache[funcIndex] = 'none';
    return 'none';
  };
}

/**
 * A function that categorizes a sample.
 */
type SampleCategorizer = (stackIndex: (IndexIntoStackTable|null)) => (string|null);

/**
 * Given a profile, return a function that categorizes a sample.
 * @param {object} thread Thread from a profile.
 * @return {function} Sample stack categorizer.
 */
function sampleCategorizer(thread: Thread): SampleCategorizer {
  const categorizeFuncName = functionNameCategorizer(thread.funcTable.name.length);
  const stackCategoryCache: Map<IndexIntoStackTable, (string|null)> = new Map();

  /*
   * Return the category for the entire stack rooted at stackIndex, if known, otherwise
   * just the category for the top frame.
   */
  function categorizeStack(stackIndex: IndexIntoStackTable): string {
    const category = stackCategoryCache.get(stackIndex);
    if (category) {
      return category;
    }

    const frameIndex = thread.stackTable.frame[stackIndex];
    const implIndex = thread.frameTable.implementation[frameIndex];
    if (implIndex !== null) {
      // script.execute.baseline or script.execute.ion
      return 'script.execute.' + thread.stringTable._array[implIndex];
    }

    const funcIndex = thread.frameTable.func[frameIndex];
    return categorizeFuncName(funcIndex, thread.funcTable.name, thread.stringTable._array);
  }

  function categorizeSampleStack(stackIndex: (IndexIntoStackTable|null)): (string|null) {
    if (stackIndex === null) {
      return null;
    }

    let category = 'uncategorized';
    let lastWaitIndex;
    let firstCategorizedIndex;

    /*
     * Scan the stack, youngest to oldest frame, to find the last 'wait'
     * function and the first fully categorized function.
     */
    for (let index = stackIndex; index !== null; index = thread.stackTable.prefix[index]) {
      const topCategory = categorizeStack(index);

      if (topCategory === 'wait') {
        lastWaitIndex = index;
      } else if (topCategory !== 'none') {
        category = topCategory;
        firstCategorizedIndex = index;
        break;
      }
    }

    /*
     * Stacks in [youngest .. firstCategorizedIndex] should be labeled
     * <category>, except if there are 'wait' frames, in which case
     * [youngest .. lastWaitIndex] should have a '.wait' appended. So scan
     * through all the stacks, youngest first up to the first fully categorized
     * stack, and record the category name.
     */

    let currentCat = category;
    if (lastWaitIndex !== undefined && !currentCat.endsWith('.wait')) {
      currentCat += '.wait';
    }

    for (let index = stackIndex; index !== null; index = thread.stackTable.prefix[index]) {
      stackCategoryCache.set(index, currentCat);
      if (index === lastWaitIndex) {
        currentCat = category;
      }
      if (index === firstCategorizedIndex) {
        break;
      }
    }

    category = stackCategoryCache.get(stackIndex) || 'uncategorized';
    return (category === 'uncategorized.wait') ? 'wait' : category;
  }

  return categorizeSampleStack;
}

/**
 * Count the number of samples in a given category. This will also count subcategories
 * in the case of categories labeled like "script.link", so "script" and "script.link"
 * will each be counted as having a sample.
 * @param {object} summary - Accumulates the counts.
 * @param {string} fullCategoryName - The name of the category.
 * @returns {object} summary
 */
function summarizeSampleCategories(summary: Summary, fullCategoryName: (string|null)): Summary {
  if (fullCategoryName !== null) {
    const categories = fullCategoryName.split('.');

    while (categories.length > 0) {
      const category = categories.join('.');
      summary[category] = (summary[category] || 0) + 1;
      categories.pop();
    }
  }
  return summary;
}

/**
 * Finalize the summary calculation by attaching percentages and sorting the result.
 * @param {object} summary - The object that summarizes the times of the samples.
 * @return {array} The summary with percentages.
 */
function calculateSummaryPercentages(summary: Summary) {
  const rows = objectEntries(summary);

  const sampleCount = rows.reduce((sum: number, [name: string, count: number]) => {
    // Only count the sample if it's not a sub-category. For instance "script.link"
    // is a sub-category of "script".
    return sum + (name.includes('.') ? 0 : count);
  }, 0);

  return rows
    .map(([category, samples]) => {
      const percentage = samples / sampleCount;
      return { category, samples, percentage };
    })
    // Sort by sample count, then by name so that the results are deterministic.
    .sort((a, b) => {
      if (a.samples === b.samples) {
        return a.category.localeCompare(b.category);
      }
      return b.samples - a.samples;
    });
}

function logStacks(stacksInCategory: StacksInCategory, maxLogLength = 10) {
  const entries = objectEntries(stacksInCategory);
  const data = entries
    .sort(([, {total: a}], [, {total: b}]) => b - a)
    .slice(0, Math.min(maxLogLength, entries.length));

  /* eslint-disable no-console */
  console.log(`Top ${maxLogLength} stacks in selected category`);
  console.log(data);
  /* eslint-enable no-console */
}

function stackToString(stackIndex: IndexIntoStackTable, thread: Thread): string {
  const { stackTable, frameTable, funcTable, stringTable } = thread;
  const stack = [];
  let nextStackIndex = stackIndex;
  while (nextStackIndex !== null) {
    const frameIndex = stackTable.frame[nextStackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const name = stringTable._array[funcTable.name[funcIndex]];
    stack.push(name);
    nextStackIndex = stackTable.prefix[nextStackIndex];
  }
  return stack.join('\n');
}

function incrementPerThreadCount(container: StacksInCategory, key: string, threadName: string) {
  const count = container[key] || { total: 0, [threadName]: 0 };
  count.total++;
  count[threadName]++;
  container[key] = count;
}

function countStacksInCategory(
  profile: Profile, threadCategories: ThreadCategories, category: string = 'uncategorized'
): StacksInCategory {
  const stacksInCategory = {};
  profile.threads.forEach((thread, i) => {
    const categories = threadCategories[i];
    const { samples } = thread;
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      if (categories[sampleIndex] === category) {
        const stackIndex = samples.stack[sampleIndex];
        if (stackIndex !== null) {
          const stringCallStack: string = stackToString(stackIndex, thread);
          incrementPerThreadCount(stacksInCategory, stringCallStack, thread.name);
        }
      }
    }
  });
  return stacksInCategory;
}

/**
 * Take a profile and return a summary that categorizes each sample, then calculate
 * a summary of the percentage of time each sample was present.
 * @param {array} profile - The current profile.
 * @returns {array} Stacks mapped to categories.
 */
export function categorizeThreadSamples(profile: Profile): ThreadCategories {
  return timeCode('categorizeThreadSamples', () => {
    const threadCategories = mapProfileToThreadCategories(profile);

    if (process.env.NODE_ENV === 'development') {
      // Change the constant to display the top stacks of a different category.
      const categoryToDump = 'uncategorized';
      const stacks: StacksInCategory = countStacksInCategory(profile, threadCategories, categoryToDump);
      console.log(`${Object.keys(stacks).length} stacks labeled '${categoryToDump}'`);
      logStacks(stacks);
    }

    return threadCategories;
  });
}

function mapProfileToThreadCategories(profile: Profile): ThreadCategories {
  return profile.threads.map(thread => {
    const categorizer = sampleCategorizer(thread);
    return thread.samples.stack.map(categorizer);
  });
}

/**
 * Take a profile and return a summary that categorizes each sample, then calculate
 * a summary of the percentage of time each sample was present.
 * @param {object} profile - The profile to summarize.
 * @param {object} threadCategories - Each thread's categories for the samples.
 * @returns {object} The summaries of each thread.
 */
export function summarizeCategories(profile: Profile, threadCategories: ThreadCategories) {
  return threadCategories.map(categories => (
      categories.reduce(summarizeSampleCategories, {})
    ))
    .map(calculateSummaryPercentages);
}

export function calculateRollingSummaries(
  profile: Profile, threadCategories: ThreadCategories, segmentCount: number = 40, rolling: number = 4
): RollingSummary[] {
  const [minTime, maxTime] = profile.threads.map(thread => {
    return [thread.samples.time[0], thread.samples.time[thread.samples.time.length - 1]];
  })
  .reduce((a, b) => ([
    Math.min(a[0], b[0]),
    Math.max(a[1], b[1]),
  ]));
  const totalTime = maxTime - minTime;
  const segmentLength = totalTime / segmentCount;
  const segmentHalfLength = segmentLength / 2;
  const rollingLength = segmentLength * rolling;
  const rollingHalfLength = segmentLength * rolling / 2;

  return profile.threads.map((thread, threadIndex) => {
    const categories = threadCategories[threadIndex];
    const rollingSummary: RollingSummary = [];

    for (let i = 0; i < segmentCount; i++) {
      let samplesInRange = 0;
      const samples = {};

      const rollingMinTime = minTime + (i * segmentLength) + segmentHalfLength - rollingHalfLength;
      const rollingMaxTime = rollingMinTime + rollingLength;

      for (let sampleIndex = 0; sampleIndex < thread.samples.time.length; sampleIndex++) {
        const time = thread.samples.time[sampleIndex];
        if (time > rollingMinTime) {
          if (time > rollingMaxTime) {
            break;
          }
          const category = categories[sampleIndex];
          if (category !== null) {
            samples[category] = (samples[category] || 0) + 1;
            samplesInRange++;
          }
        }
      }

      rollingSummary.push({
        samples,
        percentage: mapObj(samples, count => count / samplesInRange),
      });
    }

    return rollingSummary;
  });
}

function mapObj(object, fn) {
  let i = 0;
  const mappedObj = {};
  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      i++;
      mappedObj[key] = fn(object[key], key, i);
    }
  }
  return mappedObj;
}

/**
 * Flow requires a type-safe implementation of Object.entries().
 * See: https://github.com/facebook/flow/issues/2174
 */
function objectEntries<T>(object: { [id: string]: T }): Array<[string, T]> {
  const entries = [];
  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      entries.push([key, object[key]]);
    }
  }
  return entries;
}
