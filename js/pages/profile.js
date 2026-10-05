/* profile.html — Phantom Parade Profile: the home sorcerer's art on the left,
 * a dark panel on the right with Profile / Progress tabs. The name and the
 * self-introduction (profile.intro) are edited here and written through
 * Save.update. */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  const INTRO_MAX = 120;
  let tab = 'profile';
  let missions = null;
  let editing = { name: false, intro: false };
  let draft = null;

  const PENCIL = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/></svg>';
  const PLUS = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>';

  /** grade title by player rank (shown on the title plate) */
  function rankTitle(rank) {
    if (rank >= 60) return 'Special Grade Sorcerer';
    if (rank >= 40) return 'Grade 1 Sorcerer';
    if (rank >= 25) return 'Semi-Grade 1 Sorcerer';
    if (rank >= 12) return 'Grade 2 Sorcerer';
    if (rank >= 5) return 'Grade 3 Sorcerer';
    return 'Grade 4 Sorcerer';
  }
  const playerId = (s) => (Number(s.created) || 0).toString(36).padStart(9, '0').slice(-9) + 'jjk';

  function homeDef(s) {
    const id = s.profile.homeUnit && Rules.unitDef(s.profile.homeUnit) ? s.profile.homeUnit : null;
    if (id) return Rules.unitDef(id);
    const own = Rules.ownedList().sort((a, b) => b.power - a.power)[0];
    return own ? own.def : Data.char('yuji_301');
  }

  function profileTab(s) {
    const team = s.teams[s.activeTeam];
    const sup = team && team.support ? Rules.unitView(team.support) : null;
    const cp = team ? Rules.teamPower(team) : 0;
    const intro = s.profile.intro == null ? '' : String(s.profile.intro);
    return `<div class="pf-id">
        <div class="pf-rank" title="Player Rank ${esc(s.profile.rank)}"><small>Player Rank</small><b>${esc(s.profile.rank)}</b></div>
        <div class="pf-id-lines">
          <div class="pf-line"><span class="pf-plate">${esc(rankTitle(s.profile.rank))}</span></div>
          <div class="pf-line"><input class="pf-name" id="pf-name" maxlength="24" value="${esc(s.profile.name)}" aria-label="Player name" ${editing.name ? '' : 'readonly'}>
            <button class="pf-pen" type="button" data-edit="name" aria-label="Edit name" title="Edit name">${PENCIL}</button></div>
          <div class="pf-line"><span class="pf-uid">ID:${esc(playerId(s))}</span></div>
        </div>
      </div>
      <div class="pf-sec">Self-Introduction</div>
      <div class="pf-box pf-intro-box">
        <textarea class="pf-intro" id="pf-intro" maxlength="${INTRO_MAX}" rows="3" placeholder="Nice to meet you." aria-label="Self-introduction" ${editing.intro ? '' : 'readonly'}>${esc(intro)}</textarea>
        <button class="pf-pen" type="button" data-edit="intro" aria-label="Edit self-introduction" title="Edit self-introduction">${PENCIL}</button>
      </div>
      <div class="pf-sec">Assistance Info</div>
      <div class="pf-box pf-assist">
        <div class="pf-assist-units">
          ${sup ? `<a class="pf-unit" href="characters.html" title="${esc(sup.def.name + (sup.def.title ? ' — ' + sup.def.title : ''))}">${Art.img(sup.def, 'icon', { cls: 'art' })}${UI.rarityBadge(sup.def, 'pf-unit-rar')}<span class="pf-unit-lv">Lv${esc(sup.unit.level)}</span></a>`
    : `<a class="pf-unit is-empty" href="teams.html" title="Set a Backup unit">${PLUS}</a>`}
          <a class="pf-unit is-empty" href="teams.html" title="Team Formation">${PLUS}</a>
        </div>
        <div class="pf-assist-info">
          <span class="pf-assist-name">${sup ? esc(sup.def.name) : 'No Backup set'}<small>${esc(team ? team.name : '')}</small></span>
          <span class="pf-cp"><em>Assistance CP</em><b>${fmt(cp)}</b></span>
        </div>
        <a class="pf-pen" href="teams.html" aria-label="Edit team" title="Team Formation">${PENCIL}</a>
      </div>`;
  }

  function progressTab(s) {
    const stages = missions ? missions.chapters.reduce((a, c) => a.concat(c.stages.map((x) => x.id)), []) : [];
    const cleared = stages.filter((id) => s.progress[id] && s.progress[id].clears > 0).length;
    const stars = stages.reduce((a, id) => a + ((s.progress[id] && s.progress[id].stars) || 0), 0);
    const owned = Object.keys(s.units).filter((id) => Data.char(id)).length;
    const total = Data.characters.length;
    const st = s.stats || {};
    const rate = st.battles ? Math.round((st.wins / st.battles) * 100) : 0;
    const need = Rules.rankExpToNext(s.profile.rank);
    const chapters = missions ? missions.chapters.map((c) => {
      const ids = c.stages.map((x) => x.id);
      const n = ids.filter((id) => s.progress[id] && s.progress[id].clears > 0).length;
      return `<div class="pf-chap"><span>${esc(c.name)}</span><span class="bar"><i style="width:${Math.round((n / ids.length) * 100)}%"></i></span><b>${n}/${ids.length}</b></div>`;
    }).join('') : '';
    const cell = (label, val, sub) => `<div class="pf-stat"><small>${label}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
    return `<div class="pf-stats">
        ${cell('Stages Cleared', `${cleared}<span>/${stages.length}</span>`)}
        ${cell('Stars', `${stars}<span>/${stages.length * 3}</span>`, '<i class="star on">★</i>')}
        ${cell('Sorcerers', `${owned}<span>/${total}</span>`)}
        ${cell('Battles', fmt(st.battles || 0))}
        ${cell('Wins', fmt(st.wins || 0), st.battles ? rate + '%' : '')}
        ${cell('Summons', fmt(st.pulls || 0))}
      </div>
      <div class="pf-sec">Player Rank ${esc(s.profile.rank)}</div>
      <div class="pf-rankbar"><span class="bar"><i style="width:${Math.min(100, Math.round((s.profile.rankExp / need) * 100))}%"></i></span><small>${fmt(s.profile.rankExp)} / ${fmt(need)} EXP</small></div>
      <div class="pf-sec">Story</div>
      <div class="pf-chaps">${chapters}</div>
      <p class="pf-since">Sorcerer since ${esc(new Date(s.created || Date.now()).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }))}</p>`;
  }

  function draw() {
    const s = Save.get();
    $('#pf-tabs').innerHTML = [['profile', 'Profile'], ['progress', 'Progress']].map(([id, label]) => `<button class="jjk-tab pf-tab${id === tab ? ' active' : ''}" type="button" role="tab" aria-selected="${id === tab}" data-tab="${id}">${label}</button>`).join('');
    $('#pf-body').innerHTML = tab === 'profile' ? profileTab(s) : progressTab(s);
    $('#pf-body').dataset.tab = tab;
    // restore unsaved edits after switching back to the Profile tab
    if (tab === 'profile' && draft) {
      if (draft.name != null) $('#pf-name').value = draft.name;
      if (draft.intro != null) $('#pf-intro').value = draft.intro;
      draft = null;
    }
  }

  function save() {
    const name = $('#pf-name');
    const intro = $('#pf-intro');
    const s = Save.get();
    const n = name ? name.value.trim().slice(0, 24) : s.profile.name;
    const t = intro ? intro.value.replace(/\s+$/, '').slice(0, INTRO_MAX) : s.profile.intro;
    if (name && !n) { UI.toast('Enter a name.', 'bad'); name.focus(); return; }
    Save.update((st) => { st.profile.name = n; st.profile.intro = t || ''; });
    editing = { name: false, intro: false };
    draw();
    UI.toast('Profile saved.', 'good');
    UI.sfx('tap');
  }

  function render() {
    const s = Save.get();
    const def = homeDef(s);
    $('#main').classList.add('pf-main');
    $('#main').innerHTML = `<div class="pf">
      <div class="pf-art">${def ? Art.img(def, 'full', { cls: 'art pf-art-img', eager: true, alt: def.name }) : ''}
        ${def ? `<div class="pf-art-cap"><span class="pf-art-name">${esc(def.name)}</span><small>${esc(def.title || '')}</small></div>` : ''}
        <div class="pf-actions">
          <a class="pp-stone pf-small" href="home.html">Change Home<br>Sorcerer</a>
          <button class="pp-stone pf-save" type="button" id="pf-save">Save</button>
        </div>
      </div>
      <section class="pf-panel jjk-panel">
        <div class="pf-tabs" id="pf-tabs" role="tablist"></div>
        <div class="pf-body" id="pf-body"></div>
      </section>
    </div>`;
    draw();
    $('#pf-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b || b.dataset.tab === tab) return;
      // keep unsaved edits when switching tabs
      if (tab === 'profile') stash();
      tab = b.dataset.tab;
      draw();
    });
    $('#pf-body').addEventListener('click', (e) => {
      const b = e.target.closest('[data-edit]');
      if (!b) return;
      const k = b.dataset.edit;
      editing[k] = true;
      const el = k === 'name' ? $('#pf-name') : $('#pf-intro');
      el.readOnly = false;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    $('#pf-body').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'pf-name') { e.preventDefault(); save(); }
    });
    $('#pf-save').addEventListener('click', save);
  }

  function stash() {
    const n = $('#pf-name'); const t = $('#pf-intro');
    draft = { name: n ? n.value : null, intro: t ? t.value : null };
  }
  UI.boot({ data: ['characters'], init: () => Data.load('missions').then((m) => { missions = m; render(); }) });
})();
