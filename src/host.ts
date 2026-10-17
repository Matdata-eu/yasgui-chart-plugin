/**
 * Feature detection for the YASR host API
 *
 * Newer YASR versions (MatGUI) offer a shared describe panel and a toolbar
 * slot to plugins. Older ones don't: the plugin then keeps its own describe
 * modal and draws its own toolbar above the chart.
 */

import type { Yasr } from './types';

/** True when the host opens IRIs in its shared describe panel */
export function hasHostDescribe(yasr: Yasr | null | undefined): boolean {
  return !!yasr?.hostApi?.describe && typeof yasr.describe === 'function';
}

/** The host's plugin toolbar slot, or null when the host has none */
export function getHostToolbar(yasr: Yasr | null | undefined): HTMLDivElement | null {
  if (!yasr?.hostApi?.toolbar || typeof yasr.getPluginToolbar !== 'function') return null;
  try {
    const slot = yasr.getPluginToolbar();
    return slot instanceof HTMLElement ? (slot as HTMLDivElement) : null;
  } catch (error) {
    console.warn('yasgui-chart-plugin: could not get the plugin toolbar', error);
    return null;
  }
}
