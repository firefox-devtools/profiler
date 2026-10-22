/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// An oxlint JS plugin that exposes some of ESLint's core rules. oxlint only
// implements these as type-aware rules, which can't run on JavaScript files.
// .oxlintrc.json enables them for JavaScript files only.
import { builtinRules } from 'eslint/use-at-your-own-risk';

const RULE_NAMES = ['consistent-return', 'dot-notation'];

export default {
  meta: { name: 'eslint-js' },
  rules: Object.fromEntries(
    RULE_NAMES.map((name) => [name, builtinRules.get(name)])
  ),
};
