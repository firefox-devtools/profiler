import esbuild from 'esbuild';
import copy from 'esbuild-plugin-copy';
import { wasmLoader } from 'esbuild-plugin-wasm';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

function generateHtmlPlugin(options) {
  return {
    name: 'firefox-profiler-generate-html',
    setup(build) {
      const { outdir, publicPath } = build.initialOptions;
      build.initialOptions.metafile = true;
      build.onEnd(async (result) => {
        await generateHTML(result.metafile, { ...options, outdir, publicPath });
      });
    },
  };
}

const baseConfig = {
  bundle: true,
  minify: isProduction,
  absWorkingDir: __dirname,
  loader: {
    '.png': 'file',
    '.jpg': 'file',
    '.svg': 'file',
    '.worker.js': 'file',
  },
  alias: {
    'firefox-profiler': './src',
    'firefox-profiler-res': './res',
  },
};

const templateHTML = fs.readFileSync(
  path.join(__dirname, 'res/index.html'),
  'utf8'
);

export const mainBundleConfig = {
  ...baseConfig,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  splitting: true,
  entryPoints: ['src/index.tsx'],
  outdir: 'dist',
  metafile: true,
  publicPath: '/',
  entryNames: '[name]-[hash]',
  define: {
    'process.env.L10N': process.env.L10N
      ? JSON.stringify(process.env.L10N)
      : 'undefined',
    AVAILABLE_STAGING_LOCALES: process.env.L10N
      ? JSON.stringify(fs.readdirSync('./locales'))
      : 'undefined',
    // no need to define NODE_ENV:
    // esbuild automatically defines NODE_ENV based on the value for "minify"
  },
  external: ['zlib'],
  plugins: [
    wasmLoader(),
    copy({
      resolveFrom: __dirname,
      assets: [
        { from: ['res/_headers'], to: ['dist'] },
        { from: ['res/_redirects'], to: ['dist'] },
        { from: ['res/contribute.json'], to: ['dist'] },
        { from: ['res/robots.txt'], to: ['dist'] },
        { from: ['res/service-worker-compat.js'], to: ['dist'] },
        { from: ['res/img/favicon.png'], to: ['dist/res/img'] },
        { from: ['docs-user/**/*'], to: ['dist/docs'] },
        { from: ['locales/**/*'], to: ['dist/locales'] },
      ],
    }),
    generateHtmlPlugin({
      filename: 'index.html',
      entryPoint: 'src/index.tsx',
      templateHTML,
    }),
  ],
};

// Common build configuration for node-based tools
export const nodeBaseConfig = {
  ...baseConfig,
  platform: 'node',
  target: 'node16',
  splitting: false,
  format: 'cjs',
  bundle: true,
  external: ['fs', 'path', 'crypto', 'zlib'],
  plugins: [
    wasmLoader({
      mode: 'embedded',
    }),
  ],
};

async function buildAll() {
  // Clean dist directory
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true });
  }

  const builds = [];

  // Main app build
  builds.push(esbuild.build(mainBundleConfig));

  // Node tools (if requested)
  if (process.argv.includes('--node-tools')) {
    // Symbolicator CLI
    builds.push(
      esbuild.build({
        ...nodeBaseConfig,
        entryPoints: ['src/symbolicator-cli/index.ts'],
        outfile: 'dist/symbolicator-cli.js',
      })
    );
  }

  // Wait for all builds to complete
  const buildResults = await Promise.all(builds);

  // Save metafile data to a file, for example to allow visualizing bundle size.
  if (buildResults[0].metafile) {
    fs.writeFileSync(
      'dist/metafile.json',
      JSON.stringify(buildResults[0].metafile, null, 2)
    );
    console.log('📊 Metafile saved to dist/metafile.json');
  }

  console.log('✅ Build completed');
}

async function generateHTML(metafileJson, options) {
  const { entryPoint, templateHTML, filename, outdir, publicPath } = options;

  const htmlOutputPath = outdir + '/' + filename;

  function convertPath(oldPath) {
    const prefixToStrip = outdir + '/';

    if (!oldPath || !oldPath.startsWith || !oldPath.startsWith(prefixToStrip)) {
      throw new Error(
        `Unexpected path ${oldPath} which seems to be outside the outdir (which is set to ${outdir})`
      );
    }

    const relativePath = oldPath.slice(prefixToStrip.length);
    if (publicPath) {
      // e.g. publicPath === '/'
      return publicPath + relativePath;
    }
    return relativePath;
  }

  if (!metafileJson || !metafileJson.outputs) {
    throw new Error('No outputs detected');
  }

  const [mainBundlePath, mainBundle] = Object.entries(
    metafileJson.outputs
  ).find(([_bundlePath, bundle]) => bundle.entryPoint === entryPoint);

  const extraHeadTags = [];

  // Main JS bundle
  extraHeadTags.push(
    `<script src="${convertPath(mainBundlePath)}" type="module" async></script>`
  );

  // Main Stylesheet
  if (mainBundle.cssBundle) {
    extraHeadTags.push(
      `<link rel="stylesheet" href="${convertPath(mainBundle.cssBundle)}">`
    );
  }

  // Preload startup chunks
  const startupChunks = mainBundle.imports.filter(
    (imp) => imp.kind === 'import-statement' // as opposed to 'dynamic-import'
  );
  for (const startupChunk of startupChunks) {
    extraHeadTags.push(
      `<link rel="modulepreload" href="${convertPath(startupChunk.path)}">`
    );
  }

  // Insert tags before </head>
  const extraHeadStr = extraHeadTags.map((s) => '    ' + s).join('\n');
  const html = templateHTML.replace(
    '</head>',
    '\n' + extraHeadStr + '\n  </head>'
  );

  // Write the final HTML
  fs.writeFileSync(htmlOutputPath, html);
}

// Run build if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildAll().catch(console.error);
}
