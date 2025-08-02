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
        if (
          !file.includes('test') &&
          file !== 'libdef' &&
          file !== '@types' &&
          file !== 'node_modules'
        ) {
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
        if (
          relativePath.includes('/test/') ||
          relativePath.includes('/libdef/')
        ) {
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

function findExcludedFiles() {
  const content = fs.readFileSync('tsconfig.migration.json', 'utf8');
  const json = JSON.parse(content);
  return json.exclude;
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

// Calculate transitive unfinished dependencies
function calculateTransitiveDependencies(
  file,
  graph,
  transitiveDependenciesOfFile,
  visited = new Set()
) {
  if (transitiveDependenciesOfFile.has(file)) {
    return transitiveDependenciesOfFile.get(file);
  }

  if (visited.has(file)) {
    return new Set(); // Avoid cycles
  }

  visited.add(file);
  const fileInfo = graph.get(file);

  if (!fileInfo) {
    return new Set();
  }

  const transitiveDeps = new Set();

  for (const dep of fileInfo.directDependencies) {
    const depInfo = graph.get(dep);
    if (depInfo && !depInfo.isFinished) {
      transitiveDeps.add(dep);
    }

    // Add transitive dependencies
    const transitiveOfDep = calculateTransitiveDependencies(
      dep,
      graph,
      transitiveDependenciesOfFile,
      new Set(visited)
    );
    for (const transitiveDep of transitiveOfDep) {
      if (!graph.get(transitiveDep)?.isFinished) {
        transitiveDeps.add(transitiveDep);
      }
    }
  }

  transitiveDependenciesOfFile.set(file, transitiveDeps);
  return transitiveDeps;
}

// Analyze files and generate report
function analyzeFiles() {
  console.log(
    '🔍 Analyzing JavaScript and TypeScript files and their dependencies...\n'
  );

  const { jsFiles, tsFiles } = findFiles();
  const excludedFiles = new Set(findExcludedFiles());
  const allFiles = new Set([...jsFiles, ...tsFiles]);

  console.log(`📊 File statistics:`);
  console.log(`   JavaScript files remaining: ${jsFiles.length}`);
  console.log(
    `   TypeScript files converted: ${tsFiles.length} (${excludedFiles.size} not passing strict)`
  );
  console.log(`   Total files analyzed: ${allFiles.size}\n`);

  const graph = buildDependencyGraph(allFiles, excludedFiles);

  // const importersOfFile = new Map();
  // for (const [file, fileInfo] of graph) {
  //   for (const dep of fileInfo.directDependencies) {
  //     const importers = importersOfFile.get(dep);
  //     if (importers !== undefined) {
  //       importers.add(file);
  //     } else {
  //       importersOfFile.set(file, new Set([file]));
  //     }
  //   }
  // }

  const transitiveDependenciesOfFile = new Map();
  for (const [file] of graph) {
    calculateTransitiveDependencies(file, graph, transitiveDependenciesOfFile);
  }

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
