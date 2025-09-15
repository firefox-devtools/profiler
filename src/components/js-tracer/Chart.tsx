/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
  JS_TRACER_MAXIMUM_CHART_ZOOM,
} from 'firefox-profiler/app-logic/constants';
import explicitConnect from 'firefox-profiler/utils/connect';
import { JsTracerCanvas } from './Canvas';

import {
  getCommittedRange,
  getPreviewSelection,
  getStringTable,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getSelectedThreadsKey } from 'firefox-profiler/selectors/url-state';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { ensureExists } from 'firefox-profiler/utils/types';

import type { StringTable } from 'firefox-profiler/utils/string-table';
import type {
  JsTracerTable,
  ThreadsKey,
  Profile,
  JsTracerTiming,
  UnitIntervalOfProfileRange,
  CssPixels,
  StartEndRange,
  PreviewSelection,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './index.css';

const ROW_HEIGHT: CssPixels = 16;

type OwnProps = {
  readonly jsTracerTable: JsTracerTable;
  readonly showJsTracerSummary: boolean;
  readonly doFadeIn: boolean;
};

type DispatchProps = {
  readonly updatePreviewSelection: typeof updatePreviewSelection;
};

type StateProps = {
  readonly jsTracerTimingRows: JsTracerTiming[];
  readonly stringTable: StringTable;
  readonly timeRange: StartEndRange;
  readonly threadsKey: ThreadsKey;
  readonly previewSelection: PreviewSelection | null;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

/**
 * This component uses the timing information for JS tracer events. This information
 * can be quite expensive to compute. This expense is mitigated by some loading logic
 * that is implementing in the parent components defined below.
 */
class JsTracerExpensiveChartImpl extends React.PureComponent<Props> {
  /**
   * Determine the maximum zoom of the viewport.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const {
      timeRange: { start, end },
    } = this.props;
    return JS_TRACER_MAXIMUM_CHART_ZOOM / (end - start);
  }

  override render() {
    const {
      timeRange,
      threadsKey,
      jsTracerTable,
      jsTracerTimingRows,
      previewSelection,
      updatePreviewSelection,
      doFadeIn,
    } = this.props;

    // The viewport needs to know about the height of what it's drawing, calculate
    // that here at the top level component.
    const maxViewportHeight = jsTracerTimingRows.length * ROW_HEIGHT;

    return (
      <JsTracerCanvas
        key={threadsKey}
        viewportProps={{
          timeRange,
          previewSelection,
          maxViewportHeight,
          viewportNeedsUpdate,
          maximumZoom: this.getMaximumZoom(),
          marginLeft: TIMELINE_MARGIN_LEFT,
          marginRight: TIMELINE_MARGIN_RIGHT,
        }}
        chartProps={{
          jsTracerTimingRows,
          jsTracerTable,
          updatePreviewSelection,
          rangeStart: timeRange.start,
          rangeEnd: timeRange.end,
          rowHeight: ROW_HEIGHT,
          threadsKey,
          doFadeIn,
        }}
      />
    );
  }
}

// This function is given the JsTracerCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { readonly jsTracerTimingRows: JsTracerTiming[] },
  newProps: { readonly jsTracerTimingRows: JsTracerTiming[] }
) {
  return prevProps.jsTracerTimingRows !== newProps.jsTracerTimingRows;
}

/**
 * This connect function is very expensive to run the first time.
 */
const JsTracerExpensiveChart = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => ({
    timeRange: getCommittedRange(state),
    stringTable: getStringTable(state),
    threadsKey: getSelectedThreadsKey(state),
    previewSelection: getPreviewSelection(state),
    jsTracerTimingRows: ensureExists(
      ownProps.showJsTracerSummary
        ? selectedThreadSelectors.getExpensiveJsTracerLeafTiming(state)
        : selectedThreadSelectors.getExpensiveJsTracerTiming(state),
      'The JS tracer information must exist when mounting this component'
    ),
  }),
  mapDispatchToProps: { updatePreviewSelection },
  component: JsTracerExpensiveChartImpl,
});

type ChartLoaderProps = {
  readonly profile: Profile;
  readonly jsTracerTable: JsTracerTable;
  readonly showJsTracerSummary: boolean;
  readonly keyString: string;
};

type ChartLoaderState = {
  readyToRenderExpensiveChart: boolean;
};

// Keep track of all the React keys seen for a component. If everything is correctly
// memoized, then it should only be slow and expensive to compute the timing information
// the first time. After that we don't need to use a loader/fading in strategy.
//
// These sets are valid per profile, so WeakMap them on the profile.
const _seenChartKeysPerProfile: WeakMap<Profile, Set<string>> = new WeakMap();

/**
 * This component displays a helpful loading screen for the first time a selector is
 * run. It relies on having a property `key` property on the component. This way
 * initialization and invalidation is all handled through the component lifecycles.
 */
class JsTracerChartLoader extends React.PureComponent<
  ChartLoaderProps,
  ChartLoaderState
> {
  override state = {
    // The loader needs to be mounted before rendering the chart, as it has expensive
    // selectors.
    readyToRenderExpensiveChart: false,
  };
  // When loading the JS Tracer information multiple times, the expensive selectors
  // will have already run. There is no need to fade the component in.
  _doFadeIn: boolean = false;

  constructor(props: ChartLoaderProps) {
    super(props);
    // Look up the seenChartKeys per-profile. If not found, create a new Set.
    let seenChartKeys = _seenChartKeysPerProfile.get(props.profile);
    if (seenChartKeys === undefined) {
      seenChartKeys = new Set<string>();
      _seenChartKeysPerProfile.set(props.profile, seenChartKeys);
    }

    if (!seenChartKeys.has(props.keyString)) {
      // Only fade in the component on the first render. After the first time,
      // everything should be correctly memoized, and not need another re-render.
      this._doFadeIn = true;
      seenChartKeys.add(props.keyString);
    }
  }

  override componentDidMount() {
    if (this._doFadeIn) {
      // Let the screen render at least once, then start computing the expensive chart.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.setState({ readyToRenderExpensiveChart: true });
        });
      });
    }
  }

  override render() {
    const { jsTracerTable, showJsTracerSummary } = this.props;
    return this.state.readyToRenderExpensiveChart || !this._doFadeIn ? (
      <JsTracerExpensiveChart
        doFadeIn={this._doFadeIn}
        jsTracerTable={jsTracerTable}
        showJsTracerSummary={showJsTracerSummary}
      />
    ) : (
      <div className="jsTracerLoader">
        Re-constructing tracing information from{' '}
        {this.props.jsTracerTable.events.length.toLocaleString()} events. This
        might take a moment.
      </div>
    );
  }
}

type ChartProps = {
  readonly profile: Profile;
  readonly jsTracerTable: JsTracerTable;
  readonly showJsTracerSummary: boolean;
  readonly threadsKey: ThreadsKey;
};

/**
 * This component enforces that the JsTracerChartLoader has a correct key in order
 * to signal React to unmount the previous JsTracerChartLoader component, and create
 * a new one. This ensures that the loading message is correctly displayed for new
 * JS tracer data. The initial computation of the timing information is quite expensive,
 * so it's nice to show a friendly message in the UI to the end user first.
 *
 * For more information on the life cycle of keyed components see:
 * See: https://reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html#recommendation-fully-uncontrolled-component-with-a-key
 */
export class JsTracerChart extends React.PureComponent<ChartProps> {
  override render() {
    const { profile, jsTracerTable, showJsTracerSummary, threadsKey } =
      this.props;
    const key = `${threadsKey}-${showJsTracerSummary ? 'true' : 'false'}`;
    return (
      <JsTracerChartLoader
        key={key}
        keyString={key}
        jsTracerTable={jsTracerTable}
        showJsTracerSummary={showJsTracerSummary}
        profile={profile}
      />
    );
  }
}
