import LoadingState from 'firefox-profiler/types';

export const loadingState:Reducer<LoadingState> = (
  state = 'promise',
  action
) => {
  switch (action.type) {
    case 'CHANGE_LOAD_PROGRESS':
      return {
        loadingStep:'promise',
        progress:100,
        error: 0,
      };//returns the object with new loadingStep and increase in progress
    default:
      return {
        loadingStep:'promise',
        progress:0,
        error: 0,
      };
  }
};