/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from 'assert/strict';
import { execFile, spawn, spawnSync } from 'child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'url';
import { promisify } from 'util';

import {
  buildAnnouncementUrl,
  buildDeploymentBody,
  bumpMinorVersion,
  checkWaitArguments,
  checksHaveNotStarted,
  collectLocalizerCredits,
  collectUpdatedLocales,
  combineDeploymentChanges,
  findGitHubRemote,
  getCliVersionPlan,
  isValidVersion,
  isVersionGreater,
  parseArguments,
  parseGitHubRepositoryUrl,
  reviewersFor,
  runRemoteMutation,
  validateAnnouncementUrl,
} from './deploy-prod.mts';

function writeFakeCommand(
  directory: string,
  name: string,
  source: string
): void {
  if (process.platform === 'win32') {
    writeFileSync(join(directory, `${name}.mjs`), source);
    writeFileSync(
      join(directory, `${name}.cmd`),
      `@node "%~dp0${name}.mjs" %*\r\n`
    );
    return;
  }

  const path = join(directory, name);
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function environmentWithPath(directory: string): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => name.toLowerCase() !== 'path'
    )
  );
  return {
    ...environment,
    PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
  };
}

async function runDeploymentTest(
  source: string,
  environment: NodeJS.ProcessEnv,
  answers: [string, string][],
  moduleUrl = new URL('./deploy-prod.mts', import.meta.url)
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import { registerHooks } from 'node:module';
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === 'open') {
          return { url: 'data:text/javascript,export default async () => { throw new Error("Unexpected browser launch"); };', shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
    });
    const deployment = await import(${JSON.stringify(moduleUrl.href)});
    ${source}
  `,
    ],
    { env: environment }
  );
  let stdout = '';
  let stderr = '';
  let nextAnswer = 0;
  let promptOffset = 0;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    const answer = answers[nextAnswer];
    if (!answer) {
      return;
    }
    const index = stdout.indexOf(answer[0], promptOffset);
    if (index !== -1) {
      promptOffset = index + answer[0].length;
      nextAnswer++;
      child.stdin.write(`${answer[1]}\n`);
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    const status = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    return { status, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

test('checkWaitArguments only filters required checks when requested', () => {
  assert.deepEqual(checkWaitArguments(123, true), [
    'pr',
    'checks',
    '123',
    '--watch',
    '--fail-fast',
    '--required',
  ]);
  assert.deepEqual(checkWaitArguments(123, false), [
    'pr',
    'checks',
    '123',
    '--watch',
  ]);
});

test('checksHaveNotStarted only matches missing-check messages', () => {
  assert.equal(
    checksHaveNotStarted("no checks reported on the 'main' branch"),
    true
  );
  assert.equal(
    checksHaveNotStarted("no required checks reported on the 'main' branch"),
    true
  );
  assert.equal(checksHaveNotStarted('a check failed'), false);
});

test('parseArguments enables dry-run mode and rejects unknown arguments', () => {
  assert.deepEqual(parseArguments([]), { dryRun: false });
  assert.deepEqual(parseArguments(['--dry-run']), { dryRun: true });
  assert.throws(() => parseArguments(['--unknown']), /Unknown argument/);
});

test('runRemoteMutation only prints commands in dry-run mode', () => {
  const logs: unknown[][] = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args);

  try {
    assert.equal(
      runRemoteMutation(true, 'command-that-does-not-exist', ['--write']),
      null
    );
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(logs, [
    ['[dry-run] Would run:', 'command-that-does-not-exist --write'],
  ]);
});

describe('deployment workflows', { concurrency: true, timeout: 30_000 }, () => {
  for (const publishCli of [true, false]) {
    test(
      `dry run without mutations, publish CLI: ${publishCli}`,
      { concurrency: true, timeout: 30_000 },
      async () => {
        const directory = mkdtempSync(join(tmpdir(), 'deploy-prod-test-'));
        const binDirectory = join(directory, 'bin');
        const temporaryDirectory = join(directory, 'tmp');
        const violationsPath = join(directory, 'violations');
        mkdirSync(binDirectory);
        mkdirSync(temporaryDirectory);

        writeFakeCommand(
          binDirectory,
          'git',
          `#!/usr/bin/env node
import { appendFileSync } from 'fs';

const args = process.argv.slice(2);
const command = args[0];
const mutations = new Set(['add', 'branch', 'checkout', 'clone', 'commit', 'merge', 'pull', 'push', 'reset', 'switch', 'tag']);
if (mutations.has(command)) {
  appendFileSync(process.env.DEPLOY_PROD_TEST_VIOLATIONS, \`git \${args.join(' ')}\\n\`);
  process.exit(90);
}

if (command === 'status' || command === 'fetch' || command === 'diff') {
  process.exit(0);
}
if (command === 'remote') {
  if (args[1] === 'get-url') {
    process.stdout.write('https://github.com/firefox-devtools/profiler.git');
    process.exit(0);
  }
  process.stdout.write([
    'origin\\tgit@github.com:example-maintainer/perf.html.git (fetch)',
    'origin\\tgit@github.com:example-maintainer/perf.html.git (push)',
    'upstream\\tgit@github.com:firefox-devtools/profiler.git (fetch)',
    'upstream\\tgit@github.com:firefox-devtools/profiler.git (push)',
  ].join('\\n'));
  process.exit(0);
}
if (command === 'show') {
  process.stdout.write(JSON.stringify({ name: '@firefox-devtools/profiler-cli', version: '0.12.0' }));
  process.exit(0);
}
if (command === 'show-ref') {
  process.exit(1);
}
if (command === 'log') {
  if (process.env.DEPLOY_PROD_TEST_SKIP_CLI && !args.includes('--grep')) {
    process.stdout.write('[Example Author] Improve the web UI (#123)');
  }
  process.exit(0);
}
if (command === 'var') {
  process.stdout.write('node -e ""\\n');
  process.exit(0);
}
if (command === 'rev-parse') {
  process.stdout.write('0123456789abcdef0123456789abcdef01234567\\n');
  process.exit(0);
}

throw new Error(\`Unexpected git command: \${args.join(' ')}\`);
`
        );

        writeFakeCommand(
          binDirectory,
          'gh',
          `#!/usr/bin/env node
import { appendFileSync } from 'fs';

const args = process.argv.slice(2);
if (args[0] === '--version' || (args[0] === 'auth' && args[1] === 'status')) {
  process.exit(0);
}
if (args[0] === 'api' && args[1] === 'user') {
  process.stdout.write('example-maintainer\\n');
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'list') {
  process.stdout.write('[]\\n');
  process.exit(0);
}

appendFileSync(process.env.DEPLOY_PROD_TEST_VIOLATIONS, \`gh \${args.join(' ')}\\n\`);
process.exit(90);
`
        );

        for (const command of ['npm', 'yarn']) {
          writeFakeCommand(
            binDirectory,
            command,
            `#!/usr/bin/env node
import { appendFileSync } from 'fs';

appendFileSync(process.env.DEPLOY_PROD_TEST_VIOLATIONS, \`${command} \${process.argv.slice(2).join(' ')}\\n\`);
process.exit(90);
`
          );
        }

        try {
          const { status, stdout, stderr } = await runDeploymentTest(
            "await deployment.main(['--dry-run']);",
            {
              ...environmentWithPath(binDirectory),
              DEPLOY_PROD_TEST_VIOLATIONS: violationsPath,
              DEPLOY_PROD_TEST_SKIP_CLI: publishCli ? '' : '1',
              TEMP: temporaryDirectory,
              TMPDIR: temporaryDirectory,
              TMP: temporaryDirectory,
            },
            [
              ['Type "y" to continue:', 'y'],
              [
                'Profiler CLI version (main 0.12.0, production 0.12.0): [0.13.0]',
                publishCli ? '' : '0.12.0',
              ],
            ]
          );
          assert.equal(status, 0, stderr);
          assert.doesNotMatch(stderr, /Unexpected browser launch/);
          if (publishCli) {
            assert.match(stdout, /Bump profiler-cli version to 0\.13\.0/);
            assert.match(
              stdout,
              /Would publish @firefox-devtools\/profiler-cli@0\.13\.0 to npm/
            );
            assert.match(
              stdout,
              /Would run: git push https:\/\/github.com\/firefox-devtools\/profiler.git <version-bump-commit>:refs\/tags\/profiler-cli-v0.13.0/
            );
            assert.match(
              stdout,
              /Would run: gh release create profiler-cli-v0.13.0 --verify-tag/
            );
            assert.match(stdout, /DRY-RUN\/0/);
          } else {
            assert.doesNotMatch(
              stdout,
              /gh release create|refs\/tags\/|yarn publish-cli/
            );
          }
          assert.match(stdout, /Would open the prefilled announcement/);
          const fallback = stdout.match(
            /If the prefilled link fails, open (\S+) and paste/
          );
          assert.ok(fallback);
          const fallbackUrl = new URL(fallback[1]);
          assert.equal(fallbackUrl.searchParams.has('body'), false);
          assert.equal(fallbackUrl.searchParams.get('category_id'), '521');
          assert.match(
            stdout,
            /paste this announcement body:\n\nThe latest version/
          );
          assert.match(stdout, /Would wait for you to review and publish/);
          assert.match(stdout, /Dry run completed/);
          assert.equal(
            existsSync(violationsPath)
              ? readFileSync(violationsPath, 'utf8')
              : '',
            ''
          );
          assert.deepEqual(readdirSync(temporaryDirectory), []);
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      }
    );
  }
});

test('announcement composer formats changes and preserves credits and links', () => {
  const url = new URL(
    buildAnnouncementUrl({
      commit: 'abc',
      date: 'November 4, 2026',
      body: buildDeploymentBody(
        '[Example Author] Fix A & B (#123)\n[Example Contributor] [Panel] Add a feature (#124)',
        ['fr: Éxample', 'de: Example Localizer']
      ),
      url: 'https://github.com/firefox-devtools/profiler/pull/456',
    })
  );
  assert.equal(url.origin, 'https://discourse.mozilla.org');
  assert.equal(url.pathname, '/new-topic');
  assert.equal(url.searchParams.get('category_id'), '521');
  assert.equal(url.searchParams.get('tags'), 'firefox-profiler');
  assert.equal(
    url.searchParams.get('title'),
    'Firefox Profiler Deployment (November 4, 2026)'
  );
  const body = url.searchParams.get('body')!;
  assert.equal(
    body,
    [
      'The latest version of the [Firefox Profiler](https://profiler.firefox.com) is now live! Check out the full changelog below to see what’s changed:',
      '',
      '**Highlights:**',
      '',
      '<!-- Move notable changes from Other Changes here and remove this comment before publishing. -->',
      '',
      '**Other Changes:**',
      '',
      '- [Example Author] Fix A & B ([#123](https://github.com/firefox-devtools/profiler/pull/123))',
      '- [Example Contributor] [Panel] Add a feature ([#124](https://github.com/firefox-devtools/profiler/pull/124))',
      '',
      'Big thanks to our amazing localizers for making this release possible:',
      '',
      'fr: Éxample',
      'de: Example Localizer',
      '',
      'Find out more about the Firefox Profiler on [profiler.firefox.com](https://profiler.firefox.com)! If you have any questions, join the discussion on our [Matrix channel](https://chat.mozilla.org/#/room/#profiler:mozilla.org)!',
      '',
    ].join('\n')
  );
});

test('announcement composer preserves custom Markdown in edited deployment notes', () => {
  const notes =
    'Custom notes\n\n- [Example Author] **Fix** (#123)\n\n[Documentation](https://example.org)';
  const url = new URL(
    buildAnnouncementUrl({
      commit: 'abc',
      date: 'November 17, 2026',
      body: notes,
      url: null,
    })
  );
  assert.ok(
    url.searchParams
      .get('body')!
      .includes(
        notes.replace(
          '(#123)',
          '([#123](https://github.com/firefox-devtools/profiler/pull/123))'
        )
      )
  );
});

describe(
  'CLI operations preserve the source checkout',
  { concurrency: true, timeout: 30_000 },
  () => {
    for (const scenario of ['bump', 'publish', 'tag hook failure']) {
      test(`${scenario}`, { concurrency: true, timeout: 30_000 }, async () => {
        // The native variant also expands Windows short names, which Git does
        // for the hook's working directory.
        const directory = realpathSync.native(
          mkdtempSync(join(tmpdir(), 'deploy-checkout-test-'))
        );
        const source = join(directory, 'source');
        const binDirectory = join(directory, 'bin');
        const temporaryDirectory = join(directory, 'tmp');
        for (const path of [source, binDirectory, temporaryDirectory]) {
          mkdirSync(path);
        }
        const globalConfig = join(directory, 'gitconfig');
        writeFileSync(globalConfig, '');
        const environment = {
          ...environmentWithPath(binDirectory),
          GIT_CONFIG_GLOBAL: globalConfig,
          TEST_DIRECTORY: directory,
          TEST_SCENARIO: scenario,
          TMPDIR: temporaryDirectory,
          TEMP: temporaryDirectory,
          TMP: temporaryDirectory,
        };
        const gitIn = async (
          cwd: string,
          ...args: string[]
        ): Promise<string> => {
          const { stdout } = await promisify(execFile)('git', args, {
            cwd,
            env: environment,
            encoding: 'utf8',
          });
          return stdout.trim();
        };
        const git = (...args: string[]): Promise<string> =>
          gitIn(source, ...args);
        try {
          await git('init', '--initial-branch=main');
          await git('config', 'user.name', 'Example Maintainer');
          await git('config', 'user.email', 'maintainer@example.com');
          writeFileSync(join(source, '.gitignore'), 'node_modules\n.hooks/\n');
          mkdirSync(join(source, 'profiler-cli'));
          const manifestPath = join(source, 'profiler-cli', 'package.json');
          writeFileSync(
            manifestPath,
            JSON.stringify({
              name: '@firefox-devtools/profiler-cli',
              version: '0.11.0',
            }) + '\n'
          );
          await git('add', '.');
          await git('commit', '-m', 'Create the deployment fixture');
          writeFileSync(
            manifestPath,
            JSON.stringify({
              name: '@firefox-devtools/profiler-cli',
              version: '0.12.0',
            }) + '\n'
          );
          await git('add', '.');
          await git('commit', '-m', 'Bump the fixture CLI version');
          const deployedCommit = await git('rev-parse', 'HEAD');
          const canonical = join(directory, 'canonical.git');
          const fork = join(directory, 'fork.git');
          await git('clone', '--bare', source, canonical);
          await git('clone', '--bare', source, fork);
          await git('remote', 'add', 'canonical', canonical);
          await git('remote', 'add', 'personal', fork);
          await git('fetch', 'canonical');
          writeFileSync(
            join(source, 'local-main-only'),
            'Unmerged local work\n'
          );
          await git('add', 'local-main-only');
          await git('commit', '-m', 'Add local main work');
          const localMainCommit = await git('rev-parse', 'HEAD');
          await git('remote', 'set-url', '--push', 'canonical', fork);
          await git('checkout', '-b', 'deployment-script');
          mkdirSync(join(source, 'bin'));
          const modulePath = join(source, 'bin', 'deploy-prod.mts');
          copyFileSync(
            fileURLToPath(new URL('./deploy-prod.mts', import.meta.url)),
            modulePath
          );
          writeFileSync(
            manifestPath,
            JSON.stringify({
              name: '@firefox-devtools/profiler-cli',
              version: '99.0.0',
            }) + '\n'
          );
          await git('add', '.');
          await git('commit', '-m', 'Add unmerged deployment changes');
          symlinkSync(
            fileURLToPath(new URL('../node_modules', import.meta.url)),
            join(source, 'node_modules'),
            'junction'
          );
          const originalHead = await git('rev-parse', 'HEAD');
          const originalIndex = await git('ls-files', '--stage');
          const originalManifest = readFileSync(manifestPath, 'utf8');
          mkdirSync(join(source, '.hooks'));
          await git('config', 'core.hooksPath', '.hooks');
          const isBump = scenario === 'bump';
          const hookPath = join(
            source,
            '.hooks',
            isBump ? 'pre-commit' : 'pre-push'
          );
          writeFileSync(
            hookPath,
            '#!/bin/sh\nnode "$TEST_DIRECTORY/check-hook.mjs"\n'
          );
          chmodSync(hookPath, 0o755);
          writeFileSync(
            join(directory, 'check-hook.mjs'),
            `
import assert from 'node:assert/strict';
import { appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
appendFileSync(join(process.env.TEST_DIRECTORY, 'hooks'), process.cwd() + '\\n');
if (${!isBump}) {
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), '${deployedCommit}');
  assert.ok(existsSync('node_modules'));
}
if (process.env.TEST_SCENARIO === 'tag hook failure') process.exit(1);
`
          );
          writeFakeCommand(
            binDirectory,
            'gh',
            `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== 'pr') throw new Error('Unexpected GitHub mutation');
if (args[1] === 'list') process.stdout.write('[]');
else if (args[1] === 'create') process.stdout.write('https://github.com/firefox-devtools/profiler/pull/123');
else throw new Error('Unexpected GitHub command');
`
          );
          writeFakeCommand(
            binDirectory,
            'yarn',
            `#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
assert.notEqual(process.cwd(), ${JSON.stringify(source)});
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), '${deployedCommit}');
assert.equal(JSON.parse(readFileSync('profiler-cli/package.json', 'utf8')).version, '0.12.0');
appendFileSync(join(process.env.TEST_DIRECTORY, 'yarn-commands'), JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (args[0] === 'install') {
  assert.deepEqual(args, ['install', '--frozen-lockfile']);
  mkdirSync('node_modules');
} else if (args[0] !== 'publish-cli') throw new Error('Unexpected Yarn command');
`
          );
          const operation = isBump
            ? "await deployment.createVersionBumpPullRequest('0.13.0', 'example-maintainer', 'personal', 'canonical', false);"
            : `await deployment.finishDeployment('${deployedCommit}', { shouldPublishCli: true, version: '0.12.0', plannedChange: null }, 'canonical', false);`;
          const { status, stdout, stderr } = await runDeploymentTest(
            operation,
            environment,
            Array.from(
              { length: 3 },
              () => ['Type "y" to continue:', 'y'] as [string, string]
            ),
            pathToFileURL(modulePath)
          );
          const failed = scenario === 'tag hook failure';
          assert.equal(status, failed ? 1 : 0, `${stdout}\n${stderr}`);
          assert.equal(
            await git('branch', '--show-current'),
            'deployment-script'
          );
          assert.equal(await git('rev-parse', 'HEAD'), originalHead);
          assert.equal(await git('rev-parse', 'main'), localMainCommit);
          assert.equal(await git('ls-files', '--stage'), originalIndex);
          assert.equal(readFileSync(manifestPath, 'utf8'), originalManifest);
          assert.equal(await git('status', '--porcelain'), '');
          assert.equal(await git('branch', '--list', 'bump-cli-0.13.0'), '');
          const clones = readdirSync(temporaryDirectory).filter((name) =>
            name.startsWith('profiler-deploy-')
          );
          assert.equal(clones.length, failed ? 1 : 0, JSON.stringify(clones));
          if (failed) {
            assert.match(stderr, /temporary Profiler clone is kept/);
          }
          const hookCwd = readFileSync(join(directory, 'hooks'), 'utf8').trim();
          assert.ok(hookCwd.startsWith(temporaryDirectory));
          if (!isBump) {
            assert.equal(
              await gitIn(canonical, 'tag', '--list'),
              failed ? '' : 'profiler-cli-v0.12.0'
            );
            if (!failed) {
              assert.equal(
                await gitIn(canonical, 'rev-parse', 'profiler-cli-v0.12.0'),
                deployedCommit
              );
            }
            assert.equal(await gitIn(fork, 'tag', '--list'), '');
            assert.equal(await git('tag', '--list'), '');
          }
          if (isBump) {
            assert.equal(
              await gitIn(fork, 'rev-parse', 'bump-cli-0.13.0^'),
              deployedCommit
            );
            assert.equal(
              await gitIn(
                fork,
                'show',
                '--format=',
                '--name-only',
                'bump-cli-0.13.0'
              ),
              'profiler-cli/package.json'
            );
            assert.equal(
              await gitIn(fork, 'log', '-1', '--format=%B', 'bump-cli-0.13.0'),
              'Bump profiler-cli version to 0.13.0'
            );
            assert.equal(
              await gitIn(
                fork,
                'log',
                '-1',
                '--format=%an <%ae>',
                'bump-cli-0.13.0'
              ),
              'Example Maintainer <maintainer@example.com>'
            );
            assert.equal(
              JSON.parse(
                await gitIn(
                  fork,
                  'show',
                  'bump-cli-0.13.0:profiler-cli/package.json'
                )
              ).version,
              '0.13.0'
            );
          } else {
            const commands = readFileSync(
              join(directory, 'yarn-commands'),
              'utf8'
            )
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line));
            assert.deepEqual(
              commands.map(({ args }) => args),
              [['install', '--frozen-lockfile'], ['publish-cli']]
            );
            assert.equal(new Set(commands.map(({ cwd }) => cwd)).size, 1);
          }
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      });
    }
  }
);

test('announcement links must point to a published Mozilla Discourse topic', () => {
  for (const url of [
    'https://discourse.mozilla.org/t/example/123',
    'https://discourse.mozilla.org/t/123',
    'https://discourse.mozilla.org/t/example/123/1',
  ]) {
    assert.equal(validateAnnouncementUrl(url), url);
  }
  for (const url of [
    'https://example.org/t/example/123',
    'https://discourse.mozilla.org/new-topic',
    'http://discourse.mozilla.org/t/123',
    'https://user@discourse.mozilla.org/t/123',
    'not a URL',
    '',
  ]) {
    assert.throws(
      () => validateAnnouncementUrl(url),
      /Enter the published topic URL from https:\/\/discourse.mozilla.org\/t\//
    );
  }
});

test('CLI tag targets the version change, not a later manifest edit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'deploy-prod-tag-test-'));
  writeFakeCommand(
    directory,
    'git',
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'log') {
  process.stdout.write('later-manifest-edit\\nversion-bump\\n');
} else if (args[0] === 'show') {
  const ref = args[1].split(':')[0];
  const versions = {
    deployed: '0.13.0',
    'later-manifest-edit': '0.13.0',
    'later-manifest-edit^': '0.13.0',
    'version-bump': '0.13.0',
    'version-bump^': '0.12.0',
  };
  if (!(ref in versions)) throw new Error('Unexpected ref: ' + ref);
  process.stdout.write(JSON.stringify({ version: versions[ref] }));
} else {
  throw new Error('Unexpected command: ' + args.join(' '));
}
`
  );
  try {
    const source = `
      import assert from 'node:assert/strict';
      import { findCliVersionCommit } from ${JSON.stringify(new URL('./deploy-prod.mts', import.meta.url).href)};
      assert.equal(findCliVersionCommit('deployed', '0.13.0'), 'version-bump');
      assert.throws(() => findCliVersionCommit('deployed', '0.14.0'), /does not contain/);
    `;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', source],
      {
        encoding: 'utf8',
        env: environmentWithPath(directory),
      }
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('bumpMinorVersion increments the minor version', () => {
  assert.equal(bumpMinorVersion('0.9.0'), '0.10.0');
  assert.equal(bumpMinorVersion('1.2.7'), '1.3.0');
  assert.equal(bumpMinorVersion('1.2.7-next.1'), '1.3.0');
});

test('isValidVersion accepts release and prerelease versions', () => {
  assert.equal(isValidVersion('0.10.0'), true);
  assert.equal(isValidVersion('1.0.0-next.1'), true);
  assert.equal(isValidVersion('1.0.0-0'), true);
  assert.equal(isValidVersion('1.0'), false);
  assert.equal(isValidVersion('01.0.0'), false);
  assert.equal(isValidVersion('1.0.0-next.01'), false);
});

test('isVersionGreater compares releases and prereleases', () => {
  assert.equal(isVersionGreater('0.9.0', '0.10.0'), true);
  assert.equal(isVersionGreater('1.0.0-next.1', '1.0.0'), true);
  assert.equal(isVersionGreater('1.0.0', '1.0.0-next.1'), false);
  assert.equal(isVersionGreater('1.2.0', '1.1.9'), false);
});

test('getCliVersionPlan accounts for the version in production', () => {
  assert.deepEqual(getCliVersionPlan('0.10.0', '0.10.0'), {
    defaultVersion: '0.11.0',
    shouldPublishCurrentVersion: false,
  });
  assert.deepEqual(getCliVersionPlan('0.11.0', '0.10.0'), {
    defaultVersion: '0.11.0',
    shouldPublishCurrentVersion: true,
  });
  assert.throws(
    () => getCliVersionPlan('0.10.0', '0.11.0'),
    /main CLI version 0\.10\.0 is older than production 0\.11\.0/
  );
});

test('parseGitHubRepositoryUrl parses GitHub remote URLs', () => {
  assert.deepEqual(
    parseGitHubRepositoryUrl('git@github.com:example-user/profiler.git'),
    { owner: 'example-user', name: 'profiler' }
  );
  assert.deepEqual(
    parseGitHubRepositoryUrl('https://github.com/example-user/profiler'),
    { owner: 'example-user', name: 'profiler' }
  );
  assert.deepEqual(
    parseGitHubRepositoryUrl('ssh://git@github.com/example-user/profiler.git'),
    { owner: 'example-user', name: 'profiler' }
  );
  assert.equal(
    parseGitHubRepositoryUrl('git@gitlab.com:example-user/profiler.git'),
    null
  );
});

test('findGitHubRemote finds remotes by URL direction', () => {
  const remoteList = [
    'personal\tgit@github.com:example-user/profiler.git (fetch)',
    'personal\tgit@github.com:example-user/profiler.git (push)',
    'mozilla\thttps://github.com/firefox-devtools/profiler.git (fetch)',
    'mozilla\thttps://github.com/firefox-devtools/profiler.git (push)',
  ].join('\n');

  assert.equal(
    findGitHubRemote(remoteList, 'firefox-devtools/profiler', 'fetch'),
    'mozilla'
  );
  assert.equal(
    findGitHubRemote(remoteList, 'example-user/profiler', 'push'),
    'personal'
  );
  assert.equal(
    findGitHubRemote(remoteList, 'example-user/profiler', 'fetch'),
    'personal'
  );
  assert.equal(
    findGitHubRemote(remoteList, 'example-user/perf.html', 'push'),
    null
  );
  assert.equal(
    findGitHubRemote(remoteList, 'missing-user/profiler', 'push'),
    null
  );

  const triangularRemoteList = [
    'combined\tgit@github.com:firefox-devtools/profiler.git (fetch)',
    'combined\tgit@github.com:example-user/profiler.git (push)',
  ].join('\n');
  assert.equal(
    findGitHubRemote(
      triangularRemoteList,
      'firefox-devtools/profiler',
      'fetch'
    ),
    'combined'
  );
  assert.equal(
    findGitHubRemote(triangularRemoteList, 'example-user/profiler', 'push'),
    'combined'
  );

  const historicalForkRemoteList =
    'personal\tgit@github.com:example-user/perf.html.git (push)';
  assert.equal(
    findGitHubRemote(
      historicalForkRemoteList,
      'example-user/perf.html',
      'push'
    ),
    'personal'
  );
});

test('collectUpdatedLocales returns sorted unique locale names', () => {
  assert.deepEqual(
    collectUpdatedLocales(
      [
        'locales/tr/app.ftl',
        'locales/es-CL/app.ftl',
        'locales/tr/app.ftl',
      ].join('\n')
    ),
    ['es-CL', 'tr']
  );
});

test('collectLocalizerCredits supports locale before and after email', () => {
  assert.deepEqual(
    collectLocalizerCredits(
      [
        'Localizer One (tr) <one@example.com>',
        'Localizer Two <two@example.com> (el)',
        'Localizer Three (tr) <three@example.com>',
        'Localizer Four (fy-NL, nl) <four@example.com>',
        'Localizer Five [:alias] (it) <five@example.com>',
        'Localizer One (tr) <one@example.com>',
      ].join('\n')
    ),
    [
      'el: Localizer Two',
      'fy-NL, nl: Localizer Four',
      'it: Localizer Five',
      'tr: Localizer One',
      'tr: Localizer Three',
    ]
  );
});

test('buildDeploymentBody matches the deployment PR shape', () => {
  assert.equal(
    buildDeploymentBody('[Alice] Add a feature (#1)', ['de: Ger']),
    [
      'Changes:',
      '',
      '[Alice] Add a feature (#1)',
      '',
      'And special thanks to our localizers:',
      '',
      'de: Ger',
      '',
    ].join('\n')
  );
});

test('combineDeploymentChanges includes changes simulated by a dry run', () => {
  assert.equal(
    combineDeploymentChanges('', [
      '[Example Maintainer] Bump profiler-cli version to 0.13.0',
    ]),
    '[Example Maintainer] Bump profiler-cli version to 0.13.0'
  );
  assert.equal(
    combineDeploymentChanges('[Example Author] Existing change (#1)', [
      '[Example Maintainer] Sync localizations',
      '[Example Maintainer] Bump profiler-cli version to 0.13.0',
    ]),
    [
      '[Example Author] Existing change (#1)',
      '[Example Maintainer] Sync localizations',
      '[Example Maintainer] Bump profiler-cli version to 0.13.0',
    ].join('\n')
  );
});

test('reviewersFor excludes a maintainer running the script', () => {
  assert.deepEqual(reviewersFor('fatadel'), ['canova', 'mstange']);
  assert.deepEqual(reviewersFor('CANOVA'), ['mstange', 'fatadel']);
  assert.deepEqual(reviewersFor('contributor'), [
    'canova',
    'mstange',
    'fatadel',
  ]);
});
