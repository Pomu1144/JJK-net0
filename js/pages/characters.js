/* characters.html — roster grid + detail (stats, skills, level-up with Training Lights + JP). */
(function () {
  'use strict';
  const { $, $$, esc, fmt } = UI;
  let ITEMS = {};
  const view = { sort: 'level', el: 'all', show: 'lv', q: '' };
  try { Object.assign(view, Save.pref('roster') || {}, { q: '' }); } catch (_) { /* default */ }

  const SORTS = {
    level: (a, b) => b.unit.level - a.unit.level || b.power - a.power,
    power: (a, b) => b.power - a.power,
    rarity: (a, b) => b.def.rarity - a.def.rarity || b.power - a.power,
    element: (a, b) => Rules.ELEMENTS.indexOf(a.def.element) - Rules.ELEMENTS.indexOf(b.def.element) || b.power - a.power,
    newest: (a, b) => (b.unit.obtained || 0) - (a.unit.obtained || 0),
  };
  const SORT_LABEL = { level: 'Lv', power: 'CP', rarity: 'Rarity', element: 'Type', newest: 'New' };
  /** What the card's corner shows; "Switch" cycles it, as in the game. */
  const SHOW = { lv: 'Lv', cp: 'CP', awak: 'Awakening' };
  const SORT_IC = '<svg class="ch-sort-ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h3v11h2.5L4.5 18 .5 14H3zM10 4h8M10 8h6M10 12h4M10 16h2" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const SWITCH_IC = '<svg class="ch-sw-ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7h12l-3-3M17 13H5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /** The red "!" on a card: a Training Light can level this unit now. */
  function canEnhance(v) {
    const s = Save.get();
    return v.unit.level < v.maxLevel && ['light_s', 'light_m', 'light_l'].some((k) => (s.items[k] || 0) > 0 && s.currency.yen >= ((ITEMS[k] || {}).jp || 0));
  }

  function corner(v) {
    if (view.show === 'cp') return `<span class="uc-lv is-cp">CP<b>${fmt(v.power)}</b></span>`;
    if (view.show === 'awak') return `<span class="uc-lv">Awk<b>${v.unit.dupes || 0}</b></span>`;
    return `<span class="uc-lv">Lv<b>${v.unit.level}</b></span>`;
  }

  function renderGrid() {
    const all = Rules.ownedList();
    const q = view.q.trim().toLowerCase();
    const list = all.filter((v) => (view.el === 'all' || v.def.element === view.el)
      && (!q || (v.def.name + ' ' + (v.def.title || '')).toLowerCase().includes(q))).sort(SORTS[view.sort] || SORTS.level);
    $('#grid').innerHTML = list.length ? list.map((v, i) => `<div class="ch-cell c${i % 4}">${canEnhance(v) ? '<i class="ch-alert" aria-label="Can be enhanced">!</i>' : ''}${UI.unitCard(v, { wide: true, hideName: true, corner: corner(v), artKind: 'portrait' })}</div>`).join('')
      : '<p class="empty">No sorcerers match. Summon more at the Summon hall.</p>';
    $('#ch-sort-l').textContent = SORT_LABEL[view.sort] || 'Lv';
    $('#ch-filter-on').hidden = view.el === 'all' && !q;
    $('#ch-show').textContent = SHOW[view.show];
  }

  /** Sort & filter sheet: type filter and sort key. */
  function openSort() {
    const m = UI.modal(`<div class="ch-sheet"><h4>Type</h4><div class="el-filter" role="group">
        <button class="all${view.el === 'all' ? ' active' : ''}" data-el="all" type="button">All</button>
        ${Rules.ELEMENTS.map((e) => `<button class="${view.el === e ? 'active' : ''}" data-el="${e}" type="button" aria-label="${UI.typeOf(e)} type">${UI.typeBadge(e)}</button>`).join('')}</div>
      <h4>Sort</h4><div class="ch-sorts">${Object.keys(SORTS).map((k) => `<button class="jjk-tab${k === view.sort ? ' active' : ''}" data-sort="${k}" type="button">${SORT_LABEL[k]}</button>`).join('')}</div></div>`,
    { title: 'Sort / Filter', sub: '並び替え' });
    m.el.addEventListener('click', (e) => {
      const el = e.target.closest('[data-el]'), so = e.target.closest('[data-sort]');
      if (!el && !so) return;
      if (el) view.el = el.dataset.el;
      if (so) view.sort = so.dataset.sort;
      Save.pref('roster', Object.assign({}, view, { q: '' }));
      renderGrid();
      m.el.querySelectorAll('[data-el]').forEach((b) => b.classList.toggle('active', b.dataset.el === view.el));
      m.el.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('active', b.dataset.sort === view.sort));
    });
  }

  function render() {
    const right = $('.topbar .top-right');
    if (right && !$('.ch-tools')) right.insertAdjacentHTML('afterbegin', `<div class="ch-tools">
        <label class="ch-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12l5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          <input id="ch-q" type="search" placeholder="Keyword Search" aria-label="Keyword Search" autocomplete="off"></label>
        <span class="ch-stack"><i class="ch-filter-on" id="ch-filter-on" hidden>Filter On</i>
          <button class="jjk-btn is-primary ch-sort" id="ch-sort" type="button">${SORT_IC}<span id="ch-sort-l">Lv</span></button></span>
        <span class="ch-stack"><i class="ch-show" id="ch-show">Lv</i>
          <button class="pp-stone ch-switch" id="ch-switch" type="button">${SWITCH_IC}<span>Switch</span></button></span>
      </div>`);
    $('#main').innerHTML = '<div class="unit-grid roster-grid ch-grid" id="grid"></div>';
    $('#ch-q').addEventListener('input', (e) => { view.q = e.target.value; renderGrid(); });
    $('#ch-sort').addEventListener('click', openSort);
    $('#ch-switch').addEventListener('click', () => {
      const k = Object.keys(SHOW); view.show = k[(k.indexOf(view.show) + 1) % k.length];
      Save.pref('roster', Object.assign({}, view, { q: '' })); UI.sfx('tap'); renderGrid();
    });
    $('#grid').addEventListener('click', (e) => {
      const c = e.target.closest('.ucard');
      if (c) openDetail(c.dataset.id);
    });
    renderGrid();
    const want = decodeURIComponent(location.hash.slice(1));
    if (want && Rules.unitView(want)) openDetail(want);
  }

  /** Command skills (normal, Skill 1, Skill 2, Ultimate) and auto-skills (passives, support). */
  function skillList(d) {
    const ic = (k) => (d.art && d.art.skills && d.art.skills[k]) || '';
    const u = d.ultimate;
    const cmd = [
      { k: 'normal', icon: ic('normal'), name: d.basic.name, label: 'Attack', cost: '+1', desc: (d.basic.mult || 1).toFixed(1) + 'x attack to one enemy. Builds cursed energy.' },
      d.technique && { k: 's1', icon: ic('s1'), name: d.technique.name, label: 'Skill 1', cost: d.technique.cost, desc: d.technique.desc },
      d.technique2 && { k: 's2', icon: ic('s2'), name: d.technique2.name, label: 'Skill 2', cost: d.technique2.cost, desc: d.technique2.desc },
      u && { k: 'ult', icon: ic('ult'), name: u.name, label: u.kind === 'domain' ? 'Domain Expansion' : 'Ultimate', cost: u.cost + ' · full gauge', desc: u.desc },
    ].filter(Boolean);
    const auto = (d.passives || []).map((p, i) => ({ k: 'p' + i, name: p.name, label: 'Passive', desc: p.desc }))
      .concat(d.support ? [{ k: 'sup', name: d.support.name, label: 'Support skill', desc: d.support.desc + ' (when set as Backup)' }] : []);
    return { cmd, auto };
  }

  function openDetail(id) {
    let m = null;
    let pick = 's1';
    let showDesc = false; // the skill text opens when a skill is tapped, as in the game
    let mode = 'main';        // 'main' | 'lv' (Training Light feed)
    let expanded = false;     // art-only view
    // prev / next follow the roster, strongest first
    const order = Rules.ownedList().sort((a, b) => b.power - a.power).map((x) => x.id);
    const draw = () => {
      const v = Rules.unitView(id);
      if (!v) return;
      const d = v.def, u = v.unit;
      const need = Rules.expToNext(u.level);
      const maxed = u.level >= v.maxLevel;
      const next = maxed ? null : Rules.statsAt(d, u.level + 1, u.dupes);
      const s = Save.get();
      const t = UI.typeOf(d).toLowerCase();
      const sk = skillList(d);
      const all = sk.cmd.concat(sk.auto);
      const cur = all.find((x) => x.k === pick) || all[0];
      const plus = (a, b) => (next ? `<em>+${fmt(a - b)}</em>` : '');
      const kanji = (x) => esc(String(x.name || '?').replace(/^[^A-Za-z0-9]*/, '').charAt(0) || '術');
      const autoCells = sk.auto.map((x) => `<button class="enh-hex${x.k === pick ? ' on' : ''}" type="button" data-skill="${x.k}" title="${esc(x.name)}"><span>${kanji(x)}</span></button>`)
        .concat(Array.from({ length: Math.max(0, 4 - sk.auto.length) }, () => '<span class="enh-hex is-empty"></span>')).join('');
      const K = 'assets/pp/ui/kit/', E = 'assets/pp/ui/enhance/';
      const cmdLbl = (x) => (x.k === 'normal' ? 'ATK' : x.k === 'ult' ? 'ULT' : x.label.replace('Skill ', 'S'));
      const autoSlots = sk.auto.map((x) => `<button class="enh-slot${x.k === pick ? ' on' : ''}" type="button" data-skill="${x.k}" title="${esc(x.name)}"><span class="enh-hex"><span>${kanji(x)}</span></span></button>`)
        .concat(Array.from({ length: Math.max(0, 4 - sk.auto.length) }, () => `<span class="enh-slot is-empty"><img src="${K}slot-empty.webp" alt=""></span>`)).join('');
      const lvMode = mode === 'lv';
      const html = `<div class="enh is-pp t-${t} is-${UI.rarityOf(d).toLowerCase()}${expanded ? ' is-expanded' : ''}">
        <div class="enh-art">${Art.img(d, 'full', { eager: true, alt: '' })}
          <div class="enh-head"><button class="jjk-icon-btn enh-back" type="button" aria-label="Back">${UI.icon('back')}</button><h1 class="jjk-title-plate"><span>Enhance</span></h1></div>
          <button class="enh-kit-sq" type="button" id="enh-expand" aria-label="View art" title="View art"><img src="${K}sq-expand.webp" alt=""></button>
          ${order.length > 1 ? `<button class="enh-arrow is-l" type="button" data-step="-1" aria-label="Previous sorcerer"><img src="${K}arrow-l.webp" alt=""></button>` : ''}
          <div class="enh-id">
            <div class="enh-namebox">${UI.rarityBadge(d)}<div class="enh-name"><small>${esc(d.title || '')}</small><h2>${esc(d.name)}</h2></div></div>
            <div class="enh-tags"><span class="enh-type">${UI.typeBadge(d)}</span>${UI.focusTag(d)}${d.rarity >= 7 || d.limited ? '<span class="limited-tag">LIMITED</span>' : ''}${d.guest ? `<span class="badge is-guest">GUEST · ${esc(d.sourceGame)}</span>` : ''}
              <button class="enh-attr" type="button" id="enh-attr"><img src="${E}attr-btn.webp" alt="Attribute Overview"></button></div>
          </div>
        </div>
        <div class="enh-panel">
          ${order.length > 1 ? `<button class="enh-arrow is-r" type="button" data-step="1" aria-label="Next sorcerer"><img src="${K}arrow-r.webp" alt=""></button>` : ''}
          <div class="enh-top">
            <div class="enh-lv"><small>Lv</small><b>${u.level}<span>/${v.maxLevel}</span></b>
              <div class="bar"><i style="width:${maxed ? 100 : Math.min(100, (u.exp / need) * 100)}%"></i></div>
              <small class="enh-exp">${maxed ? 'MAX LEVEL' : 'EXP ' + fmt(u.exp) + ' / ' + fmt(need)}</small></div>
            <div class="enh-gradebox"><img class="enh-headimg" src="${E}grade-head.webp" alt="GRADE"><span class="enh-dial"><b>1</b></span></div>
            <div class="enh-awakbox"><img class="enh-headimg" src="${E}awak-head.webp" alt="Awakening"><span class="enh-hexval"><b>${u.dupes || 0}</b></span></div>
          </div>
          <div class="enh-grid">
            <dl class="enh-stats">
              <div><dt>CP</dt><dd>${fmt(v.power)}</dd></div>
              <div><dt>HP</dt><dd>${fmt(v.stats.hp)}${plus(next && next.hp, v.stats.hp)}</dd></div>
              <div><dt>Attack</dt><dd>${fmt(v.stats.atk)}${plus(next && next.atk, v.stats.atk)}</dd></div>
              <div><dt>Speed</dt><dd>${fmt(v.stats.speed)}${plus(next && next.speed, v.stats.speed)}</dd></div>
              <div><dt>Focus</dt><dd>${esc(d.focus || '—')}</dd></div>
              <div><dt>Init. CE</dt><dd>${Rules.BATTLE.ceStart}</dd></div>
              <div><dt>Max CE</dt><dd>${Rules.BATTLE.ceMax}</dd></div>
            </dl>
            <div class="enh-skills">
              <div class="enh-sk-h">Command Skills</div>
              <div class="enh-sk-row">${sk.cmd.map((x) => `<button class="enh-sk${x.k === pick ? ' on' : ''}" type="button" data-skill="${x.k}" title="${esc(x.name)}">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : `<span class="enh-sk-k">${kanji(x)}</span>`}<small>${cmdLbl(x)}</small></button>`).join('')}</div>
              <div class="enh-sk-h">Auto-Skills</div>
              <div class="enh-sk-row">${autoSlots}</div>
            </div>
          </div>
          ${cur && showDesc ? `<div class="enh-desc is-pop" id="enh-desc"><b>${esc(cur.name)}</b> <small>${esc(cur.label)}</small>${cur.cost != null ? `<span class="cost"><img src="assets/pp/ui/Energy.webp" alt="CE">${esc(cur.cost)}</span>` : ''}<p>${esc(cur.desc || '')}</p></div>` : ''}
          <div class="enh-seal" title="Phantom Seal Stamp: +10 levels past the cap (coming later)"><img src="${E}seal-plate.webp" alt="Phantom Seal Stamp"><b>${fmt(s.items.phantom_seal || 0)}</b></div>
          ${lvMode ? `<div class="enh-btns is-feed">${['light_s', 'light_m', 'light_l'].map((k) => `
            <button class="enh-btn" type="button" data-feed="${k}" ${maxed || !(s.items[k] > 0) || s.currency.yen < (ITEMS[k].jp || 0) ? 'disabled' : ''} title="${esc(ITEMS[k].desc)}">${UI.itemIcon(k, ITEMS)}<span><b>${esc(ITEMS[k].name.replace(/^Training Light /, 'Light '))}</b><small>+${fmt(ITEMS[k].exp)} EXP · ${UI.YEN_SVG}${fmt(ITEMS[k].jp || 0)}</small><em>×${s.items[k] || 0}</em></span></button>`).join('')}
            <button class="enh-btn is-done" type="button" data-mode="main"><span><b>Done</b></span></button>
          </div>
          <small class="enh-jp muted">${UI.YEN_SVG} ${fmt(s.currency.yen)} JP · Training Lights drop in the <a href="missions.html#strengthen">Training Light Quest</a></small>` : `<div class="enh-btns is-main">
            <button class="enh-btn enh-pb" type="button" data-mode="lv"><span><b>Lv</b><small>Enhancement</small></span>${!maxed && ['light_s', 'light_m', 'light_l'].some((k) => s.items[k] > 0) ? '<i class="nav-dot">!</i>' : ''}</button>
            <button class="enh-btn enh-pb" type="button" data-soon="Grade"><span><b>GRADE</b><small>Enhancement</small></span></button>
            <button class="enh-btn enh-pb" type="button" id="enh-awak"><span><b class="is-mid">Awakening</b><small class="enh-strip"><img src="${E}awak-hex.webp" alt="">${u.dupes || 0} / ${Rules.MAX_DUPES}</small></span></button>
            <button class="enh-btn enh-pb" type="button" data-soon="Skill"><span><b>Skill</b><small>Enhancement</small></span></button>
          </div>`}
          <div class="enh-foot">
            <button class="pp-stone" type="button" id="home-set">${UI.icon('home')}<span>Set as Home</span></button>
            <a class="pp-stone" href="teams.html">${UI.icon('teams')}<span>Team Formation</span></a>
            ${d.borrowedFrom ? `<small class="muted">Guest techniques are borrowed from ${esc((Data.char(d.borrowedFrom) || {}).name || '')} (same type).</small>` : ''}
          </div>
        </div></div>`;
      if (!m) {
        m = UI.modal(html, { cls: 'is-full', onClose: () => { history.replaceState(null, '', location.pathname); renderGrid(); } });
        m.el.addEventListener('click', onClick);
      } else m.el.querySelector('.modal-body').innerHTML = html;
    };
    const onClick = (e) => {
      if (e.target.closest('.enh-back')) { m.close(); return; }
      if (expanded && !e.target.closest('#enh-expand')) { expanded = false; draw(); return; }
      const st = e.target.closest('[data-step]');
      if (st) {
        const i = order.indexOf(id);
        id = order[(i + Number(st.dataset.step) + order.length) % order.length];
        pick = 's1'; mode = 'main'; showDesc = false;
        history.replaceState(null, '', '#' + encodeURIComponent(id));
        UI.sfx('tap'); draw(); return;
      }
      if (e.target.closest('#enh-expand')) { expanded = !expanded; draw(); return; }
      const md = e.target.closest('[data-mode]');
      if (md) { mode = md.dataset.mode; UI.sfx('tap'); draw(); return; }
      const so = e.target.closest('[data-soon]');
      if (so) { UI.toast(so.dataset.soon + ' Enhancement uses Cursed Objects / Cursed Crystals, which arrive with the Cursed Object Collection mode.', 'bad'); return; }
      if (e.target.closest('#enh-awak')) {
        const vv = Rules.unitView(id);
        UI.modal(`<p style="margin-top:0">Awakening (Limit Break) rises with every duplicate you draw, up to ${Rules.MAX_DUPES}. Each level adds +${Rules.DUPE_BONUS}% to all stats; duplicates beyond that turn into JP.</p><p><b>${esc(vv.def.name)}</b>: Awakening ${vv.unit.dupes || 0} / ${Rules.MAX_DUPES}</p>`, { title: 'Awakening', sub: '覚醒' });
        return;
      }
      if (e.target.closest('#enh-attr')) {
        const dd = Rules.unitDef(id);
        UI.modal(`<dl class="enh-attrlist"><div><dt>Type</dt><dd>${UI.typeLabel(dd)}</dd></div><div><dt>Role</dt><dd>${esc(dd.role || '—')}</dd></div><div><dt>Focus</dt><dd>${esc(dd.focus || '—')}</dd></div><div><dt>Affiliation</dt><dd>${esc(dd.affiliation || '—')}</dd></div>${dd.support ? `<div><dt>Backup skill</dt><dd><b>${esc(dd.support.name)}</b> — ${esc(dd.support.desc)}</dd></div>` : ''}${(dd.passives || []).map((p) => `<div><dt>Auto-Skill</dt><dd><b>${esc(p.name)}</b> — ${esc(p.desc)}</dd></div>`).join('')}</dl>`, { title: 'Attribute Overview', sub: esc(dd.name) });
        return;
      }
      const sk = e.target.closest('[data-skill]');
      if (sk) { showDesc = !(showDesc && pick === sk.dataset.skill); pick = sk.dataset.skill; UI.sfx('tap'); draw(); return; }
      if (showDesc && e.target.closest('#enh-desc')) { showDesc = false; draw(); return; }
      const f = e.target.closest('[data-feed]');
      if (f) {
        const k = f.dataset.feed;
        let res = null;
        Save.update((s) => {
          const jp = ITEMS[k].jp || 0;
          if (!(s.items[k] > 0) || s.currency.yen < jp) return;
          s.items[k]--;
          s.currency.yen -= jp;
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

  UI.boot({ back: 'formation.html', hud: false, data: ['characters', 'items'], init: () => Data.load('items').then((it) => { ITEMS = it.items; render(); }) });
  window.addEventListener('portal:imported', () => { if ($('#grid')) renderGrid(); });
})();
