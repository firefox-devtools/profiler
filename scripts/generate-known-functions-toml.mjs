import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const jsCode = execSync(
  'node_modules/.bin/esbuild src/node-tools/profile-insert-labels/known-functions.ts --platform=node --format=esm'
).toString();

const dataUrl = 'data:text/javascript,' + encodeURIComponent(jsCode);
const { BREAK_OUT_BUCKETS } = await import(dataUrl);

let toml = '';
for (const bucket of BREAK_OUT_BUCKETS) {
  toml += `[[buckets]]\n`;
  toml += `name = ${JSON.stringify(bucket.name)}\n`;
  toml += `funcPrefixes = [\n`;
  for (const prefix of bucket.funcPrefixes) {
    toml += `  ${JSON.stringify(prefix)},\n`;
  }
  toml += `]\n\n`;
}

const outPath = 'src/node-tools/profile-insert-labels/known-functions.toml';
writeFileSync(outPath, toml.trimEnd() + '\n');
console.log(`Wrote ${outPath}`);
