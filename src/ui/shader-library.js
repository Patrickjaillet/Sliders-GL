/**
 * src/ui/shader-library.js — Phase 20.3
 *
 * Moteur de tags, recherche plein texte locale et collections.
 *
 * Architecture — partage l'IndexedDB "z-gl-workspace" (v2) :
 *   store "projects"     (existant v1) — champs exploités : tags[], description, format,
 *                                        multipass, folder, code
 *   store "thumbnails"   (existant v1)
 *   store "collections"  (nouveau v2)  { id, name, projectIds[], createdAt, color }
 *
 * API publique :
 *   initLibraryDB()
 *   indexProject(project)            → met à jour l'index plein-texte local (localStorage)
 *   searchProjects(query, filters?)  → project[] filtrés + scorés
 *   setProjectTags(id, tags[])       → persiste les tags sur le projet
 *   getAllTags()                      → string[] (union de tous les tags)
 *   createCollection(name, color?)   → collection
 *   listCollections()                → collection[]
 *   getCollection(id)                → collection
 *   addToCollection(collectionId, projectId)
 *   removeFromCollection(collectionId, projectId)
 *   deleteCollection(id)
 *   renameCollection(id, name)
 */

import { state } from '../core/state.js';

const DB_NAME    = 'z-gl-workspace';
const DB_VERSION = 2;           // bump pour ajouter le store "collections"
const ST_PROJECTS    = 'projects';
const ST_THUMBS      = 'thumbnails';
const ST_COLLECTIONS = 'collections';

const COLL_COLORS = ['#7b6fff','#89dceb','#a6e3a1','#fab387','#f38ba8','#cba6f7','#f9e2af','#74c7ec'];
const INDEX_KEY   = 'z-gl-lib-index';   // localStorage : Map<id, tokenSet[]>

let _db = null;

// ─── IndexedDB v2 ─────────────────────────────────────────────────────────────

async function _getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Stores v1 — déjà créés par workspace-manager.js si la DB existait en v1.
      // onupgradeneeded est appelé même pour un upgrade v1→v2, donc on vérifie.
      if (!db.objectStoreNames.contains(ST_PROJECTS)) {
        const ps = db.createObjectStore(ST_PROJECTS, { keyPath: 'id' });
        ps.createIndex('updatedAt', 'updatedAt', { unique: false });
        ps.createIndex('name',      'name',      { unique: false });
      }
      if (!db.objectStoreNames.contains(ST_THUMBS)) {
        db.createObjectStore(ST_THUMBS, { keyPath: 'id' });
      }
      // Store v2 : collections
      if (!db.objectStoreNames.contains(ST_COLLECTIONS)) {
        const cs = db.createObjectStore(ST_COLLECTIONS, { keyPath: 'id' });
        cs.createIndex('name', 'name', { unique: false });
      }
    };
    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = ()  => reject(req.error);
  });
}

function _p(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function _tx(store, mode = 'readonly') {
  return _db.transaction(store, mode).objectStore(store);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initLibraryDB() {
  await _getDB();
}

// ─── Full-text index (localStorage) ──────────────────────────────────────────
// Tokenize le nom + description + tags + code (100 premiers tokens) de chaque projet.
// Stocké en localStorage pour éviter de lire tout le code à chaque recherche.

function _tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function _loadIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}'); }
  catch { return {}; }
}

function _saveIndex(idx) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); }
  catch {}
}

export function indexProject(project) {
  const idx   = _loadIndex();
  const tokens = [
    ..._tokenize(project.name),
    ..._tokenize(project.description || ''),
    ...(project.tags || []).flatMap(t => _tokenize(t)),
    ..._tokenize((project.code || '').slice(0, 2000)),   // premiers 2000 chars
  ];
  idx[project.id] = [...new Set(tokens)];
  _saveIndex(idx);
}

function _removeFromIndex(id) {
  const idx = _loadIndex();
  delete idx[id];
  _saveIndex(idx);
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * @param {string} query   — mots clés libres (vide = tout retourner)
 * @param {object} filters — { tags:string[], format:string, hasMultipass:bool,
 *                             hasWebGPU:bool, hasMidi:bool, hasTimeline:bool,
 *                             collectionId:string, dateFrom:number, dateTo:number }
 * @returns {Promise<object[]>} projets triés par score décroissant
 */
export async function searchProjects(query = '', filters = {}) {
  await _getDB();

  // Charger tous les projets
  const projects = await _p(_tx(ST_PROJECTS).getAll()) || [];

  // Filtrage par collection
  let allowedIds = null;
  if (filters.collectionId) {
    const coll = await getCollection(filters.collectionId);
    allowedIds = new Set(coll?.projectIds || []);
  }

  const queryTokens = _tokenize(query);
  const idx = _loadIndex();

  const scored = projects
    .map(p => {
      // Filtres booléens
      if (allowedIds && !allowedIds.has(p.id)) return null;
      if (filters.tags?.length) {
        const pt = new Set((p.tags || []).map(t => t.toLowerCase()));
        if (!filters.tags.every(t => pt.has(t.toLowerCase()))) return null;
      }
      if (filters.format    && p.format !== filters.format)     return null;
      if (filters.hasMultipass != null) {
        const has = !!(p.multipass && Object.keys(p.multipass.passes || {}).length > 1);
        if (filters.hasMultipass !== has) return null;
      }
      if (filters.hasWebGPU != null) {
        const has = p.format === 'wgsl';
        if (filters.hasWebGPU !== has) return null;
      }
      if (filters.hasMidi != null) {
        const has = !!(p.code && /\biMidi\b|\bmidi\b/i.test(p.code));
        if (filters.hasMidi !== has) return null;
      }
      if (filters.hasTimeline != null) {
        const has = !!(p.code && /\biTimeline\b|\btimeline\b/i.test(p.code));
        if (filters.hasTimeline !== has) return null;
      }
      if (filters.dateFrom && p.updatedAt < filters.dateFrom) return null;
      if (filters.dateTo   && p.updatedAt > filters.dateTo)   return null;

      // Score plein-texte
      let score = 0;
      if (queryTokens.length > 0) {
        const projectTokens = new Set(idx[p.id] || []);
        const nameTokens    = new Set(_tokenize(p.name));
        for (const t of queryTokens) {
          if (nameTokens.has(t))    score += 3;   // nom = poids fort
          else if (projectTokens.has(t)) score += 1;
        }
        if (score === 0) return null;  // aucun token ne correspond
      }

      return { project: p, score };
    })
    .filter(Boolean);

  scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.project.updatedAt - a.project.updatedAt
  );

  return scored.map(s => s.project);
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function setProjectTags(id, tags) {
  await _getDB();
  const project = await _p(_tx(ST_PROJECTS).get(id));
  if (!project) return;
  project.tags = tags.map(t => t.trim()).filter(Boolean);
  project.updatedAt = Date.now();
  await _p(_tx(ST_PROJECTS, 'readwrite').put(project));
  indexProject(project);
  return project;
}

export async function getAllTags() {
  await _getDB();
  const projects = await _p(_tx(ST_PROJECTS).getAll()) || [];
  const set = new Set();
  for (const p of projects) {
    for (const t of (p.tags || [])) set.add(t.trim());
  }
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// ─── Collections ─────────────────────────────────────────────────────────────

export async function createCollection(name, color = null) {
  await _getDB();
  const existing = await listCollections();
  if (existing.find(c => c.name === name)) throw new Error(`Collection "${name}" already exists`);
  const coll = {
    id:         _uid(),
    name:       name.trim(),
    projectIds: [],
    createdAt:  Date.now(),
    color:      color || COLL_COLORS[existing.length % COLL_COLORS.length],
  };
  await _p(_tx(ST_COLLECTIONS, 'readwrite').put(coll));
  return coll;
}

export async function listCollections() {
  await _getDB();
  return (await _p(_tx(ST_COLLECTIONS).getAll())) || [];
}

export async function getCollection(id) {
  await _getDB();
  return _p(_tx(ST_COLLECTIONS).get(id));
}

export async function addToCollection(collectionId, projectId) {
  await _getDB();
  const coll = await getCollection(collectionId);
  if (!coll) return;
  if (!coll.projectIds.includes(projectId)) {
    coll.projectIds.push(projectId);
    await _p(_tx(ST_COLLECTIONS, 'readwrite').put(coll));
  }
  return coll;
}

export async function removeFromCollection(collectionId, projectId) {
  await _getDB();
  const coll = await getCollection(collectionId);
  if (!coll) return;
  coll.projectIds = coll.projectIds.filter(id => id !== projectId);
  await _p(_tx(ST_COLLECTIONS, 'readwrite').put(coll));
  return coll;
}

export async function deleteCollection(id) {
  await _getDB();
  await _p(_tx(ST_COLLECTIONS, 'readwrite').delete(id));
}

export async function renameCollection(id, name) {
  await _getDB();
  const coll = await getCollection(id);
  if (!coll) return;
  coll.name = name.trim();
  await _p(_tx(ST_COLLECTIONS, 'readwrite').put(coll));
  return coll;
}

// ─── Re-index all projects (called once on init) ──────────────────────────────

export async function reindexAll() {
  await _getDB();
  const projects = await _p(_tx(ST_PROJECTS).getAll()) || [];
  for (const p of projects) indexProject(p);
}
