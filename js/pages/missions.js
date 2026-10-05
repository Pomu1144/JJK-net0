/* missions.html — the Quest hub (Phantom Parade): mode tiles, then
 * Main Quest (chapters -> stages) or Strengthening Quests (Training Light /
 * JP Gathering: daily runs, auto-clear once a stage has 3 stars). */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  let M = null, ITEMS = {};
  let chIdx = 0;
  let mode = 'main';      // 'main' | 'strengthen'
  let qIdx = 0;           // selected Strengthening Quest

  // Modes from the guide. Only Main Quest and Strengthening Quest are playable;
  // the rest show their art and are marked as coming later.
  const MODES = [
    { id: 'main', name: 'Main Quest', kanji: 'メインクエスト', art: 'main-quest' },
    { id: 'strengthen', name: 'Strengthening Quest', kanji: '強化クエスト', art: 'strengthen' },
    { id: 'cursed-objects', name: 'Cursed Object Collection', kanji: '呪物収集', art: 'cursed-objects', soon: true },
    { id: 'domain', name: 'Domain Investigation', kanji: '領域調査', art: 'domain', soon: true },
    { id: 'foes', name: 'Formidable Foes', kanji: '強敵邂逅', art: 'foes', soon: true },
    { id: 'tower', name: 'Illusory Tower', kanji: '夢幻廻楼', art: 'tower', soon: true },
    { id: 'event', name: 'Event', kanji: 'イベント', art: '../memories/night-out-between-sorcerers/art', href: 'event.html' },
  ];
  const STAR_TEXT = '1★ clear · 2★ at most 1 character defeated · 3★ no characters defeated';

  const allStages = () => M.chapters.flatMap((c) => c.stages);
  const questOf = (stageId) => (M.quests || []).find((q) => q.stages.some((x) => x.id === stageId)) || null;
  const findStage = (stageId) => allStages().concat((M.quests || []).flatMap((q) => q.stages)).find((x) => x.id === stageId);
  function unlocked(stageId) {
    const q = questOf(stageId);
    if (q) { const st = q.stages.find((x) => x.id === stageId); return !st.unlock || !!Save.get().progress[st.unlock]; }
    const list = allStages();
    const i = list.findIndex((s) => s.id === stageId);
    return i <= 0 || !!Save.get().progress[list[i - 1].id];
  }
  const runsLeft = (q) => Math.max(0, q.daily - Rules.questRuns(null, q.id));
  function chapterUnlocked(ci) { return ci === 0 || unlocked(M.chapters[ci].stages[0].id); }

  function rewardText(r) {
    const parts = [];
    if (r.cubes) parts.push(fmt(r.cubes) + ' Cubes');
    if (r.yen) parts.push(fmt(r.yen) + ' JP');
    Object.entries(r.items || {}).forEach(([k, n]) => parts.push(n + '× ' + (ITEMS[k] ? ITEMS[k].name : k)));
    return parts.join(', ');
  }

  function drawModes() {
    $('#modes').innerHTML = MODES.map((m) => `<button class="pp-parch mode-card${m.id === mode ? ' active' : ''}${m.soon ? ' is-soon' : ''}" type="button" data-mode="${m.id}" ${m.soon ? 'disabled title="Coming in a later update"' : ''}>
      <span class="parch-art" style="background-image:url('assets/pp/modes/${m.art}.webp')"></span>
      <span class="mode-kanji">${esc(m.kanji)}</span><span class="parch-label">${esc(m.name)}</span>
      ${m.soon ? '<span class="mode-soon">COMING SOON</span>' : ''}</button>`).join('');
  }

  function draw() {
    drawModes();
    $('#tabs').hidden = mode !== 'main';
    if (mode === 'strengthen') return drawQuests();
    const s = Save.get();
    const ch = M.chapters[chIdx];
    const got = ch.stages.reduce((a, st) => a + ((s.progress[st.id] || {}).stars || 0), 0);
    $('#tabs').innerHTML = M.chapters.map((c, i) => {
      const open = chapterUnlocked(i);
      const got = c.stages.reduce((a2, st) => a2 + ((s.progress[st.id] || {}).stars || 0), 0);
      return `<button class="pp-parch ch-card${i === chIdx ? ' active' : ''}${open ? '' : ' is-locked'}" data-c="${i}" type="button" ${open ? '' : 'disabled title="Clear the previous chapter"'}>
        ${c.bg ? `<span class="parch-art" style="background-image:url('${esc(c.bg)}')"></span>` : ''}
        <span class="ch-arc">${esc(c.arc)}</span><span class="parch-label">${esc(c.name)}</span>
        <span class="ch-prog">${open ? '★ ' + got + '/' + c.stages.length * 3 : 'LOCKED'}</span></button>`;
    }).join('');
    $('#chapter').innerHTML = `<div class="chapter-hero jjk-panel${ch.bg ? ' has-bg' : ''}">${ch.bg ? `<div class="scene-bg" style="background-image:url('${esc(ch.bg)}')"></div>` : ''}<span class="ch-kanji">${esc(ch.kanji)}</span>
      <div class="grow"><b>${esc(ch.name)}</b><p>${esc(ch.desc)}</p></div>
      <div class="ch-stars"><b>★ ${got}</b>of ${ch.stages.length * 3}</div></div>
      <div class="stage-list jjk-panel">${ch.stages.map((st) => {
        const p = s.progress[st.id];
        const open = unlocked(st.id);
        const enemies = new Set(st.waves.flat().map((w) => w.enemy));
        return `<div class="stage pp-card${open ? '' : ' is-locked'}${st.boss ? ' is-boss' : ''}${p ? ' is-cleared' : ''}">
          <span class="st-no"><span>${esc(st.id)}</span></span>
          <div class="grow"><h4>${esc(st.name)} ${st.boss ? '<span class="boss-tag">BOSS</span>' : ''}</h4>
            <div class="st-meta"><span>${UI.STAM_SVG} ${st.stamina}</span><span>${st.waves.length} waves · ${enemies.size} opponent${enemies.size === 1 ? '' : 's'}</span><span>Rec. power <b>${fmt(st.recommendedPower)}</b></span>
              <span>${UI.YEN_SVG}${fmt(st.rewards.yen)} · ${fmt(st.rewards.unitExp)} EXP</span>
              <span class="first${p ? ' is-done' : ''}">First clear: ${esc(rewardText(st.firstClear))}</span></div></div>
          <span class="st-stars" title="${STAR_TEXT}">${UI.stars((p && p.stars) || 0, 3)}</span>
          ${p ? '<img class="cleared-stamp" src="assets/ui/jjk/stamp_claimed.webp" alt="">' : ''}
          <button class="jjk-btn is-small${open ? ' is-primary' : ''}" type="button" data-stage="${esc(st.id)}" ${open ? '' : 'disabled'}>${open ? 'Fight' : 'Locked'}</button>
        </div>`;
      }).join('')}</div>`;
  }

  function dropsHtml(st) {
    return (st.rewards.drops || []).map((d) => `<span class="q-drop">${UI.itemIcon(d.item, ITEMS)}<b>×${d.qty}</b>${d.chance < 100 ? `<small>${d.chance}%</small>` : ''}</span>`).join('');
  }

  function drawQuests() {
    const s = Save.get();
    const qs = M.quests || [];
    const q = qs[qIdx] || qs[0];
    const ap = Rules.staminaNow(s);
    const left = runsLeft(q);
    $('#chapter').innerHTML = `<div class="q-cards">${qs.map((x, i) => `<button class="pp-parch q-card${i === qIdx ? ' active' : ''}" type="button" data-q="${i}">
        <span class="parch-art" style="background-image:url('${esc(x.art)}')"></span>
        <span class="parch-label">${esc(x.name)}</span><span class="q-runs"><img src="assets/pp/currency/rank-on.webp" alt=""> ${runsLeft(x)}/${x.daily}</span></button>`).join('')}</div>
      <div class="chapter-hero jjk-panel q-hero"><img class="q-icon" src="${esc(q.icon)}" alt="">
        <div class="grow"><b>${esc(q.name)}</b><p>${esc(q.desc)} ${left}/${q.daily} runs left today. Stages cleared with 3★ can be auto-cleared.</p></div>
        <div class="ch-stars"><b>${UI.STAM_SVG} ${ap.cur}</b>AP</div></div>
      <div class="stage-list jjk-panel">${q.stages.map((st) => {
        const p = s.progress[st.id];
        const open = unlocked(st.id);
        const lock = st.unlock ? (allStages().find((x) => x.id === st.unlock) || {}) : null;
        const auto = p && p.stars >= 3;
        const maxAuto = Math.max(0, Math.min(left, Math.floor(ap.cur / st.stamina), 10));
        return `<div class="stage pp-card q-stage${open ? '' : ' is-locked'}${p ? ' is-cleared' : ''}">
          <span class="st-no"><span>${esc(st.name.slice(0, 3).toUpperCase())}</span></span>
          <div class="grow"><h4>${esc(st.name)}</h4>
            <div class="st-meta"><span>${UI.STAM_SVG} ${st.stamina}</span><span>Rec. power <b>${fmt(st.recommendedPower)}</b></span>
              <span>${UI.YEN_SVG}${fmt(st.rewards.yen)} · ${fmt(st.rewards.unitExp)} EXP</span>${dropsHtml(st)}
              ${open ? '' : `<span class="first">Unlocks after Main Quest ${esc(st.unlock)}${lock && lock.name ? ' · ' + esc(lock.name) : ''}</span>`}</div></div>
          <span class="st-stars" title="${STAR_TEXT}">${UI.stars((p && p.stars) || 0, 3)}</span>
          <div class="q-btns">
            <button class="jjk-btn is-small${open ? ' is-primary' : ''}" type="button" data-stage="${esc(st.id)}" ${open && left ? '' : 'disabled'}>${open ? 'Fight' : 'Locked'}</button>
            ${auto ? `<button class="jjk-btn is-small" type="button" data-auto="${esc(st.id)}" data-n="1" ${maxAuto >= 1 ? '' : 'disabled'}>Auto ×1</button>
              <button class="jjk-btn is-small" type="button" data-auto="${esc(st.id)}" data-n="${maxAuto}" ${maxAuto > 1 ? '' : 'disabled'}>Auto ×${Math.max(2, maxAuto)}</button>` : ''}
          </div>
        </div>`;
      }).join('')}</div>`;
  }

  /** Auto-clear (guide: 3★ material stages): same rewards as a win, no battle. */
  function autoClear(stageId, n) {
    const st = findStage(stageId);
    const q = questOf(stageId);
    let done = 0;
    const total = { yen: 0, drops: {}, levels: 0 };
    Save.update((s) => {
      const team = s.teams[s.activeTeam];
      const ids = Rules.teamIds(team).filter((id) => s.units[id]);
      for (let i = 0; i < n; i++) {
        const ap = Rules.staminaNow(s);
        if (ap.cur < st.stamina || Rules.questRuns(s, q.id) >= q.daily) break;
        s.stamina = { cur: ap.cur - st.stamina, ts: ap.cur >= ap.max ? Date.now() : ap.ts };
        const r = Rules.grantClearTo(s, st, { team: ids, support: team.support && s.units[team.support] ? team.support : null, stars: 3, quest: q.id });
        total.yen += st.rewards.yen;
        Object.entries(r.drops).forEach(([k, c]) => { total.drops[k] = (total.drops[k] || 0) + c; });
        total.levels += r.levels.filter((l) => l.to > l.from).length;
        s.stats.battles++; s.stats.wins++;
        done++;
      }
    });
    if (!done) { UI.toast('Not enough AP or no runs left today.', 'bad'); return; }
    const got = [fmt(total.yen) + ' JP'].concat(Object.entries(total.drops).map(([k, c]) => c + '× ' + (ITEMS[k] ? ITEMS[k].name : k)));
    UI.toast('Auto-cleared ×' + done + ': ' + got.join(', ') + (total.levels ? ' · level up!' : ''), 'good');
    UI.sfx('win');
    draw();
  }

  function prepare(stageId) {
    const st = findStage(stageId);
    let pick = Save.get().activeTeam;
    const q = questOf(stageId);
    const m = UI.modal('<div id="prep"></div>', { title: q ? q.name + ' · ' + st.name : st.id + ' · ' + st.name, sub: st.boss ? 'BOSS STAGE' : q ? 'STRENGTHENING QUEST' : 'MISSION' });
    const body = m.el.querySelector('#prep');
    const paint = () => {
      const s = Save.get();
      const stam = Rules.staminaNow(s);
      const t = s.teams[pick];
      const n = Rules.teamIds(t).length;
      body.innerHTML = `<p class="muted" style="margin:0 0 8px;font-size:12px">${esc(st.desc || '')} Clear Rank: ${STAR_TEXT}.</p>
        <div class="team-choice">${s.teams.map((tm, i) => `<button type="button" data-team="${i}" class="pp-card${i === pick ? ' active' : ''}"><b>${esc(tm.name)}</b><small>Power ${fmt(Rules.teamPower(tm))}</small>
          <div class="mini">${tm.slots.concat([tm.support]).map((id, j) => { const v = id && Rules.unitView(id); return `<span class="${j === 4 ? 'sup' : ''}">${v ? Art.img(v.def, 'portrait', { alt: '' }) : ''}</span>`; }).join('')}</div></button>`).join('')}</div>
        <div class="row wrap"><span>${UI.STAM_SVG} Cost <b>${st.stamina}</b> · you have <b class="${stam.cur < st.stamina ? '' : 'gold'}">${stam.cur}</b></span>
          <span class="grow"></span>
          <a class="jjk-btn is-small" href="teams.html">Edit teams</a>
          ${stam.cur < st.stamina ? '<a class="jjk-btn is-small" href="shop.html#stamina">Refill AP</a>' : ''}
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
    $('#main').innerHTML = '<div class="mode-cards" id="modes"></div><div class="ch-cards" id="tabs"></div><div id="chapter"></div>';
    const hash = location.hash.slice(1);
    const hi = M.chapters.findIndex((c) => c.id === hash);
    const qi = (M.quests || []).findIndex((q) => q.id === hash);
    if (hash === 'strengthen' || qi >= 0) { mode = 'strengthen'; qIdx = Math.max(0, qi); }
    if (hi >= 0) chIdx = hi;
    else {
      // open on the chapter with the next uncleared stage
      const s = Save.get();
      const ci = M.chapters.findIndex((c) => c.stages.some((st) => !s.progress[st.id]));
      chIdx = ci >= 0 ? ci : 0;
    }
    $('#modes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b || b.disabled) return;
      const tile = MODES.find((m) => m.id === b.dataset.mode);
      if (tile && tile.href) { location.href = tile.href; return; }
      mode = b.dataset.mode;
      history.replaceState(null, '', '#' + (mode === 'main' ? M.chapters[chIdx].id : 'strengthen'));
      UI.sfx('tap');
      draw();
    });
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) { chIdx = +b.dataset.c; history.replaceState(null, '', '#' + M.chapters[chIdx].id); draw(); } });
    $('#chapter').addEventListener('click', (e) => {
      const qb = e.target.closest('[data-q]');
      if (qb) { qIdx = +qb.dataset.q; history.replaceState(null, '', '#' + M.quests[qIdx].id); draw(); return; }
      const a = e.target.closest('[data-auto]');
      if (a && !a.disabled) { autoClear(a.dataset.auto, +a.dataset.n || 1); return; }
      const b = e.target.closest('[data-stage]');
      if (b) prepare(b.dataset.stage);
    });
    draw();
  }

  UI.boot({ data: ['characters', 'missions', 'items'], init: () => Promise.all([Data.load('missions'), Data.load('items')]).then(([m, it]) => { M = m; ITEMS = it.items; render(); }) });
})();
