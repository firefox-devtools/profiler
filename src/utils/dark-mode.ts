let _isDarkModeSetup = false;
let _isDarkMode = false;

export function isDarkMode() {
  if (!_isDarkModeSetup) {
    if (window.matchMedia) {
      const result = window.matchMedia('(prefers-color-scheme: dark)');
      _isDarkMode = result.matches;
      result.addEventListener('change', (event) => {
        _isDarkMode = event.matches;
      });
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
