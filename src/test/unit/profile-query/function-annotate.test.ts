/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { selectHeaviestNativeSymbols } from '../../../profile-query/function-annotate';
import { getNativeSymbolsForFunc } from '../../../profile-logic/profile-data';
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';

it('selects the ten native symbols with the highest sample weights', function () {
  const frames = Array.from(
    { length: 11 },
    (_, i) => `A[lib:one][sym:s${i}:${i.toString(16)}:1]`
  );
  const { derivedThreads, funcNamesDictPerThread } = getProfileFromTextSamples(
    [...frames, 'Unrelated'].join('  ')
  );
  const [thread] = derivedThreads;
  const [{ A }] = funcNamesDictPerThread;
  thread.samples.weight = [...frames.map((_, i) => i + 1), 100];

  const selected = selectHeaviestNativeSymbols(
    A,
    getNativeSymbolsForFunc(A, thread.frameTable),
    thread,
    thread.samples
  );

  expect(
    [...selected].map((i) =>
      thread.stringTable.getString(thread.nativeSymbols.name[i])
    )
  ).toEqual(Array.from({ length: 10 }, (_, i) => `s${10 - i}`));
});
