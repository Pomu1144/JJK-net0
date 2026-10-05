/* missions.html — chapters -> stages (stamina, stars, rewards, first clear). */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  let M = null, ITEMS = {};
  let chIdx = 0;

  const allStages = () => M.chapters.flatMap((c) => c.stages);
  function unlocked(stageId) {
    const list = allStages();
    const i = list.findIndex((s) => s.id === stageId);
    return i <= 0 || !!Save.get().progress[list[i - 1].id];
  }
  function chapterUnlocked(ci) { return ci === 0 || unlocked(M.chapters[ci].stages[0].id); }

  function rewardText(r) {
    const parts = [];
    if (r.cubes) parts.push(r.cubes + ' Cubes');
    if (r.yen) parts.push('¥' + fmt(r.yen));
    Object.entries(r.items || {}).forEach(([k, n]) => parts.push(n + '× ' + (ITEMS[k] ? ITEMS[k].name : k)));
    return parts.join(', ');
  }

  function draw() {
    const s = Save.get();
    const ch = M.chapters[chIdx];
    const got = ch.stages.reduce((a, st) => a + ((s.progress[st.id] || {}).stars || 0), 0);
    $('#tabs').innerHTML = M.chapters.map((c, i) => `<button class="jjk-tab${i === chIdx ? ' active' : ''}" data-c="${i}" type="button" ${chapterUnlocked(i) ? '' : 'disabled title="Clear the previous chapter"'}>${esc(c.arc)} · ${esc(c.name)}</button>`).join('');
    $('#chapter').innerHTML = `<div class="chapter-hero jjk-panel"><span class="ch-kanji">${esc(ch.kanji)}</span>
      <div class="grow"><b>${esc(ch.name)}</b><p>${esc(ch.desc)}</p></div>
      <div class="ch-stars"><b>${got}</b> / ${ch.stages.length * 3} ★</div></div>
      <div class="stage-list">${ch.stages.map((st) => {
        const p = s.progress[st.id];
        const open = unlocked(st.id);
        const enemies = new Set(st.waves.flat().map((w) => w.enemy));
        return `<div class="stage${open ? '' : ' is-locked'}">
          <span class="st-no">${esc(st.id)}</span>
          <div class="grow"><h4>${esc(st.name)} ${st.boss ? '<span class="boss-tag">BOSS</span>' : ''}</h4>
            <div class="st-meta"><span>${UI.STAM_SVG} ${st.stamina}</span><span>${st.waves.length} waves · ${enemies.size} curse types</span><span>Rec. power ${fmt(st.recommendedPower)}</span>
              <span>¥${fmt(st.rewards.yen)} · ${fmt(st.rewards.unitExp)} EXP</span>
              <span class="first${p ? ' is-done' : ''}">First clear: ${esc(rewardText(st.firstClear))}</span></div></div>
          <span class="st-stars" title="1★ clear · 2★ nobody KO'd · 3★ within ${st.turnGoal} turns">${UI.stars((p && p.stars) || 0, 3)}</span>
          ${p ? '<img class="cleared-stamp" src="assets/ui/jjk/stamp_claimed.webp" alt="">' : ''}
          <button class="jjk-btn is-small${open ? ' is-primary' : ''}" type="button" data-stage="${esc(st.id)}" ${open ? '' : 'disabled'}>${open ? 'Fight' : 'Locked'}</button>
        </div>`;
      }).join('')}</div>`;
  }

  function prepare(stageId) {
    const st = allStages().find((x) => x.id === stageId);
    let pick = Save.get().activeTeam;
    const m = UI.modal('<div id="prep"></div>', { title: st.id + ' · ' + st.name, sub: st.boss ? 'BOSS STAGE' : 'MISSION' });
    const body = m.el.querySelector('#prep');
    const paint = () => {
      const s = Save.get();
      const stam = Rules.staminaNow(s);
      const t = s.teams[pick];
      const n = Rules.teamIds(t).length;
      body.innerHTML = `<p class="muted" style="margin:0 0 8px;font-size:12px">${esc(st.desc || '')} Stars: 1★ clear · 2★ nobody knocked out · 3★ clear within ${st.turnGoal} turns.</p>
        <div class="team-choice">${s.teams.map((tm, i) => `<button type="button" data-team="${i}" class="${i === pick ? 'active' : ''}"><b>${esc(tm.name)}</b><small>Power ${fmt(Rules.teamPower(tm))}</small>
          <div class="mini">${tm.slots.concat([tm.support]).map((id, j) => { const v = id && Rules.unitView(id); return `<span class="${j === 4 ? 'sup' : ''}">${v ? Art.img(v.def, 'portrait', { alt: '' }) : ''}</span>`; }).join('')}</div></button>`).join('')}</div>
        <div class="row wrap"><span>${UI.STAM_SVG} Cost <b>${st.stamina}</b> · you have <b class="${stam.cur < st.stamina ? '' : 'gold'}">${stam.cur}</b></span>
          <span class="grow"></span>
          <a class="jjk-btn is-small" href="teams.html">Edit teams</a>
          ${stam.cur < st.stamina ? '<a class="jjk-btn is-small" href="shop.html#stamina">Refill stamina</a>' : ''}
          <button class="jjk-btn is-primary" id="go" type="button" ${n && stam.cur >= st.stamina ? '' : 'disabled'}>Start · ${st.stamina} ${UI.icon('bolt')}</button></div>
        ${n ? '' : '<p class="msg is-bad">This team has no front units.</p>'}`;
    };
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-team]');
      if (b) { pick = +b.dataset.team; paint(); return; }
      if (e.target.closest('#go')) {
        Save.update((s) => { s.activeTeam = pick; });
        location.href = 'battle.html?stage=' + encodeURIComponent(st.id) + '&team=' + pick;
      }
    });
    paint();
  }

  function render() {
    $('#main').innerHTML = '<div class="tabs" id="tabs"></div><div id="chapter"></div>';
    const hash = location.hash.slice(1);
    const hi = M.chapters.findIndex((c) => c.id === hash);
    if (hi >= 0) chIdx = hi;
    else {
      // open on the chapter with the next uncleared stage
      const s = Save.get();
      const ci = M.chapters.findIndex((c) => c.stages.some((st) => !s.progress[st.id]));
      chIdx = ci >= 0 ? ci : 0;
    }
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) { chIdx = +b.dataset.c; history.replaceState(null, '', '#' + M.chapters[chIdx].id); draw(); } });
    $('#chapter').addEventListener('click', (e) => { const b = e.target.closest('[data-stage]'); if (b) prepare(b.dataset.stage); });
    draw();
  }

  UI.boot({ data: ['characters', 'missions', 'items'], init: () => Promise.all([Data.load('missions'), Data.load('items')]).then(([m, it]) => { M = m; ITEMS = it.items; render(); }) });
})();
