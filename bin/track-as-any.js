#!/usr/bin/env node

/**
 * Script to track and monitor `as any` usage in TypeScript files
 * Usage: yarn track-as-any [--baseline] [--diff] [--detail]
 */

const fs = require('fs');
const { execSync } = require('child_process');

const BASELINE_FILE = '.as-any-baseline.json';
const SRC_DIR = 'src';

function findAsAnyUsages() {
  try {
    // Use ripgrep to find all 'as any' usages with line numbers
    const output = execSync(
      `rg "as any" --type ts --line-number --no-heading --json ${SRC_DIR}`,
      { encoding: 'utf8' }
    );

    const usages = [];
    output
      .trim()
      .split('\n')
      .forEach((line) => {
        if (!line) {
          return;
        }
        try {
          const match = JSON.parse(line);
          if (match.type === 'match') {
            usages.push({
              file: match.data.path.text,
              line: match.data.line_number,
              content: match.data.lines.text.trim(),
              matches: match.data.submatches.map((sub) => ({
                start: sub.start,
                end: sub.end,
                text: sub.match.text,
              })),
            });
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      });

    // Ensure consistent order.
    usages.sort((a, b) => {
      if (a.file !== b.file) {
        return a.file < b.file ? -1 : 1;
      }
      if (a.line !== b.line) {
        return a.line < b.line ? -1 : 1;
      }
      return 0;
    });

    return usages;
  } catch (error) {
    if (error.status === 1) {
      // No matches found
      return [];
    }
    throw error;
  }
}

function groupByFile(usages) {
  const grouped = {};
  usages.forEach((usage) => {
    if (!grouped[usage.file]) {
      grouped[usage.file] = [];
    }
    grouped[usage.file].push({
      line: usage.line,
      content: usage.content,
    });
  });
  return grouped;
}

function generateReport(usages, options = {}) {
  const grouped = groupByFile(usages);
  const totalFiles = Object.keys(grouped).length;
  const totalUsages = usages.length;

  console.log(`\n📊 As Any Usage Report`);
  console.log(`======================`);
  console.log(`Total files with 'as any': ${totalFiles}`);
  console.log(`Total 'as any' usages: ${totalUsages}`);

  if (options.detail) {
    console.log(`\n📁 Files by usage count:`);
    const sortedFiles = Object.entries(grouped).sort(
      ([, a], [, b]) => b.length - a.length
    );

    sortedFiles.forEach(([file, fileUsages]) => {
      console.log(`  ${file}: ${fileUsages.length} usages`);
      if (options.detail && fileUsages.length <= 5) {
        fileUsages.forEach((usage) => {
          console.log(`    Line ${usage.line}: ${usage.content}`);
        });
      }
    });
  }

  return { totalFiles, totalUsages, grouped };
}

function saveBaseline(usages) {
  const data = {
    timestamp: new Date().toISOString(),
    totalUsages: usages.length,
    totalFiles: Object.keys(groupByFile(usages)).length,
    usages: usages.map((u) => ({
      file: u.file,
      line: u.line,
      content: u.content,
    })),
  };

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2));
  console.log(`✅ Baseline saved to ${BASELINE_FILE}`);
  return data;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch (error) {
    console.error(`❌ Error loading baseline: ${error.message}`);
    return null;
  }
}

function compareToPrevious(currentUsages, baseline) {
  if (!baseline) {
    console.log(`\n⚠️  No baseline found. Run with --baseline to create one.`);
    return;
  }

  const currentTotal = currentUsages.length;
  const baselineTotal = baseline.totalUsages;
  const diff = currentTotal - baselineTotal;

  console.log(`\n📈 Progress Report`);
  console.log(`==================`);
  console.log(
    `Baseline (${baseline.timestamp.split('T')[0]}): ${baselineTotal} usages`
  );
  console.log(`Current: ${currentTotal} usages`);

  if (diff > 0) {
    console.log(`❌ Increased by ${diff} usages`);
  } else if (diff < 0) {
    console.log(
      `✅ Reduced by ${Math.abs(diff)} usages (${((Math.abs(diff) / baselineTotal) * 100).toFixed(1)}% improvement)`
    );
  } else {
    console.log(`➡️  No change`);
  }

  // Show new/removed files
  const currentFiles = new Set(currentUsages.map((u) => u.file));
  const baselineFiles = new Set(baseline.usages.map((u) => u.file));

  const newFiles = [...currentFiles].filter((f) => !baselineFiles.has(f));
  const cleanedFiles = [...baselineFiles].filter((f) => !currentFiles.has(f));

  if (newFiles.length > 0) {
    console.log(`\n🔍 New files with 'as any':`);
    newFiles.forEach((file) => console.log(`  + ${file}`));
  }

  if (cleanedFiles.length > 0) {
    console.log(`\n🎉 Files cleaned of 'as any':`);
    cleanedFiles.forEach((file) => console.log(`  - ${file}`));
  }
}

function main() {
  const args = process.argv.slice(2);
  const options = {
    baseline: args.includes('--baseline'),
    diff: args.includes('--diff'),
    detail: args.includes('--detail'),
  };

  console.log(`🔍 Scanning for 'as any' usages in ${SRC_DIR}/...`);

  const usages = findAsAnyUsages();
  generateReport(usages, options);

  if (options.baseline) {
    saveBaseline(usages);
  }

  if (options.diff) {
    const baseline = loadBaseline();
    compareToPrevious(usages, baseline);
  }

  // Always show progress if baseline exists (unless explicitly creating baseline)
  if (!options.baseline) {
    const baseline = loadBaseline();
    if (baseline) {
      compareToPrevious(usages, baseline);
    }
  }

  console.log(`\n💡 Usage:`);
  console.log(
    `  yarn track-as-any --baseline  # Save current state as baseline`
  );
  console.log(`  yarn track-as-any --diff      # Compare with baseline`);
  console.log(`  yarn track-as-any --detail    # Show detailed file breakdown`);
}

if (require.main === module) {
  main();
}
