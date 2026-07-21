import { safeLocalGet, safeLocalSet } from '../core/utils.js';

const HISTORY_KEY = 'sl_history';
const MAX_HISTORY = 10;

export function loadHistory() {
  try {
    const raw = safeLocalGet(HISTORY_KEY, '[]');
    return JSON.parse(raw);
  } catch (_) { return []; }
}

export function pushHistory(name, code) {
  try {
    let h = loadHistory();
    h = h.filter(e => e.code !== code);
    h.unshift({ name: name || 'Untitled', code, created: new Date().toISOString() });
    h = h.slice(0, MAX_HISTORY);
    safeLocalSet(HISTORY_KEY, JSON.stringify(h));
  } catch (_) {}
}
