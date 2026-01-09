let _isDarkModeSetup = false;
let _isDarkMode = false;

export function isDarkMode() {
  if (!_isDarkModeSetup) {
    try {
      function readSetting() {
        const theme = window.localStorage.getItem('theme');
        if (theme === 'dark') {
          _isDarkMode = true;
        } else {
          _isDarkMode = false;
        }
      }
      readSetting();
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key === 'theme') {
          readSetting();
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

export function setDarkMode() {
  _isDarkMode = true;
  window.localStorage.setItem('theme', 'dark');
  document.documentElement.classList.add('dark-mode');
}

export function setLightMode() {
  _isDarkMode = false;
  window.localStorage.removeItem('theme');
  document.documentElement.classList.remove('dark-mode');
}
