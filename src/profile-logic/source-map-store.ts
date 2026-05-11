/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SourceMapConsumer as LibSourceMapConsumer } from 'source-map';
import type { RawSourceMap } from 'source-map';
import type { IndexIntoSourceTable } from 'firefox-profiler/types';

export type SourceMapConsumer = LibSourceMapConsumer;

/**
 * Bias constant for the source-map library's `originalPositionFor`.
 * When used as `bias`, returns the mapping whose generated position is the
 * smallest value greater than or equal to the queried position (upper bound).
 * Exported so callers can perform exact-match checks without importing source-map directly.
 */
export const SOURCE_MAP_LEAST_UPPER_BOUND: number =
  LibSourceMapConsumer.LEAST_UPPER_BOUND;

/**
 * Holds pre-parsed SourceMapConsumer instances keyed by IndexIntoSourceTable.
 * Initialized from the resolvedSourceMaps already fetched at profile load time.
 */
export class SourceMapStore {
  _consumers: Map<IndexIntoSourceTable, SourceMapConsumer>;

  private constructor(consumers: Map<IndexIntoSourceTable, SourceMapConsumer>) {
    this._consumers = consumers;
  }

  static async create(
    resolvedSourceMaps: Map<IndexIntoSourceTable, RawSourceMap>,
    wasmUrl: string
  ): Promise<SourceMapStore> {
    const consumers = new Map<IndexIntoSourceTable, SourceMapConsumer>();

    // Initialize the WASM backing for source-map which is required in browser environments.
    // This is a no-op if already initialized.
    // `initialize` is a static method at runtime but is typed as an instance method in the .d.ts.
    // https://github.com/mozilla/source-map/pull/520
    await (LibSourceMapConsumer as any).initialize({
      'lib/mappings.wasm': wasmUrl,
    });

    await Promise.all(
      Array.from(resolvedSourceMaps).map(async ([sourceIndex, sourceMap]) => {
        try {
          const consumer = await new LibSourceMapConsumer(sourceMap);
          consumers.set(sourceIndex, consumer);
        } catch (e) {
          console.warn(
            `SourceMapStore: failed to parse source map for sourceIndex=${sourceIndex}:`,
            e
          );
        }
      })
    );

    return new SourceMapStore(consumers);
  }

  getConsumer(sourceIndex: IndexIntoSourceTable): SourceMapConsumer | null {
    return this._consumers.get(sourceIndex) ?? null;
  }

  destroy(): void {
    for (const consumer of this._consumers.values()) {
      consumer.destroy();
    }
    this._consumers.clear();
  }
}
