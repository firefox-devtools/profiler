import {processProfileSummary, profileProcessed} from '../actions';
/**
 * Messages are the translation layer from actions dispatched by the content
 * thread to the worker thread. This de-couples the state of the two threads.
 * In the worker this is the only place that actions can be dispatched.
 */
const messages = {};
export default messages;

messages.PROFILE_PROCESSED = function (message, call) {
  call(profileProcessed, message.profile);
};

messages.SUMMARIZE_PROFILE = function (message, call) {
  call(processProfileSummary);
};
