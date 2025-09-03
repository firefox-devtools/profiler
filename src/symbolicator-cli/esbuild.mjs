import esbuild from 'esbuild';
import fs from 'fs';
import { nodeBaseConfig } from '../../esbuild.mjs';

async function buildAll() {
  // Clean dist directory
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true });
  }

  await esbuild.build({
    ...nodeBaseConfig,
    entryPoints: ['src/symbolicator-cli/index.ts'],
    outfile: 'dist/symbolicator-cli.js',
  });

  console.log('✅ Build completed');
}

// Run build if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildAll().catch(console.error);
}
