/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * Transforms are the minimal representation some kind of transformation to the data
 * that is used to transform the sample and stack information of a profile. They are
 * applied in a stack.
 */
import type { ThreadIndex } from './profile';
import type { CallNodePath } from './profile-derived';
import type { ImplementationFilter } from './actions';

/**
 * When working with a call tree, nodes in the graph are not stable across various
 * transformations of the stacks. It doesn't make sense to generate a single ID for
 * a node, as the definition of what a node is can change depending on the current
 * context. In order to get around this, we use the concept of a CallNodeReference.
 * This reference remains stable across stack inversions, and filtering stacks
 * by their implementation. The combination of the path of called functions to the call
 * node, the implementation filter, and whether the stacks were inverted will
 * provide a stable reference to a call node for a given view into a call tree.
 */
export type CallNodeReference = {
  callNodePath: CallNodePath,
  implementation: ImplementationFilter,
  inverted: boolean,
};

/**
 * FocusSubtreeTransform represents the operation of focusing on a subtree in a call tree.
 * The subtree is referenced by a callNodePath (a list of functions to a particular node),
 * and an implementation filter to filter out certain stacks and nodes that we don't care
 * about. For more details read `docs/call-tree.md`.
 *
 * Here is a typical case of focusing on the subtree at CallNodePath [A, B, C]
 *
 *                     A:3,0                              C:2,0
 *                       |                               /      \
 *                       v       Focus [A, B, C]        v        v
 *                     B:3,0           -->           D:1,0     F:1,0
 *                     /    \                         |           |
 *                    v      v                        v           v
 *                C:2,0     H:1,0                   E:1,1       G:1,1
 *               /      \         \
 *              v        v         v
 *            D:1,0     F:1,0     F:1,1
 *            |           |
 *            v           v
 *          E:1,1       G:1,1
 *
 * As well as focusing on a normal subtree, we can also focus on an inverted call tree.
 * In this case the CallNodePath will be reversed, and will go from the end of a call
 * stack, towards the base, the opposite order of an un-inverted CallNodePath.
 *
 * Here is a typical case of focusing on the inverted subtree at CallNodePath [Z, Y, X]
 *
 *           1. Starting call tree         ->       2. Invert call tree        ->
 *
 *                  A:3,0                             Z:2,2         E:1,1
 *                    ↓                                 ↓             ↓
 *                  B:3,0                             Y:2,0         D:1,0
 *                 ↙     ↘                              ↓             ↓
 *             X:1,0     C:1,0                        X:2,0         C:1,0
 *            ↙         ↙      ↘                     ↙     ↘          ↓
 *         Y:1,0     X:1,0     D:1,0             B:1,0     C:1,0    B:1,0
 *           ↓         ↓         ↓                 ↓         ↓        ↓
 *        Z:1,1      Y:1,0     E:1,0             A:1,0     B:1,0    A:1,0
 *                     ↓                                     ↓
 *                   Z:1,1                                  A:1,0
 *
 *  --------------------------------------------------------------------------------
 *
 *   ->    3. Focus [Z, Y, X]      ->      4. Un-invert call tree
 *
 *                 X:2,2                           A:2,0
 *                ↙     ↘                            ↓
 *            B:1,0     C:1,0                      B:2,0
 *              ↓         ↓                       ↙     ↘
 *            A:1,0     B:1,0                 X:1,1     C:1,0
 *                        ↓                               ↓
 *                      A:1,0                           X:1,1
 */
export type MergeSubtree = { type: 'merge-subtree' } & CallNodeReference;

/**
 * The MergeSubtree transform represents merging a CallNode into the parent CallNode. The
 * CallNode must match the given CallNodePath. In the call tree below, if the CallNode
 * at path [A, B, C] is removed, then the `D` and `F` CallNodes are re-assigned to `B`.
 * No self time in this case would change, as `C` was not a leaf CallNode, but the
 * structure of the tree was changed slightly. The merging work is done by transforming
 * an existing thread's stackTable.
 *
 *                 A:3,0                              A:3,0
 *                   |                                  |
 *                   v                                  v
 *                 B:3,0                              B:3,0
 *                 /    \          Merge C         /    |    \
 *                v      v           -->          v     v     v
 *            C:2,0     H:1,0                 D:1,0   F:1,0    H:1,0
 *           /      \         \                 |       |        |
 *          v        v         v                v       v        v
 *        D:1,0     F:1,0     F:1,1          E:1,1    G:1,1    F:1,1
 *        |           |
 *        v           v
 *      E:1,1       G:1,1
 *
 *
 * When a leaf CallNode is merged, the self time for that CallNode is assigned to the
 * parent CallNode. Here the leaf CallNode `E` is merged. `D` goes from having a self
 * time of 0 to 1.
 *                A:3,0                              A:3,0
 *                  |                                  |
 *                  v                                  v
 *                B:3,0                              B:3,0
 *                /    \          Merge E            /    \
 *               v      v           -->             v      v
 *           C:2,0     H:1,0                    C:2,0     H:1,0
 *          /      \         \                 /      \         \
 *         v        v         v               v        v         v
 *       D:1,0     F:1,0     F:1,1          D:1,1     F:1,0     F:1,1
 *       |           |                                  |
 *       v           v                                  v
 *     E:1,1       G:1,1                              G:1,1
 *
 * This same operation can be done on an inverted call tree as well. The CallNodePath
 * would then be reversed, going from the top of the stack, towards the bottom.
 */
export type MergeCallNode = { type: 'merge-call-node' } & CallNodeReference;

/**
 * TODO - Once implemented.
 */
export type FocusSubtree = { type: 'focus-subtree' } & CallNodeReference;

export type Transform = FocusSubtree | MergeSubtree | MergeCallNode;
export type TransformStack = Transform[];
export type TransformStacksPerThread = { [id: ThreadIndex]: TransformStack };
