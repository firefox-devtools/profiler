/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { insertStackLabels } from '../../profile-logic/insert-stack-labels';
import { callTreeFromProfile, formatTree } from '../fixtures/utils';

describe('insertStackLabels', function () {
  it('inserts a label before the first frame matching a label', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      B
      mozilla::layout::Reflow
      mozilla::layout::FrameReflow
    `);

    const labeled = insertStackLabels(profile, [
      { name: 'Layout', funcPrefixes: ['mozilla::layout::'] },
    ]);

    expect(formatTree(callTreeFromProfile(labeled))).toEqual([
      '- Unaccounted (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '    - B (total: 1, self: —)',
      '      - Layout (total: 1, self: —)',
      '        - mozilla::layout::Reflow (total: 1, self: —)',
      '          - mozilla::layout::FrameReflow (total: 1, self: 1)',
    ]);
  });

  it('does not repeat the label for consecutive frames in the same label', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      gfx::Composite
      gfx::LayerManager::Render
      gfx::DrawQuad
    `);

    const labeled = insertStackLabels(profile, [
      { name: 'Graphics', funcPrefixes: ['gfx::'] },
    ]);

    expect(formatTree(callTreeFromProfile(labeled))).toEqual([
      '- Unaccounted (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '    - Graphics (total: 1, self: —)',
      '      - gfx::Composite (total: 1, self: —)',
      '        - gfx::LayerManager::Render (total: 1, self: —)',
      '          - gfx::DrawQuad (total: 1, self: 1)',
    ]);
  });

  it('does not re-insert the label when re-entering a label after an unmatched frame', function () {
    // A non-JS, non-label frame (helper) propagates the inherited label context,
    // so gfx::DrawQuad is still considered inside the Graphics label and no new
    // label is inserted.
    const { profile } = getProfileFromTextSamples(`
      gfx::Composite
      helper
      gfx::DrawQuad
    `);

    const labeled = insertStackLabels(profile, [
      { name: 'Graphics', funcPrefixes: ['gfx::'] },
    ]);

    expect(formatTree(callTreeFromProfile(labeled))).toEqual([
      '- Graphics (total: 1, self: —)',
      '  - gfx::Composite (total: 1, self: —)',
      '    - helper (total: 1, self: —)',
      '      - gfx::DrawQuad (total: 1, self: 1)',
    ]);
  });

  it('inserts the right label when multiple labels are configured', function () {
    const { profile } = getProfileFromTextSamples(`
      A               A
      layout::Reflow  gfx::Composite
    `);

    const labeled = insertStackLabels(profile, [
      { name: 'Layout', funcPrefixes: ['layout::'] },
      { name: 'Graphics', funcPrefixes: ['gfx::'] },
    ]);

    expect(formatTree(callTreeFromProfile(labeled))).toEqual([
      '- Unaccounted (total: 2, self: —)',
      '  - A (total: 2, self: —)',
      '    - Layout (total: 1, self: —)',
      '      - layout::Reflow (total: 1, self: 1)',
      '    - Graphics (total: 1, self: —)',
      '      - gfx::Composite (total: 1, self: 1)',
    ]);
  });

  it('inserts a new label when switching from one label to another', function () {
    const { profile } = getProfileFromTextSamples(`
      layout::Reflow
      gfx::Composite
    `);

    const labeled = insertStackLabels(profile, [
      { name: 'Layout', funcPrefixes: ['layout::'] },
      { name: 'Graphics', funcPrefixes: ['gfx::'] },
    ]);

    expect(formatTree(callTreeFromProfile(labeled))).toEqual([
      '- Layout (total: 1, self: —)',
      '  - layout::Reflow (total: 1, self: —)',
      '    - Graphics (total: 1, self: —)',
      '      - gfx::Composite (total: 1, self: 1)',
    ]);
  });

  it('wraps unmatched root frames in an Unaccounted label', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      B
      C
    `);

    const labeled = insertStackLabels(profile, [
      { name: 'Layout', funcPrefixes: ['layout::'] },
    ]);

    expect(formatTree(callTreeFromProfile(labeled))).toEqual([
      '- Unaccounted (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '    - B (total: 1, self: —)',
      '      - C (total: 1, self: 1)',
    ]);
  });

  it('handles multiple samples sharing common prefixes correctly', function () {
    const { profile } = getProfileFromTextSamples(`
      A                         A                         A
      B                         B                         B
      gfx::Composite            gfx::Composite            C
      gfx::DrawQuad             gfx::LayerManager::Render
    `);

    const labeled = insertStackLabels(profile, [
      { name: 'Graphics', funcPrefixes: ['gfx::'] },
    ]);

    expect(formatTree(callTreeFromProfile(labeled))).toEqual([
      '- Unaccounted (total: 3, self: —)',
      '  - A (total: 3, self: —)',
      '    - B (total: 3, self: —)',
      '      - Graphics (total: 2, self: —)',
      '        - gfx::Composite (total: 2, self: —)',
      '          - gfx::DrawQuad (total: 1, self: 1)',
      '          - gfx::LayerManager::Render (total: 1, self: 1)',
      '      - C (total: 1, self: 1)',
    ]);
  });
});
