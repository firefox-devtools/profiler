# Video Documentation

## Tutorial videos

These videos go through an introduction of how to use perf.html and some of the theory behind how profilers work. They are a good way to get up and running with the workflow of how the tools work.

| Video | Description |
| ----- | ----------- |
| [perf.html intro][intro] | This intro video explains how to get set up and start profiling. It explains a little bit of how the architecture works to better understand the relationship of the various tools and data sources. |
| [Samples and markers][samples] |  Profilers have two main different types of data they collect. Thinking of the profile in terms of samples and markers is a useful way to understand what is going on with the underlying data. |
| [Call Tree (Part 1) - The basics][calltree1] | Call trees are one of the most useful reports on understanding profiles. This video walks through some very simplified examples and explains how the call tree is constructed and what it represents. |
| [Call Tree (Part 2) - Real recording][calltree2] | Take the theory of call stack and call trees to the interface of perf.html |
| [Call Tree (Part 3) - Branching][calltree3] | Real code branches and this demonstration walk you through how call trees are affected by branching and show how to understand them in a simplified code example. |
| [Multiple threads and async code][threads] | Walk through the steps of understanding and looking at a multi-process profile. |

## Joy of Profiling

These semi-weekly episodes examine Firefox performance profiles using perf.html. They are long-form and are a nice way to gain insights on how profile analysis is done on real-world profiles.

* [View all episodes][joy]

## Other recordings

 * [Ehsan giving a profiling tutorial](https://vid.ly/e6v7s4?content=video&amp;format=hd_webm)

[intro]: https://www.youtube.com/watch?v=MxgWOTqxOTg&list=PLxaZqnd-OQM620EZ_6eT8qurOnZ4eu6dz&index=1
[samples]: https://www.youtube.com/watch?v=BBDErudR_8Q&index=2&list=PLxaZqnd-OQM620EZ_6eT8qurOnZ4eu6dz
[calltree1]: https://www.youtube.com/watch?v=5L1fP7zOMD8&index=3&list=PLxaZqnd-OQM620EZ_6eT8qurOnZ4eu6dz
[calltree2]: https://www.youtube.com/watch?v=jqhP_25Nl-c&list=PLxaZqnd-OQM620EZ_6eT8qurOnZ4eu6dz&index=4
[calltree3]: https://www.youtube.com/watch?v=3hoceL8d4YM&index=5&list=PLxaZqnd-OQM620EZ_6eT8qurOnZ4eu6dz
[threads]: https://www.youtube.com/watch?v=Qq0h1veSBEc&list=PLxaZqnd-OQM620EZ_6eT8qurOnZ4eu6dz&index=6
[joy]: https://air.mozilla.org/search/?q=joy+of+profiling
