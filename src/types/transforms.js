/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * Transforms are the minimal representation some kind of transformation to the data
 * that is used to transform the sample and stack information of a profile. They are
 * applied in a stack.
 */
import type { ThreadIndex, IndexIntoFuncTable } from './profile';
import type { ImplementationFilter } from './actions';

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
export type FocusSubtreeTransform = {|
  type: 'focus-subtree',
  callNodePath: IndexIntoFuncTable[],
  implementation: ImplementationFilter,
  inverted: boolean,
|};

export type Transform = FocusSubtreeTransform;
export type TransformStack = Transform[];
export type TransformStacksPerThread = { [id: ThreadIndex]: TransformStack };
