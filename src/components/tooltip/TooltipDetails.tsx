/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

/*
 * This component enforces the HTML structure we use in the marker tooltips.
 * This is made necessary by our use of a grid layout that needs this strict
 * structure.
 *
 * It's used like this:
 *
 * <TooltipDetails>
 *   <TooltipDetail label="Property">Value of property</TooltipDetail>
 * </TooltipDetails>
 *
 * <TooltipDetail> won't render a line if the passed child is null, undefined,
 * or the empty string. This is to make it easier to pass random properties from
 * markers.
 *
 * <TooltipDetail> accepts also a non-native type as a child, like an HTML
 * element or even a react element. Even if that's theoretically possible with
 * the typing using fragments, it should never render more than 1 child.
 */

type DetailProps = {
  readonly label: string;
  // Only one child is accepted.
  readonly children?: React.ReactNode;
};

export function TooltipDetail({ label, children }: DetailProps) {
  if (children === null || children === undefined || children === '') {
    return null;
  }

  return (
    <React.Fragment>
      <div className="tooltipLabel">{label}:</div>
      {children}
    </React.Fragment>
  );
}

export function TooltipDetailSeparator() {
  return <div className="tooltipDetailSeparator"></div>;
}

export type TooltipDetailComponent = React.ReactElement<
  typeof TooltipDetail | typeof TooltipDetailSeparator
> | null;
type Props = {
  // This component accepts only TooltipDetail children.
  readonly children: React.ReactNode;
};

export function TooltipDetails({ children }: Props) {
  return <div className="tooltipDetails">{children}</div>;
}
