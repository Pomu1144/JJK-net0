/* characters.html — roster grid + detail (stats, skills, level-up with talismans). */
(function () {
  'use strict';
  const { $, $$, esc, fmt } = UI;
  let ITEMS = {};
  const view = { sort: 'power', el: 'all' };
  try { Object.assign(view, Save.pref('roster') || {}); } catch (_) { /* default */ }

  const SORTS = {
    power: (a, b) => b.power - a.power,
    rarity: (a, b) => b.def.rarity - a.def.rarity || b.power - a.power,
    level: (a, b) => b.unit.level - a.unit.level || b.power - a.power,
    element: (a, b) => Rules.ELEMENTS.indexOf(a.def.element) - Rules.ELEMENTS.indexOf(b.def.element) || b.power - a.power,
    newest: (a, b) => (b.unit.obtained || 0) - (a.unit.obtained || 0),
  };

  function renderGrid() {
    const all = Rules.ownedList();
    const list = all.filter((v) => view.el === 'all' || v.def.element === view.el).sort(SORTS[view.sort] || SORTS.power);
    $('#grid').innerHTML = list.length ? list.map((v) => UI.unitCard(v)).join('') : '<p class="empty">No sorcerers match. Summon more at the Summon hall.</p>';
    $('#count').textContent = list.length + ' / ' + all.length + ' units · ' + Data.characters.length + ' in the archive';
    $$('.el-filter button').forEach((b) => b.classList.toggle('active', b.dataset.el === view.el));
  }

  function render() {
    $('#main').innerHTML = `
      <div class="toolbar">
        <div class="el-filter" role="group" aria-label="Element filter">
          <button class="all" data-el="all" type="button">All</button>
          ${Rules.ELEMENTS.map((e) => `<button data-el="${e}" type="button" title="${e}"><img src="${Art.orb(e)}" alt="${e}"></button>`).join('')}
        </div>
        <label class="row" style="gap:6px"><span class="muted" style="font-size:12px">Sort</span>
          <select class="input" id="sort" style="height:32px;font-size:13px">
            ${Object.keys(SORTS).map((k) => `<option value="${k}"${k === view.sort ? ' selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}
          </select></label>
        <span class="count" id="count"></span>
      </div>
      <div class="unit-grid" id="grid"></div>`;
    $('.el-filter').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      view.el = b.dataset.el; Save.pref('roster', view); renderGrid();
    });
    $('#sort').addEventListener('change', (e) => { view.sort = e.target.value; Save.pref('roster', view); renderGrid(); });
    $('#grid').addEventListener('click', (e) => {
      const c = e.target.closest('.ucard');
      if (c) openDetail(c.dataset.id);
    });
    renderGrid();
    const want = decodeURIComponent(location.hash.slice(1));
    if (want && Rules.unitView(want)) openDetail(want);
  }

  function skillsHtml(d) {
    const u = d.ultimate;
    const icon = (k) => (d.art && d.art.skills && d.art.skills[k] ? `<img class="skill-icon" src="${esc(d.art.skills[k])}" alt="" loading="lazy">` : '');
    const tech = (t, n) => (t ? `<div class="skill is-tech">${icon('s' + n)}<h4>${esc(t.name)} <small>Skill ${n}</small><span class="cost">${t.cost} CE</span></h4><p>${esc(t.desc)}</p></div>` : '');
    return `
      <div class="skill">${icon('normal')}<h4>${esc(d.basic.name)} <small>Normal attack</small><span class="cost">+1 CE</span></h4><p>${(d.basic.mult || 1).toFixed(1)}x attack to one curse. Builds cursed energy.</p></div>
      ${tech(d.technique, 1)}${tech(d.technique2, 2)}
      ${u ? `<div class="skill is-ult">${icon('ult')}<h4>${esc(u.name)} <small>${u.kind === 'domain' ? 'Domain Expansion' : 'Ultimate'}</small><span class="cost">${u.cost} CE · full gauge</span></h4><p>${esc(u.desc)}</p></div>` : ''}
      ${(d.passives || []).map((p) => `<div class="skill is-passive"><h4>${esc(p.name)} <small>Passive</small></h4><p>${esc(p.desc)}</p></div>`).join('')}
      ${d.support ? `<div class="skill is-support"><h4>${esc(d.support.name)} <small>Support skill</small></h4><p>${esc(d.support.desc)} (when set as Support)</p></div>` : ''}`;
  }

  function openDetail(id) {
    let m = null;
    const draw = () => {
      const v = Rules.unitView(id);
      if (!v) return;
      const d = v.def, u = v.unit;
      const need = Rules.expToNext(u.level);
      const maxed = u.level >= v.maxLevel;
      const next = maxed ? null : Rules.statsAt(d, u.level + 1, u.dupes);
      const s = Save.get();
      const html = `<div class="detail" style="--rc:var(--r${Math.min(7, Math.max(3, d.rarity))})">
        <div class="detail-art">${Art.img(d, 'full', { eager: true })}</div>
        <div>
          <div class="detail-head">${UI.orb(d.element)}<h3>${esc(d.name)}</h3>${UI.stars(d.rarity)}
            ${d.guest ? `<span class="badge is-guest">GUEST · ${esc(d.sourceGame)}</span>` : ''}
            ${u.dupes ? `<span class="badge">+${u.dupes}</span>` : ''}
            <span class="title">${esc(d.title)} · ${esc(d.affiliation || '')}</span></div>
          <div class="level-row"><b>Lv ${u.level} / ${v.maxLevel}</b>
            <div class="bar"><i style="width:${maxed ? 100 : Math.min(100, (u.exp / need) * 100)}%"></i></div>
            <small class="muted">${maxed ? 'MAX' : fmt(u.exp) + ' / ' + fmt(need)}</small></div>
          <div class="stat-list">
            <div class="stat"><small>HEALTH</small><b>${fmt(v.stats.hp)}</b>${next ? `<span class="next">+${fmt(next.hp - v.stats.hp)}</span>` : ''}</div>
            <div class="stat"><small>ATTACK</small><b>${fmt(v.stats.atk)}</b>${next ? `<span class="next">+${fmt(next.atk - v.stats.atk)}</span>` : ''}</div>
            <div class="stat"><small>SPEED</small><b>${fmt(v.stats.speed)}</b>${next ? `<span class="next">+${fmt(next.speed - v.stats.speed)}</span>` : ''}</div>
          </div>
          <div class="section-title" style="margin-top:10px">Level up <small>呪符 · TALISMANS</small></div>
          <div class="feed">${['talisman_s', 'talisman_m', 'talisman_l'].map((k) => `
            <div class="feed-item">${UI.itemIcon(k, ITEMS)}<small>${esc(ITEMS[k].name)}</small>
              <span class="qty">×${s.items[k] || 0} · +${fmt(ITEMS[k].exp)}</span>
              <button class="jjk-btn is-small" type="button" data-feed="${k}" ${maxed || !(s.items[k] > 0) ? 'disabled' : ''}>Use</button></div>`).join('')}</div>
          <div class="row wrap" style="margin-bottom:10px">
            <button class="jjk-btn is-small" type="button" id="home-set">Set as Home</button>
            <a class="jjk-btn is-small" href="teams.html">Teams</a>
            <span class="muted" style="font-size:12px">Power <b class="gold">${fmt(v.power)}</b></span>
          </div>
          <div class="section-title">Techniques <small>術式 · SKILLS</small></div>
          ${skillsHtml(d)}
          ${d.borrowedFrom ? `<p class="muted" style="font-size:11px">Guest techniques are borrowed from ${esc((Data.char(d.borrowedFrom) || {}).name || '')} (same element).</p>` : ''}
        </div></div>`;
      if (!m) {
        m = UI.modal(html, { title: d.name, sub: d.kanji ? d.kanji + ' · ' + d.element.toUpperCase() : d.element, onClose: () => { history.replaceState(null, '', location.pathname); renderGrid(); } });
        m.el.addEventListener('click', onClick);
      } else m.el.querySelector('.modal-body').innerHTML = html;
    };
    const onClick = (e) => {
      const f = e.target.closest('[data-feed]');
      if (f) {
        const k = f.dataset.feed;
        let res = null;
        Save.update((s) => {
          if (!(s.items[k] > 0)) return;
          s.items[k]--;
          res = Rules.addExpTo(s, id, ITEMS[k].exp);
        });
        if (res && res.to > res.from) { UI.toast('Level up! Lv ' + res.from + ' → ' + res.to, 'good'); UI.sfx('rare'); } else UI.sfx('tap');
        draw();
      }
      if (e.target.closest('#home-set')) {
        Save.update((s) => { s.profile.homeUnit = id; });
        UI.toast('Home character set', 'good');
      }
    };
    history.replaceState(null, '', '#' + encodeURIComponent(id));
    draw();
  }

  UI.boot({ data: ['characters', 'items'], init: () => Data.load('items').then((it) => { ITEMS = it.items; render(); }) });
  window.addEventListener('portal:imported', () => { if ($('#grid')) renderGrid(); });
})();
