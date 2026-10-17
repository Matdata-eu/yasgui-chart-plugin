/**
 * Inline Lucide icons (https://lucide.dev, ISC licence)
 *
 * Only the few icons the plugin needs are inlined, so there is no icon font
 * or runtime dependency. They are stroke icons drawn in `currentColor`.
 */

const ICON_PATHS = {
  'chart-column':
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  'sliders-horizontal':
    '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/>' +
    '<line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/>' +
    '<line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/>' +
    '<line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/>' +
    '<line x1="16" x2="16" y1="18" y2="22"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevrons-left': '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/>' +
    '<line x1="12" x2="12" y1="15" y2="3"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** SVG markup of a Lucide icon (decorative: hidden from assistive technology) */
export function iconSvg(name: IconName, size = 16, strokeWidth = 1.75): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="chart-icon chart-icon-${name}" ` +
    `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`
  );
}

/** A Lucide icon as a DOM element */
export function icon(name: IconName, size?: number, strokeWidth?: number): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = iconSvg(name, size, strokeWidth);
  return template.content.firstElementChild as SVGElement;
}
