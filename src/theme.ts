/**
 * Theme utilities: read the YASGUI theme and its colours, and watch for changes.
 */

export interface ChartThemeColors {
  dark: boolean;
  text: string;
  textMuted: string;
  border: string;
  background: string;
  tooltipBackground: string;
  palette: string[];
}

/** Categorical palette, readable on both light and dark backgrounds */
const LIGHT_PALETTE = [
  '#2f6fb0',
  '#e07b39',
  '#3a9a5b',
  '#c94f5d',
  '#7d5ab5',
  '#2a9d9d',
  '#c9a227',
  '#8c6d52',
  '#d35fa6',
  '#6b7a8f',
];

const DARK_PALETTE = [
  '#6aa6e8',
  '#f29b5c',
  '#5cc483',
  '#ec7b87',
  '#a98be0',
  '#4fc4c4',
  '#e6c454',
  '#b8977a',
  '#ef8cc8',
  '#9aa8bb',
];

export function getCurrentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function getThemeColors(): ChartThemeColors {
  const dark = getCurrentTheme() === 'dark';
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    dark,
    text: read('--yasgui-text-primary', dark ? '#e0e0e0' : '#222222'),
    textMuted: read('--yasgui-text-secondary', dark ? '#aaaaaa' : '#666666'),
    border: read('--yasgui-border-color', dark ? '#444444' : '#d0d0d0'),
    background: read('--yasgui-bg-primary', dark ? '#1e1e1e' : '#ffffff'),
    tooltipBackground: read('--yasgui-bg-secondary', dark ? '#2a2a2a' : '#ffffff'),
    palette: dark ? DARK_PALETTE : LIGHT_PALETTE,
  };
}

/** Call `callback` whenever the document's data-theme attribute changes */
export function watchThemeChanges(callback: () => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.attributeName === 'data-theme')) callback();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return observer;
}
