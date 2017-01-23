import { timeCode } from './time-code';

/**
 * A list of strategies for matching sample names to patterns.
 */
const match = {
  exact: (symbol, pattern) => symbol === pattern,
  prefix: (symbol, pattern) => symbol.startsWith(pattern),
  substring: (symbol, pattern) => symbol.includes(pattern),
  stem: (symbol, pattern) => {
    return symbol === pattern || (symbol && symbol.startsWith(pattern + '('));
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
  [match.prefix, 'js::jit::BaselineCompiler::compile', 'script.compile.baseline'],

  [match.prefix, 'CompositorBridgeParent::Composite', 'paint'],
  [match.prefix, 'mozilla::layers::PLayerTransactionParent::Read(', 'messageread'],

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

export function summarizeProfile(profile) {
  return timeCode('summarizeProfile', () => {
    const categories = categorizeThreadSamples(profile);
    const rollingSummaries = calculateRollingSummaries(profile, categories);
    const summaries = summarizeCategories(profile, categories);

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
 * Given a profile, return a function that categorizes a sample.
 * @param {object} thread Thread from a profile.
 * @return {function} Sample stack categorizer.
 */
function sampleCategorizer(thread) {
  const categorizeFuncName = functionNameCategorizer();

  function computeCategory(stackIndex) {
    if (stackIndex === null) {
      return 'uncategorized';
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

    const prefixCategory = categorizeSampleStack(thread.stackTable.prefix[stackIndex]);
    if (category === 'wait') {
      if (prefixCategory === 'uncategorized') {
        return 'wait';
      }
      if (prefixCategory.endsWith('.wait') || prefixCategory === 'wait') {
        return prefixCategory;
      }
      return prefixCategory + '.wait';
    }

    return prefixCategory;
  }

  const stackCategoryCache = new Map();
  function categorizeSampleStack(stackIndex) {
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
function summarizeSampleCategories(summary, fullCategoryName) {
  const categories = fullCategoryName.split('.');

  while (categories.length > 0) {
    const category = categories.join('.');
    summary[category] = (summary[category] || 0) + 1;
    categories.pop();
  }

  return summary;
}

/**
 * Finalize the summary calculation by attaching percentages and sorting the result.
 * @param {object} summary - The object that summarizes the times of the samples.
 * @return {array} The summary with percentages.
 */
function calculateSummaryPercentages(summary) {
  const rows = Object.entries(summary);

  const sampleCount = rows.reduce((sum, [name, count]) => {
    // Only count the sample if it's not a sub-category. For instance "script.link"
    // is a sub-category of "script".
    return sum + (name.includes('.') ? 0 : count);
  }, 0);

  return rows
    .map(([category, samples]) => {
      const percentage = samples / sampleCount;
      return { category, samples, percentage };
    })
    .sort((a, b) => b.samples - a.samples);
}

function logStacks(samples, maxLogLength = 10) {
  const entries = Object.entries(samples);
  /* eslint-disable no-console */
  console.log(`Top ${maxLogLength} stacks in selected category`);
  const log = typeof console.table === 'function' ? console.table : console.log;
  log(
    entries
      .sort(([, {total: a}], [, {total: b}]) => b - a)
      .slice(0, Math.min(maxLogLength, entries.length))
  );
  /* eslint-enable no-console */
}

function stackToString(stackIndex, thread) {
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

function incrementPerThreadCount(container, key, threadName) {
  const count = container[key] || { total: 0, [threadName]: 0 };
  count.total++;
  count[threadName]++;
  container[key] = count;
}

function countStacksInCategory(profile, summaries, category = 'uncategorized') {
  const uncategorized = {};
  profile.threads.forEach((thread, i) => {
    const threadSummary = summaries[i];
    const { samples } = thread;
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      if (threadSummary[sampleIndex] === category) {
        const stringCallStack = stackToString(samples.stack[sampleIndex], thread);
        incrementPerThreadCount(uncategorized, stringCallStack, thread.name);
      }
    }
  });
  return uncategorized;
}

/**
 * Take a profile and return a summary that categorizes each sample, then calculate
 * a summary of the percentage of time each sample was present.
 * @param {array} profile - The current profile.
 * @returns {array} Stacks mapped to categories.
 */
export function categorizeThreadSamples(profile) {
  return timeCode('categorizeThreadSamples', () => {
    const summaries = profile.threads.map(thread => {
      const categorizer = sampleCategorizer(thread);
      return thread.samples.stack.map(categorizer);
    });

    if (process.env.NODE_ENV === 'development') {
      const cat = process.env.DUMP_CATEGORY || 'uncategorized';
      const stacks = countStacksInCategory(profile, summaries, cat);
      console.log(`${Object.keys(stacks).length} stacks labeled '${cat}'`);
      logStacks(stacks);
    }

    return summaries;
  });
}

/**
 * Take a profile and return a summary that categorizes each sample, then calculate
 * a summary of the percentage of time each sample was present.
 * @param {object} profile - The profile to summarize.
 * @param {object} threadCategories - Each thread's categories for the samples.
 * @returns {object} The summaries of each thread.
 */
export function summarizeCategories(profile, threadCategories) {
  return threadCategories.map(categories => (
      categories.reduce(summarizeSampleCategories, {})
    ))
    .map(calculateSummaryPercentages);
    // Sort the threads based on how many categories they have.
    // .sort((a, b) => Object.keys(b.summary).length - Object.keys(a.summary).length);
}

export function calculateRollingSummaries(profile, threadCategories, segmentCount = 40, rolling = 4) {
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

    return times(segmentCount, segmentIndex => {
      let samplesInRange = 0;
      const samples = {};

      const rollingMinTime = minTime + (segmentIndex * segmentLength) + segmentHalfLength - rollingHalfLength;
      const rollingMaxTime = rollingMinTime + rollingLength;

      for (let sampleIndex = 0; sampleIndex < thread.samples.time.length; sampleIndex++) {
        const time = thread.samples.time[sampleIndex];
        if (time > rollingMinTime) {
          if (time > rollingMaxTime) {
            break;
          }
          const category = categories[sampleIndex];
          samples[category] = (samples[category] || 0) + 1;
          samplesInRange++;
        }
      }

      return {
        samples,
        percentage: mapObj(samples, count => count / samplesInRange),
      };
    });
  });
}

function times(n, fn) {
  const results = Array(n);
  for (let i = 0; i < n; i++) {
    results[i] = fn(i);
  }
  return results;
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
