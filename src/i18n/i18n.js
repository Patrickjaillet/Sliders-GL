import { state } from '../core/state.js';
import enData from './en.json';

let _localeData = enData;

/**
 * Initialize i18n — English only, synchronous.
 */
export function initI18n() {
  _localeData = enData;
  state.i18n = { locale: 'en', t };
}

/**
 * Translate a key (supports nested keys with dot notation).
 * @param {string} key
 * @param {object} params
 * @returns {string}
 */
export function t(key, params = {}) {
  const keys = key.split('.');
  let value = _localeData;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key;
    }
  }
  if (typeof value !== 'string') return key;
  let result = value;
  for (const [param, val] of Object.entries(params)) {
    result = result.replace(new RegExp(`{${param}}`, 'g'), val);
  }
  return result;
}

export function getLocale() { return 'en'; }
export function hasTranslation(key) {
  const keys = key.split('.');
  let value = _localeData;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) value = value[k];
    else return false;
  }
  return typeof value === 'string';
}
export function getTranslations(namespace) {
  return _localeData[namespace] || {};
}

// Legacy stubs — kept so existing imports don't break
export const AVAILABLE_LOCALES = [{ code: 'en', name: 'English', nativeName: 'English' }];
export async function setLocale() { return true; }
export async function loadLocale() { return true; }
export function getAvailableLocales() { return AVAILABLE_LOCALES; }
