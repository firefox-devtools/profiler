/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';
import {
  getProfileOrNull,
  getAssemblyViewCode,
  getBrowserConnection,
  getAssemblyViewNativeSymbol,
  getSymbolServerUrl,
  getAssemblyViewIsOpen,
} from 'firefox-profiler/selectors';
import {
  beginLoadingAssemblyCodeFromUrl,
  beginLoadingAssemblyCodeFromBrowserConnection,
  finishLoadingAssemblyCode,
  failLoadingAssemblyCode,
} from 'firefox-profiler/actions/code';
import { fetchAssembly } from 'firefox-profiler/utils/fetch-assembly';
import { RegularExternalCommunicationDelegate } from 'firefox-profiler/utils/query-api';
import type { BrowserConnection } from 'firefox-profiler/app-logic/browser-connection';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  AssemblyCodeStatus,
  Profile,
  NativeSymbolInfo,
} from 'firefox-profiler/types';

type StateProps = {
  readonly assemblyViewNativeSymbol: NativeSymbolInfo | null;
  readonly assemblyViewCode: AssemblyCodeStatus | void;
  readonly assemblyViewIsOpen: boolean;
  readonly symbolServerUrl: string;
  readonly profile: Profile | null;
  readonly browserConnection: BrowserConnection | null;
};

type DispatchProps = {
  readonly beginLoadingAssemblyCodeFromUrl: typeof beginLoadingAssemblyCodeFromUrl;
  readonly beginLoadingAssemblyCodeFromBrowserConnection: typeof beginLoadingAssemblyCodeFromBrowserConnection;
  readonly finishLoadingAssemblyCode: typeof finishLoadingAssemblyCode;
  readonly failLoadingAssemblyCode: typeof failLoadingAssemblyCode;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class AssemblyCodeFetcherImpl extends React.PureComponent<Props> {
  override componentDidMount() {
    this._triggerAssemblyLoadingIfNeeded();
  }

  override componentDidUpdate() {
    this._triggerAssemblyLoadingIfNeeded();
  }

  _triggerAssemblyLoadingIfNeeded() {
    const { assemblyViewIsOpen, assemblyViewNativeSymbol, assemblyViewCode } =
      this.props;
    if (assemblyViewIsOpen && assemblyViewNativeSymbol && !assemblyViewCode) {
      this._fetchAssemblyForNativeSymbol(assemblyViewNativeSymbol);
    }
  }

  async _fetchAssemblyForNativeSymbol(nativeSymbol: NativeSymbolInfo) {
    const {
      beginLoadingAssemblyCodeFromUrl,
      beginLoadingAssemblyCodeFromBrowserConnection,
      finishLoadingAssemblyCode,
      failLoadingAssemblyCode,
      symbolServerUrl,
      profile,
      browserConnection,
    } = this.props;

    if (profile === null) {
      return;
    }

    const lib = profile.libs[nativeSymbol.libIndex];
    const { debugName, breakpadId } = lib;
    const hexAddress = nativeSymbol.address.toString(16);
    const nativeSymbolKey = `${debugName}/${breakpadId}/${hexAddress}`;

    const delegate = new RegularExternalCommunicationDelegate(
      browserConnection,
      {
        onBeginUrlRequest: (url: string) => {
          beginLoadingAssemblyCodeFromUrl(nativeSymbolKey, url);
        },
        onBeginBrowserConnectionQuery: () => {
          beginLoadingAssemblyCodeFromBrowserConnection(nativeSymbolKey);
        },
      }
    );

    const fetchAssemblyResult = await fetchAssembly(
      nativeSymbol,
      lib,
      symbolServerUrl,
      delegate
    );

    switch (fetchAssemblyResult.type) {
      case 'SUCCESS':
        finishLoadingAssemblyCode(
          nativeSymbolKey,
          fetchAssemblyResult.instructions
        );
        break;
      case 'ERROR':
        failLoadingAssemblyCode(nativeSymbolKey, fetchAssemblyResult.errors);
        break;
      default:
        throw assertExhaustiveCheck(fetchAssemblyResult);
    }
  }

  override render() {
    return null;
  }
}

export const AssemblyCodeFetcher = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    assemblyViewNativeSymbol: getAssemblyViewNativeSymbol(state),
    assemblyViewCode: getAssemblyViewCode(state),
    assemblyViewIsOpen: getAssemblyViewIsOpen(state),
    symbolServerUrl: getSymbolServerUrl(state),
    profile: getProfileOrNull(state),
    browserConnection: getBrowserConnection(state),
  }),
  mapDispatchToProps: {
    beginLoadingAssemblyCodeFromUrl,
    beginLoadingAssemblyCodeFromBrowserConnection,
    finishLoadingAssemblyCode,
    failLoadingAssemblyCode,
  },
  component: AssemblyCodeFetcherImpl,
});
