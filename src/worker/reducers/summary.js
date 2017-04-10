export default function summary(state = null, action) {
  switch (action.type) {
    case 'PROFILE_SUMMARY_PROCESSED':
      return action.summary;
    default:
      return state;
  }
}
