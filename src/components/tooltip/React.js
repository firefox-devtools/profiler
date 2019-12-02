/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import { formatMilliseconds } from '../../utils/format-numbers';
import './React.css';

function formatComponentStack(componentStack) {
  const lines = componentStack.split('\n').map(line => line.trim());
  lines.shift();

  if (lines.length > 5) {
    return lines.slice(0, 5).join('\n') + '\n...';
  }
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

export function TooltipReactEvent({ event }) {
  const { componentStack, type } = event;

  let className = null;
  let label = null;
  switch (type) {
    case 'schedule-render':
      label = 'Render scheduled';
      break;
    case 'schedule-state-update':
      className = 'componentNameStateUpdate';
      label = 'State update scheduled';
      break;
    case 'suspend':
      className = 'componentNameSuspended';
      label = 'Suspended';
      break;
    default:
      break;
  }

  const componentName = getComponentNameFromStack(componentStack);

  return (
    <div className="tooltipMarker">
      <div className={classNames({ tooltipHeader: componentStack })}>
        <div className="tooltipOneLine">
          {componentName && (
            <div className={className}>{componentName}&nbsp;</div>
          )}
          <div className="tooltipTitle">{label}</div>
        </div>
      </div>
      {componentStack && (
        <pre className="componentStack">
          {formatComponentStack(componentStack)}
        </pre>
      )}
    </div>
  );
}

export function TooltipReactWork({ work }) {
  const { duration, type } = work;

  let label = null;
  switch (type) {
    case 'commit-work':
      label = 'Commit';
      break;
    case 'render-idle':
      label = 'Idle';
      break;
    case 'render-work':
      label = 'Render';
      break;
    default:
      break;
  }

  return (
    <div className="tooltipMarker">
      <div className="tooltipOneLine">
        <div className="tooltipTiming">{formatMilliseconds(duration)}</div>
        <div className="tooltipTitle">{label}</div>
      </div>
    </div>
  );
}
