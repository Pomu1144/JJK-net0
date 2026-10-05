/* js/art.js — character / curse art.
 * Every character has art.portrait / art.full (real webp for the three
 * NXBNVNB characters, generated SVG files for the rest, absolute URLs for
 * Portal guests). If an image fails to load (e.g. a guest's home game is
 * offline) it is swapped for a generated SVG made here at runtime.
 */
(function (global) {
  'use strict';

  const EL = {
    Body:    ['#3f8fe0', '#0b2a52', '#9fd0ff'],
    Skill:   ['#33b56a', '#0a3b23', '#a6f0c2'],
    Heart:   ['#e0453f', '#4a0c0e', '#ffb0a4'],
    Bravery: ['#e3b52c', '#4a3506', '#fff0a6'],
    Wisdom:  ['#9a5ae0', '#2a0f4d', '#dcc0ff'],
  };
  const registry = new Map();
  const fbCache = new Map();

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  /** Generated portrait for anything without (working) art. */
  function fallback(def) {
    const key = (def && def.id) || 'x';
    if (fbCache.has(key)) return fbCache.get(key);
    const [c1, c2, glow] = EL[(def && def.element)] || EL.Body;
    const ini = esc(initials(def && def.name));
    const k = esc((def && def.kanji) || (global.Rules ? Rules.ELEMENT_KANJI[def && def.element] : '') || '呪');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
<defs><linearGradient id="g" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="#05080a"/></linearGradient>
<radialGradient id="r" cx=".5" cy=".45" r=".55"><stop offset="0" stop-color="${glow}" stop-opacity=".5"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>
<rect width="300" height="400" fill="url(#g)"/><circle cx="150" cy="190" r="150" fill="url(#r)"/>
<text x="150" y="250" text-anchor="middle" font-family="serif" font-size="170" font-weight="700" fill="#fff" fill-opacity=".12">${k}</text>
<path d="M20,400 C30,320 90,290 150,290 C210,290 270,320 280,400z" fill="#0b0f14" stroke="${glow}" stroke-opacity=".55" stroke-width="3"/>
<ellipse cx="150" cy="196" rx="58" ry="66" fill="#0b0f14" stroke="${glow}" stroke-opacity=".55" stroke-width="3"/>
<text x="150" y="214" text-anchor="middle" font-family="Georgia,serif" font-size="46" font-weight="700" fill="${glow}">${ini}</text>
<rect x="4" y="4" width="292" height="392" fill="none" stroke="#c9a24e" stroke-opacity=".7" stroke-width="2"/></svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    fbCache.set(key, url);
    return url;
  }

  function src(def, kind) {
    const a = def && def.art;
    const u = a && (kind === 'full' ? a.full || a.portrait : a.portrait || a.full);
    return u || fallback(def);
  }

  /** <img> markup with lazy loading and an automatic generated fallback. */
  function img(def, kind, opts) {
    const o = opts || {};
    if (def && def.id) registry.set(def.id, def);
    const lazy = o.eager ? '' : ' loading="lazy"';
    return `<img class="${esc(o.cls || 'art')}" src="${esc(src(def, kind))}" alt="${esc(o.alt != null ? o.alt : (def && def.name) || '')}"${lazy} decoding="async" draggable="false" data-art-id="${esc(def && def.id)}" onerror="Art.onErr(this)">`;
  }

  function onErr(el) {
    if (el.dataset.fb) return;
    el.dataset.fb = '1';
    el.src = fallback(registry.get(el.dataset.artId) || { id: el.dataset.artId, name: el.alt });
  }

  function orb(element) {
    return 'assets/ui/jjk/orb_' + String(element || 'body').toLowerCase() + '.webp';
  }

  global.Art = { src, img, fallback, onErr, orb, initials, COLORS: EL };
})(window);
