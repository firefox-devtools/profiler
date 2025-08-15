# Processed profile format

The Gecko Profiler emits JSON profiles that Firefox Profiler can display. This original Gecko profile format needs to be processed in order to provide a data structure that is optimized for JS analysis. This client-side step provides a convenient mechanism for pre-processesing certain data transformations. The largest transformation is moving the performance data to be from a list of small object for each entry, to a few array tables containing long lists of primitive values. The primitive values do not need to be tracked by the garbage collector. For instance, if each profiler sample had a single object associated per sample with 7 properties per object, then 1000 samples would be one array containing 1000 objects. Transforming that into the processed format that same 1000 samples would be 1 table object, and 7 arrays, each of length 1000. The latter is much easier for the garbage collector to handle when using a reactive programming style.

## Processed profile documentation

The documentation for this format is provided in the TypeScript type definition located at [src/types/profile.ts](../src/types/profile.ts). Eventually the plan is to have the documentation here; now that we've switched to TypeScript we might be able to autogenerate some nice docs.
