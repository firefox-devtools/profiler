/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  render,
  fireEvent,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import {
  changeNetworkSearchString,
  commitRange,
  updatePreviewSelection,
} from '../../actions/profile-view';
import { NetworkChart } from '../../components/network-chart';
import { MaybeMarkerContextMenu } from '../../components/shared/MarkerContextMenu';
import { changeSelectedTab } from '../../actions/app';
import { ensureExists } from '../../utils/types';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getScrollToSelectionGeneration } from 'firefox-profiler/selectors/profile';

import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileWithMarkers,
  getNetworkMarkers,
  type TestDefinedMarker,
} from '../fixtures/profiles/processed-profile';
import {
  addRootOverlayElement,
  removeRootOverlayElement,
  getMouseEvent,
  fireFullClick,
  fireFullContextMenu,
} from '../fixtures/utils';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import type { Profile } from 'firefox-profiler/types';

const NETWORK_MARKERS = (function () {
  const arrayOfNetworkMarkers: TestDefinedMarker[][] = Array(10)
    .fill(undefined)
    .map((_, i) =>
      getNetworkMarkers({
        uri: 'https://mozilla.org/',
        id: i,
        startTime: 3 + 0.1 * i,
      })
    );
  return ([] as TestDefinedMarker[]).concat(...arrayOfNetworkMarkers);
})();

function setupWithProfile(profile: Profile) {
  const flushRafCalls = mockRaf();

  const store = storeWithProfile(profile);
  store.dispatch(changeSelectedTab('network-chart'));

  const renderResult = render(
    <Provider store={store}>
      <>
        <MaybeMarkerContextMenu />
        <NetworkChart />
      </>
    </Provider>
  );

  flushRafCalls();

  const { container } = renderResult;

  function getUrlShorteningParts(): Array<[string, string]> {
    return Array.from(
      container.querySelectorAll('.networkChartRowItemLabel span')
    ).map((node) => [node.className, node.textContent!]);
  }

  const getBarElements = () =>
    Array.from(
      container.querySelectorAll('.networkChartRowItemBar')
    ) as HTMLElement[];

  const getBarElementStyles = () =>
    getBarElements().map((element) => element.getAttribute('style'));

  const getPhaseElements = () =>
    Array.from(container.querySelectorAll('.networkChartRowItemBarPhase'));

  const getPhaseElementStyles = () =>
    getPhaseElements().map((element) => element.getAttribute('style'));

  function rowItem() {
    return ensureExists(
      container.querySelector('.networkChartRowItem'),
      `Couldn't find the row item in the network chart, with selector .networkChartRowItem`
    ) as HTMLElement;
  }

  const getContextMenu = () =>
    ensureExists(
      container.querySelector('.react-contextmenu'),
      `Couldn't find the context menu.`
    );

  return {
    ...renderResult,
    ...store,
    flushRafCalls,
    getUrlShorteningParts,
    getBarElements,
    getBarElementStyles,
    getPhaseElements,
    getPhaseElementStyles,
    rowItem,
    getContextMenu,
  };
}

function setupWithPayload(markers: TestDefinedMarker[]) {
  const profile = getProfileWithMarkers(markers);
  return setupWithProfile(profile);
}

autoMockElementSize({
  width: 200 + TIMELINE_MARGIN_RIGHT + TIMELINE_MARGIN_LEFT,
  height: 300,
});

describe('NetworkChart', function () {
  it('renders NetworkChart correctly', () => {
    const { container } = setupWithPayload([...NETWORK_MARKERS]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('displays a context menu when right clicking', () => {
    // Context menus trigger asynchronous operations for some behaviors, so we
    // use fake timers to avoid bad interactions between tests.
    jest.useFakeTimers();

    const markers = [
      ...getNetworkMarkers({
        uri: 'https://mozilla.org/1',
        id: 1,
        startTime: 10,
        endTime: 60,
      }),
      ...getNetworkMarkers({
        uri: 'https://mozilla.org/2',
        id: 2,
        startTime: 20,
        endTime: 70,
      }),
    ];
    const { getByText, getContextMenu } = setupWithPayload(markers);
    fireFullContextMenu(getByText('/1'));

    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

    fireFullClick(getByText('Copy URL'));
    expect(copy).toHaveBeenLastCalledWith('https://mozilla.org/1');
    expect(getContextMenu()).not.toHaveClass('react-contextmenu--visible');

    act(() => jest.runAllTimers());
    expect(document.querySelector('react-contextmenu')).toBeFalsy();
  });
});

describe('NetworkChartRowBar phase calculations', function () {
  it('divides up the different phases of the request with full set of required information', () => {
    const { getPhaseElementStyles, getBarElementStyles } = setupWithPayload(
      getNetworkMarkers({
        uri: 'https://mozilla.org/img/',
        id: 100,
        startTime: 10,
        // With an endTime at 109, the profile's end time is 110, and so the
        // profile's length is 100, which gives integer values for test results.
        endTime: 109,
        payload: {
          pri: 20,
          count: 10,
          domainLookupStart: 20,
          domainLookupEnd: 24,
          connectStart: 25,
          tcpConnectEnd: 26,
          secureConnectionStart: 26,
          connectEnd: 28,
          requestStart: 30,
          responseStart: 60,
          responseEnd: 80,
        },
      })
    );

    // Width is nearly the available width (200px). It's expected that it's not
    // the full width because the range ends 1ms after the marker.
    expect(getBarElementStyles()[0]).toEqual(
      `width: 198px; left: ${TIMELINE_MARGIN_LEFT}px;`
    );
    // The sum of widths should equal the width above.
    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 20px; opacity: 0;',
      'left: 20px; width: 20px; opacity: 0.3333333333333333;',
      'left: 40px; width: 60px; opacity: 0.6666666666666666;',
      'left: 100px; width: 40px; opacity: 1;',
      'left: 140px; width: 58px; opacity: 0;',
    ]);
  });

  it('displays properly a network marker even when it crosses the boundary', () => {
    const { dispatch, getPhaseElementStyles, getBarElementStyles } =
      setupWithPayload(
        getNetworkMarkers({
          uri: 'https://mozilla.org/img/',
          id: 100,
          startTime: 10,
          // With an endTime at 109, the profile's end time is 110, and so the
          // profile's length is 100, which gives integer values for test results.
          endTime: 109,
          payload: {
            pri: 20,
            count: 10,
            domainLookupStart: 20,
            domainLookupEnd: 24,
            connectStart: 25,
            tcpConnectEnd: 26,
            secureConnectionStart: 26,
            connectEnd: 28,
            requestStart: 30,
            responseStart: 60,
            responseEnd: 80,
          },
        })
      );

    // Note: "10" here means "20" in the profile, because this is the delta
    // since the start of the profile (aka zeroAt), and not an absolute value.
    act(() => {
      dispatch(commitRange(10, 50));
    });

    // The width is bigger than the mocked available width (which is 200px) but
    // this is expected.
    // It's also expected that the left value is less than TIMELINE_MARGIN_LEFT,
    // because the range start is after the start of the marker.
    expect(getBarElementStyles()[0]).toEqual('width: 495px; left: 100px;');

    // It's expected that all elements are rendered, but some of them will be
    // drawn out of the window obviously.
    // The sum of widths should equal the width above.
    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 50px; opacity: 0;',
      'left: 50px; width: 50px; opacity: 0.3333333333333333;',
      'left: 100px; width: 150px; opacity: 0.6666666666666666;',
      // The actual value has a float rounding error, using a regexp accounts for this.
      expect.stringMatching(/^left: 250\.\d*?px; width: 100px; opacity: 1;$/),
      'left: 350px; width: 145px; opacity: 0;',
    ]);
  });

  it('renders according to the preview selection', () => {
    const { dispatch, getBarElements } = setupWithPayload([
      ...getNetworkMarkers({
        uri: 'https://mozilla.org/img/',
        id: 100,
        startTime: 10,
        endTime: 55,
      }),
      ...getNetworkMarkers({
        uri: 'https://mozilla.org/img/',
        id: 100,
        startTime: 50,
        endTime: 109,
      }),
    ]);

    // With this preview selection, we expect that the first marker will still
    // be in sight, but that the second marker will be out of the view.
    // Still, because it's a preview selection, the second marker will have a
    // dedicated line.
    act(() => {
      dispatch(
        updatePreviewSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: 20,
          selectionEnd: 40,
        })
      );
    });

    const [firstMarker, secondMarker] = getBarElements();

    // We expect that the first marker will be displayed.
    const firstMarkerWidth = parseInt(firstMarker.style.width);
    const firstMarkerLeft = parseInt(firstMarker.style.left);
    // The start is before the end of the range.
    expect(firstMarkerLeft).toBeLessThanOrEqual(TIMELINE_MARGIN_LEFT + 200);
    // The end is after the start of the range.
    expect(firstMarkerLeft + firstMarkerWidth).toBeGreaterThanOrEqual(
      TIMELINE_MARGIN_LEFT
    );

    // We expect that the second marker will have a line but is drawn out of the view.
    expect(secondMarker).toBeTruthy();

    const secondMarkerLeft = parseInt(secondMarker.style.left);
    expect(secondMarkerLeft).toBeGreaterThan(TIMELINE_MARGIN_LEFT + 200);
  });

  it('divides up the different phases of the request with subset of required information', () => {
    const { getPhaseElementStyles } = setupWithPayload(
      getNetworkMarkers({
        uri: 'https://mozilla.org/img/',
        id: 100,
        startTime: 10,
        // With an endTime at 109, the profile's end time is 110, and so the
        // profile's length is 100, which gives integer values for test results.
        endTime: 109,
        payload: {
          pri: 20,
          count: 10,
          requestStart: 20,
          responseStart: 60,
          responseEnd: 80,
        },
      })
    );

    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 20px; opacity: 0;',
      'left: 20px; width: 80px; opacity: 0.6666666666666666;',
      'left: 100px; width: 40px; opacity: 1;',
      'left: 140px; width: 58px; opacity: 0;',
    ]);
  });

  it('takes the full width when there is no details in the payload', () => {
    const { getPhaseElementStyles } = setupWithPayload(
      getNetworkMarkers({
        uri: 'https://mozilla.org/img/',
        id: 100,
        startTime: 10,
        // With an endTime at 109, the profile's end time is 110, and so the
        // profile's length is 100, which gives integer values for test results.
        endTime: 109,
      })
    );

    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 198px; opacity: 1;',
    ]);
  });

  it('divides the phases when only the start marker is present', () => {
    const markerForProfileRange: TestDefinedMarker = [
      'Some Marker',
      0,
      // With an endTime at 99, the profile's end time is 100 which gives
      // integer values for test results.
      99,
    ];

    // Create a start marker, but discard the end marker.
    const [startMarker] = getNetworkMarkers({
      uri: 'https://mozilla.org/img/',
      id: 100,
      startTime: 10,
      fetchStart: 20,
      endTime: 60,
    });

    const { getPhaseElementStyles } = setupWithPayload([
      markerForProfileRange,
      startMarker,
    ]);

    expect(getPhaseElementStyles()).toEqual([
      // The marker goes to the end of the profile range.
      'left: 0px; width: 180px; opacity: 1;',
    ]);
  });

  it('divides the phases when only the end marker is present', () => {
    // Get the end marker, but not the start.
    const [, endMarker] = getNetworkMarkers({
      uri: 'https://mozilla.org/img/',
      id: 100,
      startTime: 10,
      fetchStart: 15,
      // With an endTime at 109, the profile's end time is 110, and so the
      // profile's length is 100, which gives integer values for test results.
      endTime: 109,
      payload: {
        pri: 20,
        count: 10,
        domainLookupStart: 20,
        domainLookupEnd: 24,
        connectStart: 25,
        tcpConnectEnd: 26,
        secureConnectionStart: 26,
        connectEnd: 28,
        requestStart: 30,
        responseStart: 60,
        responseEnd: 80,
      },
    });

    // Force the start time to be 10.
    endMarker[1] = 10;

    const { getPhaseElementStyles } = setupWithPayload([endMarker]);

    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 20px; opacity: 0;',
      'left: 20px; width: 20px; opacity: 0.3333333333333333;',
      'left: 40px; width: 60px; opacity: 0.6666666666666666;',
      'left: 100px; width: 40px; opacity: 1;',
      'left: 140px; width: 58px; opacity: 0;',
    ]);
  });

  it('renders 2 bars for a network marker with a preconnect part', () => {
    const { getBarElementStyles } = setupWithPayload(
      getNetworkMarkers({
        startTime: 10010,
        fetchStart: 10011,
        // endTime is 99ms after startTime, so that the profile's end time is
        // 10110ms, which makes the length 100ms, and we get nice rounded values
        // as a result.
        endTime: 10109,
        id: 1235,
        uri: 'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          count: 47027,
          domainLookupStart: 500,
          domainLookupEnd: 510,
          connectStart: 511,
          tcpConnectEnd: 515,
          secureConnectionStart: 516,
          connectEnd: 520,
          requestStart: 10030,
          responseStart: 10060,
          responseEnd: 10080,
        },
      })
    );

    const barStyles = getBarElementStyles();
    expect(barStyles).toHaveLength(2);
    expect(barStyles).toEqual([
      'left: -18870px; width: 40px;',
      'width: 198px; left: 150px;',
    ]);
  });

  it('renders 2 bars for a network markers with a preconnect part containing only the domain lookup', () => {
    const { getBarElementStyles } = setupWithPayload(
      getNetworkMarkers({
        startTime: 10010,
        fetchStart: 10011,
        // endTime is 99ms after startTime, so that the profile's end time is
        // 10110ms, which makes the length 100ms, and we get nice rounded values
        // as a result.
        endTime: 10109,
        id: 1235,
        uri: 'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          count: 47027,
          domainLookupStart: 500,
          domainLookupEnd: 520,
          requestStart: 10030,
          responseStart: 10060,
          responseEnd: 10080,
        },
      })
    );

    const barStyles = getBarElementStyles();
    expect(barStyles).toHaveLength(2);
    expect(barStyles).toEqual([
      'left: -18870px; width: 40px;',
      'width: 198px; left: 150px;',
    ]);
  });
});

describe('NetworkChartRowBar URL split', function () {
  function setupForUrl(uri: string) {
    return setupWithPayload(getNetworkMarkers({ uri }));
  }

  it('splits up the url by protocol / domain / path / filename / params / hash', function () {
    const { getUrlShorteningParts } = setupForUrl(
      'https://test.mozilla.org:5000/img/optimized/test.gif?param1=123&param2=321#hashNode2'
    );
    expect(getUrlShorteningParts()).toEqual([
      // Then assert that it's broken up as expected
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'test.mozilla.org:5000'],
      ['networkChartRowItemUriOptional', '/img/optimized'],
      ['networkChartRowItemUriRequired', '/test.gif'],
      ['networkChartRowItemUriOptional', '?param1=123&param2=321'],
      ['networkChartRowItemUriOptional', '#hashNode2'],
    ]);
  });

  it('splits properly a url without a path', function () {
    const testUrl = 'https://mozilla.org/';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriRequired', '/'],
    ]);
  });

  it('splits properly a url without a directory', function () {
    const testUrl = 'https://mozilla.org/index.html';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriRequired', '/index.html'],
    ]);
  });

  it('splits properly a url without a filename', function () {
    const testUrl = 'https://mozilla.org/analytics/';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriRequired', '/analytics/'],
    ]);
  });

  it('splits properly a url without a filename and a long directory', function () {
    const testUrl = 'https://mozilla.org/assets/analytics/';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriOptional', '/assets'],
      ['networkChartRowItemUriRequired', '/analytics/'],
    ]);
  });

  it('splits properly a url with a short directory path', function () {
    const testUrl = 'https://mozilla.org/img/image.jpg';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriOptional', '/img'],
      ['networkChartRowItemUriRequired', '/image.jpg'],
    ]);
  });

  it('splits properly a url with a long directory path', function () {
    const testUrl = 'https://mozilla.org/assets/img/image.jpg';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriOptional', '/assets/img'],
      ['networkChartRowItemUriRequired', '/image.jpg'],
    ]);
  });

  it('returns null with an invalid url', function () {
    const { getUrlShorteningParts } = setupForUrl(
      'test.mozilla.org/img/optimized/'
    );
    expect(getUrlShorteningParts()).toEqual([]);
  });
});

describe('NetworkChartRowBar MIME-type filter', function () {
  /**
   * Setup network markers payload for URL, with content type removed.
   */
  function setupForUrl(uri: string) {
    return setupWithPayload(
      getNetworkMarkers({ uri, payload: { contentType: undefined } })
    );
  }

  it('searches for img MIME-Type', function () {
    const { rowItem } = setupForUrl(
      'https://test.mozilla.org/img/optimized/test.png'
    );
    expect(rowItem()).toHaveClass('network-color-img');
  });

  it('searches for html MIME-Type', function () {
    const { rowItem } = setupForUrl(
      'https://test.mozilla.org/img/optimized/test.html'
    );
    expect(rowItem()).toHaveClass('network-color-html');
  });

  it('searches for js MIME-Type', function () {
    const { rowItem } = setupForUrl('https://test.mozilla.org/scripts/test.js');
    expect(rowItem()).toHaveClass('network-color-js');
  });

  it('searches for css MIME-Type', function () {
    const { rowItem } = setupForUrl('https://test.mozilla.org/styles/test.css');
    expect(rowItem()).toHaveClass('network-color-css');
  });

  it('uses default when no filter applies', function () {
    const { rowItem } = setupForUrl('https://test.mozilla.org/file.xuul');
    expect(rowItem()).toHaveClass('network-color-other');
  });
});

describe('EmptyReasons', () => {
  it("shows a reason when a profile's network markers have been filtered out", () => {
    const { dispatch, container } = setupWithPayload([...NETWORK_MARKERS]);

    act(() => {
      dispatch(changeNetworkSearchString('MATCH_NOTHING'));
    });
    expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
  });
});

describe('Network Chart/tooltip behavior', () => {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  it('shows a tooltip when the mouse hovers the line', () => {
    const { rowItem, queryByTestId, getByTestId } =
      setupWithPayload(getNetworkMarkers());

    expect(queryByTestId('tooltip')).not.toBeInTheDocument();
    // React uses mouseover/mouseout events to implement mouseenter/mouseleave.
    // See https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/react-dom/src/events/EnterLeaveEventPlugin.js#L24-L31
    fireEvent(rowItem(), getMouseEvent('mouseover', { pageX: 25, pageY: 25 }));
    expect(getByTestId('tooltip')).toBeInTheDocument();
    fireEvent(rowItem(), getMouseEvent('mouseout', { pageX: 25, pageY: 25 }));
    expect(queryByTestId('tooltip')).not.toBeInTheDocument();
  });

  it('changes the redux store when the mouse hovers the line', () => {
    const { rowItem, getState } = setupWithPayload(getNetworkMarkers());

    // React uses mouseover/mouseout events to implement mouseenter/mouseleave.
    // See https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/react-dom/src/events/EnterLeaveEventPlugin.js#L24-L31
    fireEvent(rowItem(), getMouseEvent('mouseover', { pageX: 25, pageY: 25 }));
    expect(selectedThreadSelectors.getHoveredMarkerIndex(getState())).toBe(0);

    fireEvent(rowItem(), getMouseEvent('mouseout', { pageX: 25, pageY: 25 }));
    expect(selectedThreadSelectors.getHoveredMarkerIndex(getState())).toBe(
      null
    );
  });

  it('does not show tooltips when a context menu is displayed', () => {
    // Context menus trigger asynchronous operations for some behaviors, so we
    // use fake timers to avoid bad interactions between tests.
    jest.useFakeTimers();

    const { rowItem, queryByTestId, getByText, getContextMenu } =
      setupWithPayload(getNetworkMarkers());

    fireFullContextMenu(getByText('mozilla.org'));

    expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

    // React uses mouseover/mouseout events to implement mouseenter/mouseleave.
    // See https://github.com/facebook/react/blob/b87aabdfe1b7461e7331abb3601d9e6bb27544bc/packages/react-dom/src/events/EnterLeaveEventPlugin.js#L24-L31
    fireEvent(rowItem(), getMouseEvent('mouseover', { pageX: 25, pageY: 25 }));
    expect(queryByTestId('tooltip')).not.toBeInTheDocument();
  });
});

describe('calltree/ProfileCallTreeView navigation keys', () => {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  function setup(markers: TestDefinedMarker[]) {
    const { container, getState } = setupWithPayload(markers);

    const renderedRows = container.querySelectorAll('.networkChartRowItem');
    expect(renderedRows.length).toEqual(48);

    return {
      getState,
      // take either a key as a string, or a full event if we need more
      // information like modifier keys.
      simulateKey: (param: string | { key: string; metaKey?: boolean }) => {
        const treeViewBody = ensureExists(
          container.querySelector('div.treeViewBody'),
          `Couldn't find the tree view body with selector .networkChart`
        );
        fireEvent.keyDown(
          treeViewBody,
          typeof param === 'string' ? { key: param } : param
        );
      },
      selectedText: () =>
        ensureExists(
          container.querySelector('.isSelected'),
          `Couldn't find the selected row with selector .isSelected`
        ).textContent,
    };
  }

  it('selects row on left click', () => {
    const { rowItem, getState } = setupWithPayload(getNetworkMarkers());

    const initialScrollGeneration = getScrollToSelectionGeneration(getState());
    fireFullClick(rowItem());
    expect(rowItem()).toHaveClass('isSelected');

    // The scroll generation hasn't moved.
    expect(getScrollToSelectionGeneration(getState())).toEqual(
      initialScrollGeneration
    );
  });

  it('reacts properly to up/down navigation keys', () => {
    // This generates a profile where function "name<i + 1>" is present
    // <length - i> times, which means it will have a self time of <length - i>
    // ms. This is a good way to control the order we'll get in the call tree
    // view: function "name1" will be first, etc.
    const markers = (function () {
      const arrayOfNetworkMarkers = Array(48)
        .fill(undefined)
        .map((_, i) =>
          getNetworkMarkers({
            uri: `https://mozilla.org/${i + 1}`,
            id: i,
            startTime: 3 + 0.1 * i,
          })
        );
      return ([] as TestDefinedMarker[]).concat(...arrayOfNetworkMarkers);
    })();

    const { simulateKey, selectedText, getState } = setup(markers);

    const initialScrollGeneration = getScrollToSelectionGeneration(getState());

    simulateKey('ArrowDown');
    expect(selectedText()).toBe(`https://mozilla.org/1`);
    simulateKey('PageDown');
    expect(selectedText()).toBe(`https://mozilla.org/17`); // 15 rows below
    simulateKey('End');
    expect(selectedText()).toBe(`https://mozilla.org/48`);
    simulateKey('ArrowUp');
    expect(selectedText()).toBe(`https://mozilla.org/47`);
    simulateKey('PageUp');
    expect(selectedText()).toBe(`https://mozilla.org/31`); // 15 rows above
    simulateKey('Home');
    expect(selectedText()).toBe(`https://mozilla.org/1`);

    // These are MacOS shortcuts.
    simulateKey({ key: 'ArrowDown', metaKey: true });
    expect(selectedText()).toBe(`https://mozilla.org/48`);
    simulateKey({ key: 'ArrowUp', metaKey: true });
    expect(selectedText()).toBe(`https://mozilla.org/1`);

    // Now we expect that the scroll generation increased, because scroll should
    // be triggered with the keyboard navigation.
    expect(getScrollToSelectionGeneration(getState())).toBeGreaterThan(
      initialScrollGeneration
    );
  });

  it('changes the mouse time position when the mouse moves', function () {
    const { getState, container } = setupWithPayload(getNetworkMarkers());

    // Expect the mouseTimePosition to not be set at the beginning of the test.
    expect(getState().profileView.viewOptions.mouseTimePosition).toBeNull();

    const networkChart = ensureExists(
      container.querySelector('.networkChart'),
      'Could not find the network chart element'
    );

    // Move the mouse over the network chart, ensure mouseTimePosition is set.
    fireEvent.mouseMove(networkChart, {
      clientX: TIMELINE_MARGIN_LEFT + 100, // Position within the chart area
      clientY: 100,
    });
    const mouseTimePosition =
      getState().profileView.viewOptions.mouseTimePosition;
    expect(typeof mouseTimePosition).toEqual('number');

    // Move the mouse to a different position, ensure mouseTimePosition changed.
    fireEvent.mouseMove(networkChart, {
      clientX: TIMELINE_MARGIN_LEFT + 150, // Different position within chart area
      clientY: 100,
    });
    expect(getState().profileView.viewOptions.mouseTimePosition).not.toEqual(
      mouseTimePosition
    );

    // Move the mouse out of the network chart, ensure mouseTimePosition is no longer set.
    fireEvent.mouseLeave(networkChart);
    expect(getState().profileView.viewOptions.mouseTimePosition).toBeNull();
  });
});
