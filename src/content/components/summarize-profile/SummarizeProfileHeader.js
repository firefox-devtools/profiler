export function SummarizeProfileHeader ({theadName}) {
  return (
    <div>
      <div className='summarize-profile-thread' colSpan='3'>{theadName} Thread</div>
      <div className='summarize-profile-header'>
        <div className='summarize-line-graph'>
          Rolling Summary
        </div>
        <div className='summarize-profile-details'>
          <div className='summarize-profile-text'>Category</div>
          <div className='summarize-profile-numeric'>Samples</div>
          <div className='summarize-profile-numeric'>% Time</div>
        </div>
      </div>
    </div>
  );
}
