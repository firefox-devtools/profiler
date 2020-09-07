# Frames, funcs, stacks and CallNodes in C++

This document pertains to how C++ samples are captured, and how they are processed for reporting in the Firefox Profiler. Specifically the profiler samples capture memory addresses for frames in C++ functions, and there can be many different frame addresses per single function.

## Example code

```
0x01  int main() {
0x02    for (int i = 0; i < 10; i++) {
0x03      doSomething(i);
0x04    }
0x05  
0x06    someInterlude();
0x07  
0x08    for (int i = 10; i < 20; i++) {
0x09      doSomething(i);
0x0A    }
0x0B  
0x0C    return 0;
0x0D  }
0x0E  
0x0F  void doSomething(int i) {
0x11    // do something
0x12  }
0x13  
0x14  void someInterlude() {
0x15    // do something else
0x16  }
```

We'll use line numbers and code addresses interchangably here in order to simplify things. In reality, each line in the code above will probably generate multiple instructions, and each of those instructions will take up more than a single byte.

### Frames

We'll have a frame for every line of the script above that was on the stack during sampling.

### Funcs

We have three funcs in the code above, each of them has a start address

  - `main()` has address `0x01`
  - `doSomething(int)` has address `0x0F`
  - `someInterlude()` has address `0x14`

Each frame is assigned to one of these funcs. (We pick the func with the highest address among funcs with start address <= frame address.)

### Stacks

In the first line of the `main()` function, there's only one frame on the stack: `0x02`. So we'll have a stack object with:

 - frame: `0x02`
 - prefix: null

When the CPU is executing `doSomething()` during the first loop, the stack will have these frames on it:

```
0x03
0x11
```

So we'll have a stack object with

 - frame: `0x11`
 - prefix: a stack with
   - frame: `0x03`
   - prefix: null

If the CPU is executing `doSomething()` from the second loop, the stack will be

```
0x09
0x11
```

so we'll have a different leaf stack object whose prefix is a stack object with frame `0x09`.

### CallNodes

If we only used stacks to create the call tree, with one tree node per stack, the tree would look like this:

```
  - main@0x02
  - main@0x03
    - doSomething@0x11
  - main@0x06
    - someInterlude@0x15
  - main@0x08
  - main@0x09
    - doSomething@0x11
```

This can be very confusing and is usually not what you want. What you want instead is this:

```
  - main
    - doSomething
    - someInterlude
```

In other words, we want to combine many different `stack` object into the same tree node, reflecting which frames have been combined into the same func.

We call the node of such a combined tree a `CallNode` - it's like a `stack`, but instead of being based on frames, it's based on funcs.

## FAQ

### Why keep around stacks at all, instead of only destructively combining them into CallNodes?

We want to keep around enough information to be able to show per-line profiling information for a given CallNode. For example, for the CallNode for `main`, we want to be able to highlight the expensive lines / inside `main()`. So we need to know how many samples were executing a given line of code. With the information we have, we can do that by finding all samples whose stacks are in the selected CallNode, and then look at the leaf frames of those stacks.

### How does symbolication affect this?

Glad you asked.

When we display a profile without any symbolication information, all we have is stacks and frames. At that point, we don't know which frames are from the same function. Only once the symbol information comes in we can actually start combining multiple frames into the same func, and multiple stacks into the same CallNode.

The takeaway here is: The symbolication process doesn't only give us strings, it can also completely change the shape of the call tree.

In the Firefox Profiler, we want to be fully interactive before any symbol information has arrived, and stay interactive while it's arriving. That means that we need to handle collapsing of funcs gracefully without destroying any state, as far as that can be done. Here's how this works:

 1. When loading a Gecko profile, we naively create a func for every single frame.
 2. When a symbol table arrives:
    1. Every address that has a symbol is treated as the start of a function.
    2. For each symbol, we pick one func object, and combine the func objects that we created for all frames in that address range into that one func.
    3. We have a map, `oldFuncToNewFuncMap`, that records these collapsed funcs and the func they were collapsed into.
    4. We have a few things in the redux state which refer to funcs, most notably the set of expanded tree nodes (expandedCallNodePaths) and the currently selected tree node (selectedCallNodePath). If any of those points to a func that was collapsed away, we replace that pointer with the func that it was collapsed into.
    5. This means that selected row in the tree can jump around. But it won't jump to an unrelated function; it will still be selecting the stack of the functions that you were looking at.
