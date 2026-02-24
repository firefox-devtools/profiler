/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';

// Plugin to mark chrome:// URLs as external in CSS
//
// This is a workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=2014811
export function externalChromeUrlsPlugin() {
  return {
    name: 'external-chrome-urls',
    setup(build) {
      build.onResolve({ filter: /^chrome:\/\// }, (args) => {
        return { path: args.path, external: true };
      });
    },
  };
}

// Plugin to detect circular dependencies
export function circularDependencyPlugin() {
  return {
    name: 'circular-dependency',
    setup(build) {
      build.initialOptions.metafile = true;
      build.onEnd((result) => {
        if (!result.metafile?.inputs) return;

        const { inputs } = result.metafile;
        const recursionStack = new Set();
        const visited = new Set();
        const cycles = [];

        function findCycles(parentAncestors, modulePath) {
          if (recursionStack.has(modulePath)) {
            const cycleStart = parentAncestors.indexOf(modulePath);
            const cycle = [...parentAncestors.slice(cycleStart), modulePath];
            cycles.push(cycle);
            return;
          }

          if (visited.has(modulePath)) {
            return;
          }

          visited.add(modulePath);
          recursionStack.add(modulePath);

          const module = inputs[modulePath];
          if (module?.imports) {
            const ancestors = [...parentAncestors, modulePath];
            for (const imp of module.imports) {
              if (imp.path && !imp.external) {
                findCycles(ancestors, imp.path);
              }
            }
          }

          recursionStack.delete(modulePath);
        }

        for (const modulePath of Object.keys(inputs)) {
          if (!modulePath.includes('node_modules')) {
            findCycles([], modulePath);
          }
        }

        const projectCycles = cycles.filter((cycle) =>
          cycle.some((mod) => !mod.includes('node_modules'))
        );

        if (projectCycles.length > 0) {
          const uniqueCycles = new Map();
          for (const cycle of projectCycles) {
            const key = cycle.slice().sort().join('|');
            if (!uniqueCycles.has(key)) {
              uniqueCycles.set(key, cycle);
            }
          }

          const cycleMessages = Array.from(uniqueCycles.values())
            .map((cycle) => cycle.join(' ->\n'))
            .join('\n\n');

          throw new Error(
            `Circular dependencies detected:\n\n${cycleMessages}`
          );
        }
      });
    },
  };
}

// Plugin to generate HTML file with script/style tags
export function generateHtmlPlugin(options) {
  return {
    name: 'firefox-profiler-generate-html',
    setup(build) {
      const { outdir, publicPath } = build.initialOptions;
      build.initialOptions.metafile = true;
      build.onEnd((result) => {
        const { entryPoint, templateHTML, filename } = options;
        const metafile = result.metafile;

        if (!metafile?.outputs) {
          throw new Error('No outputs detected');
        }

        const [mainBundlePath, mainBundle] = Object.entries(
          metafile.outputs
        ).find(([_path, bundle]) => bundle.entryPoint === entryPoint);

        if (!mainBundle) {
          throw new Error(`Entry point ${entryPoint} not found in outputs`);
        }

        function convertPath(absolutePath) {
          const prefix = outdir + '/';
          if (!absolutePath?.startsWith?.(prefix)) {
            throw new Error(`Path ${absolutePath} is outside outdir ${outdir}`);
          }
          const relativePath = absolutePath.slice(prefix.length);
          return publicPath ? publicPath + relativePath : relativePath;
        }

        const headTags = [];

        headTags.push(
          `<script src="${convertPath(mainBundlePath)}" type="module" async></script>`
        );

        if (mainBundle.cssBundle) {
          headTags.push(
            `<link rel="stylesheet" href="${convertPath(mainBundle.cssBundle)}">`
          );
        }

        const startupChunks = mainBundle.imports.filter(
          (imp) => imp.kind === 'import-statement'
        );
        for (const chunk of startupChunks) {
          headTags.push(
            `<link rel="modulepreload" href="${convertPath(chunk.path)}">`
          );
        }

        const headContent = headTags.map((tag) => '    ' + tag).join('\n');
        const html = templateHTML.replace(
          '</head>',
          '\n' + headContent + '\n  </head>'
        );

        fs.writeFileSync(outdir + '/' + filename, html);
      });
    },
  };
}
