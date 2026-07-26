import * as THREE from 'three';
import './style/index.css';
import './setup.js';
import './core/constants.js';
import './shader/parser.js';
import './ui/slider.js';
import './ui/viewport.js';
import './io/actions.js';
import './io/library.js';
import './export/export.js';
import './io/shadertoy.js';
import './io/api.js';
import './ui/editor.js';
import './app/init.js';

// Phase 21.1 — i18n complet (offline)
import { initI18n } from './i18n/i18n.js';
initI18n();

import { initEvents, exposeGlobals } from './ui/events.js';
initEvents();
exposeGlobals();

// Phase E — slider panel filter bar (search + modified-only)
import { initSliderFilter } from './ui/slider.js';
initSliderFilter();

// Phase 7.3 — Accessibility
import { initAccessibility } from './ui/accessibility.js';
initAccessibility();

// Phase 7.4 — Onboarding & Help
import { initOnboarding } from './ui/onboarding.js';
initOnboarding();

// UI Redesign — Menu manager
// Fix 3.6 — setTimeout(300ms) arbitraire supprimé : si l'app est lente,
// les actions de menu pouvaient être invoquées avant l'enregistrement des handlers.
import { initMenuManager } from './ui/menu-manager.js';
initMenuManager();
console.log('✓ Menu manager initialized');

// Blender-style topbar shell — dropdown menus, workspace tabs, outliner
import { initBlenderShell } from './ui/blender-shell.js';
initBlenderShell();

// F-10.5 — Editor preferences: apply saved Monaco options at startup
import { initEditorPrefs } from './ui/settings-panel.js';
initEditorPrefs();
