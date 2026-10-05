/* js/save.js — the ONLY module that touches localStorage.
 *
 * The game shares an origin (pomu1144.github.io) with NXBNVNB and the Portal
 * hub, so every key this game owns starts with `jjk_` and nothing else is
 * ever read, written or cleared. The whole save is one JSON blob under
 * `jjk_save` with a schema version; older blobs are migrated on load.
 *
 *   Save.exists()            has a sorcerer been created?
 *   Save.create(name)        start a new save
 *   Save.get()               the live state object (read-only by convention)
 *   Save.update(fn)          mutate the state inside fn, then persist
 *   Save.exportJSON()        string for backups
 *   Save.importJSON(text)    replace the save (validated) — throws on bad input
 *   Save.reset()             delete this game's keys only
 *   Save.pref(key[, value])  tiny per-device prefs (jjk_pref_<key>)
 */
(function (global) {
  'use strict';

  const PREFIX = 'jjk_';
  const KEY = PREFIX + 'save';
  const SCHEMA = 1;

  let storageOk = true;
  function rawGet(k) {
    try { return global.localStorage.getItem(k); } catch (_) { storageOk = false; return null; }
  }
  function rawSet(k, v) {
    try { global.localStorage.setItem(k, v); return true; } catch (_) { storageOk = false; return false; }
  }
  function rawDel(k) {
    try { global.localStorage.removeItem(k); } catch (_) { storageOk = false; }
  }

  function blank(name) {
    const now = Date.now();
    return {
      schema: SCHEMA,
      created: now,
      updated: now,
      profile: { name: String(name || 'Sorcerer').slice(0, 24), rank: 1, rankExp: 0, homeUnit: null },
      currency: { cubes: 100, yen: 5000 },
      stamina: { cur: 30, ts: now },
      items: { talisman_s: 10, talisman_m: 2, talisman_l: 0, ticket: 1 },
      units: {},          // id -> { id, level, exp, dupes, obtained, guest? }
      guests: {},         // guest id -> definition (from a Portal card)
      teams: [
        { name: 'Team 1', slots: [null, null, null, null], support: null },
        { name: 'Team 2', slots: [null, null, null, null], support: null },
        { name: 'Team 3', slots: [null, null, null, null], support: null },
      ],
      activeTeam: 0,
      progress: {},       // stageId -> { stars, clears, best }
      pity: {},           // bannerId -> pulls since last featured high-rarity
      daily: {},          // offerId -> 'YYYY-MM-DD'
      settings: { music: true, sfx: true, volume: 70, battleSpeed: 1, autoBattle: false, reduceMotion: false },
      portal: { importedParties: [], lastPartyCards: [], pendingTx: [] },
      stats: { battles: 0, wins: 0, pulls: 0 },
    };
  }

  // Bring any older/partial save up to the current schema without losing data.
  function migrate(s) {
    if (!s || typeof s !== 'object') throw new Error('Save data is not an object');
    const b = blank(s.profile && s.profile.name);
    const out = Object.assign({}, b, s);
    for (const k of ['profile', 'currency', 'stamina', 'items', 'settings', 'portal', 'stats']) {
      out[k] = Object.assign({}, b[k], s[k] && typeof s[k] === 'object' ? s[k] : {});
    }
    for (const k of ['units', 'guests', 'progress', 'pity', 'daily']) {
      out[k] = s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) ? s[k] : {};
    }
    if (!Array.isArray(out.teams) || !out.teams.length) out.teams = b.teams;
    out.teams = out.teams.slice(0, 3).map((t, i) => ({
      name: String((t && t.name) || 'Team ' + (i + 1)).slice(0, 20),
      slots: [0, 1, 2, 3].map((j) => (t && Array.isArray(t.slots) && typeof t.slots[j] === 'string' ? t.slots[j] : null)),
      support: t && typeof t.support === 'string' ? t.support : null,
    }));
    while (out.teams.length < 3) out.teams.push({ name: 'Team ' + (out.teams.length + 1), slots: [null, null, null, null], support: null });
    if (!Array.isArray(out.portal.importedParties)) out.portal.importedParties = [];
    if (!Array.isArray(out.portal.pendingTx)) out.portal.pendingTx = [];
    out.activeTeam = Math.max(0, Math.min(2, Number(out.activeTeam) || 0));
    // (future) if (s.schema < 2) { ... }
    out.schema = SCHEMA;
    return out;
  }

  let state = null;
  function load() {
    if (state) return state;
    const raw = rawGet(KEY);
    if (!raw) return null;
    try { state = migrate(JSON.parse(raw)); } catch (err) {
      console.warn('[save] unreadable save, keeping a backup copy', err);
      rawSet(PREFIX + 'save_corrupt_backup', raw);
      state = null;
    }
    return state;
  }

  function persist() {
    if (!state) return false;
    state.updated = Date.now();
    return rawSet(KEY, JSON.stringify(state));
  }

  const listeners = new Set();
  function emit() { listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } }); }

  global.Save = {
    KEY, PREFIX, SCHEMA,
    get storageOk() { return storageOk; },
    exists: () => !!load(),
    get: () => load(),
    create(name) {
      state = blank(name);
      persist();
      emit();
      return state;
    },
    update(fn) {
      const s = load();
      if (!s) throw new Error('No save');
      const r = fn(s);
      persist();
      emit();
      return r;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    exportJSON() {
      const s = load();
      return JSON.stringify({ game: 'jjk-net0', exported: new Date().toISOString(), save: s }, null, 1);
    },
    importJSON(text) {
      let obj;
      try { obj = JSON.parse(String(text || '')); } catch (_) { throw new Error('That is not valid JSON.'); }
      const s = obj && obj.save ? obj.save : obj;
      if (!s || typeof s !== 'object' || !s.profile || !s.units) throw new Error('This file is not a Cursed Clash save.');
      if (Number(s.schema) > SCHEMA) throw new Error('This save is from a newer version of the game.');
      state = migrate(s);
      // in-flight Portal transfers belong to the device that made them; replaying
      // them from a backup could double-credit, so an imported save starts clean
      state.portal.pendingTx = [];
      persist();
      emit();
      return state;
    },
    reset() {
      // Only our own keys — never NXBNVNB (blazing_*) or the hub (portal_*).
      try {
        const doomed = [];
        for (let i = 0; i < global.localStorage.length; i++) {
          const k = global.localStorage.key(i);
          if (k && k.startsWith(PREFIX)) doomed.push(k);
        }
        doomed.forEach(rawDel);
      } catch (_) { rawDel(KEY); }
      state = null;
    },
    pref(key, value) {
      const k = PREFIX + 'pref_' + key;
      if (arguments.length > 1) { rawSet(k, JSON.stringify(value)); return value; }
      try { return JSON.parse(rawGet(k)); } catch (_) { return null; }
    },
  };
})(window);
