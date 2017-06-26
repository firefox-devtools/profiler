# Worker

The worker handles all heavy computation of the profiles. The content thread should request views on this data, but the mapping, filtering, and sorting should all happen here. The worker folder primarily consists of actions, reducers, and the messaging layer. The real logic of the computation should be stored in `../common`.

## Actions

The worker actions behave like normal Redux actions with one additional feature. Any actions can have the property `{ toContent: true }` and they will be dispatched to the content thread, and be ignored by the worker. See the content folder for how these are processed.

## Messages

Any action dispatched from the main thread with the property `{ toWorker: true }` will be sent to the worker and processed here. This is the translation layer that then calls the internal actions to deal with this new information. The worker's actions can only be dispatched by messages and fellow actions.

## Reducers

These are typical Redux reducers.
