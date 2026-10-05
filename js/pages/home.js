/* home.html — Jujutsu High hub, laid out after the Phantom Parade Home screen:
   own top bar (Player Rank, AP, clock, JP, Cubes), featured carousel, Story Event,
   Quest card and the right column of shortcut tiles over the home unit's full art.
   Sprites: assets/pp/ui/home/ (cut from the Home UI sheet, see assets/pp/CREDITS.md). */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  const S = (n) => 'assets/pp/ui/home/' + n + '.webp';
  // native sprite widths (px in the sheet); CSS scales them by --k (one sheet px)
  const W = { rank: 241, info: 55, ap: 240, plus: 56, plate: 222, jp: 168, cubes: 156, frame: 464, 'arrow-l': 44, 'arrow-r': 45, novice: 122, invite: 101,
    'st-profile': 92, 'st-expand': 92, 'st-swap': 91, 'event-head': 332, 'event-splash': 409, gift: 126, mission: 126, stroll: 157, exchange: 147, card: 127, quest: 478 };
  const sprite = (n, cls) => `<img class="hm-sp${cls ? ' ' + cls : ''}" src="${S(n)}" style="--w:${W[n]}" alt="" aria-hidden="true" draggable="false">`;

  function nextStage(missions, s) {
    for (const ch of missions.chapters) {
      for (const st of ch.stages) if (!s.progress[st.id]) return { ch, st };
    }
    return null;
  }

  const today = () => Rules.today();
  const isLive = (b) => b.event && b.start && b.start <= today() && (!b.end || b.end >= today());

  // "Remaining N day(s)" / "N hour(s)" until the end of an end date (local 23:59:59)
  function remaining(end) {
    if (!end) return 'Now On';
    const ms = new Date(end + 'T23:59:59').getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const h = Math.floor(ms / 3600000);
    if (h >= 24) { const d = Math.floor(h / 24); return `Remaining ${d} day${d === 1 ? '' : '(s)'}`; }
    if (h >= 1) return `Remaining ${h} hour(s)`;
    return `Remaining ${Math.max(1, Math.floor(ms / 60000))} min(s)`;
  }

  // Story Event block: the Map Event (data/events.json, opens event.html). Its end date is
  // its own `end` if it has one, otherwise the end of the current live event banners.
  function storyEvent(E, B) {
    const ev = E && E.events && E.events[0];
    if (!ev) return null;
    const live = B.banners.filter((b) => isLive(b) && b.end).sort((a, b) => (a.end < b.end ? 1 : -1));
    return { name: ev.name, end: ev.end || (live[0] && live[0].end) || null };
  }

  // the event title in two-tone ink lettering: first part ember-red, last word ice-violet
  function titleHtml(name) {
    const main = name.split(/[:：]/)[0].trim();
    const words = main.split(/\s+/);
    const last = words.length > 1 ? words.pop() : '';
    return `<span class="ev-w1">${esc(words.join(' '))}</span>${last ? ` <span class="ev-w2">${esc(last)}</span>` : ''}`;
  }

  function render() {
    Promise.all([Data.load('missions'), Data.load('banners'), Data.load('events').catch(() => null)])
      .then(([M, B, E]) => draw(M, B, E));
  }

  function draw(M, B, E) {
    const s = Save.get();
    const owned = Rules.ownedList();
    if (!s.profile.homeUnit || !Rules.unitView(s.profile.homeUnit)) {
      const best = owned.slice().sort((a, b) => b.power - a.power)[0];
      if (best) Save.update((st) => { st.profile.homeUnit = best.id; });
    }
    const hero = Rules.unitView(Save.get().profile.homeUnit);
    const nx = nextStage(M, s);
    const dailyDone = s.daily.daily_gift === Rules.today();
    const summonDot = s.currency.cubes >= 3000 || s.items.ticket > 0;
    const portalDue = !!(window.PortalPort && PortalPort.pendingTx && PortalPort.pendingTx.length);

    const hd = hero && hero.def;
    if (hd) document.body.style.setProperty('--scene', `url('${new URL(Art.src(hd, 'full'), location.href).href}')`);

    // Featured carousel: the live event banners (newest first), then the standard banner
    let live = B.banners.filter(isLive).sort((a, b) => (a.start < b.start ? 1 : -1));
    if (!live.length) live = B.banners.filter((b) => b.event).slice(0, 4);
    const slides = live.slice(0, 5).concat(B.banners.filter((b) => !b.event).slice(0, 1));
    const slide = (b, i) => {
      const d = !b.bg && Data.char(b.hero);
      return `<a class="hc-slide${i === 0 ? ' on' : ''}" href="summon.html#${esc(b.id)}" aria-label="${esc(b.name)} gacha"${b.bg ? ` style="background-image:url('${esc(b.bg)}')"` : ''}>
        ${d ? Art.img(d, 'full', { alt: '' }) : ''}<span class="hc-tag">${esc(b.kind || (b.featured.length ? 'Pickup' : 'Summon'))}</span>
        <span class="hc-title">${esc(b.name)}<small>Gacha</small></span></a>`;
    };
    const ev = storyEvent(E, B);
    const quote = hd ? `「${hd.title || hd.name}」 ${hd.technique ? 'Watch closely — ' + hd.technique.name + '.' : ''}${hd.support ? ' ' + hd.support.desc : ''}` : '';
    const dot = (on) => (on ? '<i class="nav-dot" aria-label="ready">!</i>' : '');

    $('#main').innerHTML = `<div class="home hm">
      <div class="hm-left">
        <div class="hm-feat">
          <button class="hm-arrow is-l" type="button" id="hc-prev" aria-label="Previous banner">${sprite('arrow-l')}</button>
          <div class="hm-frame">
            <div class="home-carousel" id="carousel">${slides.map(slide).join('')}</div>
            ${sprite('frame', 'hm-frame-sp')}
          </div>
          <button class="hm-arrow is-r" type="button" id="hc-next" aria-label="Next banner">${sprite('arrow-r')}</button>
          <span class="hc-dots">${slides.map((b, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</span>
        </div>
        <div class="hm-ics">
          <a class="hm-ic is-novice" id="novice-entry" href="novice.html" aria-label="Novice Mission" hidden>${sprite('novice')}</a>
          <a class="hm-ic is-portal" href="settings.html#portal" aria-label="Portal">${sprite('invite')}<span class="hm-ic-lb">Portal</span>${dot(portalDue)}</a>
        </div>
        <div class="hm-stones">
          <a class="hm-stone" href="profile.html" aria-label="Profile" title="Profile">${sprite('st-profile')}</a>
          <button class="hm-stone" type="button" id="expand" aria-label="Hide the menus to view the art" title="View art">${sprite('st-expand')}</button>
          <button class="hm-stone" type="button" id="swap" aria-label="Change home character" title="Change home character">${sprite('st-swap')}</button>
        </div>
      </div>
      ${ev ? `<a class="hm-event" href="event.html" aria-label="Story Event: ${esc(ev.name)}">
        <span class="hm-ev-head">${sprite('event-head')}<b class="hm-ev-left" id="ev-left">${esc(remaining(ev.end))}</b></span>
        <span class="hm-ev-logo">${sprite('event-splash')}<span class="hm-ev-title">${titleHtml(ev.name)}</span></span></a>` : ''}
      ${hd ? `<div class="pp-dialog home-dialog"><span class="dlg-name">${esc(hd.name)}</span><p class="dlg-text">${esc(quote)}</p>
        <span class="home-unit">${UI.rarityBadge(hd)}${UI.typeBadge(hd)}${UI.focusTag(hd)}</span></div>` : ''}
      <nav class="hm-tiles" aria-label="Shortcuts">
        <a class="hm-tile" href="shop.html#daily" aria-label="Gift">${sprite('gift')}${dot(!dailyDone)}</a>
        <a class="hm-tile" href="missions.html${nx ? '#' + nx.ch.id : ''}" aria-label="Mission">${sprite('mission')}</a>
        <button class="hm-tile" type="button" id="stroll" aria-label="Cursed Corpse Stroll">${sprite('stroll')}</button>
        <a class="hm-tile" href="shop.html" aria-label="Exchange">${sprite('exchange')}</a>
        <a class="hm-tile" href="summon.html" aria-label="Gacha" title="Gacha">${sprite('card')}${dot(summonDot)}</a>
      </nav>
      <a class="hm-quest" href="missions.html${nx ? '#' + nx.ch.id : ''}" title="${nx ? esc(nx.ch.name + ' · ' + nx.st.stamina + ' AP') : 'All cleared'}">
        ${sprite('quest')}<span class="sr-only">Quest</span>
        <span class="hm-qnext"><b>NEXT</b><span>${nx ? esc(nx.st.id + ' ' + nx.st.name) : 'All cleared'}</span></span></a>
    </div>`;
    noviceEntry();
    carousel(slides.length);
    $('#swap').addEventListener('click', () => {
      const list = Rules.ownedList().sort((a, b) => b.power - a.power);
      if (!list.length) return;
      const i = list.findIndex((v) => v.id === Save.get().profile.homeUnit);
      const nextId = list[(i + 1) % list.length].id;
      Save.update((st2) => { st2.profile.homeUnit = nextId; });
      draw(M, B, E);
    });
    $('#expand').addEventListener('click', (e) => {
      e.stopPropagation();
      document.documentElement.classList.add('hm-art-only');
      UI.toast('Tap anywhere to bring the menus back');
    });
    $('#stroll').addEventListener('click', () => UI.toast('Cursed Corpse Stroll is coming soon'));
    if (ev) {
      clearInterval(window.__homeEv);
      window.__homeEv = setInterval(() => { const el = $('#ev-left'); if (el) el.textContent = remaining(ev.end); }, 30000);
    }
  }

  // tap anywhere while the menus are hidden ("expand") to bring them back
  document.addEventListener('click', (e) => {
    const root = document.documentElement;
    if (!root.classList.contains('hm-art-only')) return;
    e.preventDefault(); e.stopPropagation();
    root.classList.remove('hm-art-only');
  }, true);

  function carousel(n) {
    clearInterval(window.__homeCarousel);
    let cur = 0;
    const go = (to) => {
      const el = $('#carousel');
      if (!el || n < 1) return;
      cur = (to + n) % n;
      el.querySelectorAll('.hc-slide').forEach((x, i) => x.classList.toggle('on', i === cur));
      document.querySelectorAll('.hm-feat .hc-dots i').forEach((x, i) => x.classList.toggle('on', i === cur));
    };
    const auto = () => { clearInterval(window.__homeCarousel); window.__homeCarousel = setInterval(() => { if (n > 1) go(cur + 1); }, 4200); };
    $('#hc-prev').addEventListener('click', () => { go(cur - 1); auto(); });
    $('#hc-next').addEventListener('click', () => { go(cur + 1); auto(); });
    auto();
  }

  // Novice Mission shortcut: js/pages/novice.js (window.Novice) owns the rules;
  // the icon hides once the final reward is claimed, "!" when something is claimable.
  function noviceEntry() {
    const paint = () => window.Novice.status().then((st) => {
      const a = document.getElementById('novice-entry');
      if (!a) return;
      a.hidden = st.hidden;
      let dot = a.querySelector('.nav-dot');
      if (st.claimable && !dot) { dot = document.createElement('i'); dot.className = 'nav-dot'; dot.textContent = '!'; a.appendChild(dot); }
      if (!st.claimable && dot) dot.remove();
    }).catch(() => {});
    if (window.Novice) { paint(); return; }
    const sc = document.createElement('script');
    sc.src = 'js/pages/novice.js';
    sc.onload = paint;
    document.head.appendChild(sc);
  }

  // Top bar (replaces the shell's title plate + HUD on Home): Player Rank, AP, clock, JP, Cubes.
  function header() {
    const s = Save.get();
    return `<header class="home-head hm-head">
      <a class="hm-rank" href="profile.html" title="Player Rank · Profile" aria-label="Player Rank ${s.profile.rank}, open Profile">${sprite('rank')}
        <b class="hm-rank-n" id="hm-rank">${s.profile.rank}</b><span class="hm-rank-name" id="hm-name">${esc(s.profile.name)}</span>
        <span class="hm-bar is-rank"><i id="hm-rank-bar"></i></span></a>
      <a class="hm-sq hm-info" href="profile.html" aria-label="Profile">${sprite('info')}</a>
      <a class="hm-ap" href="shop.html#stamina" title="AP" aria-label="AP, refill">${sprite('ap')}
        <b id="home-ap">0/0</b><small id="home-ap-t"></small><span class="hm-bar is-ap"><i id="home-ap-bar"></i></span></a>
      <a class="hm-sq hm-plus" href="shop.html#stamina" aria-label="Refill AP">${sprite('plus')}</a>
      <span class="hm-clock"><b id="home-clock"></b></span>
      <span class="hm-cur-gap"></span>
      <a class="hm-cur is-jp" href="shop.html" title="JP" aria-label="JP">${sprite('jp')}<b id="hm-yen">0</b></a>
      <span class="hm-cubes"><a class="hm-cur is-cubes" href="shop.html#summon" title="Cubes" aria-label="Cubes">${sprite('cubes')}<b id="hm-cubes">0</b></a>
        <a class="hm-sq hm-plus" href="shop.html#summon" aria-label="Get Cubes">${sprite('plus')}</a></span>
    </header>`;
  }

  const p2 = (n) => String(n).padStart(2, '0');
  function tick() {
    const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== String(v)) el.textContent = v; };
    const d = new Date();
    set('home-clock', `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`);
    const s = Save.get();
    if (!s) return;
    const st = Rules.staminaNow(s);
    set('home-ap', st.cur + '/' + st.max);
    const b = document.getElementById('home-ap-bar'); if (b) b.style.width = Math.min(100, st.cur / st.max * 100) + '%';
    if (st.cur < st.max && st.nextIn != null) { const sec = Math.max(0, Math.ceil(st.nextIn / 1000)); set('home-ap-t', Math.floor(sec / 60) + ':' + p2(sec % 60)); } else set('home-ap-t', '');
    set('hm-rank', s.profile.rank);
    set('hm-name', s.profile.name);
    const rb = document.getElementById('hm-rank-bar'); if (rb) rb.style.width = Math.min(100, s.profile.rankExp / Rules.rankExpToNext(s.profile.rank) * 100) + '%';
    set('hm-yen', fmt(s.currency.yen || 0));
    set('hm-cubes', fmt((s.currency.cubes || 0) + (s.currency.paidCubes || 0)));
  }
  setInterval(tick, 1000);
  UI.boot({ back: 'index.html', header, hud: false, data: ['characters', 'missions', 'banners'], init: () => { tick(); Save.onChange(tick); render(); } });
  window.addEventListener('portal:imported', () => { if (document.querySelector('.home')) render(); });
})();
