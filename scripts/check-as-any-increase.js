#!/usr/bin/env node

/**
 * Pre-commit hook to prevent increase in `as any` usage
 * Usage: node scripts/check-as-any-increase.js
 */

const fs = require('fs');
const { execSync } = require('child_process');

const BASELINE_FILE = '.as-any-baseline.json';
const SRC_DIR = 'src';

function findAsAnyUsages() {
  try {
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
            });
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
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

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.log(
      '⚠️  No baseline found. Run `yarn track-as-any --baseline` first.'
    );
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch (error) {
    console.error(`❌ Error loading baseline: ${error.message}`);
    process.exit(1);
  }
}

function main() {
  const baseline = loadBaseline();
  const currentUsages = findAsAnyUsages();

  const currentTotal = currentUsages.length;
  const baselineTotal = baseline.totalUsages;
  const diff = currentTotal - baselineTotal;

  if (diff > 0) {
    console.log(`❌ as any usage increased by ${diff}!`);
    console.log(`Baseline: ${baselineTotal} → Current: ${currentTotal}`);
    console.log(`\nTo allow this change, update baseline:`);
    console.log(`yarn track-as-any --baseline`);
    process.exit(1);
  } else if (diff < 0) {
    console.log(`✅ as any usage reduced by ${Math.abs(diff)}! Great work!`);
    console.log(`Consider updating baseline: yarn track-as-any --baseline`);
  } else {
    console.log(`✅ as any usage unchanged (${currentTotal} usages)`);
  }
}

if (require.main === module) {
  main();
}
