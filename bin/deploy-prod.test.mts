/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from 'assert/strict';
import { spawn } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { test } from 'node:test';
import { fileURLToPath } from 'url';

import {
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

test('dry run completes without invoking mutation commands', async () => {
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
const mutations = new Set(['add', 'branch', 'checkout', 'commit', 'merge', 'pull', 'push', 'reset', 'switch', 'tag']);
if (mutations.has(command)) {
  appendFileSync(process.env.DEPLOY_PROD_TEST_VIOLATIONS, \`git \${args.join(' ')}\\n\`);
  process.exit(90);
}

if (command === 'status' || command === 'fetch' || command === 'diff') {
  process.exit(0);
}
if (command === 'remote') {
  process.stdout.write([
    'origin\\tgit@github.com:example-maintainer/profiler.git (fetch)',
    'origin\\tgit@github.com:example-maintainer/profiler.git (push)',
    'upstream\\tgit@github.com:firefox-devtools/profiler.git (fetch)',
    'upstream\\tgit@github.com:firefox-devtools/profiler.git (push)',
  ].join('\\n'));
  process.exit(0);
}
if (command === 'show') {
  process.stdout.write(JSON.stringify({ version: '0.12.0' }));
  process.exit(0);
}
if (command === 'show-ref') {
  process.exit(1);
}
if (command === 'log') {
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
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./deploy-prod.mts', import.meta.url)),
        '--dry-run',
      ],
      {
        env: {
          ...process.env,
          DEPLOY_PROD_TEST_VIOLATIONS: violationsPath,
          PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ''}`,
          TEMP: temporaryDirectory,
          TMPDIR: temporaryDirectory,
          TMP: temporaryDirectory,
        },
      }
    );
    let stdout = '';
    let stderr = '';
    let confirmed = false;
    let selectedVersion = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (!confirmed && stdout.includes('Type "y" to continue:')) {
        confirmed = true;
        child.stdin.write('y\n');
      }
      if (
        confirmed &&
        !selectedVersion &&
        stdout.includes(
          'Profiler CLI version (main 0.12.0, production 0.12.0): [0.13.0]'
        )
      ) {
        selectedVersion = true;
        child.stdin.write('\n');
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const status = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });

    assert.equal(status, 0, stderr);
    assert.match(stdout, /Bump profiler-cli version to 0\.13\.0/);
    assert.match(
      stdout,
      /Would publish @firefox-devtools\/profiler-cli@0\.13\.0 to npm/
    );
    assert.match(stdout, /Dry run completed/);
    assert.equal(
      existsSync(violationsPath) ? readFileSync(violationsPath, 'utf8') : '',
      ''
    );
    assert.deepEqual(readdirSync(temporaryDirectory), []);
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
