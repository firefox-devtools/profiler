# Processed and Gecko Profile Format Changelog

This file documents all changes in the profiler gecko and processed formats.

Note that this is not an exhaustive list. Processed profile format upgraders can be found in [processed-profile-versioning.jt](../src/profile-logic/processed-profile-versioning.ts) and gecko profile format upgraders can be found in [gecko-profile-versioning.jt](../src/profile-logic/gecko-profile-versioning.ts). Please refer to them for older upgraders or for exact implementations.

## Processed profile format

### Version 58

A new `SourceTable` has been added to `profile.shared.sources` to centralize all source file information. The `FuncTable.fileName` field has been replaced with `FuncTable.source`, which references indices in the shared sources table. This change allows storing a UUID per JS source, which will be used for fetching sources.

### Version 57

The `searchable` property in marker schemas, originally added in version 44, is now removed again. Now all marker fields are searchable.

### Version 56

The `stringArray` is now shared across threads. The shared array is stored at `profile.shared.stringArray`.

### Version 55

Changes to the `MarkerSchema` type which is used for the elements of the array at `profile.meta.markerSchema`:

- A new `description` field was added. This field is optional.
- The `data` property was renamed to `fields`.
- Every field must have a `key` and a `format` property now. There are no static fields any more.

Concretely, this means that if you have a `{ "label": "Description", value: "..." }` entry in your marker schema's `data` array, this entry needs to be removed and the description needs to be put into the `description` field instead, and the `data` property needs to be renamed to `fields`. If you have any other static fields, i.e. fields with `label` and `value` properties rather than `key` and `format` properties, then they need to be removed without replacement.

### Version 54

The `implementation` column was removed from the frameTable. Modern profiles from Firefox use subcategories to represent the information about the JIT type of a JS frame.
The optional `meta.doesNotUseFrameImplementation` field is no longer needed and was removed.

Furthermore, marker schema fields now support a `hidden` attribute. When present and set to true, such fields will be omitted from the tooltip and the sidebar.

And finally, `profile.meta.sampleUnits.time` now supports both `'ms'` (milliseconds) and `'bytes'`. When set to `'bytes'`, the time value of a sample will be interpreted as a bytes offset. This is useful for size profiles, where a sample's "time" describes the offset at which the piece is located within the entire file.

### Version 53

The columns `category` and `subcategory` were removed from the `stackTable`, to reduce the file size of profiles. The information in these columns was fully redundant with the category information in the `frameTable`. A stack's category and subcategory are determined as follows: If the stack's frame has a non-null category, then that's the stack's category, and the frame's subcategory (or 0 if null) becomes the stack's subcategory. Otherwise, if the stack is not a root node, it inherits the category and subcategory of its prefix stack. Otherwise, it defaults to the defaultCategory, which is defined as the first category in `thread.meta.categories` whose color is `grey` - at least one such category is required to be present. And the subcategory defaults to zero - all categories are required to have a "default" subcategory as their first subcategory.

The `frameTable`'s `category` column now becomes essential. It was already required in the previous profile version, but the UI would mostly work even if it wasn't present. There are some existing profiles in rotation which are missing this column in the `frameTable`. The 52->53 upgrader fixes such profiles up by inferring it from the information in the `stackTable`.

### Version 52

No format changes, but a front-end behavior change: The schema for a marker is now looked up purely based on its `data.type`. In the past there were some special cases when `data` was `null`, or when `data.type` was `tracing` or `Text`. These special cases have been removed. The new behavior is simpler and more predictable, and was probably what you expected anyway.

This change came with a new version because we needed to upgrade old profiles from Firefox which were relying on the more complex behavior.

### Version 51

Two new marker schema field format types have been added: `flow-id` and `terminating-flow-id`, with string index values (like `unique-string`).
An optional `isStackBased` boolean field has been added to the marker schema.

### Version 50

The format can now optionally store sample and counter sample times as time deltas instead of absolute timestamps to reduce the JSON size.

### Version 49

A new `sanitized-string` marker schema format type has been added, allowing markers to carry arbitrary strings containing PII that will be sanitized along with URLs and FilePaths.

### Version 48

Removed the 'sampleGroups' object from the Counter structure.

### Version 47

The `pid` field of the `Thread` type is changed from `string | number` to `string`. The same happened to the `data.otherPid` field of IPC markers, and to the pid fields in the `profiler.counters` and `profile.profilerOverhead` lists.

### Version 46

An `isMainThread` field was added to the Thread type.

This replaces the following function:

```js
export function isMainThread(thread: Thread): boolean {
  return (
    thread.name === 'GeckoMain' ||
    // If the pid is a string, then it's not one that came from the system.
    // These threads should all be treated as main threads.
    typeof thread.pid === 'string' ||
    // On Linux the tid of the main thread is the pid. This is useful for
    // profiles imported from the Linux 'perf' tool.
    String(thread.pid) === thread.tid
  );
}
```

### Version 45

The `optimizations` field is removed from the `frameTable`.

### Version 44

The `searchable` property is implemented in the marker schema. Previously all the `name` and `category` marker schema properties were automatically searchable and we had manual handling for `FileIO`, `Log`, `DOMEvent`, `TraceEvent` marker types.

### Version 43

The `number` property in counters is now optional.

### Version 42

The `nativeSymbols` table now has a new column: `functionSize`. Its values can be null.

### Version 41

The `libs` list has moved from `Thread` to `Profile` - it is now shared between all threads in the profile. And it only contains libs which are used by at least one resource.

The Lib fields have changed, too:

- The `start`/`end`/`offset` fields are gone: They are not needed after profile processing, when all frame addresses have been made library-relative; and these values usually differ in the different processes, so the fields could not have a meaningful value in the shared list.
- There is a `codeId` field which defaults to `null`. This will be used in the future to store another ID which lets the symbol server look up correct binary. On Windows this is the dll / exe CodeId, and on Linux and Android this is the full ELF build ID.

We've also cleaned up the ResourceTable format:

- All resources now have names.
- Resources without a `host` or `lib` field have these fields set to `null` consistently.

### Older Versions

Older versions are not documented in this changelog but can be found in [processed-profile-versioning.jt](../src/profile-logic/processed-profile-versioning.ts).

## Gecko profile format

### Version 31

Two new marker schema field format types have been added: `flow-id` and `terminating-flow-id`, with string index values (like `unique-string`).
An optional `isStackBased` boolean field has been added to the marker schema.

### Version 30

A new `sanitized-string` marker schema format type has been added, allowing markers to carry arbitrary strings containing PII that will be sanitized along with URLs and FilePaths.

### Version 29

Removed the 'sample_groups' object from the GeckoCounter structure.

### Version 28

A new `unique-string` marker schema format type has been added, allowing markers to carry unique-strings in their payloads.

### Version 27

The `optimizations` field is removed from the `frameTable` schema.

### Version 26

The `searchable` property is implemented in the marker schema. Previously all the `name` and `category` marker schema properties were automatically searchable and we had manual handling for `FileIO`, `Log`, `DOMEvent`, `TraceEvent` marker types.

### Older Versions

Older versions are not documented in this changelog but can be found in [gecko-profile-versioning.jt](../src/profile-logic/gecko-profile-versioning.ts).
