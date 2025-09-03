import esbuild from 'esbuild';
import fs from 'fs';
import { nodeBaseConfig } from '../../esbuild.mjs';

async function buildAll() {
  // Clean dist directory
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true });
  }

  const buildResult = await esbuild.build({
    ...nodeBaseConfig,
    metafile: true,
    entryPoints: ['src/symbolicator-cli/index.ts'],
    outfile: 'dist/symbolicator-cli.js',
  });

  if (buildResult.metafile) {
    fs.writeFileSync(
      'dist/metafile.json',
      JSON.stringify(buildResult.metafile, null, 2)
    );
    console.log('📊 Metafile saved to dist/metafile.json');
  }

  console.log('✅ Build completed');
}

// Run build if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildAll().catch(console.error);
}
