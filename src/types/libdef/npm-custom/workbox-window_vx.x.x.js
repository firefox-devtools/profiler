/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

declare module 'workbox-window' {
  declare type WorkboxLifecycleEvent = {
    isExternal: boolean,
    isUpdate: boolean,
    originalEvent: MessageEvent,
    sw: ServiceWorker,
    target: Workbox,
    type: string,
  };

  declare type WorkboxLifecycleWaitingEvent = {
    ...WorkboxLifecycleEvent,
    wasWaitingBeforeRegister: boolean,
  };

  declare type WorkboxMessageEvent = {
    data: any,
    isExternal: boolean,
    originalEvent: MessageEvent,
    ports: Array<MessagePort>,
    sw: ServiceWorker,
    target: Workbox,
    type: 'message',
  };

  declare export class Workbox {
    constructor(
      workerPath: string,
      registerOptions?: {
        scope?: string,
        type?: 'classic' | 'module',
        updateViaCache?: 'all' | 'imports' | 'none',
        ...
      }
    ): this;
    getSW(): Promise<ServiceWorker>;
    messageSW(data: {}): Promise<any>;
    messageSkipWaiting(): void;
    register(): void;
    update(): void;
    addEventListener(
      'message',
      callback: (event: WorkboxMessageEvent) => mixed
    ): void;
    addEventListener(
      'waiting',
      callback: (event: WorkboxLifecycleWaitingEvent) => mixed
    ): void;
    addEventListener(
      | 'activated'
      | 'activating'
      | 'controlling'
      | 'installed'
      | 'installing'
      | 'redundant',
      callback: (event: WorkboxLifecycleEvent) => mixed
    ): void;
  }

  declare function messageSW(sw: ServiceWorker, data: any): Promise<any>;
}
