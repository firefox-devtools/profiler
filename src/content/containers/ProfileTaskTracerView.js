import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import actions from '../actions';
import { getTasksByThread, getProfileTaskTracerData } from '../reducers/profile-view';
import { withSize } from '../with-size';

class ThreadTaskTracerTracksImpl extends Component {
  render() {
    const { tasks, tasktracer, rangeStart, rangeEnd, width } = this.props;
    const { taskTable, stringTable, addressTable } = tasktracer;
    const tracks = [];
    for (const taskIndex of tasks) {
      const dispatchTime = taskTable.dispatchTime[taskIndex];
      if (dispatchTime >= rangeEnd) {
        continue;
      }
      const endTime = taskTable.endTime[taskIndex];
      if (endTime !== undefined && endTime <= rangeStart) {
        continue;
      }
      let track = tracks.find(track => track.fullUpTo <= taskTable.dispatchTime[taskIndex]);
      if (track === undefined) {
        track = {
          tasks: [],
          fullUpTo: 0,
        };
        tracks.push(track);
      }
      track.tasks.push(taskIndex);
      track.fullUpTo = taskTable.endTime[taskIndex] || rangeEnd;
    }
    return (
      <div className='taskTracerThreadViewTracks'>
      {
        tracks.map((track, trackIndex) => {
          return (
            <ol className='taskTracerThreadViewTrack' key={trackIndex}>
              {
                track.tasks.map((taskIndex, i) => {
                  const dispatchTime = taskTable.dispatchTime[taskIndex];
                  const beginTime = taskTable.beginTime[taskIndex] || rangeEnd;
                  const endTime = taskTable.endTime[taskIndex] || rangeEnd;
                  const pos = (beginTime - rangeStart) / (rangeEnd - rangeStart) * width;

                  const execWidth = (endTime - beginTime) / (rangeEnd - rangeStart) * width;
                  const beginDelayWidth = (beginTime - dispatchTime) / (rangeEnd - rangeStart) * width;

                  const addressIndex = taskTable.address[taskIndex];
                  const classNameStringIndex = taskTable.ipdlMsg[taskIndex] !== undefined ? taskTable.ipdlMsg[taskIndex] : addressTable.className[addressIndex];
                  const labelStringIndices = taskTable.label[taskIndex];
                  let title = classNameStringIndex !== undefined ? stringTable.getString(classNameStringIndex) : 'undefined';
                  if (labelStringIndices !== undefined) {
                    title += '\n' + labelStringIndices.map(index => ` - ${stringTable.getString(index)}`).join('\n');
                  }
                  return (
                    <li key={i}
                        className='taskTracerThreadViewTrackTask'
                        title={title}
                        style={{left: `${pos}px`, width: `${execWidth}px`}}>
                      <span className='taskTracerThreadViewTrackTaskBeginDelay'
                            style={{left: `-${beginDelayWidth}px`, width: `${beginDelayWidth}px`}}/>
                    </li>
                  );
                })
              }
            </ol>
          );
        })
      }
      </div>
    );
  }
}

ThreadTaskTracerTracksImpl.propTypes = {
  tasks: PropTypes.arrayOf(PropTypes.number).isRequired,
  tasktracer: PropTypes.object.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  width: PropTypes.number.isRequired,
};

const ThreadTaskTracerTracks = withSize(ThreadTaskTracerTracksImpl);

class ThreadTaskTracerView extends Component {
  render() {
    const { name, tasks, tasktracer, rangeStart, rangeEnd } = this.props;
    if (tasks.length === 0) {
      return <li className='taskTracerThreadView taskTracerThreadViewEmpty' />;
    }
    return (
      <li className='taskTracerThreadView'>
        <h1 className='taskTracerThreadViewThreadName' title={name}>{name}</h1>
        <ThreadTaskTracerTracks tasks={tasks} tasktracer={tasktracer} rangeStart={rangeStart} rangeEnd={rangeEnd} />
      </li>
    );
  }
}

ThreadTaskTracerView.propTypes = {
  name: PropTypes.string.isRequired,
  tasks: PropTypes.arrayOf(PropTypes.number).isRequired,
  tasktracer: PropTypes.object.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
};

class ProfileTaskTracerView extends Component {
  render() {
    const { tasktracer, tasksByThread, rangeStart, rangeEnd } = this.props;
    const { threadTable, stringTable } = tasktracer;
    return (
      <div className='taskTracerViewWrapper'>
        <ol className='taskTracerView'>
          {
            Array.from(tasksByThread).map(([threadIndex, tasks]) => {
              return (
                <ThreadTaskTracerView key={threadIndex}
                                      name={stringTable.getString(threadTable.name[threadIndex])}
                                      tasks={tasks}
                                      tasktracer={tasktracer}
                                      rangeStart={rangeStart}
                                      rangeEnd={rangeEnd} />
              );
            })
          }
        </ol>
      </div>
    );
  }
}

ProfileTaskTracerView.propTypes = {
  tasktracer: PropTypes.object.isRequired,
  tasksByThread: PropTypes.object.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
};

export default connect(state => ({
  tasktracer: getProfileTaskTracerData(state),
  tasksByThread: getTasksByThread(state),
}), actions)(ProfileTaskTracerView);
