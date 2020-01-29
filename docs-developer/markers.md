# Markers

This section is a work-in-progress. Markers are events that happen within the browser. Every marker that is generated is recorded (they are not sample-based), and thus can give a much more accurate picture into what is going on in the browser. Markers consist of either a single point in time, or a start and end time (referred to as tracing markers). They have a name and other data associated with them. Currently the structure of markers is free-form, and they vary in form from implementation to implementation across Gecko. Markers allow for engineers to arbitrarily instrument their own code with useful information for their specific domain.

## Implementing new markers

Markers are implemented in [ProfilerMarker.h], [ProfilerMarkerPayload.h] and
[ProfilerMarkerPayload.cpp].
Markers are added to a profile with the [profiler_add_marker] function.
It is declared in [GeckoProfiler.h].
Markers without a payload only have a single start time.
Markers with a payload can have a start and end time, as well as additional
information.
The payloads are defined in [ProfilerMarkerPayload.h] and
[ProfilerMarkerPayload.cpp].

[ProfilerMarker.h]: http://searchfox.org/mozilla-central/source/tools/profiler/core/ProfilerMarker.h
[ProfilerMarkerPayload.h]: http://searchfox.org/mozilla-central/source/tools/profiler/public/ProfilerMarkerPayload.h
[ProfilerMarkerPayload.cpp]: http://searchfox.org/mozilla-central/source/tools/profiler/core/ProfilerMarkerPayload.cpp
[GeckoProfiler.h]: http://searchfox.org/mozilla-central/source/tools/profiler/public/GeckoProfiler.h
[profiler_add_marker]: http://searchfox.org/mozilla-central/rev/5e1e8d2f244bd8c210a578ff1f65c3b720efe34e/tools/profiler/public/GeckoProfiler.h#368-378

## Marker Chart

Coming soon

# Marker definitions - WIP

## Paint markers

| Category     | Type               | Explanation |
| ------------ | ------------------ | ----------- |
| Paint        | RefreshDriverTick  | This is a container marker that wraps all phases of a refresh tick. |
| Paint        | FireScrollEvent    | The time it took call event listeners for “scroll” events after the scroll position in a scrollable frame changed. |
| Paint        | requestAnimationFrame callbacks | The time it takes to call JavaScript requestAnimationFrame callbacks during a refresh tick. |
| Paint        | Styles             | The time it takes to recompute CSS style information on any changed elements in the document. |
| Paint        | Reflow             | The time it took to recompute layout. |
| Paint        | DispatchSynthMouseMove | The time it takes to fire mouseover and mouseout events (and running any JS event handlers) after a layout change or scroll caused the mouse to be over a different element. |
| Paint        | DisplayList        | The time it takes to build a DisplayList for the window, which is a list of primives that need to be rendered. |
| Paint        | LayerBuilding      | The time it took to generate a new layer tree based on the new display list. |
| Paint        | Rasterize          | The time it takes to turn the display items that were assigned to a PaintedLayer into pixels in that layer’s buffer. |
| Paint        | ForwardTransaction | The time it takes to forward changes to the layer tree to the compositor. |
| Paint        | NotifyDidPaint     | The time it takes for a post-refresh garbage collection to run. (The refresh driver notifies the JS engine that it painted, and the JS engine reacts by running GC for a brief time.) |
| Paint        | LayerTransaction   | The time it takes on the compositor thread to process the list of changes that is contained in a layer transaction. This includes texture upload. |
| Paint        | Composite          | The time it takes to combine layers, on the compositor thread, and display them in the window. |

### Additional context information for paint markers

#### RefreshDriver phases

The RefreshDriver is Gecko’s way of throttling certain work, most importantly painting, to the display’s refresh rate. It’s also the mechanism that’s used to call requestAnimationFrame callbacks.

For foreground tabs, the refresh driver “ticks” in response to vsync events, so usually 60 times per second. A refresh driver “tick” contains multiple phases, one of them being painting.

Painting requires an up-to-date layout object tree (“frame tree”), and computing that requires up-to-date style information. So the basic order of operations within a refresh tick is: Flush styles (“Styles” marker), flush layout (“Reflow” marker), paint. requestAnimationFrame callbacks can touch the DOM or change style information, so in order to avoid unnecessary repeated style flushing, those run first, before the style flush.

The paint phase contains multiple sub-phases: First, Gecko builds a display list for the whole window, then it computes a layer tree for the window based on that display list, and then it rasterizes the content of any PaintedLayers in that layer tree. At the end of painting, any changes to the layer tree and to any rasterized buffers are wrapped up into a layer transaction and forwarded to the compositor (“ForwardTransaction”).

There are a few more things that we do during a refresh tick: We dispatch synthetic mouse move events if a layout change triggered the mouse to be over a different element, we fire “scroll” events, and at the end of a refresh tick, we notify the JS Engine so that it has a chance to do a small chunk of GC (“NotifyDidPaint”).

#### Compositor thread

We have two tracing markers that are compositor-specific: “LayerTransaction” and “Composite”.
The compositor applies any changes that it received in a layers transaction to the layer tree, and on vsync, it recomposites the window with that new layer tree if anything changed.
