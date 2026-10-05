/* js/ui.js — shared page shell and widgets.
 * Pages put their content in <main id="main"> and call
 *   UI.boot({ data: ['characters'], init() { ... } })
 * which gates on a save, builds the header plate + currency HUD + nav dock,
 * connects to the Portal once, loads the data files and then runs init().
 * <body data-page="teams" data-title="Teams" data-sub="編成 · Formation">
 */
(function (global) {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const fmtShort = (n) => {
    n = Math.round(Number(n) || 0);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return fmt(n);
  };

  /* ---------- line icons (stroke = currentColor) ---------- */
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10"/>',
    units: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c3 .2 5.5 2.4 5.5 5.8"/>',
    teams: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    summon: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7"/>',
    missions: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    shop: '<path d="M4 8h16l-1.5 12h-13z"/><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    portal: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16M12 4c-3 2.5-3 13.5 0 16"/>',
    exit: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const icon = (name, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

  const CUBE_SVG = '<svg class="cur-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l9 5v10l-9 5-9-5V7z" fill="#7c5cff"/><path d="M12 2l9 5-9 5-9-5z" fill="#b9a6ff"/><path d="M12 12v10l9-5V7z" fill="#4a2fc2"/><path d="M12 6.5l3.5 2-3.5 2-3.5-2z" fill="#fff" opacity=".7"/></svg>';
  const YEN_SVG = '<svg class="cur-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#c9a24e"/><circle cx="12" cy="12" r="7.6" fill="none" stroke="#6e5320" stroke-width="1.4"/><path d="M8.5 7l3.5 5 3.5-5M12 12v6M9 13h6M9 15.5h6" stroke="#3a2a08" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  const STAM_SVG = '<svg class="cur-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#0f5a5e"/><path d="M13 4L6 14h5l-1 6 7-10h-5z" fill="#7ff2e0"/></svg>';

  const NAV = [
    { id: 'home', href: 'home.html', label: 'Home', icon: 'home' },
    { id: 'characters', href: 'characters.html', label: 'Sorcerers', icon: 'units' },
    { id: 'teams', href: 'teams.html', label: 'Teams', icon: 'teams' },
    { id: 'summon', href: 'summon.html', label: 'Summon', icon: 'summon' },
    { id: 'missions', href: 'missions.html', label: 'Missions', icon: 'missions' },
    { id: 'shop', href: 'shop.html', label: 'Shop', icon: 'shop' },
    { id: 'settings', href: 'settings.html', label: 'Settings', icon: 'settings' },
  ];

  /* ---------- viewport classes (theme-jjk.css keys compact rules on them) ---------- */
  function sizeClasses() {
    const h = global.innerHeight, w = global.innerWidth;
    const root = document.documentElement;
    root.classList.toggle('is-landscape', w > h);
    root.classList.toggle('is-compact', h <= 520);
    root.classList.toggle('is-mobile', h <= 520 || w <= 720);
  }
  sizeClasses();
  global.addEventListener('resize', sizeClasses);

  /* ---------- small widgets ---------- */
  function stars(n, max) {
    let s = '';
    for (let i = 0; i < n; i++) s += '<i class="star on">★</i>';
    for (let i = n; i < (max || 0); i++) s += '<i class="star">★</i>';
    return `<span class="stars r${n}">${s}</span>`;
  }
  const orb = (el, cls) => `<img class="orb ${cls || ''}" src="${Art.orb(el)}" alt="${esc(el)}" title="${esc(el)}" width="18" height="18">`;

  /** Roster card for a Rules.unitView(). opts: { tag, picked, dim, extra, cls } */
  function unitCard(v, opts) {
    const o = opts || {};
    const tag = o.tag || 'button';
    const d = v.def;
    const badge = d.guest ? '<span class="uc-badge badge is-guest">GUEST</span>' : (o.badge || '');
    return `<${tag} class="ucard r${Math.min(7, Math.max(3, d.rarity))}${o.picked ? ' is-picked' : ''}${o.dim ? ' is-dim' : ''} ${o.cls || ''}" data-id="${esc(v.id)}"${tag === 'button' ? ' type="button"' : ''} title="${esc(d.name + ' — ' + d.title)}">
      ${Art.img(d, 'portrait')}
      <img class="uc-orb" src="${Art.orb(d.element)}" alt="${esc(d.element)}" width="20" height="20">
      ${badge}${o.extra || ''}
      <span class="uc-foot"><span class="uc-name">${esc(d.name)}</span>
      <span class="uc-meta">${stars(d.rarity)}<span>Lv${v.unit.level}</span></span></span>
    </${tag}>`;
  }

  const ITEM_CLASS = { talisman_s: '', talisman_m: 't-m', talisman_l: 't-l', ticket: 't-ticket' };
  function itemIcon(id, items) {
    const it = items && items[id];
    return `<span class="talisman ${ITEM_CLASS[id] || ''}" data-k="${esc(it ? it.kanji : '札')}" aria-hidden="true"></span>`;
  }

  function toast(text, kind) {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  /** Modal: returns { el, close }. opts: { title, sub, cls, onClose, dismissable } */
  function modal(html, opts) {
    const o = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal jjk-panel ${esc(o.cls || '')}" role="dialog" aria-modal="true">
      ${o.title ? `<div class="modal-head"><h2>${esc(o.title)}</h2>${o.sub ? `<span class="modal-sub">${esc(o.sub)}</span>` : ''}
      <button class="modal-x" type="button" aria-label="Close">${icon('close')}</button></div>` : ''}
      <div class="modal-body">${html}</div></div>`;
    document.body.appendChild(wrap);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 180);
      if (o.onClose) o.onClose();
    };
    const x = wrap.querySelector('.modal-x');
    if (x) x.addEventListener('click', close);
    if (o.dismissable !== false) wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    requestAnimationFrame(() => wrap.classList.add('in'));
    return { el: wrap.querySelector('.modal'), wrap, close };
  }

  function confirmBox(text, okLabel, title) {
    return new Promise((resolve) => {
      let answered = false;
      const m = modal(`<p class="confirm-text">${esc(text)}</p>
        <div class="modal-actions"><button class="jjk-btn" data-a="no" type="button">Cancel</button>
        <button class="jjk-btn is-primary" data-a="yes" type="button">${esc(okLabel || 'OK')}</button></div>`,
      { title: title || 'Confirm', cls: 'is-small', onClose: () => { if (!answered) resolve(false); } });
      m.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        answered = true;
        resolve(b.dataset.a === 'yes');
        m.close();
      });
    });
  }

  /* ---------- tiny WebAudio blips (Settings › Audio) ---------- */
  let actx = null;
  function sfx(kind) {
    const s = Save.get();
    if (!s || !s.settings.sfx) return;
    try {
      actx = actx || new (global.AudioContext || global.webkitAudioContext)();
      const vol = (s.settings.volume || 70) / 100 * 0.08;
      const o = actx.createOscillator();
      const g = actx.createGain();
      const t = actx.currentTime;
      const tones = { tap: [660, 0.05, 'triangle'], hit: [160, 0.09, 'square'], crit: [90, 0.16, 'sawtooth'], heal: [880, 0.12, 'sine'], win: [523, 0.35, 'triangle'], lose: [110, 0.4, 'sine'], pull: [440, 0.2, 'triangle'], rare: [988, 0.4, 'sine'] };
      const [f, d, type] = tones[kind] || tones.tap;
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (kind === 'win' || kind === 'rare') o.frequency.exponentialRampToValueAtTime(f * 2, t + d);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + d + 0.02);
    } catch (_) { /* audio unavailable */ }
  }

  /* ---------- HUD ---------- */
  function hudHtml() {
    return `<div class="hud">
      <a class="hud-cur" href="shop.html#stamina" title="Stamina">${STAM_SVG}<b id="hud-stam">0/0</b><small id="hud-stam-t"></small></a>
      <a class="hud-cur" href="shop.html#summon" title="Cursed Cubes">${CUBE_SVG}<b id="hud-cubes">0</b><i class="hud-plus">${icon('plus')}</i></a>
      <a class="hud-cur" href="shop.html" title="Yen">${YEN_SVG}<b id="hud-yen">0</b></a>
      <span id="portal-slot"></span>
    </div>`;
  }

  function paintHud() {
    const s = Save.get();
    if (!s) return;
    const st = Rules.staminaNow(s);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('hud-stam', st.cur + '/' + st.max);
    if (st.nextIn > 0) {
      const sec = Math.ceil(st.nextIn / 1000);
      set('hud-stam-t', Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'));
    } else set('hud-stam-t', '');
    set('hud-cubes', fmtShort(s.currency.cubes));
    set('hud-yen', fmtShort(s.currency.yen));
  }

  function buildShell(cfg) {
    const body = document.body;
    const page = body.dataset.page || '';
    const main = $('#main');
    const top = document.createElement('div');
    top.className = 'topbar';
    const back = cfg.back === false ? '' : `<a class="jjk-icon-btn jjk-back" href="${esc(cfg.back || 'home.html')}" aria-label="Back"><img src="assets/ui/jjk/back_arrow.webp" alt=""></a>`;
    top.innerHTML = `<header class="jjk-page-header">${back}<h1 class="jjk-title-plate"><span>${esc(body.dataset.title || '')}</span>${body.dataset.sub ? `<small class="plate-sub">${esc(body.dataset.sub)}</small>` : ''}</h1></header>${cfg.hud === false ? '<div class="hud"><span id="portal-slot"></span></div>' : hudHtml()}`;
    body.insertBefore(top, main);
    if (cfg.nav !== false) {
      const nav = document.createElement('nav');
      nav.className = 'dock';
      nav.setAttribute('aria-label', 'Main');
      nav.innerHTML = NAV.map((n) => `<a class="dock-btn${n.id === page ? ' active' : ''}" href="${n.href}"${n.id === page ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a>`).join('');
      body.appendChild(nav);
    }
    paintHud();
    Save.onChange(paintHud);
    const st = Save.get();
    document.documentElement.classList.toggle('reduce-motion', !!(st && st.settings.reduceMotion));
    setInterval(paintHud, 1000);
  }

  function errorPanel(err) {
    console.error(err);
    const main = $('#main');
    if (main) main.innerHTML = `<div class="jjk-panel error-panel"><h2>Something went wrong</h2><p>${esc(err && err.message ? err.message : err)}</p><a class="jjk-btn" href="home.html">Back to Jujutsu High</a></div>`;
  }

  /** Page entry point. */
  function boot(cfg) {
    const c = cfg || {};
    if (c.requireSave !== false && !Save.exists()) { global.location.replace('index.html'); return; }
    const start = () => {
      try { if (c.shell !== false) buildShell(c); } catch (e) { errorPanel(e); return; }
      if (global.PortalPort) PortalPort.init();
      Data.all(...(c.data || ['characters']))
        .then(() => (c.init ? c.init() : null))
        .catch(errorPanel);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  global.UI = { $, $$, esc, fmt, fmtShort, icon, stars, orb, unitCard, itemIcon, toast, modal, confirm: confirmBox, sfx, boot, paintHud, NAV, CUBE_SVG, YEN_SVG, STAM_SVG };
})(window);
