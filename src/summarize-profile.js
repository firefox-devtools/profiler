import { selectorsForThread, getProfile } from './selectors/';
import { createHistory } from 'history';

/**
 * Map symbol name its id, e.g. symbolToIds["js::RunScript"] === 45
 */
function calculateSymbolToIds(profile) {
  const symbolsText = profile.symbolicationTable;
  const symbolToIds = {};

  for (let id in symbolsText) {
    if (symbolsText.hasOwnProperty(id)) {
      id = Number(id);
      const name = symbolsText[id];
      const ids = symbolToIds[name] || [];
      ids.push(id);
      symbolToIds[name] = ids;
    }
  }
  return symbolToIds;
}

/**
 * A list of strategies for matching sample names to patterns.
 */
const match = {
  exact: (symbol, pattern) => symbol === pattern,
  prefix: (symbol, pattern) => symbol.indexOf(pattern) === 0,
  substring: (symbol, pattern) => symbol.indexOf(pattern) > -1,
  stem: (symbol, pattern) => {
    return symbol === pattern || symbol.indexOf(pattern + '(') === 0;
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

  // Can't do this until we come up with a way of labeling ion/baseline.
  // [match.prefix, 'Interpret(', 'script.interpreter',
];

/**
 * Return an object that maps symbol ids to its category
 * e.g. symbolIdToCategory[45] === "script"
 */
function calculateSymbolIdToCategory(profile) {
  // Assign categories to all symbols
  const symbolToIds = calculateSymbolToIds(profile);
  const symbolIdToCategory = {};

  for (let symbol in symbolToIds) {
    let symbolIds = symbolToIds[symbol];

    // Go through each category and attempt to assign it to this symbol.
    categories.forEach(([matches, pattern, category]) => {
      if (matches(symbol, pattern)) {
        symbolIds.forEach(id => {
          symbolIdToCategory[id] = category;
        });
      }
    });
  }

  return symbolIdToCategory;
}

/**
 * Return a function that categorizes a function name. The categories
 * are cached between calls.
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

/**
 * Given a profile, return a function that categorizes a sample.
 */
function sampleCategorizer(thread) {
  const categorize = functionNameCategorizer();

  return function categorizeSampleStack(nextStackIndex) {
    const stacks = [];
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

    return 'uncategorized';
  };
}

/**
 * Count the number of samples in a given category. This will also count subcategories
 * in the case of categories labeled like "script.link", so "script" and "script.link"
 * will each be counted as having a sample.
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
 */
function calculateSummaryPercentages(summary, i) {
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
 */
function attachThreadInformation(threads) {
  return function(histogram, i) {
    const thread = threads[i];
    return { thread: thread.name, histogram };
  };
}

/**
 * Take a profile and return a summary that categorizes each sample, then calculate
 * a summary of the percentage of time each sample was present.
 */
function summarizeProfile (profile) {
  const summaries = profile.threads.map((thread, i) => (
      thread.samples.stack
        .map(sampleCategorizer(thread))
        .reduce(summarizeSampleCategories, {})
    ))
    .map(calculateSummaryPercentages)
    .map(attachThreadInformation(profile.threads));

  summaries.forEach(({thread, histogram}) => {
    console.log(thread);
    console.table(histogram);
  });

  console.log(summaries);
}

fetch('./profiles/state-dump.json')
  .then(r => r.json())
  .then(state => summarizeProfile(getProfile(state)))
  .catch(console.error.bind(console));
