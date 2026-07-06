export function applyTheme(theme) {
  const root = document.documentElement;
  const resolved =
    theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;

  if (resolved === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
}

export function applyColorTheme(colorTheme) {
  document.documentElement.setAttribute('data-color-theme', colorTheme || 'azul');
}
