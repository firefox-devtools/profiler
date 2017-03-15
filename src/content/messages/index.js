import { profileSummaryProcessed } from '../actions/profile-summary';
/**
 * Messages are the translation layer from actions dispatched by the worker
 * thread to the content thread. This de-couples the state of the two threads.
 */
const messages = {};
export default messages;

messages.PROFILE_SUMMARY_PROCESSED = function (message, call) {
  call(profileSummaryProcessed, message.summary);
};
