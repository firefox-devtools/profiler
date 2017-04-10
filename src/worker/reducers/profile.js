export default function profile(state = null, action) {
  switch (action.type) {
    case 'PROFILE_PROCESSED':
      return action.profile;
    default:
      return state;
  }
}
