/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Map a client command to the ephemeral view settings its permalink needs, so
 * that `<command> --permalink` links to what the command displayed rather than
 * to the bare session state.
 */

import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import type { ClientCommand, PermalinkView } from './protocol';

export function permalinkViewForCommand(command: ClientCommand): PermalinkView {
  switch (command.command) {
    case 'thread': {
      const view: PermalinkView = { threadHandle: command.thread };
      const subcommand = command.subcommand;
      switch (subcommand) {
        case 'samples':
        case 'samples-top-down':
        case 'samples-bottom-up':
        case 'functions':
          view.tab = 'calltree';
          view.callTreeSearch =
            command.search ?? command.functionFilters?.searchString;
          view.includeIdle = command.includeIdle;
          view.strategy = command.strategy;
          view.sampleFilters = command.sampleFilters;
          view.invertCallstack = subcommand === 'samples-bottom-up';
          break;
        case 'markers':
          view.tab = command.markerFilters?.list
            ? 'marker-table'
            : 'marker-chart';
          view.markerSearch = command.markerFilters?.searchString;
          break;
        case 'network':
          view.tab = 'network-chart';
          view.networkSearch = command.networkFilters?.searchString;
          break;
        case 'page-load':
          view.tab = 'marker-chart';
          break;
        case 'info':
        case 'list':
        case 'select':
          break;
        default:
          throw assertExhaustiveCheck(subcommand);
      }
      return view;
    }
    case 'profile':
      switch (command.subcommand) {
        case 'markers':
          return {
            threadHandle: command.markerFilters?.thread,
            tab: command.markerFilters?.list ? 'marker-table' : 'marker-chart',
            markerSearch: command.markerFilters?.searchString,
          };
        case 'info':
        case 'threads':
        case 'meta':
        case 'logs':
          return {};
        default:
          throw assertExhaustiveCheck(command);
      }
    case 'marker':
      return { tab: 'marker-chart', markerHandle: command.marker };
    case 'function':
      return { tab: 'calltree', strategy: command.strategy };
    case 'counter':
    case 'sample':
    case 'strategy':
    case 'zoom':
    case 'filter':
    case 'sourcemap':
    case 'status':
    case 'permalink':
      return {};
    default:
      throw assertExhaustiveCheck(command);
  }
}
