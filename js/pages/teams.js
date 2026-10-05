/* teams.html — 3 team presets: 4 front slots + 1 support (commander). */
(function () {
  'use strict';
  const { $, $$, esc, fmt } = UI;
  let teamIdx = 0;
  let sel = 0;            // selected slot: 0-3 front, 4 support

  function team() { return Save.get().teams[teamIdx]; }
  function slotId(i) { const t = team(); return i === 4 ? t.support : t.slots[i]; }

  function draw() {
    const s = Save.get();
    const t = team();
    const sup = t.support && Rules.unitView(t.support);
    const supSkill = sup && sup.def.support;
    $('#tabs').innerHTML = s.teams.map((tm, i) => `<button class="jjk-tab${i === teamIdx ? ' active' : ''}" data-t="${i}" type="button">${esc(tm.name)}${i === s.activeTeam ? ' ◆' : ''}</button>`).join('');
    const ORD = ['1st', '2nd', '3rd', '4th', ''];
    const slot = (i) => {
      const id = slotId(i);
      const v = id && Rules.unitView(id);
      const d = v && v.def;
      const card = d ? `${Art.img(d, 'portrait', { alt: '' })}${UI.focusTag(d)}<span class="fm-lv">Lv${v.unit.level}</span>${UI.typeBadge(d, 'fm-type')}
          <span class="fm-strip">${UI.rarityBadge(d)}<span>${esc(d.name)}</span></span>` : `<span class="fm-empty">${UI.icon('plus')}<small>${i === 4 ? 'Backup' : 'Empty'}</small></span>`;
      return `<button class="slot-box fm-card${d ? ' t-' + UI.typeOf(d).toLowerCase() + ' is-' + UI.rarityOf(d).toLowerCase() : ' is-empty'}${i === 4 ? ' is-support' : ''}${sel === i ? ' is-sel' : ''}" data-slot="${i}" type="button" aria-label="${i === 4 ? 'Backup (support) slot' : 'Main slot ' + (i + 1)}">
          ${ORD[i] ? `<span class="fm-ord">${ORD[i]}</span>` : ''}${card}</button>`;
    };
    $('#formation').innerHTML = `
      <div class="formation-head"><h3>${esc(t.name)}</h3>
        <button class="pp-stone fm-mini" id="rename" type="button" aria-label="Rename team" title="Rename">✎</button>
        <span class="power">Current Power <b>${fmt(Rules.teamPower(t))}</b></span>
        <button class="jjk-btn is-small${s.activeTeam === teamIdx ? ' is-primary' : ''}" id="activate" type="button">${s.activeTeam === teamIdx ? 'Active team' : 'Set active'}</button></div>
      <div class="fm-row">
        <div class="fm-main"><h4 class="brush">Main</h4><div class="fm-cards">${[0, 1, 2, 3].map(slot).join('')}</div></div>
        <div class="fm-backup"><h4 class="brush">Backup</h4><div class="fm-cards">${slot(4)}</div></div>
      </div>
      <div class="fm-tools"><button class="pp-stone" id="auto" type="button">Quick Format</button><button class="pp-stone" id="clear" type="button">Clear Slot</button>
        <p class="support-note">${supSkill ? `Backup · <b>${esc(supSkill.name)}</b>: ${esc(supSkill.desc)}` : 'The Backup does not fight; its support skill boosts the whole Main line.'}</p></div>`;
    const used = new Set([...t.slots, t.support].filter(Boolean));
    const list = Rules.ownedList().sort((a, b) => b.power - a.power);
    $('#pick-title').textContent = sel === 4 ? 'Pick the Backup' : 'Pick for Main ' + (sel + 1);
    $('#pick').innerHTML = list.map((v) => UI.unitCard(v, { picked: v.id === slotId(sel), dim: used.has(v.id) && v.id !== slotId(sel), tag2: false })).join('');
  }

  function place(id) {
    Save.update((s) => {
      const t = s.teams[teamIdx];
      const cur = sel === 4 ? t.support : t.slots[sel];
      // a unit can only be in one place in a team: swap it out of its old slot
      const oldFront = t.slots.indexOf(id);
      const wasSup = t.support === id;
      if (cur === id) { if (sel === 4) t.support = null; else t.slots[sel] = null; return; }
      if (oldFront >= 0) t.slots[oldFront] = cur || null;
      if (wasSup) t.support = cur || null;
      if (sel === 4) t.support = id; else t.slots[sel] = id;
    });
    if (sel < 3) sel++;
    UI.sfx('tap');
    draw();
  }

  function render() {
    teamIdx = Save.get().activeTeam;
    $('#main').innerHTML = `<div class="tabs" id="tabs"></div>
      <section class="formation" id="formation"></section>
      <section class="picker jjk-panel"><div class="section-title" id="pick-title">Pick</div><div class="unit-grid" id="pick"></div></section>`;
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { teamIdx = +b.dataset.t; sel = 0; draw(); } });
    $('#formation').addEventListener('click', async (e) => {
      const sb = e.target.closest('[data-slot]');
      if (sb) { sel = +sb.dataset.slot; draw(); return; }
      if (e.target.closest('#activate')) { Save.update((s) => { s.activeTeam = teamIdx; }); UI.toast(team().name + ' is now active', 'good'); draw(); }
      if (e.target.closest('#clear')) { Save.update((s) => { const t = s.teams[teamIdx]; if (sel === 4) t.support = null; else t.slots[sel] = null; }); draw(); }
      if (e.target.closest('#auto')) {
        const best = Rules.ownedList().sort((a, b) => b.power - a.power).map((v) => v.id);
        Save.update((s) => { const t = s.teams[teamIdx]; t.slots = [0, 1, 2, 3].map((i) => best[i] || null); t.support = best[4] || null; });
        draw();
      }
      if (e.target.closest('#rename')) {
        const name = prompt('Team name', team().name);
        if (name && name.trim()) { Save.update((s) => { s.teams[teamIdx].name = name.trim().slice(0, 20); }); draw(); }
      }
    });
    $('#pick').addEventListener('click', (e) => { const c = e.target.closest('.ucard'); if (c) place(c.dataset.id); });
    draw();
  }

  UI.boot({ back: 'formation.html', data: ['characters'], init: render });
  window.addEventListener('portal:imported', () => { if ($('#pick')) draw(); });
})();
