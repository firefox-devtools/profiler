/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { timeCode } from '../utils/time-code';
import type { Profile, Thread, IndexIntoStackTable } from '../types/profile';

export type Summary = { [id: string]: number };
type MatchingFunction = (string, string) => boolean;
type StacksInCategory = { [id: string]: { [id: string]: number } };
type SummarySegment = {
  percentage: { [id: string]: number },
  samples: { [id: string]: number },
};
type RollingSummary = SummarySegment[];
type Categories = Array<string | null>;
type ThreadCategories = Categories[];

/**
 * A list of strategies for matching sample names to patterns.
 */
const match: { [id: string]: MatchingFunction } = {
  exact: (symbol, pattern) => symbol === pattern,
  prefix: (symbol, pattern) => symbol.startsWith(pattern),
  substring: (symbol, pattern) => symbol.includes(pattern),
  stem: (symbol, pattern) => {
    return symbol === pattern || symbol.startsWith(pattern + '(');
  },
};

/**
 * Categories is a list that includes the necessary information to match a sample to
 * a category. This list will need to be adjusted as the engine implementation switches.
 * Each category definition is a tuple that takes the following form:
 *
 * [
 *   matches, // A function that returns true/false for how the pattern should be matched.
 *   pattern, // The pattern that should match the sample name.
 *   category, // The category to finally label the sample.
 * ]
 */

const categories = [
  [match.exact, 'js::RunScript', 'script'],
  [match.stem, 'js::Nursery::collect', 'GC'],
  [match.stem, 'js::GCRuntime::collect', 'GC'],
  [match.prefix, 'mozilla::RestyleManager::', 'restyle'],
  [match.substring, 'RestyleManager', 'restyle'],
  [match.stem, 'PresShell::ProcessReflowCommands', 'layout'],
  [match.prefix, 'nsCSSFrameConstructor::', 'frameconstruction'],
  [match.stem, 'PresShell::DoReflow', 'layout'],
  [match.substring, '::compileScript(', 'script'],

  [match.prefix, 'nsCycleCollector', 'CC'],
  [match.prefix, 'nsPurpleBuffer', 'CC'],
  [match.substring, 'pthread_mutex_lock', 'wait'], // eg __GI___pthread_mutex_lock
  [match.prefix, 'nsRefreshDriver::IsWaitingForPaint', 'paint'], // arguable, I suppose
  [match.stem, 'PresShell::Paint', 'paint'],
  [match.prefix, '__poll', 'wait'],
  [match.prefix, '__pthread_cond_wait', 'wait'],
  [match.stem, 'PresShell::DoUpdateApproximateFrameVisibility', 'layout'], // could just as well be paint
  [match.substring, 'mozilla::net::', 'network'],
  [match.stem, 'nsInputStreamReadyEvent::Run', 'network'],

  // [match.stem, 'NS_ProcessNextEvent', 'eventloop'],
  [match.exact, 'nsJSUtil::EvaluateString', 'script'],
  [match.prefix, 'js::frontend::Parser', 'script.parse'],
  [match.prefix, 'js::jit::IonCompile', 'script.compile.ion'],
  [
    match.prefix,
    'js::jit::BaselineCompiler::compile',
    'script.compile.baseline',
  ],

  [match.prefix, 'CompositorBridgeParent::Composite', 'paint'],
  [
    match.prefix,
    'mozilla::layers::PLayerTransactionParent::Read(',
    'messageread',
  ],

  [match.prefix, 'mozilla::dom::', 'dom'],
  [match.prefix, 'nsDOMCSSDeclaration::', 'restyle'],
  [match.prefix, 'nsHTMLDNS', 'network'],
  [match.substring, 'IC::update(', 'script.icupdate'],
  [match.prefix, 'js::jit::CodeGenerator::link(', 'script.link'],

  [match.exact, 'base::WaitableEvent::Wait()', 'idle'],
  // TODO - if mach_msg_trap is called by RunCurrentEventLoopInMode, then it
  // should be considered idle time. Add a fourth entry to this tuple
  // for child checks?
  [match.exact, 'mach_msg_trap', 'wait'],

  // Can't do this until we come up with a way of labeling ion/baseline.
  [match.prefix, 'Interpret(', 'script.execute.interpreter'],
];

export function summarizeProfile(profile: Profile) {
  return timeCode('summarizeProfile', () => {
    const threadCategories: ThreadCategories = categorizeThreadSamples(profile);
    const rollingSummaries: RollingSummary[] = calculateRollingSummaries(
      profile,
      threadCategories
    );
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
function functionNameCategorizer() {
  const cache = new Map();
  return function functionNameToCategory(name) {
    const existingCategory = cache.get(name);
    if (existingCategory !== undefined) {
      return existingCategory;
    }

    for (const [matches, pattern, category] of categories) {
      if (matches(name, pattern)) {
        cache.set(name, category);
        return category;
      }
    }

    cache.set(name, false);
    return false;
  };
}

/**
 * A function that categorizes a sample.
 */
type SampleCategorizer = (stackIndex: IndexIntoStackTable | null) =>
  | string
  | null;

/**
 * Given a profile, return a function that categorizes a sample.
 * @param {object} thread Thread from a profile.
 * @return {function} Sample stack categorizer.
 */
function sampleCategorizer(thread: Thread): SampleCategorizer {
  const categorizeFuncName = functionNameCategorizer();

  function computeCategory(stackIndex: IndexIntoStackTable | null):
    | string
    | null {
    if (stackIndex === null) {
      return null;
    }

    const frameIndex = thread.stackTable.frame[stackIndex];
    const implIndex = thread.frameTable.implementation[frameIndex];
    if (implIndex !== null) {
      // script.execute.baseline or script.execute.ion
      return 'script.execute.' + thread.stringTable._array[implIndex];
    }

    const funcIndex = thread.frameTable.func[frameIndex];
    const name = thread.stringTable._array[thread.funcTable.name[funcIndex]];
    const category = categorizeFuncName(name);
    if (category !== false && category !== 'wait') {
      return category;
    }

    const prefixCategory = categorizeSampleStack(
      thread.stackTable.prefix[stackIndex]
    );
    if (category === 'wait') {
      if (prefixCategory === null || prefixCategory === 'uncategorized') {
        return 'wait';
      }
      if (prefixCategory.endsWith('.wait') || prefixCategory === 'wait') {
        return prefixCategory;
      }
      return prefixCategory + '.wait';
    }

    return prefixCategory;
  }

  const stackCategoryCache: Map<IndexIntoStackTable, string | null> = new Map();

  function categorizeSampleStack(stackIndex: IndexIntoStackTable | null):
    | string
    | null {
    if (stackIndex === null) {
      return null;
    }
    let category = stackCategoryCache.get(stackIndex);
    if (category !== undefined) {
      return category;
    }

    category = computeCategory(stackIndex);
    stackCategoryCache.set(stackIndex, category);
    return category;
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
function summarizeSampleCategories(
  summary: Summary,
  fullCategoryName: string | null
): Summary {
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

  const sampleCount = rows.reduce(
    (sum: number, [name: string, count: number]) => {
      // Only count the sample if it's not a sub-category. For instance "script.link"
      // is a sub-category of "script".
      return sum + (name.includes('.') ? 0 : count);
    },
    0
  );

  return (
    rows
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
      })
  );
}

function logStacks(stacksInCategory: StacksInCategory, maxLogLength = 10) {
  const entries = objectEntries(stacksInCategory);
  const data = entries
    .sort(([, { total: a }], [, { total: b }]) => b - a)
    .slice(0, Math.min(maxLogLength, entries.length));

  /* eslint-disable no-console */
  console.log(`Top ${maxLogLength} stacks in selected category`);
  console.log(data);
  /* eslint-enable no-console */
}

function stackToString(
  stackIndex: IndexIntoStackTable,
  thread: Thread
): string {
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

function incrementPerThreadCount(
  container: StacksInCategory,
  key: string,
  threadName: string
) {
  const count = container[key] || { total: 0, [threadName]: 0 };
  count.total++;
  count[threadName]++;
  container[key] = count;
}

function countStacksInCategory(
  profile: Profile,
  threadCategories: ThreadCategories,
  category: string = 'uncategorized'
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
          incrementPerThreadCount(
            stacksInCategory,
            stringCallStack,
            thread.name
          );
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
      const stacks: StacksInCategory = countStacksInCategory(
        profile,
        threadCategories,
        categoryToDump
      );
      console.log(
        `${Object.keys(stacks).length} stacks labeled '${categoryToDump}'`
      );
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
export function summarizeCategories(
  profile: Profile,
  threadCategories: ThreadCategories
) {
  return threadCategories
    .map(categories => categories.reduce(summarizeSampleCategories, {}))
    .map(calculateSummaryPercentages);
}

export function calculateRollingSummaries(
  profile: Profile,
  threadCategories: ThreadCategories,
  segmentCount: number = 40,
  rolling: number = 4
): RollingSummary[] {
  const [minTime, maxTime] = profile.threads
    .map(thread => {
      return [
        thread.samples.time[0],
        thread.samples.time[thread.samples.time.length - 1],
      ];
    })
    .reduce((a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1])]);
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
      const samples: { [string]: number } = {};

      const rollingMinTime =
        minTime + i * segmentLength + segmentHalfLength - rollingHalfLength;
      const rollingMaxTime = rollingMinTime + rollingLength;

      for (
        let sampleIndex = 0;
        sampleIndex < thread.samples.time.length;
        sampleIndex++
      ) {
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

function mapObj<T>(object: { [string]: T }, fn: (T, string, number) => T) {
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
