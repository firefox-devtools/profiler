/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from 'assert/strict';
import { test } from 'node:test';

import {
  buildDeploymentBody,
  bumpMinorVersion,
  classifyChecks,
  collectLocalizerCredits,
  collectUpdatedLocales,
  isValidVersion,
  isVersionGreater,
  reviewersFor,
} from './deploy-prod-e2e.mjs';

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
        'giray (tr) <giray@example.com>',
        'George kitsoukakis <george@example.com> (el)',
        'Selim Şumlu (tr) <selim@example.com>',
        'Fjoerfoks (fy-NL, nl) <fjoerfoks@example.com>',
        'giray (tr) <giray@example.com>',
      ].join('\n')
    ),
    [
      'el: George kitsoukakis',
      'fy-NL, nl: Fjoerfoks',
      'tr: giray',
      'tr: Selim Şumlu',
    ]
  );
});

test('classifyChecks handles check runs and status contexts', () => {
  assert.deepEqual(
    classifyChecks([
      { name: 'complete', conclusion: 'SUCCESS', status: 'COMPLETED' },
      { name: 'running', conclusion: '', status: 'IN_PROGRESS' },
      { context: 'external', state: 'SUCCESS' },
      { context: 'failed', state: 'FAILURE' },
    ]),
    { failed: ['failed'], pending: ['running'] }
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

test('reviewersFor excludes a maintainer running the script', () => {
  assert.deepEqual(reviewersFor('fatadel'), ['canova', 'mstange']);
  assert.deepEqual(reviewersFor('CANOVA'), ['mstange', 'fatadel']);
  assert.deepEqual(reviewersFor('contributor'), [
    'canova',
    'mstange',
    'fatadel',
  ]);
});
