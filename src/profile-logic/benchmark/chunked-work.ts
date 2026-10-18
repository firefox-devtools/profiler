/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Running a long computation without holding on to the main thread.
 *
 * The benchmark comparison spends seconds in tight numeric loops — measured on a
 * 13-subtest Speedometer pair, ~1.1s for the global bucket table and ~1.7s for
 * the 13 subtest tables — and it used to spend them in one uninterrupted go.
 * That is not merely a slow page: until the last table was done, the browser
 * could not paint the rows it already had the numbers for, and could not so much
 * as follow a link the reader clicked.
 *
 * The shape here is a plain synchronous generator that `yield`s wherever its
 * state is consistent, plus two ways to drive one. `runToCompletion` is for
 * callers with no event loop to be polite to — the CLI and the tests — and
 * `runInSlices` is for the UI, handing the main thread back whenever a slice has
 * run long enough. The computation does not know which is driving it, so there
 * is exactly one copy of it to keep correct.
 *
 * Deliberately not workers, yet: see the note at the end of this file.
 */

/**
 * A computation that produces a `T`, and can be interrupted at its `yield`
 * points.
 *
 * `yield` means "my state is consistent here", not "I have made progress worth
 * reporting": nothing is passed out, and a driver is free to resume immediately.
 * So a computation should yield freely — every draw of a permutation, every few
 * hundred rows of a table — and leave the question of how long to keep going to
 * whoever is running it. Resuming a generator costs on the order of a hundred
 * nanoseconds, and the driver's own clock check is what actually paces the work.
 */
export type SlicedWork<T> = Generator<void, T, void>;

/** Run `work` straight through, ignoring its yield points. */
export function runToCompletion<T>(work: SlicedWork<T>): T {
  let step = work.next();
  while (!step.done) {
    step = work.next();
  }
  return step.value;
}

/**
 * How long a slice may run before the main thread is handed back, in ms.
 *
 * Short enough that a click lands within about a frame, long enough that the
 * per-slice overhead (one task boundary, plus whatever the browser does with it)
 * stays a few percent. The work does not have to fit in a frame — nothing here is
 * animating — so there is no reason to go below this and pay the boundary more
 * often.
 */
const SLICE_MS = 12;

/**
 * Run `work` in slices of at most `SLICE_MS`, yielding the main thread between
 * them so the browser can paint and dispatch input.
 *
 * If `signal` aborts, this rejects with the signal's reason at the next slice
 * boundary and the computation is abandoned where it stands — which is the point
 * of chunking it: a comparison the reader has already replaced should not go on
 * spending seconds finishing tables nobody will look at.
 */
export async function runInSlices<T>(
  work: SlicedWork<T>,
  signal?: AbortSignal
): Promise<T> {
  let sliceStart = performance.now();
  for (;;) {
    const step = work.next();
    if (step.done) {
      // Finished work is worth having even if the caller has moved on.
      return step.value;
    }
    // Every yield point, not just every slice boundary: reading `aborted` costs
    // nothing next to the arithmetic between two yields, and it means an abort
    // takes effect as soon as the computation is in a state where it can.
    signal?.throwIfAborted();
    if (performance.now() - sliceStart >= SLICE_MS) {
      await yieldToBrowser();
      sliceStart = performance.now();
    }
  }
}

/**
 * Resolve in a fresh task, so that the browser gets its chance to paint whatever
 * has been rendered since we last let go, and to dispatch the clicks that piled
 * up while we were busy.
 *
 * A MessageChannel ping, specifically, and the choice is load-bearing rather than
 * a matter of taste.
 *
 * **Not `setTimeout(0)`**: browsers clamp nested timeouts to 4ms after the first
 * few, which against a 12ms slice would throw away a quarter of the throughput.
 *
 * **Not `scheduler.yield()`**, even though it is the primitive built for exactly
 * this. In Gecko a yield continuation is a `WebTaskMainThreadRunnable` at
 * MediumHigh priority, which outranks the ordinary task React's scheduler renders
 * in — so a chain of them starves React for as long as the chain lasts. Profiled
 * on a 13-subtest pair with that version in place: the score rows were ready at
 * 2.0s and the first layout after them ran at 7.5s, when the last table finished
 * and the chain stopped. The slicing was not the problem — the slices were all
 * there, 12ms each, with the main thread handed back between them, and vsync
 * (higher priority still) kept ticking the spinner animation, so the page looked
 * alive. React simply never got a turn, so the DOM was never touched and there was
 * nothing to paint. A progressive report that cannot repaint is not progressive.
 *
 * MessageChannel is what React's own scheduler posts with, so our slices and its
 * renders land in the same queue at the same priority and take turns in order. It
 * is the fairness, not the mechanism, that matters here: whatever we yield with
 * has to be no more urgent than what the page needs in order to draw.
 */
export function yieldToBrowser(): Promise<void> {
  const port = messagePort();
  if (port === null) {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    pendingYields.push(resolve);
    port.postMessage(null);
  });
}

/** Resolvers waiting on a MessageChannel ping, oldest first. One shared channel
 * serves every caller, so the resolvers have to be queued rather than held in a
 * single `onmessage` closure that a second caller would overwrite. */
const pendingYields: Array<() => void> = [];
let sendPort: MessagePort | null | undefined;

function messagePort(): MessagePort | null {
  if (sendPort === undefined) {
    if (typeof MessageChannel !== 'function') {
      sendPort = null;
    } else {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        const resolve = pendingYields.shift();
        if (resolve !== undefined) {
          resolve();
        }
      };
      sendPort = channel.port2;
    }
  }
  return sendPort;
}

/**
 * ## What this is, and is not, for
 *
 * Slicing keeps the page responsive; it does not make anything finish sooner. In
 * the browser the bucket tables — which is nearly all of the arithmetic — are
 * computed in workers instead, and they are the reason the comparison finishes in
 * a fraction of the time rather than merely staying polite while it does not. See
 * benchmark-compare-worker-pool.ts.
 *
 * What is left here still earns its keep. `runToCompletion` is what a worker
 * drives the same computation with, since a worker has no UI to be polite to; and
 * `runInSlices` remains the fallback path, the CLI's, and the driver for anything
 * on the main thread that is long enough to be felt but too entangled with a
 * `Profile` to ship anywhere — see "What not to move" in
 * docs-developer/benchmark-compare-multithreading.md.
 */
