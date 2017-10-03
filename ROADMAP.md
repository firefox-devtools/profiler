# Roadmap for perf.html

(Last updated July 2017)

Mozilla is investing in performance tools to understand the performance characteristics of Firefox in order to build a faster, silky smooth browser that will benefit millions of users so that they have a great experience on web.

## Top Line Goal: Support Quantum Flow

Quantum Flow is an internal Mozilla project to find where Firefox is slow, and make it faster. More information about this project is available on the [Mozilla Wiki](https://wiki.mozilla.org/Quantum/Flow). Features that help engineers diagnose performance problems are high priority, as many engineers are using this tool every day. There is a direct benefit of resolving a Quantum Flow issue, with improving Firefox end user's experiences. These issues can be found with the [Quantum Flow label](https://github.com/devtools-html/perf.html/issues?q=is%3Aopen+is%3Aissue+label%3A%22quantum+flow%22).

## Data transformations and the call tree

Many platform engineers are working with the call tree and have feature requests for better being able to filter and transform the data to find performance bottlenecks. The primary tracking issue for this is [Issue #435](https://github.com/devtools-html/perf.html/issues/435)

## Marker information

The benefits of a custom Firefox-specific profiler over existing more generalized performance tools is that the complex system of a web browser can be annotated with additional information. Markers are recorded for specific events that happen in the system, and can be used to annotate and provide additional insight into what is going on in an integrated system. Some areas to refine are:

 * Styling and painting to the screen
 * UserTiming information
 * Network requests

There are 3 places markers are currently surfaced. The header, the Marker Table, and the Marker Chart. There is a lot of opportunity to improve this area to provide greater insights into what is going on.

## Support web developers

The data presented right now has more of a platform engineer focus. This is a great way to build out necessary analytics and get some great insight into the system. However, the data can be quite platform-specific, and not helpful developers focusing on web applications.

perf.html should support various types of defaults for different types of users, especially web developers, so that the data presented is easy to understand and actionable. We shouldn't display platform information by default.

## Land back in Firefox DevTools

Once the product is more web developer friendly, we want to have a centralized effort with platform and DevTools to provide performance tooling. The path forward here is to use perf.html in the Firefox DevTools. Rather than embedding directly into DevTools, the plan is to instead providing a recording panel in DevTools, and then pop out the profiles into a separate tab loading perf.html.

# Future aspirations

## Continuous integration workflows

It would be great to support continuous integration paths. There is a lot of interesting work we could do here.

## Load in other browser platform's profiles

Often we want to know why different platforms have different performance characteristics. It would be great to be able to cross-compare on different browsers. In order to do this it would involve a one time mapping of the third party format, to perf.html's processed profile format. These profiles could then be viewed and shared.

## Programmatic API

We already process and run reports on the performance data. It would be great to hook this up to a public-facing API that anyone could use to query performance information. This would be especially nice with being able to convert a variety of platforms to our format, and if we support continuous integration workflows.
