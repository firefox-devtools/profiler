import SummarizeLineGraph from './SummarizeLineGraph';

export function SummarizeProfileExpand ({summary, thread, isExpanded, expand, collapse}) {
  // Only show the expand/collapse button when it is warranted.
  if (summary.length > EXPAND_LENGTH) {
    return (
      <div className='summarize-profile-row'>
        <SummarizeLineGraph isBlank={true} />
        <div className='summarize-profile-details'>
          {
            isExpanded
              ? <a className='summarize-profile-collapse expanded' onClick={() => collapse(thread) }>Collapse</a>
              : <a className='summarize-profile-collapse' onClick={() => expand(thread) }>Expand remaining categories...</a>
          }
        </div>
      </div>
    );
  }
  return null;
}
