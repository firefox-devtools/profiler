/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @ts-nocheck We just need enough here to pass tests.

type Size = {
  readonly width: number;
  readonly height: number;
  // offsetX and offsetY will define values for left/right/x/y/top/bottom,
  // taking into account width and height as well.
  readonly offsetX?: number;
  readonly offsetY?: number;
};

// This function returns an object suitable to be returned from
// getBoundingClientRect. Generally you don't need to call it directly, but
// rather use autoMockElementSize and setMockedElementSize.
export function getBoundingBox({ width, height, offsetX, offsetY }: Size) {
  offsetX = offsetX || 0;
  offsetY = offsetY || 0;

  return {
    width,
    height,
    left: offsetX,
    right: offsetX + width,
    x: offsetX,
    y: offsetY,
    top: offsetY,
    bottom: offsetY + height,
  };
}

// Call this function inside a `describe` block to automatically define
// getBoundingClientRect, offsetWidth and offsetHeight to fixed values.
export function autoMockElementSize(sizeInformation: Size) {
  beforeEach(() => {
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(sizeInformation));
    jest
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(() => sizeInformation.width);
    jest
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(() => sizeInformation.height);
  });
}

// Use this function to change the auto mocked size from autoMockElementSize.
export function setMockedElementSize(sizeInformation: Size) {
  HTMLElement.prototype.getBoundingClientRect.mockImplementation(() =>
    getBoundingBox(sizeInformation)
  );

  const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetWidth'
  );
  if (offsetWidthDescriptor && offsetWidthDescriptor.get) {
    offsetWidthDescriptor.get.mockImplementation(() => sizeInformation.width);
  }

  const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight'
  );
  if (offsetHeightDescriptor && offsetHeightDescriptor.get) {
    offsetHeightDescriptor.get.mockImplementation(() => sizeInformation.height);
  }
}

// Use this function to get a very fake HTMLElement with some sizing methods and
// properties.
export function getElementWithFixedSize(sizeInformation: Size): HTMLElement {
  const mockEl = {
    getBoundingClientRect: () => getBoundingBox(sizeInformation),
    offsetWidth: sizeInformation.width,
    offsetHeight: sizeInformation.height,
  } as any;

  return mockEl;
}
