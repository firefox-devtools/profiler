# `src` organization

The code is split into three different sections to support a threaded architecture.

## `./common`

Common is for code that can be used without much context. Any utilities that involve React components or Redux state must be self-contained (ideally pure functions) that do not know about the greater app state. The `./common` folder is also a good place for any scripts that process and analyze profile information. These functions again shouldn't know about the greater app state, and must rely upon code in the `./content` and `./worker` folders to wire the functionality into the application. Code from inside the `./common` folder must not import code from any outside folders.

## `./content`

The main view of the application is stored in the `./content` folder. This holds the Redux state and React components for the application. Ideally all real work will be offloaded into the worker thread. This folder can freely import from the common folder, but must not import from the worker folder. Logic-heavy work should be turned into context-free modules (that don't know about React or Redux) inside of `./common`.

## `./worker`

All heavy computation should not block the main thread, and should happen inside of the worker. The worker has no idea about React, but does have a unique Redux store. This store should be de-coupled from that of the content thread. This folder can freely import from the common folder, but must not import from the content folder.
