# `./common`

Any type of computation work should be stored here. These files can be utilities, or more complicated modules, but they must not know about the greater state of the application. All parameters should be passed in through the content and worker threads, but the return values, state management, and UI interaction should be handled inside of the other folders.

There must not be any imported files from outside of this folder. Importing third party libraries is fine, but this can result in duplicated code if the files are imported into both the content and worker thread.
