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
          <a class="pp-stone sq" href="teams.html" title="${esc(team.name)}" aria-label="Team Formation">${UI.icon('teams')}</a>
          <a class="pp-stone sq" href="characters.html${hd ? '#' + encodeURIComponent(hero.id) : ''}" title="Enhance" aria-label="Enhance home character">${UI.icon('expand')}</a>
        </div>
      </div>
      ${hd ? `<div class="pp-dialog home-dialog"><span class="dlg-name">${esc(hd.name)}</span><p class="dlg-text">${esc(quote)}</p>
        <span class="home-unit">${UI.rarityBadge(hd)}${UI.typeBadge(hd)}${UI.focusTag(hd)}</span></div>` : ''}
      <div class="home-right">
        <a class="side-ic" href="characters.html">${UI.icon('units')}<span>Sorcerers</span><i class="side-count">${Rules.ownedList().length}</i></a>
        <a class="side-ic" href="summon.html">${UI.icon('summon')}<span>Summon</span>${s.currency.cubes >= 45 || s.items.ticket > 0 ? '<i class="nav-dot">!</i>' : ''}</a>
        <a class="side-ic" href="shop.html">${UI.icon('shop')}<span>Exchange</span></a>
      </div>
      <a class="pp-parch home-quest" href="missions.html${nx ? '#' + nx.ch.id : ''}">
        <span class="quest-label">Quest</span>
        <span class="quest-next"><b>NEXT</b> ${nx ? esc(nx.st.id + ' ' + nx.st.name) : 'All cleared'}</span>
        <small class="quest-sub">${nx ? esc(nx.ch.name) + ' · ' + nx.st.stamina + ' AP' : 'Replay for 3 stars'}</small></a>
    </div>`;
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

  // Phantom Parade home header: Player Rank, AP (stamina) bar, date / time.
  function header() {
    const s = Save.get();
    const need = Rules.rankExpToNext(s.profile.rank);
    const st = Rules.staminaNow(s);
    return `<header class="home-head">
      <span class="rank-circle" title="Player Rank">${s.profile.rank}</span>
      <div class="hh-block hh-rank"><small>${esc(s.profile.name)}</small><span class="hh-bar red"><i style="width:${Math.min(100, s.profile.rankExp / need * 100)}%"></i></span></div>
      <div class="hh-block hh-ap"><small><span>AP</span><b id="home-ap">${st.cur}/${st.max}</b></small><span class="hh-bar"><i id="home-ap-bar" style="width:${Math.min(100, st.cur / st.max * 100)}%"></i></span></div>
      <a class="pp-stone hh-plus" href="shop.html#stamina" aria-label="Refill stamina">${UI.icon('plus')}</a>
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
