/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fetchAssembly } from 'firefox-profiler/utils/fetch-assembly';
import { ensureExists } from '../../utils/types';
import type { NativeSymbolInfo, Lib } from 'firefox-profiler/types';

describe('fetchAssembly', function () {
  const nativeSymbolInfo: NativeSymbolInfo = {
    name: 'nsBoxFrame::DidReflow(nsPresContext*, mozilla::ReflowInput const*)',
    address: 0x2b2540,
    functionSize: 0x3c,
    functionSizeIsKnown: true,
    libIndex: 0,
  };
  const lib: Lib = {
    arch: 'x86_64',
    name: 'xul.dll',
    path: '/Users/mstange/Downloads/xul.dll',
    debugName: 'xul.pdb',
    debugPath: 'xul.pdb',
    breakpadId: 'F0530E7AD96BB6ED4C4C44205044422E1',
    codeId: '6132B96B70fd000',
  };
  const exampleResponse = JSON.stringify({
    startAddress: '0x2b2540',
    size: '0x3c',
    arch: 'x86_64',
    syntax: ['Intel', 'C style'],
    instructions: [
      [0, 'push rsi', 'push(rsi)'],
      [1, 'push rdi', 'push(rdi)'],
      [2, 'push rbx', 'push(rbx)'],
      [3, 'sub rsp, 0x20', 'rsp -= 0x20'],
      [7, 'mov rsi, rcx', 'rsi = rcx'],
      [10, 'mov rdi, qword [rcx + 0x58]', 'rdi = [rcx + 0x58]'],
      [14, 'mov ebx, edi', 'ebx = edi'],
      [16, 'and ebx, 0x1400', 'ebx &= 0x1400'],
      [22, 'call 0x16c5d35', '0x16c5d35 = call(0x16c5d35)'],
      [27, 'or qword [rsi + 0x58], rbx', '[rsi + 0x58] |= rbx'],
      [31, 'bt rdi, 0xa', 'bt'],
      [35, 'jb $+0x8', 'if /* unsigned */ below(rflags) then jmp $+0x8'],
      [37, 'add rsp, 0x20', 'rsp += 0x20'],
      [41, 'pop rbx', 'rbx = pop()'],
      [42, 'pop rdi', 'rdi = pop()'],
      [43, 'pop rsi', 'rsi = pop()'],
      [44, 'ret', 'ret()'],
      [45, 'mov rcx, rsi', 'rcx = rsi'],
      [48, 'add rsp, 0x20', 'rsp += 0x20'],
      [52, 'pop rbx', 'rbx = pop()'],
      [53, 'pop rdi', 'rdi = pop()'],
      [54, 'pop rsi', 'rsi = pop()'],
      [55, 'jmp $+0x16b3884', 'jmp $+0x16b3884'],
    ],
  });

  it('fetches from symbol server', async function () {
    let observedUrl = null;
    let observedPostData: string | null = null;
    expect(
      await fetchAssembly(nativeSymbolInfo, lib, 'http://127.0.0.1:8000/api', {
        fetchUrlResponse: async (url: string, postData?: string) => {
          observedUrl = url;
          observedPostData = postData ?? null;
          const r = new Response(exampleResponse, {
            status: 200,
          });
          return r;
        },
        queryBrowserSymbolicationApi: async (
          _path: string,
          _requestJson: string
        ) => {
          throw new Error('No browser connection');
        },
      })
    ).toEqual({
      type: 'SUCCESS',
      instructions: [
        { address: 0x2b2540 + 0, decodedString: 'push rsi' },
        { address: 0x2b2540 + 1, decodedString: 'push rdi' },
        { address: 0x2b2540 + 2, decodedString: 'push rbx' },
        { address: 0x2b2540 + 3, decodedString: 'sub rsp, 0x20' },
        { address: 0x2b2540 + 7, decodedString: 'mov rsi, rcx' },
        {
          address: 0x2b2540 + 10,
          decodedString: 'mov rdi, qword [rcx + 0x58]',
        },
        { address: 0x2b2540 + 14, decodedString: 'mov ebx, edi' },
        { address: 0x2b2540 + 16, decodedString: 'and ebx, 0x1400' },
        { address: 0x2b2540 + 22, decodedString: 'call 0x16c5d35' },
        { address: 0x2b2540 + 27, decodedString: 'or qword [rsi + 0x58], rbx' },
        { address: 0x2b2540 + 31, decodedString: 'bt rdi, 0xa' },
        { address: 0x2b2540 + 35, decodedString: 'jb $+0x8' },
        { address: 0x2b2540 + 37, decodedString: 'add rsp, 0x20' },
        { address: 0x2b2540 + 41, decodedString: 'pop rbx' },
        { address: 0x2b2540 + 42, decodedString: 'pop rdi' },
        { address: 0x2b2540 + 43, decodedString: 'pop rsi' },
        { address: 0x2b2540 + 44, decodedString: 'ret' },
        { address: 0x2b2540 + 45, decodedString: 'mov rcx, rsi' },
        { address: 0x2b2540 + 48, decodedString: 'add rsp, 0x20' },
        { address: 0x2b2540 + 52, decodedString: 'pop rbx' },
        { address: 0x2b2540 + 53, decodedString: 'pop rdi' },
        { address: 0x2b2540 + 54, decodedString: 'pop rsi' },
        { address: 0x2b2540 + 55, decodedString: 'jmp $+0x16b3884' },
      ],
    });
    expect(observedUrl).toBe('http://127.0.0.1:8000/api/asm/v1');
    expect(observedPostData).not.toBeNull();
    expect(JSON.parse(ensureExists<string>(observedPostData))).toEqual({
      debugName: 'xul.pdb',
      debugId: 'F0530E7AD96BB6ED4C4C44205044422E1',
      name: 'xul.dll',
      codeId: '6132B96B70fd000',
      startAddress: '0x2b2540',
      size: '0x3c',
      continueUntilFunctionEnd: false,
    });
  });

  it('sets the continueUntilFunctionEnd flag in the request JSON if the function size is not known', async function () {
    let observedPostData = null;
    const nativeSymbolWithUnknownFunctionSize = {
      ...nativeSymbolInfo,
      functionSizeIsKnown: false,
    };
    expect(
      (
        await fetchAssembly(
          nativeSymbolWithUnknownFunctionSize,
          lib,
          'http://127.0.0.1:8000/api',
          {
            fetchUrlResponse: async (_url: string, postData?: string) => {
              observedPostData = postData;
              const r = new Response(exampleResponse, {
                status: 200,
              });
              return r;
            },
            queryBrowserSymbolicationApi: async (
              _path: string,
              _requestJson: string
            ) => {
              throw new Error('No browser connection');
            },
          }
        )
      ).type
    ).toEqual('SUCCESS');
    expect(
      JSON.parse(ensureExists<string>(observedPostData))
        .continueUntilFunctionEnd
    ).toBeTrue();
  });

  it('fetches assembly from the browser', async function () {
    expect(
      (
        await fetchAssembly(
          nativeSymbolInfo,
          lib,
          'http://127.0.0.1:8000/api',
          {
            fetchUrlResponse: async (_url: string, _postData?: string) => {
              throw new Error('Some network error');
            },
            queryBrowserSymbolicationApi: async (
              path: string,
              _requestJson: string
            ) => {
              if (path !== '/asm/v1') {
                throw new Error(`Unrecognized API path ${path}`);
              }
              return exampleResponse;
            },
          }
        )
      ).type
    ).toEqual('SUCCESS');
  });

  it('propagates all errors', async function () {
    expect(
      await fetchAssembly(nativeSymbolInfo, lib, 'http://127.0.0.1:8000/api', {
        fetchUrlResponse: async (_url: string, _postData?: string) => {
          throw new Error('Some network error');
        },
        queryBrowserSymbolicationApi: async (
          _path: string,
          _requestJson: string
        ) => {
          throw new Error('No browser connection');
        },
      })
    ).toEqual({
      type: 'ERROR',
      errors: [
        {
          type: 'BROWSER_CONNECTION_ERROR',
          browserConnectionErrorMessage: 'Error: No browser connection',
        },
        {
          type: 'NETWORK_ERROR',
          networkErrorMessage: 'Error: Some network error',
          url: 'http://127.0.0.1:8000/api/asm/v1',
        },
      ],
    });
  });

  it('does not query non-local symbol servers', async function () {
    let observedUrl = null;
    expect(
      (
        await fetchAssembly(
          nativeSymbolInfo,
          lib,
          'https://symbolication.services.mozilla.com',
          {
            fetchUrlResponse: async (url: string, _postData?: string) => {
              observedUrl = url;
              throw new Error(
                'Should not have queried this API on the official symbol server because it does not support it yet'
              );
            },
            queryBrowserSymbolicationApi: async (
              _path: string,
              _requestJson: string
            ) => {
              return exampleResponse;
            },
          }
        )
      ).type
    ).toEqual('SUCCESS');
    expect(observedUrl).toBeNull();
  });
});
