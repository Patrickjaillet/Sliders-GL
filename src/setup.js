// First module: inject HTML template into DOM before any other module runs
import uiHTML from './ui.html?raw';
document.body.innerHTML = uiHTML;
// Signal that the UI HTML is now in the DOM so that any module whose IIFE
// ran before this point (import order race) can retry its DOM queries.
document.dispatchEvent(new CustomEvent('zgl:ui-ready'));
