/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';

import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';

import './SettingsMenu.css';

type Props = {
  readonly buttonClassName?: string;
};

function SettingsMenuPanel() {
  return (
    <div className="settingsMenuPanel">
      <div className="settingsMenuRow settingsMenuRow--theme">
        <ThemeToggle />
      </div>
      <div className="settingsMenuLinks">
        <a
          className="settingsMenuLink"
          href="/docs/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Localized id="SettingsMenu--docs">Docs</Localized>
        </a>
        <a
          className="settingsMenuLink"
          href="https://www.mozilla.org/about/legal/terms/mozilla"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Localized id="SettingsMenu--legal">Legal</Localized>
        </a>
        <a
          className="settingsMenuLink"
          href="https://www.mozilla.org/privacy/websites"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Localized id="SettingsMenu--privacy">Privacy</Localized>
        </a>
        <a
          className="settingsMenuLink"
          href="https://www.mozilla.org/privacy/websites/#cookies"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Localized id="SettingsMenu--cookies">Cookies</Localized>
        </a>
      </div>
      <div className="settingsMenuRow settingsMenuRow--language">
        <LanguageSwitcher />
      </div>
    </div>
  );
}

export class SettingsMenu extends React.PureComponent<Props> {
  override render() {
    const { buttonClassName } = this.props;
    return (
      <Localized id="SettingsMenu--button" attrs={{ title: true }}>
        <ButtonWithPanel
          className="settingsMenu"
          buttonClassName={buttonClassName}
          panelClassName="settingsMenuArrowPanel"
          title="Settings"
          label=""
          panelContent={<SettingsMenuPanel />}
        />
      </Localized>
    );
  }
}
