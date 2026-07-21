const MENU_ITEM_SELECTOR = '[role="menuitem"]:not(.disabled)';

function focusFirst(container) {
  const items = [...container.querySelectorAll(MENU_ITEM_SELECTOR)];
  (/** @type {HTMLElement} */ (items[0]))?.focus();
}

function focusLast(container) {
  const items = [...container.querySelectorAll(MENU_ITEM_SELECTOR)];
  (/** @type {HTMLElement} */ (items[items.length - 1]))?.focus();
}

function arrowNav(container, current, dir) {
  const items = [...container.querySelectorAll(MENU_ITEM_SELECTOR)];
  if (!items.length) return;
  const idx = items.indexOf(current);
  if (dir === 'down') (/** @type {HTMLElement} */ (items[(idx + 1) % items.length]))?.focus();
  if (dir === 'up')   (/** @type {HTMLElement} */ (items[(idx - 1 + items.length) % items.length]))?.focus();
}

function initFileMenuKeyboard() {
  const popup = document.getElementById('fileMenuPopup');
  const btn   = document.getElementById('fileMenuBtn');
  if (!popup || !btn) return;

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      if (!popup.hidden) { e.preventDefault(); focusFirst(popup); }
    }
  });

  popup.addEventListener('keydown', (e) => {
    const item = e.target.closest(MENU_ITEM_SELECTOR);
    if (e.key === 'ArrowDown') { e.preventDefault(); arrowNav(popup, item, 'down'); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); arrowNav(popup, item, 'up');   return; }
    if (e.key === 'Home')      { e.preventDefault(); focusFirst(popup); return; }
    if (e.key === 'End')       { e.preventDefault(); focusLast(popup);  return; }
    if (e.key === 'Escape')    { e.preventDefault(); popup.hidden = true; btn.setAttribute('aria-expanded', 'false'); (/** @type {HTMLElement} */ (btn)).focus(); return; }
    if (e.key === 'Tab')       { popup.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  });
}

function initSnippetsMenuKeyboard() {
  const menu = document.getElementById('snippetsMenu');
  const btn  = document.getElementById('snipBtn');
  if (!menu || !btn) return;

  const ITEM_SEL = '.snip-item';

  function getItems() { return [...menu.querySelectorAll(ITEM_SEL)]; }

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (menu.classList.contains('open')) (/** @type {HTMLElement} */ (getItems()[0]))?.focus();
    }
  });

  menu.addEventListener('keydown', (e) => {
    const items = getItems();
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (/** @type {HTMLElement} */ (items[(idx + 1) % items.length]))?.focus(); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); (/** @type {HTMLElement} */ (items[(idx - 1 + items.length) % items.length]))?.focus(); return; }
    if (e.key === 'Home')      { e.preventDefault(); (/** @type {HTMLElement} */ (items[0]))?.focus(); return; }
    if (e.key === 'End')       { e.preventDefault(); (/** @type {HTMLElement} */ (items[items.length - 1]))?.focus(); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      (/** @type {HTMLElement} */ (btn)).focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.activeElement.click();
      return;
    }
    if (e.key === 'Tab') { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  });
}

function initDivActionKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'A') return;
    e.preventDefault();
    el.click();
  });
}

function initChannelPanelKeyboard() {
  const head = document.getElementById('chHead');
  if (!head) return;
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.click(); }
  });
}

/**
 * §4.2 — WAI-ARIA Tabs pattern for the MIDI tablist.
 * Arrow Left/Right cycle focus + activate; Home/End jump to edges.
 * Follows the "automatic activation" model (focus = activate).
 */
function initMidiTablistKeyboard() {
  const tablist = document.querySelector('[role="tablist"][aria-label="MIDI panels"]');
  if (!tablist) return;

  const TABS = ['map', 'monitor', 'grid', 'output'];

  tablist.addEventListener('keydown', (e) => {
    const focused = document.activeElement;
    if (!focused || focused.getAttribute('role') !== 'tab') return;

    const currentId = focused.id.replace('midiTab_', '');
    const idx = TABS.indexOf(currentId);
    if (idx === -1) return;

    let next = -1;
    if (e.key === 'ArrowRight') { e.preventDefault(); next = (idx + 1) % TABS.length; }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); next = (idx - 1 + TABS.length) % TABS.length; }
    else if (e.key === 'Home')       { e.preventDefault(); next = 0; }
    else if (e.key === 'End')        { e.preventDefault(); next = TABS.length - 1; }
    else return;

    const target = document.getElementById(`midiTab_${TABS[next]}`);
    if (target) {
      target.focus();
      target.click(); // automatic activation: switch pane on arrow
    }
  });
}

export function initKeyboardNav() {
  initFileMenuKeyboard();
  initSnippetsMenuKeyboard();
  initDivActionKeyboard();
  initChannelPanelKeyboard();
  initMidiTablistKeyboard();
}
