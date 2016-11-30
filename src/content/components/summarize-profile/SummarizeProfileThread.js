export function SummarizeProfileThread({summaryTable, rollingSummary, isExpanded, index}) {
  if (index > EXPAND_LENGTH && !isExpanded) {
    return null;
  }
  const {category, samples, percentage} = summaryTable;
  return (
    <div className='summarize-profile-row'>
      <SummarizeLineGraph rollingSummary={rollingSummary} category={category} />
      <div className='summarize-profile-details'>
        <div className='summarize-profile-text'>{category}</div>
        <div className='summarize-profile-numeric'>{samples}</div>
        <div className='summarize-profile-numeric'>{displayPercentage(percentage)}</div>
      </div>
    </div>
  );
}
