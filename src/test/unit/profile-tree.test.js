/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { processProfile } from '../../profile-logic/process-profile';
import exampleProfile from '.././fixtures/profiles/example-profile';
import { getCallTree } from '../../profile-logic/profile-tree';
import {
  getFuncStackInfo,
  invertCallstack,
} from '../../profile-logic/profile-data';

describe('profile-tree', function() {
  const profile = processProfile(exampleProfile);
  const thread = profile.threads[0];

  describe('unfiltered call tree', function() {
    const funcStackInfo = getFuncStackInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable
    );
    const callTree = getCallTree(
      thread,
      profile.meta.interval,
      funcStackInfo,
      'combined',
      false
    );
    const [rootFuncStackIndex] = callTree.getRoots();
    it('calculates the the root of a calltree', function() {
      const rootNode = callTree.getNode(rootFuncStackIndex);
      expect(rootNode).toEqual({
        dim: false,
        icon: null,
        lib: '',
        name: '(root)',
        selfTime: '1.0ms',
        totalTime: '7.0ms',
        totalTimePercent: '100.0%',
      });
    });
    it('calculates the children of the root node', function() {
      const childIndices = callTree.getChildren(rootFuncStackIndex);
      const childNodes = childIndices.map(index => callTree.getNode(index));
      expect(childNodes).toEqual([
        {
          dim: false,
          icon: null,
          lib: 'firefox',
          name: '0x100000f84',
          selfTime: '2.0ms',
          totalTime: '6.0ms',
          totalTimePercent: '85.7%',
        },
      ]);
    });
  });

  describe('inverted call tree', function() {
    const inverted = invertCallstack(thread);
    const funcStackInfo = getFuncStackInfo(
      inverted.stackTable,
      inverted.frameTable,
      inverted.funcTable
    );
    const callTree = getCallTree(
      inverted,
      profile.meta.interval,
      funcStackInfo,
      'combined',
      true
    );
    const rootIndices = callTree.getRoots();
    const [firstRoot] = rootIndices;

    it('calculates the inverted roots of a calltree', function() {
      const rootNodes = rootIndices.map(index => callTree.getNode(index));
      expect(rootNodes).toEqual([
        {
          dim: false,
          icon: null,
          lib: 'firefox',
          name: '0x100000f84',
          selfTime: '2.0ms',
          totalTime: '2.0ms',
          totalTimePercent: '28.6%',
        },
        {
          dim: false,
          icon: null,
          lib: 'firefox',
          name: '0x100001a45',
          selfTime: '2.0ms',
          totalTime: '2.0ms',
          totalTimePercent: '28.6%',
        },
        {
          dim: false,
          icon: null,
          lib: '',
          name: 'Startup::XRE_Main',
          selfTime: '1.0ms',
          totalTime: '1.0ms',
          totalTimePercent: '14.3%',
        },
        {
          dim: false,
          icon: null,
          lib: '',
          name: '(root)',
          selfTime: '1.0ms',
          totalTime: '1.0ms',
          totalTimePercent: '14.3%',
        },
        {
          dim: false,
          icon: null,
          lib: 'chrome://blargh:34',
          name: 'frobnicate',
          selfTime: '1.0ms',
          totalTime: '1.0ms',
          totalTimePercent: '14.3%',
        },
      ]);
    });

    it('calculates the children of the inverted root node', function() {
      const childIndices = callTree.getChildren(firstRoot);
      const childNodes = childIndices.map(index => callTree.getNode(index));
      expect(childNodes).toEqual([
        {
          dim: false,
          icon: null,
          lib: '',
          name: '(root)',
          selfTime: '0.0ms',
          totalTime: '2.0ms',
          totalTimePercent: '28.6%',
        },
      ]);
    });
  });
});
