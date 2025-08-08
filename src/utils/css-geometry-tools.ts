/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Return a float number for the number of CSS pixels from the computed style
 * of the supplied CSS property on the supplied element.
 */
function getFloatStyle(element: HTMLElement, cssProperty: string): number {
  // flow doesn't know about getComputedStyle.
  const getComputedStyle = window.getComputedStyle;
  return (
    parseFloat(getComputedStyle(element).getPropertyValue(cssProperty)) || 0
  );
}

function subtractBorder(element: HTMLElement, rect: DOMRect): DOMRect {
  const borderTop = getFloatStyle(element, 'border-top-width');
  const borderRight = getFloatStyle(element, 'border-right-width');
  const borderBottom = getFloatStyle(element, 'border-bottom-width');
  const borderLeft = getFloatStyle(element, 'border-left-width');

  return new DOMRect(
    rect.left + borderLeft,
    rect.top + borderTop,
    rect.width - borderLeft - borderRight,
    rect.height - borderTop - borderBottom
  );
}

function subtractPadding(element: HTMLElement, rect: DOMRect): DOMRect {
  const paddingTop = getFloatStyle(element, 'padding-top');
  const paddingRight = getFloatStyle(element, 'padding-right');
  const paddingBottom = getFloatStyle(element, 'padding-bottom');
  const paddingLeft = getFloatStyle(element, 'padding-left');
  return new DOMRect(
    rect.left + paddingLeft,
    rect.top + paddingTop,
    rect.width - paddingLeft - paddingRight,
    rect.height - paddingTop - paddingBottom
  );
}

function addMargin(element: HTMLElement, rect: DOMRect): DOMRect {
  const marginTop = getFloatStyle(element, 'margin-top');
  const marginRight = getFloatStyle(element, 'margin-right');
  const marginBottom = getFloatStyle(element, 'margin-bottom');
  const marginLeft = getFloatStyle(element, 'margin-left');
  return new DOMRect(
    rect.left - marginLeft,
    rect.top - marginTop,
    rect.width + marginLeft + marginRight,
    rect.height + marginTop + marginBottom
  );
}

/**
 * Returns a DOMRect for the content rect of the element, in float CSS pixels.
 * Returns an empty rect if the object has zero or more than one client rects.
 */
export function getContentRect(element: HTMLElement): DOMRect {
  const clientRects = element.getClientRects();
  if (clientRects.length !== 1) {
    return new DOMRect(0, 0, 0, 0);
  }

  const borderRect = clientRects[0];
  return subtractPadding(
    element,
    subtractBorder(element, clientRectToDomRect(borderRect))
  );
}

function clientRectToDomRect(clientRect: DOMRectReadOnly): DOMRect {
  return new DOMRect(
    clientRect.left,
    clientRect.top,
    clientRect.width,
    clientRect.height
  );
}

/**
 * Returns a DOMRect for the margin rect of the element, in float CSS pixels.
 * Returns an empty rect if the object has zero or more than one client rects.
 */
export function getMarginRect(element: HTMLElement): DOMRect {
  const clientRects = element.getClientRects();
  if (clientRects.length !== 1) {
    return new DOMRect(0, 0, 0, 0);
  }

  return addMargin(element, clientRectToDomRect(clientRects[0]));
}

/**
 * When upgrading to Flow v0.96.0, it started including a DOMRect implementation.
 * This nominal class doesn't like accessing an object via indexer properties, so
 * encapsulate this access in a function.
 */
export function extractDomRectValue(
  rect: DOMRect,
  key: 'top' | 'left' | 'right' | 'bottom'
): number {
  return rect[key];
}
