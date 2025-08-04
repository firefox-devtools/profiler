#!/usr/bin/env node

/**
 * Dependency analysis script for TypeScript migration
 * Helps identify files with minimal dependencies for optimal conversion order
 */

const fs = require('fs');
const path = require('path');

// Find all relevant files in the src directory
function findFiles() {
  const jsFiles = [];
  const tsFiles = [];

  function walkDir(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip test directories, libdef directories, and node_modules
        if (file !== 'libdef' && file !== '@types' && file !== 'node_modules') {
          walkDir(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(file);
        const relativePath = path.relative('src', fullPath);

        // Skip special files that shouldn't be converted
        if (
          file === 'node-worker-contents.js' ||
          file === 'simpleperf_report.js' ||
          file === 'webpack.config.js'
        ) {
          continue;
        }

        // Skip test files and libdef files
        if (file.endsWith('.test.js') || relativePath.includes('/libdef/')) {
          continue;
        }

        if (ext === '.js') {
          jsFiles.push(fullPath);
        } else if (ext === '.ts' || ext === '.tsx') {
          tsFiles.push(fullPath);
        }
      }
    }
  }

  walkDir('src');
  return { jsFiles, tsFiles };
}

// Extract import statements from a file
function extractImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const imports = [];

    // Match from statements and dynamic imports/requires
    const patterns = [
      /}\s*from\s+['"`]([^'"`]+)['"`]/g,
      /import\s+.*?from\s+['"`]([^'"`]+)['"`]/g,
      /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    ];

    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const importPath = match[1];

        // Include relative imports and firefox-profiler/ imports (local files)
        if (
          importPath.startsWith('./') ||
          importPath.startsWith('../') ||
          importPath.startsWith('firefox-profiler/')
        ) {
          imports.push(importPath);
        }
      }
    }

    return imports;
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`);
    return [];
  }
}

// Resolve import path to actual file path
function resolveImportPath(importPath, fromFile) {
  let resolvedPath;

  // Handle firefox-profiler/* path mapping
  if (importPath.startsWith('firefox-profiler/')) {
    const srcPath = importPath.replace('firefox-profiler/', '');
    resolvedPath = path.resolve('src', srcPath);
  } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
    // Handle relative imports
    const fromDir = path.dirname(fromFile);
    resolvedPath = path.resolve(fromDir, importPath);
  } else {
    // Assume it's an npm package or other external import
    return null;
  }

  // Try different extensions if the import doesn't specify one
  if (!path.extname(resolvedPath)) {
    const extensions = ['.js', '.ts', '.tsx'];
    for (const ext of extensions) {
      const withExt = resolvedPath + ext;
      if (fs.existsSync(withExt)) {
        return withExt;
      }
    }

    // Try index files
    for (const ext of extensions) {
      const indexFile = path.join(resolvedPath, 'index' + ext);
      if (fs.existsSync(indexFile)) {
        return indexFile;
      }
    }
  } else if (fs.existsSync(resolvedPath)) {
    return resolvedPath;
  }

  // Return null if we can't resolve it (external dependency)
  return null;
}

// Check if a file has been converted to TypeScript
function isTypeScriptFile(filePath) {
  const ext = path.extname(filePath);
  return ext === '.ts' || ext === '.tsx';
}

// Build dependency graph
function buildDependencyGraph(allFiles, excludedFiles) {
  const graph = new Map();

  for (const file of allFiles) {
    const imports = extractImports(file);
    const resolvedImports = [
      ...new Set(
        imports
          .map((imp) => resolveImportPath(imp, file))
          .filter((resolved) => {
            if (resolved === null) {
              return false;
            }
            // Convert resolved path to relative path to match allFiles format
            const relativePath = path.relative(process.cwd(), resolved);
            // Don't include self as dependency
            return allFiles.has(relativePath) && relativePath !== file;
          })
          .map((resolved) => path.relative(process.cwd(), resolved))
      ),
    ];

    const isConverted = isTypeScriptFile(file);
    const isExcluded = excludedFiles.has(file);
    const isStrict = isConverted && !isExcluded;
    const isFinished = isConverted && isStrict;
    graph.set(file, {
      directDependencies: resolvedImports,
      isConverted,
      isStrict,
      isFinished,
      lineCount: getLineCount(file),
    });
  }

  return graph;
}

// Get line count of a file
function getLineCount(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch (error) {
    return 0;
  }
}

/**
 * Compute the closure of each node, with correct handling of cycles. Makes use
 * of Tarjan's SCC algorithm.
 *
 * For this input:
 *
 * ```js
 * const testGraph = new Map([
 *     ['A', new Set(['B', 'C', 'D'])],
 *     ['B', new Set(['A', 'E'])],
 *     ['C', new Set()],
 *     ['D', new Set()],
 *     ['E', new Set()]
 * ]);
 * ```
 *
 * The output will be:
 *
 * ```js
 * const testGraph = new Map([
 *     ['A', new Set(['B', 'C', 'D', 'E'])],
 *     ['B', new Set(['A', 'C', 'D', 'E'])],
 *     ['C', new Set()],
 *     ['D', new Set()],
 *     ['E', new Set()]
 * ]);
 * ```
 *
 * @param {Map<string, Set<string>>} graph The direct dependencies of each file
 * @returns {Map<string, Set<string>>} The set of transitive dependencies of each file
 */
function calculateReachableNodes(graph) {
  // Step 1: Find all nodes in the graph
  const allNodes = new Set([...graph.keys()]);
  for (const neighbors of graph.values()) {
    for (const neighbor of neighbors) {
      allNodes.add(neighbor);
    }
  }

  // Step 2: Find strongly connected components using Tarjan's algorithm
  const sccs = findSCCs(graph, allNodes);

  // Step 3: Build condensed graph (DAG of SCCs)
  const { sccGraph, nodeToScc, sccNodes } = buildCondensedGraph(graph, sccs);

  // Step 4: Compute reachability on the condensed DAG
  const sccReachability = computeDAGReachability(sccGraph);

  // Step 5: Expand back to original nodes
  const result = new Map();

  for (const node of allNodes) {
    const reachable = new Set();
    const nodeScc = nodeToScc.get(node);

    // Add all nodes in reachable SCCs
    const reachableSccs = sccReachability.get(nodeScc);
    for (const scc of reachableSccs) {
      for (const reachableNode of sccNodes.get(scc)) {
        if (reachableNode !== node) {
          // Don't include the node itself
          reachable.add(reachableNode);
        }
      }
    }

    result.set(node, reachable);
  }

  return result;
}

function findSCCs(graph, allNodes) {
  let index = 0;
  const stack = [];
  const indices = new Map();
  const lowlinks = new Map();
  const onStack = new Set();
  const sccs = [];

  function strongConnect(node) {
    indices.set(node, index);
    lowlinks.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        lowlinks.set(
          node,
          Math.min(lowlinks.get(node), lowlinks.get(neighbor))
        );
      } else if (onStack.has(neighbor)) {
        lowlinks.set(node, Math.min(lowlinks.get(node), indices.get(neighbor)));
      }
    }

    if (lowlinks.get(node) === indices.get(node)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== node);
      sccs.push(scc);
    }
  }

  for (const node of allNodes) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return sccs;
}

function buildCondensedGraph(originalGraph, sccs) {
  const nodeToScc = new Map();
  const sccNodes = new Map();

  // Map each node to its SCC index and track nodes in each SCC
  sccs.forEach((scc, sccIndex) => {
    sccNodes.set(sccIndex, new Set(scc));
    scc.forEach((node) => {
      nodeToScc.set(node, sccIndex);
    });
  });

  // Build condensed graph (edges between SCCs)
  const sccGraph = new Map();
  for (let i = 0; i < sccs.length; i++) {
    sccGraph.set(i, new Set());
  }

  for (const [node, neighbors] of originalGraph) {
    const fromScc = nodeToScc.get(node);
    for (const neighbor of neighbors) {
      const toScc = nodeToScc.get(neighbor);
      if (fromScc !== toScc) {
        sccGraph.get(fromScc).add(toScc);
      }
    }
  }

  return { sccGraph, nodeToScc, sccNodes };
}

function computeDAGReachability(dagGraph) {
  const result = new Map();

  function dfs(scc) {
    if (result.has(scc)) {
      return result.get(scc);
    }

    const reachable = new Set();
    reachable.add(scc); // SCC can reach itself

    const neighbors = dagGraph.get(scc) || new Set();
    for (const neighbor of neighbors) {
      const neighborReachable = dfs(neighbor);
      for (const reachableScc of neighborReachable) {
        reachable.add(reachableScc);
      }
    }

    result.set(scc, reachable);
    return reachable;
  }

  for (const scc of dagGraph.keys()) {
    dfs(scc);
  }

  return result;
}

// Analyze files and generate report
function analyzeFiles() {
  console.log(
    '🔍 Analyzing JavaScript and TypeScript files and their dependencies...\n'
  );

  const { jsFiles, tsFiles } = findFiles();
  const excludedFiles = new Set();
  const allFiles = new Set([...jsFiles, ...tsFiles]);

  console.log(`📊 File statistics:`);
  console.log(`   JavaScript files remaining: ${jsFiles.length}`);
  console.log(
    `   TypeScript files converted: ${tsFiles.length} (${excludedFiles.size} not passing strict)`
  );
  console.log(`   Total files analyzed: ${allFiles.size}\n`);

  const graph = buildDependencyGraph(allFiles, excludedFiles);

  const directDependencyMap = new Map(
    Array.from(graph.entries()).map(([file, fileInfo]) => [
      file,
      fileInfo.directDependencies,
    ])
  );

  const transitiveDependenciesOfFile =
    calculateReachableNodes(directDependencyMap);

  // Analyze each file
  const fileAnalysis = [];

  for (const [file, fileInfo] of graph) {
    if (fileInfo.isFinished) {
      continue;
    }

    const directUnfinishedDeps = fileInfo.directDependencies.filter(
      (dep) => !graph.get(dep)?.isFinished
    );

    const transitiveDeps = transitiveDependenciesOfFile.get(file);
    const transitiveUnfinishedDeps = [...transitiveDeps].filter(
      (dep) => !graph.get(dep)?.isFinished
    );

    fileAnalysis.push({
      file,
      isConverted: fileInfo.isConverted,
      lineCount: fileInfo.lineCount,
      directDependencies: fileInfo.directDependencies.length,
      directUnfinishedDependencies: directUnfinishedDeps.length,
      transitiveUnfinishedDependencies: transitiveUnfinishedDeps.length,
      directUnfinishedDepsList: directUnfinishedDeps,
      transitiveUnfinishedDepsList: transitiveUnfinishedDeps,
    });
  }

  // Sort by ease of fixing (fewer transitive dependencies = easier)
  fileAnalysis.sort((a, b) => {
    // First sort by transitive dependencies
    if (
      a.transitiveUnfinishedDependencies !== b.transitiveUnfinishedDependencies
    ) {
      return (
        a.transitiveUnfinishedDependencies - b.transitiveUnfinishedDependencies
      );
    }
    // Then by direct dependencies
    if (a.directUnfinishedDependencies !== b.directUnfinishedDependencies) {
      return a.directUnfinishedDependencies - b.directUnfinishedDependencies;
    }
    // Finally by file size (smaller first)
    return a.lineCount - b.lineCount;
  });

  console.log(
    '🎯 Files ordered by ease of fixing (transitive unfinished deps : direct unfinished deps : lines : file):'
  );
  console.log(
    '   Note: "Direct dependencies" = files imported directly by this file'
  );
  console.log(
    '   Note: "Transitive dependencies" = all unfinished files this file depends on (directly or indirectly)\n'
  );
  console.log(
    '🔧  For [JS] files, "unfinished" means that the file needs to be converted.'
  );
  console.log(
    '    For [TS] files, "unfinished" means that the file has strict typechecking issues that need'
  );
  console.log(
    '    to be fixed before the file can be removed from the strict "exclude" list.\n'
  );

  for (const analysis of fileAnalysis) {
    const relativePath = path.relative(process.cwd(), analysis.file);
    let emoji;

    if (analysis.transitiveUnfinishedDependencies === 0) {
      emoji = '🟢';
    } else if (analysis.transitiveUnfinishedDependencies <= 2) {
      emoji = '🟡';
    } else if (analysis.transitiveUnfinishedDependencies <= 5) {
      emoji = '🟠';
    } else {
      emoji = '🔴';
    }

    const fileType = analysis.isConverted ? '[TS]' : '[JS]';

    console.log(
      `${emoji} ${analysis.transitiveUnfinishedDependencies} trans, ${analysis.directUnfinishedDependencies} direct, ${analysis.lineCount} lines: ${fileType} ${relativePath}`
    );

    // Show problematic dependencies for files that aren't ready
    if (
      analysis.transitiveUnfinishedDependencies > 0 &&
      analysis.transitiveUnfinishedDependencies <= 10
    ) {
      const directDepsStr = analysis.directUnfinishedDepsList
        .map((dep) => path.relative(process.cwd(), dep))
        .join(', ');
      if (directDepsStr) {
        console.log(`   └─ Direct unfinished deps: ${directDepsStr}`);
      }
    }
  }

  console.log('\n🚀 Recommended conversion strategy:');
  console.log(
    '   1. Convert 🟢 files first (no transitive unfinished dependencies)'
  );
  console.log('   2. Then convert 🟡 files (few transitive dependencies)');
  console.log('   3. Convert 🟠 files next (moderate dependencies)');
  console.log('   4. Save 🔴 files for last (many dependencies)');
  console.log('\n💡 Tips:');
  console.log(
    '   • Convert smaller files within each category first for easier testing'
  );
  console.log(
    '   • [TS] files may still need fixes to pass strict type checking'
  );
  console.log(
    '   • Focus on direct dependencies to maximize impact on other files'
  );

  // Summary statistics
  const readyFiles = fileAnalysis.filter(
    (f) => f.transitiveUnfinishedDependencies === 0
  );
  const jsReadyFiles = readyFiles.filter((f) => !f.isConverted);
  const tsNeedingFixes = readyFiles.filter((f) => f.isConverted);

  console.log('\n📈 Summary:');
  console.log(`   • ${jsReadyFiles.length} JS files ready for conversion`);
  console.log(
    `   • ${tsNeedingFixes.length} TS files may need strict type checking fixes`
  );
  console.log(
    `   • ${fileAnalysis.length - readyFiles.length} files blocked by dependencies`
  );
}

// Main execution
if (require.main === module) {
  try {
    analyzeFiles();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
