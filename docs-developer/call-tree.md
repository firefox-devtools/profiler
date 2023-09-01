# Call Tree

A call tree is a summary representation of sample and stack data. It adds together all of the timings of the different functions, and presents them in a tree depending on how they are called. For instance take the following 3 samples, where the letter represents the function that was being called.

```
 1ms  2ms  3ms
  A    A    A
  |    |    |
  v    v    v
  B    B    B
  |    |    |
  v    v    v
  C    C    H
  |    |    |
  v    v    v
  D    F    F
  |    |
  v    v
  E    G
```

In this case the profiler took 3 samples, each 1 millisecond apart. Visualizing profile information in this form doesn't scale when you have thousands of samples, so it's best to summarize this information. The call tree does this by starting at the root of all the samples, and looks at the functions called. If the functions are the same, then they are combined into a single node. After evaluating the first depth of the stack, the second level is evaluated. If any of the samples do not call the same function at the second depth, then the tree is split into multiple nodes, one for each function. This branching continues until all levels of the samples' stacks have been evaluated. Taking the above samples and the corresponding relationship between the stacks would produce the following tree. One special thing to note here is the function F has been called multiple times, but has different positions in the 2nd and 3rd callstacks.

```
              A
              |
              v
              B
            /   \
           v     v
          C       H
        /   \      \
       v     v      v
      D       F     F
      |       |
      v       v
      E       G
```

This structure makes it much easier to tell where time is being spent in different parts of the application. Here the call tree shows that function `A` is the root of our samples, and all samples were called from there. According to this call tree `B` calls out to two different functions, `C` and `H`. However with only this tree we do not yet know how long each function took. This is where self time and running time come into play.

# Self and running time

With the above graph, we know that the functions at the leaf of the graph were the actual functions that were running when we took the samples. So for the leaf functions `E`, `G`, and `F`, their self times are 1ms. Their running times will be the same as their self time. Now walking up the stack, respectively the function `D`, `F`, and `H` called those functions. Since we never actually observed those functions directly running (they weren't at the end of the stack), then the self times for all of those functions would be 0ms. However, because the functions they called _did_ in fact run, then the running times would be 1ms each. Walking all the way up to root of the graph we get to function `A`. This node on the call tree would have a self time of 0ms as we never actually directly observed it running, but it includes every other function that we did observe, so the running time would be 3ms. The following is a graph of all the running and self times where the first number is the running time, and the second is the self time. So `A:3,0` would be the function `A` with the running time of 3ms, and the self time of 0ms.

```
             A:3,0
               |
               v
             B:3,0
             /    \
            v      v
        C:2,0     H:1,0
       /      \         \
      v        v         v
    D:1,0     F:1,0     F:1,1
    |           |
    v           v
  E:1,1       G:1,1
```

# Functions are important not stacks and frames

One key point of the aggregation done in the call tree is that it's focused on what _functions_ are called, and the relationships between them. In the profiler we collect frames, that give details about that specific frame of execution. Those are then organized using stacks. Each stack points to a frame, and its prefix (parent) stack. In C++ code a single function can have multiple frames depending on which part of the function was being executed. In JavaScript a function may suddenly be optimized and JITed midway through a series of runs. When the JIT process happens there will be new frames generated for these different implementations of the same function. The stacks in the profile describe the relationship between these individual frames. However, naively using only the frames and stacks will often not produce a particularly useful tree. So when referring to anything in the tree, what we care about is the relationship of functions called, not the individual frames and stacks from the profile. For a detailed explanation of how C++ generates multiple frames for a single function, please read [Frames, funcs, stacks and CallNodes in C++](call-nodes-in-cpp.md).

## Frames and stacks in JavaScript

Imagine this simplified example of 3 samples of mixed C++, JavaScript Code (js), and JIT optimized JavaScript (JIT). The functions are all labeled as to their implementation.

| Sample index | Sample's stack                                                                             |
| ------------ | ------------------------------------------------------------------------------------------ |
| 0            | `JS::RunScript [c++]  ➡  onLoad [js]  ➡  a [js]  ➡  b [js]`                                |
| 1            | `JS::RunScript [c++]  ➡  onLoad [js]  ➡  js::jit::IonCannon [c++]  ➡  a [JIT]  ➡  b [JIT]` |
| 2            | `JS::RunScript [c++]  ➡  onLoad [js]  ➡  js::jit::IonCannon [c++]  ➡  a [JIT]  ➡  b [JIT]` |

This example produces the following frames:

| Frame index | Function name        | Implementation |
| ----------- | -------------------- | -------------- |
| 0           | `JS::RunScript`      | C++            |
| 1           | `onLoad`             | JavaScript     |
| 2           | `a`                  | JavaScript     |
| 3           | `b`                  | JavaScript     |
| 4           | `js::jit::IonCannon` | C++            |
| 5           | `a`                  | JIT            |
| 6           | `b`                  | JIT            |

For completeness, here is the stack table. It would only contain the frame index, and a stack prefix index, but it can be filled out with a little bit more information:

| Stack index | Frame index | Prefix | Frame's function     | Prefix's function    |
| ----------- | ----------- | ------ | -------------------- | -------------------- |
| 0           | 0           | null   | `JS::RunScript`      | null                 |
| 1           | 1           | 0      | `onLoad`             | `JS::RunScript`      |
| 2           | 2           | 1      | `a`                  | `onLoad`             |
| 3           | 3           | 2      | `b`                  | `a`                  |
| 4           | 4           | 1      | `js::jit::IonCannon` | `onLoad`             |
| 5           | 5           | 4      | `a`                  | `js::jit::IonCannon` |
| 6           | 6           | 5      | `b`                  | `a`                  |

Now, taking the stacks and building a call tree produces the following:

```
                  JS::RunScript
                       ↓
                     onLoad
                   ↙       ↘
                  a        js::jit::IonCannon
                  ↓             ↓
                  b             a
                                ↓
                                b
```

This is the correct tree of what you would want to see. But since we are mixing languages together into the same stack system, it might be nice to view only JS functions. In order to do that we hide any C++ stacks, and assign them to the nearest JS stack. Our tables would be updated to look like the following.

| Sample index | Sample's stack                        |
| ------------ | ------------------------------------- |
| 0            | `onLoad [js]  ➡  a [js]  ➡  b [js]`   |
| 1            | `onLoad [js]  ➡  a [JIT]  ➡  b [JIT]` |
| 2            | `onLoad [js]  ➡  a [JIT]  ➡  b [JIT]` |

| Frame index | Function name | Implementation |
| ----------- | ------------- | -------------- |
| 0           | onLoad        | JavaScript     |
| 1           | a             | JavaScript     |
| 2           | b             | JavaScript     |
| 3           | a             | JIT            |
| 4           | b             | JIT            |

| Stack index | Frame index | Prefix | Frame's function | Prefix's function |
| ----------- | ----------- | ------ | ---------------- | ----------------- |
| 0           | 0           | null   | onLoad           | null              |
| 1           | 1           | 0      | a                | onLoad            |
| 2           | 2           | 1      | b                | a                 |
| 3           | 3           | 0      | a                | onLoad            |
| 4           | 4           | 1      | b                | a                 |

With this data if we build a call tree it now looks like this.

```
         onLoad
       ↙       ↘
      a         a
      ↓         ↓
      b         b
```

This would be a surprising result, and many other assumptions would shake out that give surprising responses to this look at the data. The call tree we would really expect would be the following:

```
    onLoad
      ↓
      a
      ↓
      b
```

# Call trees as stacks of functions (CallNodes), and referring to CallNodes with function paths

What we really care about in the call tree is the execution time of a given function, and its relationship to other functions. Since there can be multiple frames and stacks per function in a call tree, the logical step is to combine all of these stacks and frames together in terms of what function they point to. This combined representation is known in the Firefox Profiler as CallNodes.

However once this happens, it starts to become quite difficult to explain relationships and refer to specific CallNodes within this modified view. Whenever we apply any type of data transformation, these CallNodes need to be regenerated, and the indexes into the CallNodesTable will be different. The only unique identifier that exists is the function, and where it exists in the call tree. So in order to refer to a specific CallNode, we need a different way to store a reference to the tree. This structure in the Firefox Profiler is called the CallNodePath.

```
              A
              |
              v
              B
            /   \
           v     v
          C       H
        /   \      \
       v     v      v
      D       F     F
      |       |
      v       v
      E       G
```

Given the above call tree, the indexes of the CallNodes in the CallNodesTable are rather random, and will change as we further modify the structure of the call tree. So to refer to the CallNodes at function C it is useful to provide a path of functions that shows how to get there. In our case this would be the list of functions `A ➡ B ➡ C`. The `CallNodePath` in the Firefox Profiler would then be stored as an array of function indexes.

# Modifying the tree

Call trees are interesting for the information they provide, but they can be quite large structures to navigate. In order to provide a proper analysis we need to be able to modify the structure and shape of the tree to provide more intelligent results. There is not a great body of language available to describe these actions, so they are listed here below.

## Again looking at these samples

```
  A    A    A
  |    |    |
  v    v    v
  B    B    B
  |    |    |
  v    v    v
  C    C    H
  |    |    |
  v    v    v
  D    F    F
  |    |
  v    v
  E    G
```

## Would produce this call tree

```
                  A:3,0
                    |
                    v
                  B:3,0
                  /    \
                 v      v
             C:2,0     H:1,0
            /      \         \
           v        v         v
         D:1,0     F:1,0     F:1,1
         |           |
         v           v
       E:1,1       G:1,1
```

## Merge (charge to caller)

Merging involves removing a single CallNode from the call tree, and then assigning its self time to the parent CallNode. In the call tree below, if the CallNode C is removed, then the `D` and `F` CallNodes are re-assigned to `B`. No self time in this case would change, as `C` was not a leaf CallNode, but the structure of the tree was changed slightly.

```
                   A:3,0                              A:3,0
                     |                                  |
                     v                                  v
                   B:3,0                              B:3,0
                   /    \          Merge C         /    |    \
                  v      v           -->          v     v     v
              C:2,0     H:1,0                 D:1,0   F:1,0    H:1,0
             /      \         \                 |       |        |
            v        v         v                v       v        v
          D:1,0     F:1,0     F:1,1          E:1,1    G:1,1    F:1,1
          |           |
          v           v
        E:1,1       G:1,1
```

When a leaf CallNode is merged, the self time for that CallNode is assigned to the parent CallNode. Here the leaf CallNode `E` is merged. `D` goes from having a self time of 0 to 1.

```
                  A:3,0                              A:3,0
                    |                                  |
                    v                                  v
                  B:3,0                              B:3,0
                  /    \          Merge E            /    \
                 v      v           -->             v      v
             C:2,0     H:1,0                    C:2,0     H:1,0
            /      \         \                 /      \         \
           v        v         v               v        v         v
         D:1,0     F:1,0     F:1,1          D:1,1     F:1,0     F:1,1
         |           |                                  |
         v           v                                  v
       E:1,1       G:1,1                              G:1,1
```

## Merge subtree (prune subtree)

The self time of an entire subtree is placed to the parent CallNode. In the case of merging CallNode C's subtree, CallNode B would go from having a self time of 0 seconds, to gaining 2 milliseconds of self time from the merged subtree.

```
                  A:3,0                             A:3,0
                    |                                 |
                    v                                 v
                  B:3,0                             B:3,2
                  /    \      Merge subtree C         |
                 v      v           -->               v
             C:2,0     H:1,0                        H:1,0
            /      \         \                        |
           v        v         v                       v
         D:1,0     F:1,0     F:1,1                  F:1,1
         |           |
         v           v
       E:1,1       G:1,1
```

### Hide

If CallNode C is hidden, then 2 samples are removed because they contain that CallNode. The overall time of the tree is reduced from 3 milliseconds to 1 milliseconds.

```
                  A:3,0                             A:1,0
                    |                                 |
                    v                                 v
                  B:3,0                             B:1,0
                  /    \          Hide C              |
                 v      v          -->                v
             C:2,0     H:1,0                        H:1,0
            /      \         \                        |
           v        v         v                       v
         D:1,0     F:1,0     F:1,1                 F:1,1
         |           |
         v           v
       E:1,1       G:1,1
```

### Focus on subtree

Only CallNodes that contain CallNode C are retained, and C is made as root.

```
                  A:3,0                         C:2,0
                    |                          /      \
                    v         Focus C        v        v
                  B:3,0         -->        D:1,0     F:1,0
                  /    \                    |           |
                 v      v                   v           v
             C:2,0     H:1,0              E:1,1       G:1,1
            /      \         \
           v        v         v
         D:1,0     F:1,0     F:1,1
         |           |
         v           v
       E:1,1       G:1,1
```

# How call tree modifications affect function paths

```
              A
              |
              v
              B
            /   \
           v     v
          C       H
        /   \      \
       v     v      v
      D       F     F
      |       |
      v       v
      E       G
```

Looking at the above call tree and imagine a CallNodePath describing the node that points to function E. This would look like `A ➡ B ➡ C ➡ D ➡ E`. Now what happens to our description of that node when applying a merging of the CallNode that points to C.

```
              A
              |
              v
              B
           /  |  \
          v   v   v
          D   F   H
          |   |   |
          v   v   v
          E   G   F
```

The CallNodePath is now `A ➡ B ➡ D ➡ E`. So in order to maintain stable CallNodePaths, we need to update our description of the CallNodePath for every modification that we apply to the call tree. This can be quite a difficult problem, especially if we allow for reordering filtering operations. Operations are not necessarily commutative, so our definition of the transformations that we are applying may need to be updated with every transformation. Essentially the history of modifications affect the representation of our next operations that need to be performed. One potential solution to cut through this complexity is to implement any data transformations as a stack that guarantees that the data being transformed deterministically has the same shape. This involves a restriction to the end user that in order to reverse any changes requires popping off every single transformation that has come before it.
