/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Return a float number for the number of CSS pixels from the computed style
 * of the supplied CSS property on the supplied element.
 * @param  {object} elem        The DOM element whose computed style to check.
 * @param  {string} cssProperty The property whose value to check.
 * @param  {object} win         The window object used for getComputedStyle
 * @return {number}             A float number containing the number of pixels.
 */
function getFloatStyle(elem, cssProperty, win) {
  return parseFloat(win.getComputedStyle(elem, null).getPropertyValue(cssProperty)) || 0;
}

const DOMRect = window.DOMRect || function (x = 0, y = 0, w = 0, h = 0) {
  this.x = x;
  this.y = y;
  this.width = w;
  this.height = h;
  this.left = x;
  this.top = y;
  this.right = x + w;
  this.bottom = y + h;
};

function subtractBorder(elem, rect, win) {
  const borderTop = getFloatStyle(elem, 'border-top-width', win);
  const borderRight = getFloatStyle(elem, 'border-right-width', win);
  const borderBottom = getFloatStyle(elem, 'border-bottom-width', win);
  const borderLeft = getFloatStyle(elem, 'border-left-width', win);
  return new DOMRect(rect.left + borderLeft,
                     rect.top + borderTop,
                     rect.width - borderLeft - borderRight,
                     rect.height - borderTop - borderBottom);
}

function subtractPadding(elem, rect, win) {
  const paddingTop = getFloatStyle(elem, 'padding-top', win);
  const paddingRight = getFloatStyle(elem, 'padding-right', win);
  const paddingBottom = getFloatStyle(elem, 'padding-bottom', win);
  const paddingLeft = getFloatStyle(elem, 'padding-left', win);
  return new DOMRect(rect.left + paddingLeft,
                     rect.top + paddingTop,
                     rect.width - paddingLeft - paddingRight,
                     rect.height - paddingTop - paddingBottom);
}

function addMargin(elem, rect, win) {
  const marginTop = getFloatStyle(elem, 'margin-top', win);
  const marginRight = getFloatStyle(elem, 'margin-right', win);
  const marginBottom = getFloatStyle(elem, 'margin-bottom', win);
  const marginLeft = getFloatStyle(elem, 'margin-left', win);
  return new DOMRect(rect.left - marginLeft,
                     rect.top - marginTop,
                     rect.width + marginLeft + marginRight,
                     rect.height + marginTop + marginBottom);
}

/**
 * Returns a DOMRect for the content rect of the element, in float CSS pixels.
 * Returns an empty rect if the object has zero or more than one client rects.
 * @param  {object} elem The DOM element whose content rect to compute.
 * @return {object}      The element's content rect.
 */
export function getContentRect(elem) {
  const clientRects = elem.getClientRects();
  if (clientRects.length !== 1) {
    return new DOMRect();
  }

  const borderRect = clientRects[0];
  const win = elem.ownerDocument.defaultView;
  return subtractPadding(elem, subtractBorder(elem, borderRect, win), win);
}

/**
 * Returns a DOMRect for the margin rect of the element, in float CSS pixels.
 * Returns an empty rect if the object has zero or more than one client rects.
 * @param  {object} elem The DOM element whose margin rect to compute.
 * @return {object}      The element's margin rect.
 */
export function getMarginRect(elem) {
  const clientRects = elem.getClientRects();
  if (clientRects.length !== 1) {
    return new DOMRect();
  }

  const borderRect = clientRects[0];
  const win = elem.ownerDocument.defaultView;
  return addMargin(elem, borderRect, win);
}
