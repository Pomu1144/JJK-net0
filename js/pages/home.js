/* home.html — Jujutsu High hub: hero, profile, quick tiles. */
(function () {
  'use strict';
  const { $, esc } = UI;

  function nextStage(missions, s) {
    for (const ch of missions.chapters) {
      for (const st of ch.stages) if (!s.progress[st.id]) return { ch, st };
    }
    return null;
  }

  function render() {
    const [missions, banners] = [Data.load('missions'), Data.load('banners')];
    Promise.all([missions, banners]).then(([M, B]) => draw(M, B));
  }

  function draw(M, B) {
    const s = Save.get();
    const owned = Rules.ownedList();
    if (!s.profile.homeUnit || !Rules.unitView(s.profile.homeUnit)) {
      const best = owned.slice().sort((a, b) => b.power - a.power)[0];
      if (best) Save.update((st) => { st.profile.homeUnit = best.id; });
    }
    const hero = Rules.unitView(Save.get().profile.homeUnit);
    const team = s.teams[s.activeTeam];
    const nx = nextStage(M, s);
    const dailyDone = s.daily.daily_gift === Rules.today();

    const hd = hero && hero.def;
    if (hd) document.body.style.setProperty('--scene', `url('${new URL(Art.src(hd, 'full'), location.href).href}')`);
    const slides = B.banners.slice().sort((a, b) => b.featured.length - a.featured.length);
    const slide = (b, i) => { const d = Data.char(b.hero); return `<a class="hc-slide${i === 0 ? ' on' : ''}" href="summon.html#${esc(b.id)}"${b.bg ? ` style="background-image:url('${esc(b.bg)}')"` : ''}>
        ${d ? Art.img(d, 'full', { alt: '' }) : ''}<span class="pk-copy"><span class="pk-label">${b.featured.length ? 'PICKUP' : 'SUMMON'}</span><span class="pk-title">${esc(b.name)}</span></span></a>`; };
    const quote = hd ? `「${hd.title || hd.name}」 ${hd.technique ? 'Watch closely — ' + hd.technique.name + '.' : ''}${hd.support ? ' ' + hd.support.desc : ''}` : '';
    $('#main').innerHTML = `<div class="home">
      <div class="home-left">
        <div class="home-carousel" id="carousel">${slides.map(slide).join('')}
          <span class="hc-dots">${slides.map((b, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</span></div>
        <div class="home-gold">
          <a class="gold-btn" href="missions.html${nx ? '#' + nx.ch.id : ''}"><span class="gold-ic">${UI.icon('missions')}</span><span>Missions</span></a>
          <a class="gold-btn" href="shop.html#daily"><span class="gold-ic">${UI.icon('gift')}</span><span>Daily Gift</span>${dailyDone ? '' : '<i class="nav-dot" aria-label="ready">!</i>'}</a>
        </div>
        <div class="home-stones">
          <button class="pp-stone sq" id="swap" type="button" title="Change home character" aria-label="Change home character">${UI.icon('swap')}</button>
          <a class="pp-stone sq kit-icon kit-profile" href="teams.html" title="${esc(team.name)}" aria-label="Team Formation">${UI.icon('teams')}</a>
          <a class="pp-stone sq kit-icon kit-expand" href="characters.html${hd ? '#' + encodeURIComponent(hero.id) : ''}" title="Enhance" aria-label="Enhance home character">${UI.icon('expand')}</a>
        </div>
      </div>
      ${hd ? `<div class="pp-dialog home-dialog"><span class="dlg-name">${esc(hd.name)}</span><p class="dlg-text">${esc(quote)}</p>
        <span class="home-unit">${UI.rarityBadge(hd)}${UI.typeBadge(hd)}${UI.focusTag(hd)}</span></div>` : ''}
      <div class="home-right">
        <a class="side-ic" href="characters.html">${UI.icon('units')}<span>Sorcerers</span><i class="side-count">${Rules.ownedList().length}</i></a>
        <a class="side-ic" href="summon.html">${UI.icon('summon')}<span>Summon</span>${s.currency.cubes >= 3000 || s.items.ticket > 0 ? '<i class="nav-dot">!</i>' : ''}</a>
        <a class="side-ic" href="shop.html">${UI.icon('shop')}<span>Exchange</span></a>
        <a class="side-ic" id="novice-entry" href="novice.html" hidden><span class="nv-side-ic" style="display:grid;place-items:center;width:46px;height:36px"></span><span>Novice Mission</span></a>
      </div>
      <a class="pp-parch home-quest" href="missions.html${nx ? '#' + nx.ch.id : ''}">
        <span class="quest-label">Quest</span>
        <span class="quest-next"><b>NEXT</b> ${nx ? esc(nx.st.id + ' ' + nx.st.name) : 'All cleared'}</span>
        <small class="quest-sub">${nx ? esc(nx.ch.name) + ' · ' + nx.st.stamina + ' AP' : 'Replay for 3 stars'}</small></a>
    </div>`;
    noviceEntry();
    clearInterval(window.__homeCarousel);
    let cur = 0;
    window.__homeCarousel = setInterval(() => {
      const el = $('#carousel');
      if (!el || slides.length < 2) return;
      cur = (cur + 1) % slides.length;
      el.querySelectorAll('.hc-slide').forEach((x, i) => x.classList.toggle('on', i === cur));
      el.querySelectorAll('.hc-dots i').forEach((x, i) => x.classList.toggle('on', i === cur));
    }, 4200);
    const swap = $('#swap');
    if (swap) swap.addEventListener('click', () => {
      const list = Rules.ownedList().sort((a, b) => b.power - a.power);
      const i = list.findIndex((v) => v.id === Save.get().profile.homeUnit);
      const nextId = list[(i + 1) % list.length].id;
      Save.update((st2) => { st2.profile.homeUnit = nextId; });
      draw(M, B);
    });
  }

  // Novice Mission shortcut: js/pages/novice.js (window.Novice) owns the rules;
  // the button hides once the final reward is claimed, "!" when something is claimable.
  function noviceEntry() {
    const paint = () => window.Novice.status().then((st) => {
      const a = document.getElementById('novice-entry');
      if (!a) return;
      a.hidden = st.hidden;
      const ic = a.querySelector('.nv-side-ic');
      if (ic && !ic.firstChild) { ic.innerHTML = window.Novice.ticketSvg('ssr'); const sv = ic.firstChild; if (sv && sv.style) { sv.style.width = '100%'; sv.style.filter = 'drop-shadow(0 1px 2px #000)'; } }
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

  // Phantom Parade home header: Player Rank, AP (stamina) bar, date / time.
  function header() {
    const s = Save.get();
    const need = Rules.rankExpToNext(s.profile.rank);
    const st = Rules.staminaNow(s);
    return `<header class="home-head">
      <a class="rank-circle" href="profile.html" title="Player Rank · Profile">${s.profile.rank}</a>
      <div class="hh-block hh-rank"><small>${esc(s.profile.name)}</small><span class="hh-bar red"><i style="width:${Math.min(100, s.profile.rankExp / need * 100)}%"></i></span></div>
      <div class="hh-block hh-ap"><small><span>AP</span><b id="home-ap">${st.cur}/${st.max}</b></small><span class="hh-bar"><i id="home-ap-bar" style="width:${Math.min(100, st.cur / st.max * 100)}%"></i></span></div>
      <a class="pp-stone hh-plus" href="shop.html#stamina" aria-label="Refill AP">${UI.icon('plus')}</a>
      <span class="hh-clock" id="home-clock"></span>
    </header>`;
  }
  function tick() {
    const c = document.getElementById('home-clock');
    if (c) { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); c.textContent = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
    const s = Save.get();
    if (s) {
      const st = Rules.staminaNow(s);
      const a = document.getElementById('home-ap'); if (a) a.textContent = st.cur + '/' + st.max;
      const b = document.getElementById('home-ap-bar'); if (b) b.style.width = Math.min(100, st.cur / st.max * 100) + '%';
    }
  }
  setInterval(tick, 1000);
  UI.boot({ back: 'index.html', header, data: ['characters', 'missions', 'banners'], init: () => { tick(); render(); } });
  window.addEventListener('portal:imported', () => { if (document.querySelector('.home')) render(); });
})();
