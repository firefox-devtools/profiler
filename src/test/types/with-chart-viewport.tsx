/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

import * as React from 'react';
import {
  withChartViewport,
  type Viewport,
} from 'firefox-profiler/components/shared/chart/Viewport';

/**
 * This file tests the withChartViewport higher order component, and makes sure
 * that it correctly catches mismatches of props with the type system.
 */

type OwnProps = {
  readonly ownPropA: 'a';
  readonly ownPropB: 'b';
};

type Props = OwnProps & {
  readonly viewport: Viewport;
};

function expectType<T>(_a: T) {}
function markUsed<T>(_a: T) {}

class ExampleChart extends React.PureComponent<Props> {
  override render() {
    expectType<'a'>(this.props.ownPropA);
    expectType<'b'>(this.props.ownPropB);
    // @ts-expect-error - There is no "ownPropC"
    expectType<any>(this.props.ownPropC);
    expectType<Viewport>(this.props.viewport);
    expectType<number>(this.props.viewport.containerWidth);
    expectType<boolean>(this.props.viewport.isDragging);

    return null;
  }
}

const ExampleChartWithViewport = withChartViewport<OwnProps>(ExampleChart);

const viewportProps = {
  timeRange: { start: 0, end: 10 },
  previewSelection: null,
  marginLeft: 0,
  marginRight: 0,
  maxViewportHeight: 100,
  maximumZoom: 0.1,
  viewportNeedsUpdate: (prevProps: OwnProps, nextProps: OwnProps) =>
    prevProps !== nextProps,
};

// This is the correct use.
const example1 = (
  <ExampleChartWithViewport
    chartProps={{ ownPropA: 'a', ownPropB: 'b' }}
    viewportProps={viewportProps}
  />
);
markUsed(example1);

// @ts-expect-error - The chartProps are missing.
const example2 = <ExampleChartWithViewport viewportProps={viewportProps} />;
markUsed(example2);

const example3 = (
  // @ts-expect-error - The viewportProps are missing.
  <ExampleChartWithViewport chartProps={{ ownPropA: 'a', ownPropB: 'b' }} />
);
markUsed(example3);

// The chart props must not be passed directly to the outer component.
const example4 = (
  <ExampleChartWithViewport
    chartProps={{ ownPropA: 'a', ownPropB: 'b' }}
    viewportProps={viewportProps}
    // @ts-expect-error - There is no "ownPropA" on the outer component.
    ownPropA="a"
  />
);
markUsed(example4);

const example5 = (
  <ExampleChartWithViewport
    // @ts-expect-error - ownPropB was not passed in.
    chartProps={{ ownPropA: 'a' }}
    viewportProps={viewportProps}
  />
);
markUsed(example5);

const example6 = (
  <ExampleChartWithViewport
    chartProps={{
      ownPropA: 'a',
      ownPropB: 'b',
      // @ts-expect-error - There is no "ownPropC"
      ownPropC: 'c',
    }}
    viewportProps={viewportProps}
  />
);
markUsed(example6);

const example7 = (
  <ExampleChartWithViewport
    chartProps={{
      // @ts-expect-error - ownPropA has the wrong type.
      ownPropA: 'b',
      ownPropB: 'b',
    }}
    viewportProps={viewportProps}
  />
);
markUsed(example7);

// The viewport is computed by the HOC, it can't be passed in the chart props.
const example8 = (
  <ExampleChartWithViewport
    chartProps={{
      ownPropA: 'a',
      ownPropB: 'b',
      // @ts-expect-error - There is no "viewport" in the chart props.
      viewport: {},
    }}
    viewportProps={viewportProps}
  />
);
markUsed(example8);

const example9 = (
  <ExampleChartWithViewport
    chartProps={{ ownPropA: 'a', ownPropB: 'b' }}
    viewportProps={{
      ...viewportProps,
      // @ts-expect-error - viewportNeedsUpdate must receive the chart props.
      viewportNeedsUpdate: (
        _prevProps: { other: number },
        _nextProps: { other: number }
      ) => true,
    }}
  />
);
markUsed(example9);

function ChartRequiringOwnPropC(
  _props: OwnProps & { readonly ownPropC: 'c'; readonly viewport: Viewport }
) {
  return null;
}

// @ts-expect-error - The chart requires a prop that isn't in the chart props.
const exampleMissingProp = withChartViewport<OwnProps>(ChartRequiringOwnPropC);
markUsed(exampleMissingProp);
