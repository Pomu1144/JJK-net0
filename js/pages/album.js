/* album.html — the Album: every Recollection (memory) scene from
 * assets/pp/memories with its title from assets/pp/manifest.json, and the card
 * art of every sorcerer you own. Tap a picture to view it full screen
 * (← / → or swipe to step through, Esc or tap outside to close). */
(function () {
  'use strict';
  const { $, $$, esc } = UI;
  let tab = 'memories';
  let memories = [];
  let list = [];      // what the open tab shows: [{ src, title, sub }]
  let viewer = null;
  let at = 0;

  const RAR = { SSR: 3, SR: 2, R: 1 };

  function units() {
    return Rules.ownedList()
      .filter((v) => v && v.def && v.def.art && v.def.art.full)
      .sort((a, b) => (b.def.rarity - a.def.rarity) || a.def.name.localeCompare(b.def.name))
      .map((v) => ({ src: v.def.art.full, title: v.def.name, sub: v.def.title || '', rar: UI.rarityOf(v.def), def: v.def }));
  }

  function render() {
    const own = units();
    const total = Data.characters.filter((c) => c.art && c.art.full).length;
    list = tab === 'memories' ? memories : own;
    $('#main').innerHTML = `<div class="alb">
      <div class="alb-tabs" role="tablist">
        <button class="jjk-tab${tab === 'memories' ? ' active' : ''}" type="button" role="tab" aria-selected="${tab === 'memories'}" data-tab="memories">Recollections <small>${memories.length}</small></button>
        <button class="jjk-tab${tab === 'units' ? ' active' : ''}" type="button" role="tab" aria-selected="${tab === 'units'}" data-tab="units">Characters <small>${own.length} / ${total}</small></button>
      </div>
      <div class="alb-grid${tab === 'units' ? ' is-units' : ''}">${list.length ? list.map((m, i) => `
        <button class="alb-card is-${esc((m.rar || 'r').toLowerCase())}" type="button" data-i="${i}" title="${esc(m.title)}">
          <span class="alb-art"><img src="${esc(m.src)}" alt="" loading="lazy" decoding="async"></span>
          <span class="alb-cap">${m.def ? UI.rarityBadge(m.def) : m.rar ? `<i class="alb-rar">${esc(m.rar)}</i>` : ''}<b>${esc(m.title)}</b>${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</span>
        </button>`).join('') : '<p class="muted alb-empty">Nothing here yet — draw on the Gacha to add sorcerers.</p>'}</div>
    </div>`;
  }

  function show(i) {
    at = (i + list.length) % list.length;
    const m = list[at];
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.className = 'alb-view';
      viewer.setAttribute('role', 'dialog');
      viewer.setAttribute('aria-modal', 'true');
      viewer.innerHTML = `<img class="alb-big" alt="">
        <div class="alb-vcap"><b></b><small></small></div>
        <button class="pp-stone alb-nav is-prev" type="button" data-step="-1" aria-label="Previous">‹</button>
        <button class="pp-stone alb-nav is-next" type="button" data-step="1" aria-label="Next">›</button>
        <button class="pp-stone alb-close" type="button" aria-label="Close">Close</button>`;
      document.body.appendChild(viewer);
      viewer.addEventListener('click', (e) => {
        const st = e.target.closest('[data-step]');
        if (st) { show(at + Number(st.dataset.step)); return; }
        if (e.target.closest('.alb-close') || e.target === viewer) close();
      });
      let x0 = null;
      viewer.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      viewer.addEventListener('touchend', (e) => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1));
      });
      document.addEventListener('keydown', onKey);
      requestAnimationFrame(() => viewer && viewer.classList.add('in'));
    }
    $('.alb-big', viewer).src = m.src;
    $('.alb-big', viewer).alt = m.title;
    $('.alb-vcap b', viewer).textContent = m.title;
    $('.alb-vcap small', viewer).textContent = (m.sub ? m.sub + ' · ' : '') + (at + 1) + ' / ' + list.length;
    UI.sfx('tap');
  }
  function onKey(e) {
    if (!viewer) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(at + 1);
    else if (e.key === 'ArrowLeft') show(at - 1);
  }
  function close() {
    if (!viewer) return;
    document.removeEventListener('keydown', onKey);
    viewer.remove();
    viewer = null;
  }

  function init() {
    return fetch('assets/pp/manifest.json').then((r) => r.json()).then((man) => {
      memories = (man.memories || [])
        .filter((m) => m.files && m.files.art)
        .map((m) => ({ src: 'assets/pp/memories/' + m.id + '/' + m.files.art, title: String(m.title || m.id), rar: m.rarity || '' }))
        .sort((a, b) => (RAR[b.rar] || 0) - (RAR[a.rar] || 0) || a.title.localeCompare(b.title));
      if (location.hash === '#characters') tab = 'units';
      render();
      $('#main').addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]');
        if (t) { tab = t.dataset.tab; history.replaceState(null, '', tab === 'units' ? '#characters' : location.pathname); render(); return; }
        const c = e.target.closest('.alb-card');
        if (c) show(Number(c.dataset.i));
      });
    });
  }

  UI.boot({ back: false, data: ['characters'], init });
})();
