/* js/pp-menu.js — the Phantom Parade "Menu" popup (opens from the square
 * Menu plate in the bottom nav).
 *
 *   PPMenu.open()     show the menu
 *   PPMenu.close()    hide it
 *
 * Self-contained: it injects css/pp-menu.css next to itself, builds its own
 * overlay and only reads the save (for the red "!" badges). Help and
 * Announcements open as UI.modal popups when js/ui.js is loaded.
 */
(function (global) {
  'use strict';

  const VERSION = '1.4';
  const NOTES = [
    ['1.4', 'Phantom Parade look', 'Serif type, slate panels with bronze trim, parchment buttons, the Menu popup, a Profile page, the Formation hub and the Exchange-style Shop.'],
    ['1.3', 'Focus', 'Every unit shows its Phantom Parade focus: 体 Physical, 呪 Jujutsu or 複 Combined.'],
    ['1.2', 'Opponents with art', 'Every enemy is now a Phantom Parade character: rival sorcerers and cursed spirits.'],
    ['1.1', 'Phantom Parade roster', '53 units with their wiki epithets, types, Skill 1 / Skill 2, ultimates and auto skills.'],
    ['1.0', 'Release', 'Summon, teams, 20 story stages, the shop and the Portal.'],
  ];
  const HELP = [
    ['Build a team', 'Formation › Team Formation: put 4 sorcerers in the Main line and 1 in Backup. The Backup does not fight; its support skill lifts the whole team.'],
    ['Fight', 'Missions: pick a stage. Attack builds cursed energy (呪力); Skill 1 and Skill 2 spend it; the Ultimate charges as you fight.'],
    ['Types', '影 Blue beats 夜 Green, 夜 Green beats 幻 Red, 幻 Red beats 影 Blue; 行 Yellow is strong against curses.'],
    ['Grow', 'Formation › Enhance Sorcerers: use Training Lights (and JP) for EXP. Farm them in the Training Light Quest, and claim the daily gift every day.'],
    ['Summon', '300 Cubes a draw, 3,000 for 10. Each pickup draw earns a Gacha Point; 250 points exchange for a featured unit.'],
  ];

  const here = (document.currentScript && document.currentScript.src) || '';
  const base = here ? here.replace(/js\/pp-menu\.js(\?.*)?$/, '') : '';
  const mem = (id) => base + 'assets/pp/memories/' + id + '/art.webp';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // stylesheet next to this script (works under any subpath)
  if (!document.querySelector('link[data-pp-menu]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = base + 'css/pp-menu.css';
    l.setAttribute('data-pp-menu', '');
    document.head.appendChild(l);
  }

  const ICON = {
    news: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.8 1.7-2.6 3-2.6s2.4.8 3 2.6M14 10h4M14 13h4"/>',
    units: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c3 .2 5.5 2.4 5.5 5.8"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5"/>',
  };
  const ic = (n) => `<svg class="ppm-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

  let wrap = null;
  let onKey = null;

  function today() {
    if (global.Rules && Rules.today) return Rules.today();
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function seenNotes() {
    try { return global.Save && Save.pref ? Save.pref('menu_notes') === VERSION : true; } catch (_) { return true; }
  }

  function html() {
    const s = global.Save && Save.exists && Save.exists() ? Save.get() : null;
    const giftDue = !!(s && s.daily && s.daily.daily_gift !== today());
    const portalDue = !!(global.PortalPort && PortalPort.pendingTx && PortalPort.pendingTx.length);
    const dot = (on) => (on ? '<i class="ppm-dot" aria-hidden="true">!</i>' : '');
    const card = (href, img, label, on) => `<a class="ppm-card" href="${base}${href}"><span class="ppm-card-art" style="background-image:url('${mem(img)}')"></span><span class="ppm-card-label">${label}</span>${dot(on)}</a>`;
    const pill = (attr, label, icon, on) => `<${attr.startsWith('href') ? 'a' : 'button type="button"'} class="ppm-pill" ${attr}>${icon ? ic(icon) : ''}<span>${label}</span>${dot(on)}</${attr.startsWith('href') ? 'a' : 'button'}>`;
    const go = (h) => `href="${base}${h}"`;
    return `<div class="ppm" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="ppm-title">
      <div class="ppm-panel">
        <h2 class="ppm-title" id="ppm-title">Menu</h2>
        <div class="ppm-cards">
          ${card('missions.html', 'a-fight-to-death', 'Quest', false)}
          ${card('shop.html', 'street-stall-shopping-and-eating', 'Exchange', giftDue)}
          ${card('settings.html#portal', 'non-standard', 'Portal', portalDue)}
        </div>
        <div class="ppm-row is-3">
          ${pill('data-ppm="news"', 'Announcement', 'news', !seenNotes())}
          ${pill(go('profile.html'), 'Profile', 'card')}
          ${pill(go('characters.html'), 'Sorcerers', 'units')}
        </div>
        <div class="ppm-row is-4">
          ${pill(go('settings.html#audio'), 'Settings')}
          ${pill('data-ppm="help"', 'Help')}
          ${pill(go('settings.html#display'), 'Display')}
          ${pill(go('settings.html#account'), 'Account')}
        </div>
        <div class="ppm-row is-3">
          ${pill(go('settings.html#data'), 'Data')}
          ${pill(go('settings.html#portal'), 'Gift Code')}
          ${pill(go('missions.html'), 'Missions')}
        </div>
        <div class="ppm-foot">
          <a class="ppm-stone is-square" href="${base}missions.html" aria-label="Missions" title="Missions">${ic('trophy')}</a>
          <a class="ppm-stone" href="${base}index.html">Go to Title</a>
        </div>
      </div>
      <button class="ppm-close" type="button" data-ppm="close">Close</button>
    </div>`;
  }

  function sub(body, title) {
    if (global.UI && UI.modal) return UI.modal(body, { title, cls: 'is-small ppm-sub' });
    alert(title);
    return null;
  }
  function help() {
    sub(`<ol class="ppm-help">${HELP.map(([h, t]) => `<li><b>${esc(h)}</b><span>${esc(t)}</span></li>`).join('')}</ol>`, 'Help · How to play');
  }
  function news() {
    try { if (global.Save && Save.pref) Save.pref('menu_notes', VERSION); } catch (_) { /* prefs unavailable */ }
    sub(`<ul class="ppm-news">${NOTES.map(([v, h, t], i) => `<li${i === 0 ? ' class="is-new"' : ''}><span class="ppm-ver">v${esc(v)}</span><b>${esc(h)}</b><span>${esc(t)}</span></li>`).join('')}</ul>`, 'Announcements');
  }

  function close() {
    if (!wrap) return;
    const w = wrap;
    wrap = null;
    document.removeEventListener('keydown', onKey);
    w.classList.remove('in');
    setTimeout(() => w.remove(), 180);
  }

  function open() {
    if (wrap) return;
    wrap = document.createElement('div');
    wrap.className = 'ppm-wrap';
    wrap.innerHTML = html();
    document.body.appendChild(wrap);
    onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-wrap')) close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.classList.contains('ppm')) { close(); return; }
      const b = e.target.closest('[data-ppm]');
      if (!b) { if (e.target.closest('a')) close(); return; }
      const act = b.dataset.ppm;
      if (act === 'close') close();
      else if (act === 'help') { close(); help(); } else if (act === 'news') { close(); news(); }
    });
    if (global.UI && UI.sfx) UI.sfx('tap');
    requestAnimationFrame(() => { if (wrap) { wrap.classList.add('in'); wrap.querySelector('.ppm').focus({ preventScroll: true }); } });
  }

  global.PPMenu = { open, close, VERSION };
})(window);
