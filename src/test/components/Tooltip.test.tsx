/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import {
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';

import { ensureExists } from '../../utils/types';

import {
  Tooltip,
  MOUSE_OFFSET,
  VISUAL_MARGIN,
} from '../../components/tooltip/Tooltip';

describe('shared/Tooltip', () => {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  it('is rendered appropriately', () => {
    const { getTooltip } = setup({
      box: { width: 500, height: 200 },
      mouse: { x: 0, y: 0 },
    });

    expect(getTooltip()).toMatchSnapshot();
  });

  describe('positioning', () => {
    it('is rendered at the right and bottom of the cursor if there is some space', () => {
      // The jsdom window size is 1024x768.
      let mouseX = 0;
      let mouseY = 0;
      const tooltipWidth = 300;
      const tooltipHeight = 200;
      const { rerender, getTooltipStyle } = setup({
        box: { width: tooltipWidth, height: tooltipHeight },
        mouse: { x: mouseX, y: mouseY },
      });

      expect(getTooltipStyle()).toEqual({
        left: `${MOUSE_OFFSET}px`,
        top: `${MOUSE_OFFSET}px`,
      });

      mouseX = 50;
      mouseY = 70;
      rerender({ mouse: { x: mouseX, y: mouseY } });

      expect(getTooltipStyle()).toEqual({
        left: `${mouseX + MOUSE_OFFSET}px`,
        top: `${mouseY + MOUSE_OFFSET}px`,
      });

      // Moving the mouse to a location where the space is available both
      // below/right and above/left will still render the tooltip below/right.
      mouseX = 510;
      mouseY = 310;
      rerender({ mouse: { x: mouseX, y: mouseY } });
      expect(getTooltipStyle()).toEqual({
        left: `${mouseX + MOUSE_OFFSET}px`,
        top: `${mouseY + MOUSE_OFFSET}px`,
      });

      // But moving the mouse to a location where the space right/below isn't
      // available will move the tooltip left/above.
      mouseX = 800;
      mouseY = 700;
      rerender({ mouse: { x: mouseX, y: mouseY } });
      expect(getTooltipStyle()).toEqual({
        left: `${mouseX - MOUSE_OFFSET - tooltipWidth}px`,
        top: `${mouseY - MOUSE_OFFSET - tooltipHeight}px`,
      });
    });

    it('is rendered at the left and top of the cursor if the space is missing at the right and below', () => {
      // The jsdom window size is 1024x768.
      let mouseX = 800;
      let mouseY = 700;
      const tooltipWidth = 300;
      const tooltipHeight = 200;
      const { getTooltipStyle, rerender } = setup({
        box: { width: tooltipWidth, height: tooltipHeight },
        mouse: { x: mouseX, y: mouseY },
      });

      const expectedLeft = () => mouseX - MOUSE_OFFSET - tooltipWidth;
      const expectedTop = () => mouseY - MOUSE_OFFSET - tooltipHeight;
      expect(getTooltipStyle()).toEqual({
        left: `${expectedLeft()}px`,
        top: `${expectedTop()}px`,
      });

      // Moving the mouse to a location where the space is available both
      // below/right and above/left will still render the tooltip above/left.
      mouseX = 510;
      mouseY = 310;
      rerender({ mouse: { x: mouseX, y: mouseY } });
      expect(getTooltipStyle()).toEqual({
        left: `${expectedLeft()}px`,
        top: `${expectedTop()}px`,
      });

      // But moving the mouse to a location where the space left/above isn't
      // available will move the tooltip right/below.
      mouseX = 50;
      mouseY = 30;
      rerender({ mouse: { x: mouseX, y: mouseY } });
      expect(getTooltipStyle()).toEqual({
        left: `${mouseX + MOUSE_OFFSET}px`,
        top: `${mouseY + MOUSE_OFFSET}px`,
      });
    });

    it('is rendered at the left and top of the window if the space is missing elsewhere', () => {
      // The jsdom window size is 1024x768.
      let mouseX = 500;
      let mouseY = 300;
      let tooltipWidth = 700;
      const tooltipHeight = 500;
      const { getTooltipStyle, rerender } = setup({
        box: { width: tooltipWidth, height: tooltipHeight },
        mouse: { x: mouseX, y: mouseY },
      });

      let expectedLeft = VISUAL_MARGIN;
      const expectedTop = VISUAL_MARGIN;
      expect(getTooltipStyle()).toEqual({
        left: `${expectedLeft}px`,
        top: `${expectedTop}px`,
      });

      // We change the size of the box and move the mouse slightly to trigger a render.
      tooltipWidth = 300;
      mouseX = 510;
      mouseY = 310;
      rerender({
        box: { width: tooltipWidth, height: tooltipHeight },
        mouse: { x: mouseX, y: mouseY },
      });

      expectedLeft = mouseX - MOUSE_OFFSET - tooltipWidth;
      expect(getTooltipStyle()).toEqual({
        left: `${expectedLeft}px`,
        top: `${expectedTop}px`,
      });
    });
  });
});

type Size = { width: number; height: number };
type Position = { x: number; y: number };
type Setup = {
  box: Size;
  mouse: Position;
};
type SetupWithMaybeBox = {
  box?: Size;
  mouse: Position;
};

function setup({ box, mouse }: Setup) {
  // Note we don't mock the window size and rely on the default in JSDom that is
  // 1024x768. It wouldn't be so easy to mock, because given it's a simple value
  // in `window` we can't use Jest's `spyOn` on it and rely on Jest's easy mock
  // restore.
  jest
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockImplementation(() => box.width);
  jest
    .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
    .mockImplementation(() => box.height);

  const { rerender } = render(
    <Tooltip mouseX={mouse.x} mouseY={mouse.y}>
      <p>Lorem ipsum</p>
    </Tooltip>
  );

  function getTooltip() {
    return ensureExists(
      document.querySelector('.tooltip'),
      `Couldn't find the tooltip element, with selector .tooltip`
    ) as HTMLElement;
  }

  function getTooltipStyle(): Record<string, string> {
    const tooltip = getTooltip();
    const style = tooltip.style;
    const result: Record<string, string> = {};
    for (let i = 0; i < style.length; i++) {
      const prop = style.item(i);
      const value = style.getPropertyValue(prop);
      result[prop] = value;
    }
    return result;
  }

  return {
    rerender: ({ mouse, box: newBox }: SetupWithMaybeBox) => {
      if (newBox) {
        box.width = newBox.width;
        box.height = newBox.height;
      }

      rerender(
        <Tooltip mouseX={mouse.x} mouseY={mouse.y}>
          <p>Lorem ipsum</p>
        </Tooltip>
      );
    },
    getTooltip,
    getTooltipStyle,
  };
}
