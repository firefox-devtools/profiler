import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  minify: true,
  publicPath: '/photon/',
  entryPoints: ['index.js'],
  loader: {
    '.png': 'file',
    '.jpg': 'file',
    '.svg': 'file',
    '.wasm': 'file',
  },
  outdir: '../../dist/photon',
  absWorkingDir: __dirname,
};

async function buildPhoton() {
  console.log('Building Photon...');
  await esbuild.build(config);
  console.log('✅ Photon build completed');
}

buildPhoton().catch(console.error);
