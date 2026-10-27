/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * The Node-only half of profile-query: loading a profile from a file or URL,
 * saving it to disk, and applying source map files read from disk.
 *
 * To use it it first needs to be built:
 *   yarn build-profile-query
 *
 * Then it can be used from an interactive node session:
 *
 * % node
 * > const { ProfileQuerierNode } = (await import('./dist/profile-query.js')).default;
 * undefined
 * > const p1 = await ProfileQuerierNode.load("/Users/mstange/Downloads/merged-profile.json.gz");
 * > const p2 = await ProfileQuerierNode.load("https://profiler.firefox.com/from-url/http%3A%2F%2Fexample.com%2Fprofile.json/");
 * > const p3 = await ProfileQuerierNode.load("https://share.firefox.dev/4oLEjCw");
 */

import * as fs from 'fs';
import * as path from 'path';

import { ProfileQuerier } from './index';
import { loadProfileFromFileOrUrl, type LoadOptions } from './loader';
import { runSourceMapSymbolicationNode } from './source-map-node';
import { basename } from 'firefox-profiler/profile-logic/source-maps/matching';
import { encodeProfileForFilename } from 'firefox-profiler/profile-logic/profile-file-encoding';
import { getFilenameString } from 'firefox-profiler/selectors/publish';
import type {
  ApplySourceMapResult,
  ProfileSaveResult,
  WithContext,
} from './types';

export class ProfileQuerierNode extends ProfileQuerier {
  static async load(
    filePathOrUrl: string,
    options: LoadOptions = {}
  ): Promise<ProfileQuerierNode> {
    const { store, rootRange } = await loadProfileFromFileOrUrl(
      filePathOrUrl,
      options
    );
    return new ProfileQuerierNode(store, rootRange);
  }

  /**
   * Write the loaded profile to `absPath`, matching the web app's Download
   * button with every sharing option checked (only embedded source contents
   * are removed). A directory target gets a file named like the web download.
   */
  async saveProfile(
    absPath: string,
    force: boolean
  ): Promise<WithContext<ProfileSaveResult>> {
    const profile = this.getProfileForDownload();
    const state = this._store.getState();

    const wantsDirectory = absPath.endsWith('/') || absPath.endsWith(path.sep);
    const targetStat = fs.statSync(absPath, { throwIfNoEntry: false });

    let outPath = absPath;
    if (targetStat?.isDirectory()) {
      outPath = path.join(absPath, `${getFilenameString(state)}.gz`);
    } else if (wantsDirectory) {
      throw new Error(`Directory not found: ${absPath}`);
    } else if (!fs.statSync(path.dirname(absPath), { throwIfNoEntry: false })) {
      throw new Error(`Directory not found: ${path.dirname(absPath)}`);
    }

    const alreadyExistsError = () =>
      new Error(`${outPath} already exists. Pass --force to overwrite it.`);

    // Cheap early check so a large profile isn't encoded just to fail below.
    // The 'wx' flag makes the real check atomic with the write.
    if (!force && fs.statSync(outPath, { throwIfNoEntry: false })) {
      throw alreadyExistsError();
    }

    const { bytes, format } = await encodeProfileForFilename(profile, outPath);

    try {
      fs.writeFileSync(outPath, bytes, { flag: force ? 'w' : 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        throw alreadyExistsError();
      }
      throw new Error(
        `Could not write profile to ${outPath}: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }

    return {
      type: 'profile-save',
      path: outPath,
      format,
      bytes: bytes.byteLength,
      context: this._getContext(),
    };
  }

  /**
   * Apply a `.map` file (read from `absPath`) to the profile. When
   * `sourceHandle` is set the auto-match step is skipped and the map is applied
   * to that source directly.
   */
  async applySourceMap(
    absPath: string,
    sourceHandle?: string
  ): Promise<WithContext<ApplySourceMapResult>> {
    // Resolved before reading the file so a bad `--to` fails without touching
    // the filesystem.
    const sourceIndex =
      sourceHandle !== undefined
        ? this._resolveTargetSource(sourceHandle)
        : undefined;

    let contents: string;
    try {
      contents = fs.readFileSync(absPath, 'utf8');
    } catch (e) {
      throw new Error(
        `Could not read source map file ${absPath}: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }

    return this._applySourceMapContents(
      basename(absPath),
      contents,
      sourceIndex,
      runSourceMapSymbolicationNode
    );
  }
}
