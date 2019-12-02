/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { TooltipDetails, TooltipDetail } from './TooltipDetails';
import { formatMilliseconds } from '../../utils/format-numbers';
import './React.css';

function formatComponentStack(componentStack) {
  const lines = componentStack.split('\n').map(line => line.trim());
  lines.shift();
  return lines.join('\n');
}

// TODO This is an ugly hack.
function getComponentNameFromStack(componentStack) {
  if (componentStack) {
    // Find the top component in the stack; this is the one that performed the action.
    let index = componentStack.indexOf('in ');
    if (index > 0) {
      let displayName = componentStack.slice(
        index + 3,
        componentStack.indexOf('\n', index)
      );

      // Remove any (FB specific) appended module name.
      index = displayName.indexOf(' (created by');
      if (index > 0) {
        displayName = displayName.slice(0, index);
      }

      // Remove HOC badges.
      // General technique copied from DevTools
      if (displayName.indexOf('(') >= 0) {
        const matches = displayName.match(/[^()]+/g);
        if (matches !== null) {
          return matches.pop();
        }
      }

      return displayName;
    }
  }
  return null;
}

export function TooltipReactEvent({ data, priority }) {
  const { componentStack, type } = data;

  let className = null;
  let label = null;
  switch (type) {
    case 'schedule-render':
      label = '⚛️ render scheduled';
      break;
    case 'schedule-state-update':
      className = 'componentNameStateUpdate';
      label = 'state update scheduled';
      break;
    case 'suspend':
      className = 'componentNameSuspended';
      label = 'suspended';
      break;
    default:
      break;
  }

  const componentName = getComponentNameFromStack(componentStack);

  return (
    <div className="tooltipMarker">
      <div className="tooltipHeader">
        <div className="tooltipOneLine">
          {componentName && (
            <div className={className}>{componentName}&nbsp;</div>
          )}
          <div className="tooltipTitle">{label}</div>
        </div>
      </div>
      <TooltipDetails>
        <TooltipDetail label="Priority">{priority}</TooltipDetail>
        {componentStack && (
          <TooltipDetail label="Component stack">
            <pre className="componentStack">
              {formatComponentStack(componentStack)}
            </pre>
          </TooltipDetail>
        )}
      </TooltipDetails>
    </div>
  );
}

export function TooltipReactWork({ data, priority }) {
  const { duration, type } = data;

  let label = null;
  switch (type) {
    case 'commit-work':
      label = '⚛️ commit';
      break;
    case 'render-idle':
      label = '⚛️ idle';
      break;
    case 'render-work':
      label = '⚛️ render';
      break;
    default:
      break;
  }

  return (
    <div className="tooltipMarker">
      <div className="tooltipHeader">
        <div className="tooltipOneLine">
          <div className="tooltipTiming">{formatMilliseconds(duration)}</div>
          <div className="tooltipTitle">{label}</div>
        </div>
      </div>
      <TooltipDetails>
        <TooltipDetail label="Priority">{priority}</TooltipDetail>
      </TooltipDetails>
    </div>
  );
}
