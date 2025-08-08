/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  parseFileNameFromSymbolication,
  getDownloadRecipeForSourceFile,
} from '../../utils/special-paths';

describe('parseFileNameFromSymbolication', function () {
  it('parses hg paths', function () {
    expect(
      parseFileNameFromSymbolication(
        'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28'
      )
    ).toEqual({
      type: 'hg',
      repo: 'hg.mozilla.org/mozilla-central',
      path: 'widget/cocoa/nsAppShell.mm',
      rev: '997f00815e6bc28806b75448c8829f0259d2cb28',
    });
  });

  it('parses git paths', function () {
    expect(
      parseFileNameFromSymbolication(
        'git:github.com/rust-lang/rust:library/std/src/sys/unix/thread.rs:53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b'
      )
    ).toEqual({
      type: 'git',
      repo: 'github.com/rust-lang/rust',
      path: 'library/std/src/sys/unix/thread.rs',
      rev: '53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b',
    });
    expect(
      parseFileNameFromSymbolication(
        'git:chromium.googlesource.com/chromium/src:content/gpu/gpu_main.cc:4dac2548d4812df2aa4a90ac1fc8912363f4d59c'
      )
    ).toEqual({
      type: 'git',
      repo: 'chromium.googlesource.com/chromium/src',
      path: 'content/gpu/gpu_main.cc',
      rev: '4dac2548d4812df2aa4a90ac1fc8912363f4d59c',
    });
    expect(
      parseFileNameFromSymbolication(
        'git:pdfium.googlesource.com/pdfium:core/fdrm/fx_crypt.cpp:dab1161c861cc239e48a17e1a5d729aa12785a53'
      )
    ).toEqual({
      type: 'git',
      repo: 'pdfium.googlesource.com/pdfium',
      path: 'core/fdrm/fx_crypt.cpp',
      rev: 'dab1161c861cc239e48a17e1a5d729aa12785a53',
    });
    expect(
      parseFileNameFromSymbolication(
        'git:github.com/torvalds/linux:arch/x86/mm/fault.c:v5.15'
      )
    ).toEqual({
      type: 'git',
      repo: 'github.com/torvalds/linux',
      path: 'arch/x86/mm/fault.c',
      rev: 'v5.15',
    });
  });

  it('parses s3 paths', function () {
    expect(
      parseFileNameFromSymbolication(
        's3:gecko-generated-sources:a5d3747707d6877b0e5cb0a364e3cb9fea8aa4feb6ead138952c2ba46d41045297286385f0e0470146f49403e46bd266e654dfca986de48c230f3a71c2aafed4/ipc/ipdl/PBackgroundChild.cpp:'
      )
    ).toEqual({
      type: 's3',
      bucket: 'gecko-generated-sources',
      path: 'ipc/ipdl/PBackgroundChild.cpp',
      digest:
        'a5d3747707d6877b0e5cb0a364e3cb9fea8aa4feb6ead138952c2ba46d41045297286385f0e0470146f49403e46bd266e654dfca986de48c230f3a71c2aafed4',
    });
    expect(
      parseFileNameFromSymbolication(
        's3:gecko-generated-sources:4fd754dd7ca7565035aaa3357b8cd99959a2dddceba0fc2f7018ef99fd78ea63d03f9bf928afdc29873089ee15431956791130b97f66ab8fcb88ec75f4ba6b04/aarch64-apple-darwin/release/build/swgl-580c7d646d09cf59/out/ps_text_run_ALPHA_PASS_TEXTURE_2D.h:'
      )
    ).toEqual({
      type: 's3',
      bucket: 'gecko-generated-sources',
      path: 'aarch64-apple-darwin/release/build/swgl-580c7d646d09cf59/out/ps_text_run_ALPHA_PASS_TEXTURE_2D.h',
      digest:
        '4fd754dd7ca7565035aaa3357b8cd99959a2dddceba0fc2f7018ef99fd78ea63d03f9bf928afdc29873089ee15431956791130b97f66ab8fcb88ec75f4ba6b04',
    });
  });

  it('parses cargo paths', function () {
    expect(
      parseFileNameFromSymbolication(
        'cargo:github.com-1ecc6299db9ec823:addr2line-0.16.0:src/function.rs'
      )
    ).toEqual({
      type: 'cargo',
      registry: 'github.com-1ecc6299db9ec823',
      crate: 'addr2line',
      version: '0.16.0',
      path: 'addr2line-0.16.0/src/function.rs',
    });
    expect(
      parseFileNameFromSymbolication(
        'cargo:github.com-1ecc6299db9ec823:tokio-1.6.1:src/runtime/task/mod.rs'
      )
    ).toEqual({
      type: 'cargo',
      registry: 'github.com-1ecc6299db9ec823',
      crate: 'tokio',
      version: '1.6.1',
      path: 'tokio-1.6.1/src/runtime/task/mod.rs',
    });
  });

  it('returns absolute file paths unchanged', function () {
    expect(
      parseFileNameFromSymbolication(
        '/Users/mstange/code/profiler-get-symbols/examples/query_api/src/main.rs'
      )
    ).toEqual({
      type: 'normal',
      path: '/Users/mstange/code/profiler-get-symbols/examples/query_api/src/main.rs',
    });
    expect(
      parseFileNameFromSymbolication(
        '/builds/worker/workspace/obj-build/ipc/ipdl/PVsyncChild.cpp'
      )
    ).toEqual({
      type: 'normal',
      path: '/builds/worker/workspace/obj-build/ipc/ipdl/PVsyncChild.cpp',
    });
    expect(
      parseFileNameFromSymbolication(
        'C:\\b\\s\\w\\ir\\cache\\builder\\src\\out\\Release_x64\\gen\\services\\viz\\public\\mojom\\compositing\\compositor_frame_sink.mojom.cc'
      )
    ).toEqual({
      type: 'normal',
      path: 'C:\\b\\s\\w\\ir\\cache\\builder\\src\\out\\Release_x64\\gen\\services\\viz\\public\\mojom\\compositing\\compositor_frame_sink.mojom.cc',
    });
  });

  it('returns URLs unchanged', function () {
    expect(
      parseFileNameFromSymbolication(
        'chrome://global/content/elements/tabbox.js'
      )
    ).toEqual({
      type: 'normal',
      path: 'chrome://global/content/elements/tabbox.js',
    });
    expect(
      parseFileNameFromSymbolication(
        'resource://activity-stream/vendor/react-dom.js'
      )
    ).toEqual({
      type: 'normal',
      path: 'resource://activity-stream/vendor/react-dom.js',
    });
    expect(
      parseFileNameFromSymbolication(
        'https://github.githubassets.com/assets/chunk-vendor-a44ba20b.js'
      )
    ).toEqual({
      type: 'normal',
      path: 'https://github.githubassets.com/assets/chunk-vendor-a44ba20b.js',
    });
  });
});

describe('getDownloadRecipeForSourceFile', function () {
  function getUrl(path: string) {
    return getDownloadRecipeForSourceFile(parseFileNameFromSymbolication(path));
  }

  it('finds the correct URLs for hg paths', function () {
    expect(
      getUrl(
        'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28'
      )
    ).toEqual({
      type: 'CORS_ENABLED_SINGLE_FILE',
      url: 'https://hg.mozilla.org/mozilla-central/raw-file/997f00815e6bc28806b75448c8829f0259d2cb28/widget/cocoa/nsAppShell.mm',
    });
  });

  it('finds the correct URLs for git paths', function () {
    expect(
      getUrl(
        'git:github.com/rust-lang/rust:library/std/src/sys/unix/thread.rs:53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b'
      )
    ).toEqual({
      type: 'CORS_ENABLED_SINGLE_FILE',
      url: 'https://raw.githubusercontent.com/rust-lang/rust/53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b/library/std/src/sys/unix/thread.rs',
    });
    expect(
      getUrl(
        'git:chromium.googlesource.com/chromium/src:content/gpu/gpu_main.cc:4dac2548d4812df2aa4a90ac1fc8912363f4d59c'
      )
    ).toEqual({
      type: 'CORS_ENABLED_SINGLE_FILE',
      url: 'https://googlesource-proxy.mstange.workers.dev/chromium/chromium/src.git/+/4dac2548d4812df2aa4a90ac1fc8912363f4d59c/content/gpu/gpu_main.cc',
    });
    expect(
      getUrl(
        'git:pdfium.googlesource.com/pdfium:core/fdrm/fx_crypt.cpp:dab1161c861cc239e48a17e1a5d729aa12785a53'
      )
    ).toEqual({
      type: 'CORS_ENABLED_SINGLE_FILE',
      url: 'https://googlesource-proxy.mstange.workers.dev/pdfium/pdfium.git/+/dab1161c861cc239e48a17e1a5d729aa12785a53/core/fdrm/fx_crypt.cpp',
    });
  });

  it('finds the correct URLs for s3 paths', function () {
    expect(
      getUrl(
        's3:gecko-generated-sources:a5d3747707d6877b0e5cb0a364e3cb9fea8aa4feb6ead138952c2ba46d41045297286385f0e0470146f49403e46bd266e654dfca986de48c230f3a71c2aafed4/ipc/ipdl/PBackgroundChild.cpp:'
      )
    ).toEqual({
      type: 'CORS_ENABLED_SINGLE_FILE',
      url: 'https://gecko-generated-sources.s3.amazonaws.com/a5d3747707d6877b0e5cb0a364e3cb9fea8aa4feb6ead138952c2ba46d41045297286385f0e0470146f49403e46bd266e654dfca986de48c230f3a71c2aafed4/ipc/ipdl/PBackgroundChild.cpp',
    });
    expect(
      getUrl(
        's3:gecko-generated-sources:4fd754dd7ca7565035aaa3357b8cd99959a2dddceba0fc2f7018ef99fd78ea63d03f9bf928afdc29873089ee15431956791130b97f66ab8fcb88ec75f4ba6b04/aarch64-apple-darwin/release/build/swgl-580c7d646d09cf59/out/ps_text_run_ALPHA_PASS_TEXTURE_2D.h:'
      )
    ).toEqual({
      type: 'CORS_ENABLED_SINGLE_FILE',
      url: 'https://gecko-generated-sources.s3.amazonaws.com/4fd754dd7ca7565035aaa3357b8cd99959a2dddceba0fc2f7018ef99fd78ea63d03f9bf928afdc29873089ee15431956791130b97f66ab8fcb88ec75f4ba6b04/aarch64-apple-darwin/release/build/swgl-580c7d646d09cf59/out/ps_text_run_ALPHA_PASS_TEXTURE_2D.h',
    });
  });

  it('finds the correct URLs for cargo paths', function () {
    expect(
      getUrl(
        'cargo:github.com-1ecc6299db9ec823:addr2line-0.16.0:src/function.rs'
      )
    ).toEqual({
      type: 'CORS_ENABLED_ARCHIVE',
      archiveUrl: 'https://crates.io/api/v1/crates/addr2line/0.16.0/download',
      pathInArchive: 'addr2line-0.16.0/src/function.rs',
    });
    expect(
      getUrl(
        'cargo:github.com-1ecc6299db9ec823:tokio-1.6.1:src/runtime/task/mod.rs'
      )
    ).toEqual({
      type: 'CORS_ENABLED_ARCHIVE',
      archiveUrl: 'https://crates.io/api/v1/crates/tokio/1.6.1/download',
      pathInArchive: 'tokio-1.6.1/src/runtime/task/mod.rs',
    });
  });

  it('finds no URL for absolute file paths', function () {
    expect(
      getUrl(
        '/Users/mstange/code/profiler-get-symbols/examples/query_api/src/main.rs'
      )
    ).toEqual({ type: 'NO_KNOWN_CORS_URL' });
    expect(
      getUrl('/builds/worker/workspace/obj-build/ipc/ipdl/PVsyncChild.cpp')
    ).toEqual({ type: 'NO_KNOWN_CORS_URL' });
    expect(
      getUrl(
        'C:\\b\\s\\w\\ir\\cache\\builder\\src\\out\\Release_x64\\gen\\services\\viz\\public\\mojom\\compositing\\compositor_frame_sink.mojom.cc'
      )
    ).toEqual({ type: 'NO_KNOWN_CORS_URL' });
  });

  it('finds no URL for URLs', function () {
    expect(getUrl('chrome://global/content/elements/tabbox.js')).toEqual({
      type: 'NO_KNOWN_CORS_URL',
    });
    expect(getUrl('resource://activity-stream/vendor/react-dom.js')).toEqual({
      type: 'NO_KNOWN_CORS_URL',
    });
    expect(
      getUrl('https://github.githubassets.com/assets/chunk-vendor-a44ba20b.js')
    ).toEqual({ type: 'NO_KNOWN_CORS_URL' });
  });
});
