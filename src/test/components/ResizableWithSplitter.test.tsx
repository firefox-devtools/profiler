/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent } from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { ResizableWithSplitter } from 'firefox-profiler/components/shared/ResizableWithSplitter';
import { getBoundingBox } from 'firefox-profiler/test/fixtures/mocks/element-size';

// JSDOM 26 doesn't implement PointerEvent or the pointer-capture methods.
// Polyfill the minimum needed for the ResizableWithSplitter behavior that
// this file is testing.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    (window as any).PointerEvent = PointerEventPolyfill;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.hasPointerCapture = () => false;
  }
});

// The drag math reads getBoundingClientRect on the outer (the splitter's
// parent) and on the outer's parent. Stub both based on a className check.
function mockOuterAndParentSizes({
  outerWidth = 0,
  outerHeight = 0,
  parentWidth = 0,
  parentHeight = 0,
}: {
  outerWidth?: number;
  outerHeight?: number;
  parentWidth?: number;
  parentHeight?: number;
}) {
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('resizableWithSplitterOuter')) {
        return getBoundingBox({ width: outerWidth, height: outerHeight });
      }
      return getBoundingBox({ width: parentWidth, height: parentHeight });
    });
}

function getOuterAndSplitter(container: HTMLElement) {
  const outer = container.firstElementChild as HTMLElement;
  const splitter = outer.querySelector('[role="separator"]') as HTMLElement;
  return { outer, splitter };
}

describe('shared/ResizableWithSplitter', () => {
  it('grows the width when dragged with splitterPosition="end"', () => {
    mockOuterAndParentSizes({ outerWidth: 200, parentWidth: 1000 });

    const { container } = render(
      <ResizableWithSplitter
        splitterPosition="end"
        controlledProperty="width"
        percent={false}
        initialSize="200px"
      >
        <div>contents</div>
      </ResizableWithSplitter>
    );
    const { outer, splitter } = getOuterAndSplitter(container);
    expect(outer).toHaveStyle({ width: '200px' });

    fireEvent.pointerDown(splitter, { clientX: 500, clientY: 0 });
    fireEvent.pointerMove(splitter, { clientX: 550, clientY: 0 });
    fireEvent.pointerUp(splitter, { clientX: 550, clientY: 0 });

    // delta = +50, splitterPosition='end' → outerDim + delta = 250
    expect(outer).toHaveStyle({ width: '250px' });
  });

  it('shrinks the width when dragged with splitterPosition="start"', () => {
    mockOuterAndParentSizes({ outerWidth: 200, parentWidth: 1000 });

    const { container } = render(
      <ResizableWithSplitter
        splitterPosition="start"
        controlledProperty="width"
        percent={false}
        initialSize="200px"
      >
        <div>contents</div>
      </ResizableWithSplitter>
    );
    const { outer, splitter } = getOuterAndSplitter(container);

    fireEvent.pointerDown(splitter, { clientX: 500, clientY: 0 });
    fireEvent.pointerMove(splitter, { clientX: 550, clientY: 0 });
    fireEvent.pointerUp(splitter, { clientX: 550, clientY: 0 });

    // delta = +50, splitterPosition='start' → outerDim - delta = 150
    expect(outer).toHaveStyle({ width: '150px' });
  });

  it('expresses the height as a percentage when percent=true', () => {
    mockOuterAndParentSizes({ outerHeight: 100, parentHeight: 500 });

    const { container } = render(
      <ResizableWithSplitter
        splitterPosition="start"
        controlledProperty="height"
        percent={true}
        initialSize="20%"
      >
        <div>contents</div>
      </ResizableWithSplitter>
    );
    const { outer, splitter } = getOuterAndSplitter(container);

    fireEvent.pointerDown(splitter, { clientX: 0, clientY: 300 });
    fireEvent.pointerMove(splitter, { clientX: 0, clientY: 250 });
    fireEvent.pointerUp(splitter, { clientX: 0, clientY: 250 });

    // delta = -50, splitterPosition='start' → outerDim - delta = 150;
    // 150 / 500 = 30.00% (JSDOM normalizes trailing zeros to "30%").
    expect(outer).toHaveStyle({ height: '30%' });
  });

  it('clamps the size at 0 when dragged past the edge', () => {
    mockOuterAndParentSizes({ outerWidth: 100, parentWidth: 1000 });

    const { container } = render(
      <ResizableWithSplitter
        splitterPosition="end"
        controlledProperty="width"
        percent={false}
        initialSize="100px"
      >
        <div>contents</div>
      </ResizableWithSplitter>
    );
    const { outer, splitter } = getOuterAndSplitter(container);

    fireEvent.pointerDown(splitter, { clientX: 500, clientY: 0 });
    // delta = -300, splitterPosition='end' → outerDim + delta = -200, clamped to 0.
    fireEvent.pointerMove(splitter, { clientX: 200, clientY: 0 });

    expect(outer).toHaveStyle({ width: '0px' });
  });
});
