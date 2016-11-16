# Content

The content thread handles all of the user interaction and views of the application. It should limit itself to these activites, and must offload all computation and processing to the worker thread. The worker thread does the heavy lifting leaving the main thread jank-free. Information is dispatched to the worker through Redux's action system.

## Actions

The content actions behave like normal Redux actions with one additional feature. Any actions can have the property `{ toWorker: true }` and they will be dispatched to the worker thread, and be ignored by the content thread. See the worker folder for how these are processed.

## Messages

Any action dispatched from the worker thread with the property `{ toContent: true }` will be sent to the content thread and processed here. This is the translation layer that then calls the internal actions to deal with this new information.

## Reducers

These are typical Redux reducers.
