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
    menu: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    gift: '<rect x="4" y="9" width="16" height="11"/><path d="M3 9h18M12 9v11M12 9C10 5 6 5 7 8M12 9c2-4 6-4 5-1"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M9 5L4 10l5 5"/><path d="M4 10h10.5a5 5 0 0 1 0 10H11"/>',
    attack: '<path d="M14.5 4H20v5.5L9 20.5 3.5 15z"/><path d="M6 13l5 5M3 21l2.5-2.5"/>',
  };
  const icon = (name, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

  const CUBE_SVG = '<svg class="cur-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l9 5v10l-9 5-9-5V7z" fill="#7c5cff"/><path d="M12 2l9 5-9 5-9-5z" fill="#b9a6ff"/><path d="M12 12v10l9-5V7z" fill="#4a2fc2"/><path d="M12 6.5l3.5 2-3.5 2-3.5-2z" fill="#fff" opacity=".7"/></svg>';
  const YEN_SVG = '<svg class="cur-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#c9a24e"/><circle cx="12" cy="12" r="7.6" fill="none" stroke="#6e5320" stroke-width="1.4"/><path d="M8.5 7l3.5 5 3.5-5M12 12v6M9 13h6M9 15.5h6" stroke="#3a2a08" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  const STAM_SVG = '<svg class="cur-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#0f5a5e"/><path d="M13 4L6 14h5l-1 6 7-10h-5z" fill="#7ff2e0"/></svg>';

  // Phantom Parade order: Formation · Missions · Home · Summon · Shop, then the square Menu plate.
  // `pages` lists the pages that light a plate up (the Formation hub covers Sorcerers + Teams).
  const NAV = [
    { id: 'formation', href: 'formation.html', label: 'Formation', icon: 'units', pages: ['formation', 'characters', 'teams'] },
    { id: 'missions', href: 'missions.html', label: 'Missions', icon: 'missions', pages: ['missions', 'battle'] },
    { id: 'home', href: 'home.html', label: 'Home', icon: 'home', pages: ['home'] },
    { id: 'summon', href: 'summon.html', label: 'Summon', icon: 'summon', pages: ['summon'] },
    { id: 'shop', href: 'shop.html', label: 'Shop', icon: 'shop', pages: ['shop'] },
    { id: 'settings', href: 'settings.html', label: 'Menu', icon: 'menu', pages: ['settings'], menu: true },
  ];
  const HELP = {
    home: 'Your home sorcerer greets you here. Tap Change to pick another one. The Quest card continues the story; the banner on the left opens the current pickup summon.',
    formation: 'Enhance Sorcerers to level them up with talismans, or open Team Formation to set 4 Main fighters and 1 Backup (support).',
    characters: 'Tap a sorcerer to open Enhance: level up with talismans, read Command Skills (Attack, Skill 1, Skill 2, Ultimate) and Auto-Skills.',
    teams: 'Tap a slot, then pick a sorcerer below. The Backup does not fight; its support skill boosts the whole Main line. Type advantage: 影 Blue › 夜 Green › 幻 Red › 影 Blue.',
    summon: 'Spend Cursed Cubes or tickets. Every 10x summon guarantees an SR or better; pickup banners have a pity counter for the featured SSR.',
    missions: 'Clear stages for Yen, EXP and first-clear Cubes. 3 stars: clear, nobody knocked out, and within the turn goal.',
    shop: 'Trade Yen and Cubes for talismans, stamina and summon tickets. The daily gift resets every day.',
    settings: 'Audio, display, account and save data. The Portal tab moves sorcerers and currency between games.',
    battle: 'Tap an enemy to target it, then choose Attack, Skill 1, Skill 2 or the Ultimate. Attacks build cursed energy (呪力); skills spend it.',
  };

  /* ---------- viewport classes (the CSS keys compact rules on them) ---------- */
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
  /* ---------- Phantom Parade type + rarity badges ---------- */
  /** Type name for a def / colour / element: 'Red' | 'Blue' | 'Green' | 'Yellow' | 'Purple'. */
  const typeOf = (x) => Art.typeOf(x);
  const typeKanji = (x) => Art.TYPES[typeOf(x)].kanji;
  /** Type diamond (幻 Red, 影 Blue, 夜 Green, 行 Yellow; purple for curses). */
  function typeBadge(x, cls) {
    const t = typeOf(x);
    const label = t + ' type (' + Art.TYPES[t].kanji + ')';
    return `<img class="type-ic ${cls || ''}" src="${Art.typeIcon(t)}" alt="${esc(label)}" title="${esc(label)}" width="22" height="22" draggable="false">`;
  }
  /** "幻 Red" label coloured by type. */
  const typeLabel = (x) => { const t = typeOf(x); return `<span class="type-name t-${t.toLowerCase()}">${Art.TYPES[t].kanji} ${t}</span>`; };
  /** 'SSR' | 'SR' | 'R' from a def (rarityLabel) or an internal rarity number. */
  function rarityOf(x) {
    if (x && typeof x === 'object') { if (x.rarityLabel) return x.rarityLabel; x = x.rarity; }
    const n = Number(x) || 0;
    return n >= 6 ? 'SSR' : n === 5 ? 'SR' : 'R';
  }
  function rarityBadge(x, cls) {
    const r = rarityOf(x);
    if (r === 'R') return `<span class="rar-ic is-r ${cls || ''}" title="R">R</span>`;
    return `<img class="rar-ic is-${r.toLowerCase()} ${cls || ''}" src="assets/pp/ui/${r}.webp" alt="${r}" title="${r}" draggable="false">`;
  }
  /** Cream "体·Attacker" tag (focus kanji + role). */
  const focusTag = (d) => (d && (d.focusKanji || d.role) ? `<span class="focus-tag">${d.focusKanji ? `<i>${esc(d.focusKanji)}</i>` : ''}${esc(d.role || d.focus || '')}</span>` : '');
  /** Older callers: the type badge replaces the element orb. */
  const orb = (el, cls) => typeBadge(el, 'orb ' + (cls || ''));

  /** Phantom Parade unit icon for any def (own unit, guest, Portal card).
   *  opts: { tag, id, level, badge, extra, cls, picked, dim, title } */
  function unitTile(d, opts) {
    const o = opts || {};
    const tag = o.tag || 'button';
    const hasIcon = !!(d.art && d.art.icon);
    const r = rarityOf(d);
    const cls = ['ucard', 't-' + typeOf(d).toLowerCase(), 'is-' + r.toLowerCase(), hasIcon ? 'has-icon' : '', d.rarity >= 7 || d.limited ? 'is-limited' : '', o.picked ? 'is-picked' : '', o.dim ? 'is-dim' : '', o.cls || ''].filter(Boolean).join(' ');
    if (o.wide) {
      // roster card: wide card art, rarity frame, type diamond, dupe hexagon, Lv strip
      return `<${tag} class="${cls} is-wide"${o.id != null ? ` data-id="${esc(o.id)}"` : ''}${tag === 'button' ? ' type="button"' : ''} title="${esc(o.title || (d.name + (d.title ? ' — ' + d.title : '')))}">
        <span class="uc-art">${Art.img(d, 'full')}${typeBadge(d, 'uc-type')}${rarityBadge(d, 'uc-rar')}
          ${o.dupes ? `<span class="uc-hex">${esc(o.dupes)}</span>` : ''}
          <span class="uc-strip"><span class="uc-name">${esc(d.name)}</span>${o.level != null ? `<span class="uc-lv">Lv<b>${esc(o.level)}</b></span>` : ''}</span>${o.badge || ''}${o.extra || ''}</span>
      </${tag}>`;
    }
    return `<${tag} class="${cls}"${o.id != null ? ` data-id="${esc(o.id)}"` : ''}${tag === 'button' ? ' type="button"' : ''} title="${esc(o.title || (d.name + (d.title ? ' — ' + d.title : '')))}">
      <span class="uc-art">${Art.img(d, 'icon')}${hasIcon ? '' : typeBadge(d, 'uc-type')}${rarityBadge(d, 'uc-rar')}
        ${o.level != null ? `<span class="uc-lv">Lv<b>${esc(o.level)}</b></span>` : ''}${o.badge || ''}${o.extra || ''}</span>
      <span class="uc-foot"><span class="uc-name">${esc(d.name)}</span>${o.tag2 === false ? '' : focusTag(d)}</span>
    </${tag}>`;
  }

  /** Roster card for a Rules.unitView(). opts: { tag, picked, dim, extra, cls, badge } */
  function unitCard(v, opts) {
    const o = opts || {};
    const d = v.def;
    const badge = d.guest ? '<span class="uc-badge badge is-guest">GUEST</span>' : (o.badge || '');
    return unitTile(d, Object.assign({}, o, { id: v.id, level: v.unit.level, dupes: v.unit.dupes, badge }));
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
    const onKey = (e) => { if (e.key === 'Escape' && o.dismissable !== false) close(); };
    document.addEventListener('keydown', onKey);
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
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
      <a class="hud-cur" href="shop.html" title="Yen">${YEN_SVG}<b id="hud-yen">0</b><i class="hud-plus">${icon('plus')}</i></a>
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

  /* red "!" notification dots on the nav plates (presentation only) */
  function paintDots() {
    const s = Save.get();
    if (!s) return;
    const want = {
      shop: s.daily && s.daily.daily_gift !== Rules.today(),
      summon: (s.items && s.items.ticket > 0) || (s.currency && s.currency.cubes >= 45),
      settings: !!(global.PortalPort && PortalPort.pendingTx && PortalPort.pendingTx.length) || (s.daily && s.daily.daily_gift !== Rules.today()),
    };
    $$('.dock-btn').forEach((a) => {
      const on = !!want[a.dataset.nav];
      let dot = a.querySelector('.nav-dot');
      if (on && !dot) { dot = document.createElement('i'); dot.className = 'nav-dot'; dot.textContent = '!'; dot.setAttribute('aria-hidden', 'true'); a.appendChild(dot); }
      if (!on && dot) dot.remove();
    });
  }

  function buildShell(cfg) {
    const body = document.body;
    const page = body.dataset.page || '';
    const main = $('#main');
    const top = document.createElement('div');
    top.className = 'topbar';
    const back = cfg.back === false ? '' : `<a class="jjk-icon-btn jjk-back" href="${esc(cfg.back || 'home.html')}" aria-label="Back">${icon('back')}</a>`;
    const head = cfg.header ? cfg.header() : `<header class="jjk-page-header">${back}<h1 class="jjk-title-plate"><span>${esc(body.dataset.title || '')}</span>${body.dataset.sub ? `<small class="plate-sub">${esc(body.dataset.sub)}</small>` : ''}</h1></header>`;
    const help = HELP[page] ? `<button class="pp-stone help-btn" id="help" type="button" aria-label="Help" title="Help">?</button>` : '';
    top.innerHTML = `${head}<div class="top-right">${cfg.hud === false ? '<div class="hud"><span id="portal-slot"></span></div>' : hudHtml()}${help}</div>`;
    const hb = top.querySelector('#help');
    if (hb) hb.addEventListener('click', () => modal(`<p class="help-text">${esc(HELP[page])}</p>`, { title: (body.dataset.title || 'Help') + ' · Help', cls: 'is-small' }));
    body.insertBefore(top, main);
    if (cfg.nav !== false) {
      const nav = document.createElement('nav');
      nav.className = 'dock';
      nav.setAttribute('aria-label', 'Main');
      nav.innerHTML = NAV.map((n) => {
        const on = n.pages.includes(page);
        return `<a class="dock-btn${on ? ' active' : ''}${n.menu ? ' is-menu' : ''}" href="${n.href}" data-nav="${n.id}"${n.id === page ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a>`;
      }).join('');
      body.appendChild(nav);
      const mb = nav.querySelector('.is-menu');
      // the Menu modal lives in js/pp-menu.js (window.PPMenu); without it the plate opens Settings
      if (mb) mb.addEventListener('click', (e) => { if (global.PPMenu && typeof PPMenu.open === 'function') { e.preventDefault(); PPMenu.open(); } });
      paintDots();
      Save.onChange(paintDots);
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
  // The roster only keeps units with real art. Units in an older save that
  // are no longer in data/characters.json (and aren't Portal guests) are
  // removed from the box and teams and refunded in Yen, once.
  function retireUnits() {
    if (!Save.exists() || !Data.characters.length) return;
    const s = Save.get();
    const gone = Object.keys(s.units || {}).filter((id) => !Data.char(id) && !(s.guests || {})[id]);
    if (!gone.length) return;
    const refund = gone.length * 3000;
    Save.update((st) => {
      gone.forEach((id) => { delete st.units[id]; });
      st.teams.forEach((t) => {
        t.slots = t.slots.map((x) => (gone.includes(x) ? null : x));
        if (gone.includes(t.support)) t.support = null;
      });
      if (gone.includes(st.profile.homeUnit)) st.profile.homeUnit = null;
      st.currency.yen += refund;
    });
    toast(gone.length + ' retired sorcerer' + (gone.length === 1 ? '' : 's') + ' refunded: ¥' + fmt(refund));
  }

  function boot(cfg) {
    const c = cfg || {};
    if (c.requireSave !== false && !Save.exists()) { global.location.replace('index.html'); return; }
    const start = () => {
      try { if (c.shell !== false) buildShell(c); } catch (e) { errorPanel(e); return; }
      if (global.PortalPort) PortalPort.init();
      Data.all(...(c.data || ['characters']))
        .then(() => { retireUnits(); return c.init ? c.init() : null; })
        .catch(errorPanel);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  global.UI = { $, $$, esc, fmt, fmtShort, icon, stars, orb, typeOf, typeKanji, typeBadge, typeLabel, rarityOf, rarityBadge, focusTag, unitTile, unitCard, itemIcon, toast, modal, confirm: confirmBox, sfx, boot, paintHud, NAV, CUBE_SVG, YEN_SVG, STAM_SVG };
})(window);
