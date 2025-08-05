/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */
import type {
ReplaceCauseWithStack,
  CauseBacktrace,
  GeckoMarkerStack,
} from 'firefox-profiler/types';

type ObjectWithCause = { a: number, cause: CauseBacktrace };
type ObjectWithOptionalCause = { a: number, cause?: CauseBacktrace };
declare const stack: GeckoMarkerStack;
declare const cause: CauseBacktrace;

function expectType<T>(_x: T) {}

// Test ReplaceCauseWithStack.
expectType<ReplaceCauseWithStack<ObjectWithCause>>({ a: 0 });
expectType<ReplaceCauseWithStack<ObjectWithOptionalCause>>({ a: 0 });
expectType<ReplaceCauseWithStack<ObjectWithCause>>({ a: 0, stack });
expectType<ReplaceCauseWithStack<ObjectWithOptionalCause>>({ a: 0, stack });

// @ts-expect-error 'cause' does not exist in type
expectType<ReplaceCauseWithStack<ObjectWithCause>>({ a: 0, stack, cause });
// @ts-expect-error 'cause' does not exist in type
expectType<ReplaceCauseWithStack<ObjectWithOptionalCause>>({ a: 0, stack, cause });
