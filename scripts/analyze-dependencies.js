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
          file !== 'node_modules'
        ) {
          walkDir(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(file);
        const relativePath = path.relative('src', fullPath);

        // Skip special files that shouldn't be converted
        if (file === 'node-worker-contents.js') {
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
function buildDependencyGraph(allFiles) {
  const graph = new Map();

  for (const file of allFiles) {
    const imports = extractImports(file);
    const resolvedImports = [
      ...new Set(
        imports
          .map((imp) => resolveImportPath(imp, file))
          .filter((resolved) => {
            if (resolved === null) return false;
            // Convert resolved path to relative path to match allFiles format
            const relativePath = path.relative(process.cwd(), resolved);
            // Don't include self as dependency
            return allFiles.includes(relativePath) && relativePath !== file;
          })
          .map((resolved) => path.relative(process.cwd(), resolved))
      ),
    ];

    graph.set(file, {
      directDependencies: resolvedImports,
      isConverted: isTypeScriptFile(file),
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

// Calculate transitive unconverted dependencies
function calculateTransitiveDependencies(file, graph, visited = new Set()) {
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
    if (depInfo && !depInfo.isConverted) {
      transitiveDeps.add(dep);
    }

    // Add transitive dependencies
    const transitiveOfDep = calculateTransitiveDependencies(
      dep,
      graph,
      new Set(visited)
    );
    for (const transitiveDep of transitiveOfDep) {
      if (!graph.get(transitiveDep)?.isConverted) {
        transitiveDeps.add(transitiveDep);
      }
    }
  }

  return transitiveDeps;
}

// Analyze files and generate report
function analyzeFiles() {
  console.log(
    '🔍 Analyzing JavaScript and TypeScript files and their dependencies...\n'
  );

  const { jsFiles, tsFiles } = findFiles();
  const allFiles = [...jsFiles, ...tsFiles];

  console.log(`📊 File statistics:`);
  console.log(`   JavaScript files remaining: ${jsFiles.length}`);
  console.log(`   TypeScript files converted: ${tsFiles.length}`);
  console.log(`   Total files analyzed: ${allFiles.length}\n`);

  const graph = buildDependencyGraph(allFiles);

  // Analyze each file
  const fileAnalysis = [];

  for (const file of allFiles) {
    const fileInfo = graph.get(file);
    if (!fileInfo) continue;

    const directUnconvertedDeps = fileInfo.directDependencies.filter(
      (dep) => !graph.get(dep)?.isConverted
    );

    const transitiveDeps = calculateTransitiveDependencies(file, graph);

    fileAnalysis.push({
      file,
      isConverted: fileInfo.isConverted,
      lineCount: fileInfo.lineCount,
      directDependencies: fileInfo.directDependencies.length,
      directUnconvertedDependencies: directUnconvertedDeps.length,
      transitiveUnconvertedDependencies: transitiveDeps.size,
      directUnconvertedDepsList: directUnconvertedDeps,
      transitiveUnconvertedDepsList: Array.from(transitiveDeps),
    });
  }

  // Sort by ease of fixing (fewer transitive dependencies = easier)
  fileAnalysis.sort((a, b) => {
    // First sort by transitive dependencies
    if (
      a.transitiveUnconvertedDependencies !==
      b.transitiveUnconvertedDependencies
    ) {
      return (
        a.transitiveUnconvertedDependencies -
        b.transitiveUnconvertedDependencies
      );
    }
    // Then by direct dependencies
    if (a.directUnconvertedDependencies !== b.directUnconvertedDependencies) {
      return a.directUnconvertedDependencies - b.directUnconvertedDependencies;
    }
    // Finally by file size (smaller first)
    return a.lineCount - b.lineCount;
  });

  console.log(
    '🎯 Files ordered by ease of fixing (transitive unconverted deps : direct unconverted deps : lines : file):'
  );
  console.log(
    '   Note: "Direct dependencies" = files imported directly by this file'
  );
  console.log(
    '   Note: "Transitive dependencies" = all unconverted files this file depends on (directly or indirectly)\n'
  );

  for (const analysis of fileAnalysis) {
    const relativePath = path.relative(process.cwd(), analysis.file);
    let emoji, category;

    if (analysis.transitiveUnconvertedDependencies === 0) {
      emoji = '🟢';
      category = 'READY';
    } else if (analysis.transitiveUnconvertedDependencies <= 2) {
      emoji = '🟡';
      category = 'SOON';
    } else if (analysis.transitiveUnconvertedDependencies <= 5) {
      emoji = '🟠';
      category = 'LATER';
    } else {
      emoji = '🔴';
      category = 'LAST';
    }

    const fileType = analysis.isConverted ? '[TS]' : '[JS]';

    console.log(
      `${emoji} ${analysis.transitiveUnconvertedDependencies} trans, ${analysis.directUnconvertedDependencies} direct, ${analysis.lineCount} lines: ${fileType} ${relativePath}`
    );

    // Show problematic dependencies for files that aren't ready
    if (
      analysis.transitiveUnconvertedDependencies > 0 &&
      analysis.transitiveUnconvertedDependencies <= 10
    ) {
      const directDepsStr = analysis.directUnconvertedDepsList
        .map((dep) => path.relative(process.cwd(), dep))
        .join(', ');
      if (directDepsStr) {
        console.log(`   └─ Direct unconverted deps: ${directDepsStr}`);
      }
    }
  }

  console.log('\n🚀 Recommended conversion strategy:');
  console.log(
    '   1. Convert 🟢 files first (no transitive unconverted dependencies)'
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
    (f) => f.transitiveUnconvertedDependencies === 0
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
