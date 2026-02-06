/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { PureComponent } from 'react';
import { Localized } from '@fluent/react';
import type { ThemePreference } from 'firefox-profiler/utils/dark-mode';
import {
  getThemePreference,
  setThemePreference,
} from 'firefox-profiler/utils/dark-mode';

import './ThemeToggle.css';

type State = {
  currentTheme: ThemePreference;
};

class ThemeToggle extends PureComponent<{}, State> {
  override state = {
    currentTheme: getThemePreference(),
  };

  override componentDidMount() {
    // Listen for storage events (cross-tab sync)
    window.addEventListener('storage', this._handleStorageChange);

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', this._handleSystemPreferenceChange);
  }

  override componentWillUnmount() {
    window.removeEventListener('storage', this._handleStorageChange);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.removeEventListener(
      'change',
      this._handleSystemPreferenceChange
    );
  }

  _handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'theme' || e.key === null) {
      this.setState({ currentTheme: getThemePreference() });
    }
  };

  _handleSystemPreferenceChange = () => {
    // Update state if user is on system preference
    if (this.state.currentTheme === 'system') {
      this.setState({ currentTheme: getThemePreference() });
    }
  };

  _handleLightClick = () => {
    setThemePreference('light');
    this.setState({ currentTheme: 'light' });
  };

  _handleSystemClick = () => {
    setThemePreference('system');
    this.setState({ currentTheme: 'system' });
  };

  _handleDarkClick = () => {
    setThemePreference('dark');
    this.setState({ currentTheme: 'dark' });
  };

  _renderIconButton(
    theme: ThemePreference,
    labelL10nId: string,
    icon: React.ReactNode,
    onClick: () => void
  ) {
    const isActive = this.state.currentTheme === theme;
    return (
      <Localized id={labelL10nId} attrs={{ title: true }}>
        <button
          type="button"
          className={`themeToggleButton ${isActive ? 'themeToggleButton-active' : ''}`}
          onClick={onClick}
          aria-label={theme}
        >
          {icon}
        </button>
      </Localized>
    );
  }

  override render() {
    return (
      <div className="themeToggle">
        {this._renderIconButton(
          'light',
          'ThemeToggle--light',
          <span className="themeToggleIcon themeToggleIcon--light" />,
          this._handleLightClick
        )}
        {this._renderIconButton(
          'system',
          'ThemeToggle--system',
          <span className="themeToggleIcon themeToggleIcon--system" />,
          this._handleSystemClick
        )}
        {this._renderIconButton(
          'dark',
          'ThemeToggle--dark',
          <span className="themeToggleIcon themeToggleIcon--dark" />,
          this._handleDarkClick
        )}
      </div>
    );
  }
}

export { ThemeToggle };
