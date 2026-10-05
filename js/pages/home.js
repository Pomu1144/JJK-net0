/* home.html — Jujutsu High hub: hero, profile, quick tiles. */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;

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
    const feat = B.banners.find((b) => b.featured.length) || B.banners[0];
    const featDef = Data.char(feat.hero);
    const rankNeed = Rules.rankExpToNext(s.profile.rank);
    const st = Rules.staminaNow(s);
    const dailyDone = s.daily.daily_gift === Rules.today();

    $('#main').innerHTML = `<div class="home">
      <div class="home-side">
        <div class="profile-card jjk-panel">
          <h2>${esc(s.profile.name)}</h2>
          <div class="rank"><span class="rank-emblem">${s.profile.rank}</span>
            <div class="grow"><small class="muted">Sorcerer Rank</small><div class="bar"><i style="width:${Math.min(100, s.profile.rankExp / rankNeed * 100)}%"></i></div>
            <small class="muted">${fmt(s.profile.rankExp)} / ${fmt(rankNeed)} EXP</small></div></div>
          <small class="muted">Stamina ${st.cur}/${st.max} · Units ${owned.length} · Team power <b class="gold">${fmt(Rules.teamPower(team))}</b></small>
        </div>
        <a class="home-tile" href="missions.html${nx ? '#' + nx.ch.id : ''}"><b>${nx ? 'Continue: ' + esc(nx.st.id + ' ' + nx.st.name) : 'All missions cleared'}</b>
          <small>${nx ? esc(nx.ch.name) + ' · ' + nx.st.stamina + ' stamina' : 'Replay for 3 stars and rewards'}</small><span class="tile-kanji">任務</span></a>
        <a class="home-tile" href="teams.html"><b>${esc(team.name)}</b><small>${Rules.teamIds(team).length}/4 front · ${team.support ? 'support set' : 'no support'}</small><span class="tile-kanji">編成</span></a>
      </div>
      <div class="home-hero">
        ${hero ? Art.img(hero.def, 'full', { cls: 'art' + (hero.def.art.generated || hero.def.guest ? ' is-svg' : ''), eager: true }) : ''}
        ${hero ? `<button class="hero-name" id="swap" type="button" title="Change home character">${UI.icon('swap')}<span>${esc(hero.def.name)}</span>${UI.stars(hero.def.rarity)}</button>` : ''}
      </div>
      <div class="home-side">
        <a class="home-tile is-summon" href="summon.html#${esc(feat.id)}">${featDef ? Art.img(featDef, 'portrait', { alt: '' }) : ''}<b>${esc(feat.name)}</b><small>${esc(feat.subtitle)}</small></a>
        <a class="home-tile" href="shop.html#daily"><b>${dailyDone ? 'Daily gift claimed' : 'Daily gift ready!'}</b><small>${dailyDone ? 'Come back tomorrow' : '10 Cursed Cubes + ¥1,000'}</small><span class="tile-kanji">日課</span></a>
        <a class="home-tile" href="characters.html"><b>Sorcerers</b><small>Level up with talismans</small><span class="tile-kanji">術師</span></a>
      </div>
    </div>`;
    const swap = $('#swap');
    if (swap) swap.addEventListener('click', () => {
      const list = Rules.ownedList().sort((a, b) => b.power - a.power);
      const i = list.findIndex((v) => v.id === Save.get().profile.homeUnit);
      const nextId = list[(i + 1) % list.length].id;
      Save.update((st2) => { st2.profile.homeUnit = nextId; });
      draw(M, B);
    });
  }

  UI.boot({ back: 'index.html', data: ['characters', 'missions', 'banners'], init: render });
  window.addEventListener('portal:imported', () => { if (document.querySelector('.home')) render(); });
})();
