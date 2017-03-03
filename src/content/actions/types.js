export type ProfileSummaryAction =
  { type: "PROFILE_SUMMARY_PROCESSED", summary: Summary } |
  { type: "PROFILE_SUMMARY_EXPAND", expanded: ExpandedSet } |
  { type: "PROFILE_SUMMARY_COLLAPSE", expanded: ExpandedSet };

export type Action = ProfileSummaryAction;
