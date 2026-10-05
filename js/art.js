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
    const u = a && (kind === 'full' ? a.full || a.portrait
      : kind === 'icon' ? a.icon || a.full || a.portrait
        : a.portrait || a.full);
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

  /* Phantom Parade unit types: 幻 Red (Heart), 影 Blue (Body), 夜 Green (Skill),
   * 行 Yellow (Bravery). Wisdom curses keep a drawn purple diamond. */
  const TYPES = {
    Red:    { kanji: '幻', img: 'assets/pp/ui/RedType.webp' },
    Blue:   { kanji: '影', img: 'assets/pp/ui/BlueType.webp' },
    Green:  { kanji: '夜', img: 'assets/pp/ui/GreenType.webp' },
    Yellow: { kanji: '行', img: 'assets/pp/ui/YellowType.webp' },
    Purple: { kanji: '呪', img: '' },
  };
  const EL_TYPE = { Heart: 'Red', Body: 'Blue', Skill: 'Green', Bravery: 'Yellow', Wisdom: 'Purple' };
  let purpleUrl = '';
  function purpleDiamond() {
    if (purpleUrl) return purpleUrl;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 2 62 32 32 62 2 32z" fill="#2a1446" stroke="#d8b8ff" stroke-width="3"/><path d="M32 9 55 32 32 55 9 32z" fill="#1a0c2e" stroke="#a174e6" stroke-width="2"/><text x="32" y="42" text-anchor="middle" font-family="serif" font-size="28" font-weight="700" fill="#d9c2ff">呪</text></svg>`;
    purpleUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return purpleUrl;
  }
  /** Type name ('Red' …) for a def, a colour or an internal element. */
  function typeOf(x) {
    if (!x) return 'Purple';
    if (typeof x === 'string') return TYPES[x] ? x : (EL_TYPE[x] || 'Purple');
    return (x.color && TYPES[x.color]) ? x.color : (EL_TYPE[x.element] || 'Purple');
  }
  function typeIcon(x) { const t = TYPES[typeOf(x)]; return t.img || purpleDiamond(); }
  /** Kept for older callers: now returns the Phantom Parade type badge. */
  function orb(element) { return typeIcon(element); }

    global.Art = { src, img, fallback, onErr, orb, typeOf, typeIcon, TYPES, initials, COLORS: EL };
})(window);
