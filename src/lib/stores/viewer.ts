import { writable } from 'svelte/store';

/**
 * True while an in-place immersive viewer (Feed.svelte opened from the All
 * Drawings grid) is covering the screen. The layout hides the nav and footer
 * on it, the same way it does for the dedicated `/drawing/[slug]/[index]`
 * feed routes — but the grid underneath keeps its chrome.
 */
export const viewerOpen = writable(false);
