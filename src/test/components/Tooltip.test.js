/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { render, cleanup } from 'react-testing-library';

import {
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';

import { ensureExists } from '../../utils/flow';

import Tooltip, { MOUSE_OFFSET } from '../../components/shared/Tooltip';

describe('shared/Tooltip', () => {
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);
  afterEach(cleanup);

  it('is rendered appropriately', () => {
    const { getTooltip } = setup({
      box: { width: 500, height: 200 },
      mouse: { x: 0, y: 0 },
    });

    expect(getTooltip()).toMatchSnapshot();
  });

  describe('positioning', () => {
    it('is rendered at the default location if there is some space', () => {
      const { rerender, getTooltipStyle } = setup({
        box: { width: 500, height: 200 },
        mouse: { x: 0, y: 0 },
      });

      expect(getTooltipStyle()).toEqual({
        left: `${MOUSE_OFFSET}px`,
        top: `${MOUSE_OFFSET}px`,
      });

      const mouseX = 50;
      const mouseY = 70;
      rerender({ x: mouseX, y: mouseY });

      expect(getTooltipStyle()).toEqual({
        left: `${mouseX + MOUSE_OFFSET}px`,
        top: `${mouseY + MOUSE_OFFSET}px`,
      });
    });

    it('is rendered at the left and top of the cursor if the space is missing at the right and below', () => {
      const mouseX = 600;
      const mouseY = 500;
      const tooltipWidth = 500;
      const tooltipHeight = 300;
      const { getTooltipStyle } = setup({
        box: { width: tooltipWidth, height: tooltipHeight },
        mouse: { x: mouseX, y: mouseY },
      });

      const expectedLeft = mouseX - MOUSE_OFFSET - tooltipWidth;
      const expectedTop = mouseY - MOUSE_OFFSET - tooltipHeight;
      expect(getTooltipStyle()).toEqual({
        left: `${expectedLeft}px`,
        top: `${expectedTop}px`,
      });
    });

    it('is rendered at the left and top of the window if the space is missing elsewhere', () => {
      const { getTooltipStyle } = setup({
        box: { width: 700, height: 500 },
        mouse: { x: 500, y: 300 },
      });

      const expectedLeft = 0;
      const expectedTop = 0;
      expect(getTooltipStyle()).toEqual({
        left: `${expectedLeft}px`,
        top: `${expectedTop}px`,
      });
    });
  });
});

type Size = {| width: number, height: number |};
type Position = {| x: number, y: number |};
type Setup = {|
  box: Size,
  mouse: Position,
|};

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
    return ensureExists(document.querySelector('.tooltip'));
  }

  function getTooltipStyle() {
    const tooltip = getTooltip();
    const style = tooltip.style;
    const result = {};
    for (let i = 0; i < style.length; i++) {
      const prop = style.item(i);
      const value = style.getPropertyValue(prop);
      result[prop] = value;
    }
    return result;
  }

  return {
    rerender: (mouse: Position) => {
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
