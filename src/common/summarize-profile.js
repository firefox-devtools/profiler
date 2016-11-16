/**
 * A list of strategies for matching sample names to patterns.
 */
const match = {
  exact: (symbol, pattern) => symbol === pattern,
  prefix: (symbol, pattern) => symbol.indexOf(pattern) === 0,
  substring: (symbol, pattern) => symbol.indexOf(pattern) > -1,
  stem: (symbol, pattern) => {
    return symbol === pattern || (symbol && symbol.indexOf(pattern + '(') === 0);
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
  // TODO - The mach msg trap is dependent on being called from RunCurrentEventLoopInMode
  // Probably add a fourth entry to this tuple for child checks.
  [match.exact, 'mach_msg_trap', 'idle'],

  // Can't do this until we come up with a way of labeling ion/baseline.
  // [match.prefix, 'Interpret(', 'script.interpreter',
];

/**
 * Return a function that categorizes a function name. The categories
 * are cached between calls.
 * @returns {function} Function categorizer.
 */
function functionNameCategorizer() {
  const cache = {};
  return function functionNameToCategory(name) {
    const existingCategory = cache[name];
    if (typeof existingCategory === 'string') {
      return existingCategory;
    }

    for (const [matches, pattern, category] of categories) {
      if (matches(name, pattern)) {
        cache[name] = category;
        return category;
      }
    }

    cache[name] = false;
    return false;
  };
}

let uncategorized = {};
/**
 * Given a profile, return a function that categorizes a sample.
 * @param {object} thread Thread from a profile.
 * @return {function} Sample stack categorizer.
 */
function sampleCategorizer(thread) {
  const categorize = functionNameCategorizer();

  return function categorizeSampleStack(initialStackIndex) {
    const stacks = [];
    let nextStackIndex = initialStackIndex;
    do {
      const stackIndex = nextStackIndex;
      const frameIndex = thread.stackTable.frame[stackIndex];
      nextStackIndex = thread.stackTable.prefix[stackIndex];
      const funcIndex = thread.frameTable.func[frameIndex];
      const name = thread.stringTable._array[thread.funcTable.name[funcIndex]];
      stacks.push(name);
      const category = categorize(name);
      if (category) {
        return category;
      }
    } while (typeof nextStackIndex === 'number');

    const stack = stacks.join('\n');
    uncategorized[stack] = (uncategorized[stack] || 0) + 1;
    return 'uncategorized';
  };
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
    return sum + (name.indexOf('.') > -1 ? 0 : count);
  }, 0);

  return rows
    .map(([category, samples]) => {
      const percentage = samples / sampleCount;
      return { category, samples, percentage };
    })
    .sort((a, b) => b.samples - a.samples);
}

/**
 * Also include any relevant meta-information here. Right now this is only the thread
 * name.
 * @param {object} threads - The threads from a profile.
 * @return {function} Function that attaches the summary and thread information.
 */
function attachThreadInformation(threads) {
  return function(summary, i) {
    const thread = threads[i];
    return { thread: thread.name, summary };
  };
}

function flushUncategorizedLog (maxLogLength = 50) {
  const entries = Object.entries(uncategorized);

  if (process.env.NODE_ENV.indexOf('development') === 0) {
    /* eslint-disable no-console */
    console.log(`Top ${maxLogLength} uncategorized stacks`);
    console.log(
      entries
        .sort(([, a], [, b]) => b - a)
        .slice(0, Math.min(maxLogLength, entries.length))
    );
    /* eslint-enable no-console */
  }

  uncategorized = {};
}

/**
 * Take a profile and return a summary that categorizes each sample, then calculate
 * a summary of the percentage of time each sample was present.
 * @param {object} profile - The profile to summarize.
 * @returns {object} The summaries of each thread.
 */
export function summarizeProfile (profile) {
  const summaries = profile.threads.map(thread => (
      thread.samples.stack
        .map(sampleCategorizer(thread))
        .reduce(summarizeSampleCategories, {})
    ))
    .map(calculateSummaryPercentages)
    .map(attachThreadInformation(profile.threads))
    // Sort the threads based on how many categories they have.
    .sort((a, b) => countKeys(b.summary) - countKeys(a.summary));

  // Uncategorized samples are collected as a side-effect from above.
  // They are only logged in development environments.
  flushUncategorizedLog();

  return summaries;
}

function countKeys (object) {
  let i = 0;
  for (const key in object) {
    if (object.hasOwnProperty(key)) {
      i++;
    }
  }
  return i;
}
