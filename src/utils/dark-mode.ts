export type ThemePreference = 'system' | 'light' | 'dark';

let _isDarkModeSetup = false;
let _isDarkMode = false;

export function getSystemTheme(): 'light' | 'dark' | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem('theme');
    if (stored === 'light') {
      return 'light';
    }
    if (stored === 'dark') {
      return 'dark';
    }
    return 'system';
  } catch {
    return 'system';
  }
}

function _applyTheme(): void {
  const preference = getThemePreference();
  let shouldBeDark = false;

  if (preference === 'dark') {
    shouldBeDark = true;
  } else if (preference === 'light') {
    shouldBeDark = false;
  } else {
    // System preference
    shouldBeDark = getSystemTheme() === 'dark';
  }

  _isDarkMode = shouldBeDark;

  if (shouldBeDark) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') {
      window.localStorage.removeItem('theme');
    } else {
      window.localStorage.setItem('theme', pref);
    }
  } catch (e) {
    console.warn('localStorage access denied', e);
  }
  _applyTheme();
}

export function isDarkMode(): boolean {
  if (!_isDarkModeSetup) {
    try {
      _applyTheme();

      // Listen for localStorage changes from other tabs
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key === 'theme' || event.key === null) {
          _applyTheme();
        }
      });

      // Listen for system preference changes
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          // Only re-apply if user is using system preference
          if (getThemePreference() === 'system') {
            _applyTheme();
          }
        });
    } catch (e) {
      console.warn('localStorage access denied', e);
    }
    _isDarkModeSetup = true;
  }

  return _isDarkMode;
}

export function lightDark(light: string, dark: string): string {
  return isDarkMode() ? dark : light;
}

export function maybeLightDark(value: string | [string, string]): string {
  if (typeof value === 'string') {
    return value;
  }
  return lightDark(value[0], value[1]);
}

export function initTheme() {
  isDarkMode();
}

export function setDarkMode() {
  setThemePreference('dark');
}

export function setLightMode() {
  setThemePreference('light');
}

export function resetForTest() {
  _isDarkModeSetup = false;
  _isDarkMode = false;
}
