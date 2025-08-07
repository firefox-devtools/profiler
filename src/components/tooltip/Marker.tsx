/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import {
  formatMilliseconds,
  formatTimestamp,
} from 'firefox-profiler/utils/format-numbers';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getCategories,
  getMarkerSchemaByName,
  getImplementationFilter,
  getPageList,
  getInnerWindowIDToPageMap,
  getZeroAt,
  getThreadIdToNameMap,
  getProcessIdToNameMap,
  getThreadSelectorsFromThreadsKey,
} from 'firefox-profiler/selectors';

import {
  TooltipNetworkMarkerPhases,
  getNetworkMarkerDetails,
} from './NetworkMarker';
import {
  TooltipDetails,
  TooltipDetail,
  type TooltipDetailComponent,
  TooltipDetailSeparator,
} from './TooltipDetails';
import { Backtrace } from 'firefox-profiler/components/shared/Backtrace';

import {
  formatMarkupFromMarkerSchema,
  getSchemaFromMarker,
} from 'firefox-profiler/profile-logic/marker-schema';
import { computeScreenshotSize } from 'firefox-profiler/profile-logic/marker-data';

import type {
  CategoryList,
  Milliseconds,
  Marker,
  ImplementationFilter,
  Thread,
  ThreadsKey,
  PageList,
  MarkerSchemaByName,
  MarkerIndex,
  InnerWindowID,
  Page,
  Pid,
  Tid,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import {
  getGCMinorDetails,
  getGCMajorDetails,
  getGCSliceDetails,
} from './GCMarker';

import './Marker.css';

function _maybeFormatDuration(
  start: number | void,
  end: number | void
): string {
  if (start !== undefined && end !== undefined) {
    return formatMilliseconds(end - start);
  }
  return 'unknown';
}

type OwnProps = {
  readonly markerIndex: MarkerIndex;
  readonly marker: Marker;
  readonly threadsKey: ThreadsKey;
  readonly className?: string;
  // In tooltips it can be awkward for really long and tall things to force
  // the layout to be huge. This option when set to true will restrict the
  // height of things like stacks, and the width of long things like URLs.
  readonly restrictHeightWidth: boolean;
};

type StateProps = {
  readonly threadName?: string;
  readonly thread: Thread;
  readonly implementationFilter: ImplementationFilter;
  readonly pages: PageList | null;
  readonly innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
  readonly zeroAt: Milliseconds;
  readonly threadIdToNameMap: Map<Tid, string>;
  readonly processIdToNameMap: Map<Pid, string>;
  readonly markerSchemaByName: MarkerSchemaByName;
  readonly getMarkerLabel: (param: MarkerIndex) => string;
  readonly categories: CategoryList;
};

type Props = ConnectedProps<OwnProps, StateProps, {}>;

// Maximum image size of a tooltip field.
const MAXIMUM_IMAGE_SIZE = 350;

/**
 * This component combines Marker Schema, and custom handling to generate tooltips
 * for markers.
 */
class MarkerTooltipContents extends React.PureComponent<Props> {
  _maybeRenderPageUrl = (): TooltipDetailComponent => {
    const { pages, innerWindowIDToPageMap, marker } = this.props;

    if (
      !(
        pages &&
        innerWindowIDToPageMap &&
        marker.data &&
        'innerWindowID' in marker.data &&
        marker.data.innerWindowID
      )
    ) {
      return null;
    }

    const innerWindowID = marker.data.innerWindowID;
    const page = innerWindowIDToPageMap.get(innerWindowID);

    if (page) {
      // If multiple pages have the same url, show the innerWindowID to disambiguate.
      let innerWindowIDSuffix = null;
      if (pages.filter((p) => p.url === page.url).length > 1) {
        innerWindowIDSuffix = ' (id: ' + innerWindowID + ')';
      }
      try {
        const { host } = new URL(page.url);
        const hostIndex = page.url.indexOf(host);
        if (hostIndex === -1) {
          throw new Error(
            'Unable to find the host in the URL. This is a programming error.'
          );
        }
        const protocol = page.url.slice(0, hostIndex);
        const rest = page.url.slice(hostIndex + host.length);
        return (
          <TooltipDetail label="Page">
            <div className="tooltipDetailsUrl">
              <span className="tooltipDetailsDim">{protocol}</span>
              {host}
              <span className="tooltipDetailsDim">{rest}</span>
              {innerWindowIDSuffix}
              {page.isPrivateBrowsing ? ' (private)' : null}
            </div>
          </TooltipDetail>
        );
      } catch (error) {
        // Could not parse the URL. Just display the entire thing
        let url = page.url;
        if (innerWindowIDSuffix) {
          url += innerWindowIDSuffix;
        }
        if (page.isPrivateBrowsing) {
          url += ' (private)';
        }
        return <TooltipDetail label="Page">{url}</TooltipDetail>;
      }
    }
    return null;
  };

  /**
   * Either print the thread name that marker is in, or get the thread name from
   * the threadId field if it's given. The second case is useful when a marker
   * belongs to another thread but in this thread for some limitations in the
   * platform side. For example, FileIO marker may belong to another thread if
   * they have threadId field.
   */
  _renderThreadDetails(): TooltipDetailComponent[] {
    const { marker, threadIdToNameMap } = this.props;
    const data = marker.data;

    // Markers might have threadId information if we're in a merged thread.
    // Otherwise let's just take the thread information from the current thread.
    const threadName =
      marker.threadId !== null
        ? threadIdToNameMap.get(marker.threadId)
        : this.props.threadName;

    if (data && 'threadId' in data && data.threadId !== undefined) {
      // This marker has some threadId data in its payload, which is about the
      // thread where this event happened.
      const threadId = data.threadId;
      const occurringThreadName = threadIdToNameMap.get(threadId);

      return [
        <TooltipDetail label="Recording Thread" key="recording">
          {threadName}
        </TooltipDetail>,
        // If we have the thread information of the occurring thread, then show.
        // Otherwise, only show the thread ID.
        occurringThreadName ? (
          <TooltipDetail
            label="Occurring Thread"
            key="occurring"
          >{`${occurringThreadName} (TID: ${threadId})`}</TooltipDetail>
        ) : (
          <TooltipDetail label="Occurring Thread ID" key="occurring">
            {threadId}
          </TooltipDetail>
        ),
      ];
    }

    // This is the common case.

    return [
      <TooltipDetail label="Track" key="thread">
        {threadName}
      </TooltipDetail>,
    ];
  }

  /**
   * This function combines the Marker Schema formatting, and custom handling of
   * properties that are difficult to represent with the Schema.
   */
  _renderMarkerDetails(): TooltipDetailComponent[] {
    const {
      marker,
      markerSchemaByName,
      thread,
      threadIdToNameMap,
      processIdToNameMap,
    } = this.props;
    const data = marker.data;
    const details: TooltipDetailComponent[] = [];

    if (data) {
      // Add the details for the markers based on their Marker schema.
      const schema = getSchemaFromMarker(markerSchemaByName, marker.data);
      if (schema) {
        if (schema.description) {
          const key = schema.name + '-description';
          details.push(
            <TooltipDetail key={key} label="Description">
              <div className="tooltipDetailsDescription">
                {schema.description}
              </div>
            </TooltipDetail>
          );
        }

        for (const field of schema.fields) {
          if (field.hidden) {
            // Do not include hidden fields.
            continue;
          }

          const { key, label, format } = field;

          const value = (data as any)[key];
          if (value === undefined || value === null) {
            // This marker doesn't have a value for this field. Values are optional.
            continue;
          }

          details.push(
            <TooltipDetail key={schema.name + '-' + key} label={label || key}>
              {formatMarkupFromMarkerSchema(
                schema.name,
                format,
                value,
                thread.stringTable,
                threadIdToNameMap,
                processIdToNameMap
              )}
            </TooltipDetail>
          );
        }
      }

      switch (data.type) {
        case 'GCMinor': {
          // The GC schema is mostly ignored.
          details.push(...getGCMinorDetails(data));
          break;
        }
        case 'GCMajor': {
          // The GC schema is mostly ignored.
          details.push(...getGCMajorDetails(data));
          break;
        }
        case 'GCSlice': {
          // The GC schema is mostly ignored.
          details.push(...getGCSliceDetails(data));
          break;
        }
        case 'Network': {
          // Network markers embed lots of timing information inside of them, that
          // must be reworked in the tooltip.
          details.push(...getNetworkMarkerDetails(data));
          break;
        }
        case 'IPC': {
          // The logic to subtract times to create durations is not supported by
          // the marker schema. Use custom handling for these in addition to
          // the other properties supported by the Marker Schema.
          details.push(
            <TooltipDetail
              label="Send Thread Latency"
              key="IPC-Send Thread Latency"
            >
              {_maybeFormatDuration(data.startTime, data.sendStartTime)}
            </TooltipDetail>,
            <TooltipDetail
              label="IPC Send Duration"
              key="IPC-IPC Send Duration"
            >
              {_maybeFormatDuration(data.sendStartTime, data.sendEndTime)}
            </TooltipDetail>,
            <TooltipDetail label="IPC Recv Latency" key="IPC-IPC Recv Latency">
              {_maybeFormatDuration(data.sendEndTime, data.recvEndTime)}
            </TooltipDetail>,
            <TooltipDetail
              label="Recv Thread Latency"
              key="IPC-Recv Thread Latency"
            >
              {_maybeFormatDuration(data.recvEndTime, data.endTime)}
            </TooltipDetail>
          );
          break;
        }
        case 'CompositorScreenshot': {
          if (
            data.url !== undefined &&
            'windowWidth' in data &&
            'windowHeight' in data
          ) {
            const { width, height } = computeScreenshotSize(
              data,
              MAXIMUM_IMAGE_SIZE
            );
            details.push(
              <TooltipDetail label="Image" key="CompositorScreenshot-image">
                <img
                  className="tooltipScreenshotImg"
                  src={thread.stringTable.getString(data.url)}
                  style={{
                    width,
                    height,
                  }}
                />
              </TooltipDetail>,
              <TooltipDetail
                label="Window Size"
                key="CompositorScreenshot-window size"
              >
                <>
                  {data.windowWidth}px × {data.windowHeight}px
                </>
              </TooltipDetail>,
              <TooltipDetail
                label="Description"
                key="CompositorScreenshot-description"
              >
                This marker spans the time between each composite of a window
                and shows the window contents during that time.
              </TooltipDetail>,
              <TooltipDetail
                label="Window ID"
                key="CompositorScreenshot-window id"
              >
                {data.windowID}
              </TooltipDetail>
            );
          } else if (marker.name === 'CompositorScreenshotWindowDestroyed') {
            details.push(
              <TooltipDetail
                label="Description"
                key="CompositorScreenshot-description"
              >
                This marker shows the moment a window has been destroyed.
              </TooltipDetail>,
              <TooltipDetail
                label="Window ID"
                key="CompositorScreenshot-window id"
              >
                {data.windowID}
              </TooltipDetail>
            );
          }
          break;
        }
        default:
        // Do nothing
      }
    }

    return details;
  }

  _maybeRenderMarkerDuration() {
    const { marker } = this.props;
    if (marker.end === null) {
      return null;
    }

    // We only know the duration if it's complete.
    const duration = marker.incomplete
      ? 'unknown duration'
      : formatTimestamp(marker.end - marker.start, 3, 1);

    return <div className="tooltipTiming">{duration}</div>;
  }

  _maybeRenderBacktrace() {
    const {
      marker,
      thread,
      implementationFilter,
      restrictHeightWidth,
      categories,
    } = this.props;
    const { data, start } = marker;
    if (data && 'cause' in data && data.cause) {
      const { cause } = data;
      const causeAge = cause.time !== undefined ? start - cause.time : 0;
      return [
        <TooltipDetailSeparator key="backtrace-separator" />,
        <TooltipDetail label="Stack" key="backtrace">
          <div className="tooltipDetailsBackTrace">
            {
              /* The cause's time might be later than the marker's start. For
                example this happens in some usual cases when the cause is
                captured right when setting the end marker for tracing pairs of
                markers. */
              causeAge > 0 ? (
                <h2 className="tooltipBackTraceTitle">
                  {data.type === 'Styles' || marker.name === 'Reflow'
                    ? `First invalidated ${formatTimestamp(
                        causeAge
                      )} before the flush, at:`
                    : `Triggered ${formatTimestamp(causeAge)} ago, at:`}
                </h2>
              ) : null
            }
            <Backtrace
              maxStacks={restrictHeightWidth ? 20 : Infinity}
              stackIndex={cause.stack}
              thread={thread}
              implementationFilter={implementationFilter}
              categories={categories}
            />
          </div>
        </TooltipDetail>,
      ];
    }
    return null;
  }

  _maybeRenderNetworkPhases() {
    const {
      marker: { data },
      zeroAt,
    } = this.props;
    if (data && data.type === 'Network') {
      return <TooltipNetworkMarkerPhases payload={data} zeroAt={zeroAt} />;
    }
    return null;
  }

  _renderTitle(): string {
    const { markerIndex, getMarkerLabel } = this.props;
    return getMarkerLabel(markerIndex);
  }

  /**
   * Often-times component logic is split out into several different components. This
   * is really helpful for interactive components, as each list of Props serves as
   * a piece of memoization that can help with not over-rendering.
   *
   * This component is a little bit different, as it will only be rendered once per
   * marker, as it's hovered. In addition, most of the complexity is in generating
   * a list of TooltipDetailComponent, which are label/value pairs. Many parts
   * of the tooltip are controlled by the Marker Schema, however there are some
   * custom implementations for various markers that include some complexity.
   * The general practice here is to provide functions of the signature:
   *
   * Payload => TooltipDetailComponent[]
   *
   * These TooltipDetailComponent are then combined with those generated by the
   * Marker Schema.
   *
   * Finally, many sections are optional based on the data that is present. Note
   * that these render function begin with "maybe", rather than embedded complicated
   * ternaries everywhere. This leads to a style of render function that includes
   * a short list of rendering strategies, in the order they appear.
   */
  override render() {
    const { className } = this.props;
    return (
      <div className={classNames('tooltipMarker', className)}>
        <div className="tooltipHeader">
          <div className="tooltipOneLine">
            {this._maybeRenderMarkerDuration()}
            <div className="tooltipTitle">{this._renderTitle()}</div>
          </div>
        </div>
        <TooltipDetails>
          {this._renderMarkerDetails()}
          {this._renderThreadDetails()}
          {this._maybeRenderPageUrl()}
          {this._maybeRenderBacktrace()}
        </TooltipDetails>
        {this._maybeRenderNetworkPhases()}
      </div>
    );
  }
}

export const TooltipMarker = explicitConnect<OwnProps, StateProps, {}>({
  mapStateToProps: (state, props) => {
    const selectors = getThreadSelectorsFromThreadsKey(props.threadsKey);
    return {
      threadName: selectors.getFriendlyThreadName(state),
      thread: selectors.getThread(state),
      implementationFilter: getImplementationFilter(state),
      pages: getPageList(state),
      innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
      zeroAt: getZeroAt(state),
      threadIdToNameMap: getThreadIdToNameMap(state),
      processIdToNameMap: getProcessIdToNameMap(state),
      markerSchemaByName: getMarkerSchemaByName(state),
      getMarkerLabel: selectors.getMarkerTooltipLabelGetter(state),
      categories: getCategories(state),
    };
  },
  component: MarkerTooltipContents,
});
