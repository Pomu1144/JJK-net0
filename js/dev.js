/* js/dev.js — developer panel. Loaded by UI.boot when ?dev=1 has been used once
 * (remembered in jjk_pref_dev; ?dev=0 turns it off). Adds a small DEV button;
 * every action edits the save through Save.update and reloads the page so all
 * screens show the new state. Self-contained: styles are injected here.
 */
(function (global) {
  'use strict';
  if (global.__devPanel) return;
  global.__devPanel = true;

  const EVENT_ID = 'ev_night_parade';
  const css = `
  .dev-fab { position: fixed; z-index: 4000; left: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; padding: 7px 3px; font: 800 9px/1 system-ui, sans-serif; letter-spacing: .12em;
    color: #111; background: #7CFC9A; border: 1px solid #0b3; border-left: 0; border-radius: 0 5px 5px 0; box-shadow: 0 2px 6px rgba(0,0,0,.6); cursor: pointer; opacity: .55; }
  .dev-fab:hover { opacity: 1; }
  .dev-panel { position: fixed; z-index: 4001; inset: 8px; max-width: 720px; margin: 0 auto; display: flex; flex-direction: column;
    background: rgba(12, 16, 20, .97); color: #e8f0e8; border: 1px solid #2f6; border-radius: 8px; font: 13px/1.35 system-ui, sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,.7); }
  .dev-panel[hidden] { display: none; }
  .dev-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #234; }
  .dev-head b { color: #7CFC9A; letter-spacing: .1em; }
  .dev-head .sp { flex: 1; }
  .dev-tabs { display: flex; gap: 2px; padding: 6px 8px 0; flex-wrap: wrap; }
  .dev-tabs button { padding: 5px 10px; background: #1b2329; color: #bcd; border: 1px solid #2a3a44; border-bottom: 0; border-radius: 5px 5px 0 0; cursor: pointer; font: inherit; }
  .dev-tabs button.on { background: #24333c; color: #7CFC9A; }
  .dev-body { flex: 1; overflow: auto; padding: 10px; border-top: 1px solid #2a3a44; }
  .dev-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
  .dev-row > span { min-width: 120px; color: #9ab; }
  .dev-panel button.d { padding: 5px 9px; background: #23313a; color: #e8f0e8; border: 1px solid #3c5563; border-radius: 4px; cursor: pointer; font: inherit; }
  .dev-panel button.d:hover { background: #2d4250; }
  .dev-panel button.d.warn { border-color: #a44; color: #fbb; }
  .dev-panel input, .dev-panel select { padding: 4px 6px; background: #0e1418; color: #e8f0e8; border: 1px solid #3c5563; border-radius: 4px; font: inherit; }
  .dev-panel textarea { width: 100%; min-height: 160px; background: #0e1418; color: #cfe; border: 1px solid #3c5563; font: 11px/1.3 ui-monospace, monospace; }
  .dev-stat { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 10px; margin-bottom: 10px; color: #cde; }
  .dev-stat b { color: #fff; }
  .dev-msg { color: #7CFC9A; min-height: 1.3em; }
  .dev-panel button.dev-big { background: #1d5a2c; border-color: #7CFC9A; color: #fff; font-weight: 800; }`;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const fmt = (n) => Number(n || 0).toLocaleString();
  let tab = global.location.pathname.endsWith('battle.html') ? 'battle' : 'currency';
  let panel = null;

  function apply(fn, msg) {
    Save.update(fn);
    say(msg || 'Done');
    if (global.UI && UI.paintHud) UI.paintHud();
    draw();
  }
  function say(t) { const m = $('.dev-msg', panel); if (m) m.textContent = t; }
  const reloadSoon = () => setTimeout(() => global.location.reload(), 350);

  function statsHtml() {
    const s = Save.get();
    const ap = Rules.staminaNow(s);
    const ev = (s.events || {})[EVENT_ID] || {};
    return `<div class="dev-stat">
      <div>Free Cubes <b>${fmt(s.currency.cubes)}</b></div><div>Paid Cubes <b>${fmt(s.currency.paidCubes)}</b></div>
      <div>JP <b>${fmt(s.currency.yen)}</b></div><div>Friendship Pt <b>${fmt(s.currency.fp)}</b></div>
      <div>AP <b>${ap.cur}/${ap.max}</b></div><div>Rank <b>${s.profile.rank}</b></div>
      <div>Units <b>${Object.keys(s.units).length}</b></div><div>Medals <b>${fmt(ev.tokens)}</b></div>
      <div>Tickets <b>${s.items.ticket || 0}</b></div><div>SSR tickets <b>${s.items.ssr_ticket || 0}</b></div>
      <div>Lights S/M/L <b>${s.items.light_s || 0}/${s.items.light_m || 0}/${s.items.light_l || 0}</b></div><div>GP cards <b>${s.items.gp_card || 0}</b></div>
    </div>`;
  }

  const TABS = {
    currency: () => `
      <div class="dev-row"><span>Free Cubes</span>${[3000, 30000, 100000, 300000].map((n) => `<button class="d" data-a="cubes" data-n="${n}">+${fmt(n)}</button>`).join('')}</div>
      <div class="dev-row"><span>Paid Cubes</span>${[100, 3000, 30000].map((n) => `<button class="d" data-a="paid" data-n="${n}">+${fmt(n)}</button>`).join('')}</div>
      <div class="dev-row"><span>JP</span>${[10000, 100000, 1000000].map((n) => `<button class="d" data-a="jp" data-n="${n}">+${fmt(n)}</button>`).join('')}</div>
      <div class="dev-row"><span>Friendship Pt</span>${[100, 1000].map((n) => `<button class="d" data-a="fp" data-n="${n}">+${fmt(n)}</button>`).join('')}</div>
      <div class="dev-row"><span>Phantom Medals</span>${[1000, 10000].map((n) => `<button class="d" data-a="medals" data-n="${n}">+${fmt(n)}</button>`).join('')}</div>
      <div class="dev-row"><span>AP</span><button class="d" data-a="ap">Refill</button><button class="d" data-a="ap999">Set 999</button></div>
      <div class="dev-row"><span>Player Rank</span><input type="number" id="dev-rank" min="1" max="200" value="${Save.get().profile.rank}" style="width:70px"><button class="d" data-a="rank">Set</button></div>
      <div class="dev-row"><span>Set exact</span><select id="dev-cur"><option value="cubes">Free Cubes</option><option value="paidCubes">Paid Cubes</option><option value="yen">JP</option><option value="fp">Friendship Pt</option></select>
        <input type="number" id="dev-val" value="0" style="width:110px"><button class="d" data-a="setcur">Set</button></div>`,
    items: () => `
      <div class="dev-row"><span>Training Lights</span><button class="d" data-a="item" data-k="light_s" data-n="50">+50 S</button><button class="d" data-a="item" data-k="light_m" data-n="20">+20 M</button><button class="d" data-a="item" data-k="light_l" data-n="10">+10 L</button></div>
      <div class="dev-row"><span>Draw Tickets</span><button class="d" data-a="item" data-k="ticket" data-n="10">+10</button><button class="d" data-a="item" data-k="ticket" data-n="100">+100</button></div>
      <div class="dev-row"><span>SSR Tickets</span><button class="d" data-a="item" data-k="ssr_ticket" data-n="1">+1</button><button class="d" data-a="item" data-k="ssr_ticket" data-n="5">+5</button></div>
      <div class="dev-row"><span>Gacha Pt Cards</span><button class="d" data-a="item" data-k="gp_card" data-n="100">+100</button></div>
      <div class="dev-row"><span>Gacha Points</span><button class="d" data-a="gp" data-n="250">+250 on every pickup banner</button></div>`,
    units: () => {
      const owned = Save.get().units;
      const opts = Data.characters.slice().sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name))
        .map((c) => `<option value="${c.id}">${owned[c.id] ? '✓ ' : ''}${c.rarityLabel || c.rarity} · ${c.name} — ${c.title || ''}</option>`).join('');
      return `
      <div class="dev-row"><span>Give unit</span><select id="dev-unit" style="max-width:100%">${opts}</select></div>
      <div class="dev-row"><span></span><button class="d" data-a="give" data-lv="1">Give Lv 1</button><button class="d" data-a="give" data-lv="max">Give max level</button><button class="d" data-a="lb">+1 Awakening</button></div>
      <div class="dev-row"><span>All units</span><button class="d" data-a="all" data-lv="1">Give all (Lv 1)</button><button class="d" data-a="all" data-lv="max">Give all (max)</button></div>
      <div class="dev-row"><span>Owned units</span><button class="d" data-a="maxown">Max level all owned</button><button class="d" data-a="lball">Awakening 5 all owned</button></div>
      <div class="dev-row"><span>Team 1</span><button class="d" data-a="bestteam">Fill with strongest owned</button></div>
      <div class="dev-row"><span>Remove</span><button class="d warn" data-a="clearunits">Remove all units except team 1</button></div>`;
    },
    progress: () => `
      <div class="dev-row"><span>Main Quest</span><button class="d" data-a="stages" data-n="1">Clear all (1★)</button><button class="d" data-a="stages" data-n="3">Clear all (3★)</button><button class="d warn" data-a="unstages">Reset story progress</button></div>
      <div class="dev-row"><span>Strengthening</span><button class="d" data-a="quests3">3★ all (auto-clear)</button><button class="d" data-a="questruns">Reset today's runs</button></div>
      <div class="dev-row"><span>Event Map</span><button class="d" data-a="eventall">Clear every node (3★)</button><button class="d warn" data-a="eventreset">Reset event</button></div>
      <div class="dev-row"><span>Novice Missions</span><button class="d" data-a="day" data-n="1">Start date −1 day</button><button class="d" data-a="day" data-n="7">−7 days (all days open)</button><button class="d warn" data-a="novicereset">Reset claims</button></div>
      <div class="dev-row"><span>Daily</span><button class="d" data-a="daily">Reset daily gift / Limited draw</button></div>`,
    battle: () => (global.BattleDev ? `
      <div class="dev-row"><span>This battle</span><button class="d" data-a="bwin">Win now</button><button class="d warn" data-a="blose">Lose now</button></div>
      <div class="dev-row"><span>Resources</span><button class="d" data-a="bgauge">Fill Ultimate gauges</button><button class="d" data-a="bce">Fill cursed energy</button></div>`
      : '<p>Open a battle to use these controls.</p>'),
    save: () => `
      <div class="dev-row"><button class="d" data-a="dump">Show save JSON</button><button class="d" data-a="copy">Copy save</button><button class="d" data-a="load">Load JSON below</button>
        <button class="d warn" data-a="reset">Delete save</button><button class="d" data-a="off">Hide DEV button</button></div>
      <textarea id="dev-json" spellcheck="false" placeholder="Save JSON"></textarea>`,
  };

  function draw() {
    if (!panel || panel.hidden) return;
    $('.dev-tabs', panel).innerHTML = Object.keys(TABS).map((k) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('');
    $('.dev-body', panel).innerHTML = statsHtml() + TABS[tab]();
  }

  function stagesAll() {
    return Data.load('missions').then((M) => ({ main: M.chapters.flatMap((c) => c.stages), quests: (M.quests || []).flatMap((q) => q.stages) }));
  }

  function giveUnit(s, id, lv) {
    const def = Rules.unitDef(id);
    if (!def) return;
    Rules.addUnitTo(s, id, 1);
    if (lv === 'max') { s.units[id].level = Rules.maxLevelOf(def); s.units[id].exp = 0; }
  }

  function act(b) {
    const a = b.dataset.a, n = Number(b.dataset.n) || 0;
    switch (a) {
      case 'cubes': return apply((s) => { s.currency.cubes += n; }, '+' + fmt(n) + ' Free Cubes');
      case 'paid': return apply((s) => { s.currency.paidCubes = (s.currency.paidCubes || 0) + n; }, '+' + fmt(n) + ' Paid Cubes');
      case 'jp': return apply((s) => { s.currency.yen += n; }, '+' + fmt(n) + ' JP');
      case 'fp': return apply((s) => { s.currency.fp = (s.currency.fp || 0) + n; }, '+' + fmt(n) + ' FP');
      case 'medals': return apply((s) => { const e = Rules.eventStateOf(s, EVENT_ID); e.tokens += n; e.earned += n; }, '+' + fmt(n) + ' Phantom Medals');
      case 'ap': return apply((s) => { const st = Rules.staminaNow(s); s.stamina = { cur: st.max, ts: Date.now() }; }, 'AP refilled');
      case 'ap999': return apply((s) => { s.stamina = { cur: 999, ts: Date.now() }; }, 'AP 999');
      case 'rank': return apply((s) => { s.profile.rank = Math.max(1, Math.min(200, Number($('#dev-rank', panel).value) || 1)); s.profile.rankExp = 0; }, 'Rank set');
      case 'setcur': { const k = $('#dev-cur', panel).value; const v = Math.max(0, Math.floor(Number($('#dev-val', panel).value) || 0)); return apply((s) => { s.currency[k] = v; }, k + ' = ' + fmt(v)); }
      case 'item': return apply((s) => { s.items[b.dataset.k] = (s.items[b.dataset.k] || 0) + n; }, '+' + n + ' ' + b.dataset.k);
      case 'gp': return Data.load('banners').then((B) => apply((s) => { B.banners.filter((x) => x.exchangeAt).forEach((x) => { s.gacha.points[x.id] = (s.gacha.points[x.id] || 0) + n; }); }, '+' + n + ' Gacha Points on every pickup banner'));
      case 'give': return apply((s) => giveUnit(s, $('#dev-unit', panel).value, b.dataset.lv), 'Unit given');
      case 'lb': return apply((s) => { const u = s.units[$('#dev-unit', panel).value]; if (u) u.dupes = Math.min(Rules.MAX_DUPES, (u.dupes || 0) + 1); }, 'Awakening +1');
      case 'all': return apply((s) => Data.characters.forEach((c) => { if (!s.units[c.id]) giveUnit(s, c.id, b.dataset.lv); }), 'All ' + Data.characters.length + ' units');
      case 'maxown': return apply((s) => Object.keys(s.units).forEach((id) => { const d = Rules.unitDef(id); if (d) { s.units[id].level = Rules.maxLevelOf(d); s.units[id].exp = 0; } }), 'Owned units at max level');
      case 'lball': return apply((s) => Object.values(s.units).forEach((u) => { u.dupes = Rules.MAX_DUPES; }), 'Awakening 5 on all owned');
      case 'bestteam': return apply((s) => { const ids = Rules.ownedList().sort((x, y) => y.power - x.power).map((v) => v.id); s.teams[0].slots = [0, 1, 2, 3].map((i) => ids[i] || null); s.teams[0].support = ids[4] || null; s.activeTeam = 0; }, 'Team 1 = strongest 4 + Backup');
      case 'clearunits': return apply((s) => { const keep = new Set(s.teams[0].slots.concat([s.teams[0].support]).filter(Boolean)); Object.keys(s.units).forEach((id) => { if (!keep.has(id)) delete s.units[id]; }); s.teams.forEach((t, i) => { if (i) { t.slots = [null, null, null, null]; t.support = null; } }); }, 'Units removed');
      case 'stages': return stagesAll().then((all) => apply((s) => all.main.forEach((st) => { const p = s.progress[st.id] || { clears: 0 }; s.progress[st.id] = { stars: Math.max(n, p.stars || 0), clears: (p.clears || 0) + 1, best: p.best || 1 }; }), 'All story stages cleared'));
      case 'unstages': return stagesAll().then((all) => apply((s) => all.main.forEach((st) => { delete s.progress[st.id]; }), 'Story progress reset'));
      case 'quests3': return stagesAll().then((all) => apply((s) => all.quests.forEach((st) => { const p = s.progress[st.id] || {}; s.progress[st.id] = { stars: 3, clears: (p.clears || 0) + 1, best: 1 }; }), 'Strengthening Quests at 3★'));
      case 'questruns': return apply((s) => { s.quests = { day: '', runs: {} }; }, "Today's quest runs reset");
      case 'eventall': return Data.load('events').then((E) => apply((s) => { const ev = E.events.find((x) => x.id === EVENT_ID) || E.events[0]; const st = Rules.eventStateOf(s, ev.id); ev.areas.forEach((ar) => ar.nodes.forEach((nd) => { st.cleared[nd.id] = 3; })); }, 'Every event node cleared'));
      case 'eventreset': return apply((s) => { if (s.events) delete s.events[EVENT_ID]; }, 'Event reset');
      case 'day': return apply((s) => { s.created = (Number(s.created) || Date.now()) - n * 864e5; }, 'Start date moved back ' + n + ' day(s)');
      case 'novicereset': return apply((s) => { s.novice = { claimed: {}, final: false }; }, 'Novice claims reset');
      case 'daily': return apply((s) => { s.daily = {}; }, 'Daily offers reset');
      case 'bwin': panel.hidden = true; global.BattleDev.win(); return;
      case 'blose': panel.hidden = true; global.BattleDev.lose(); return;
      case 'bgauge': global.BattleDev.fillGauges(); return say('Ultimate gauges full');
      case 'bce': global.BattleDev.fillCE(); return say('Cursed energy full');
      case 'dump': $('#dev-json', panel).value = JSON.stringify(Save.get(), null, 1); return say('Save shown');
      case 'copy': {
        const txt = Save.exportJSON();
        $('#dev-json', panel).value = txt;
        try { navigator.clipboard.writeText(txt).then(() => say('Copied'), () => say('Select and copy the text')); } catch (_) { say('Select and copy the text'); }
        return;
      }
      case 'load':
        try { Save.importJSON($('#dev-json', panel).value); say('Loaded'); reloadSoon(); } catch (err) { say(err.message); }
        return;
      case 'reset':
        if (!global.confirm('Delete this save?')) return;
        Save.reset(); global.location.href = 'index.html';
        return;
      case 'off':
        Save.pref('dev', false);
        document.querySelectorAll('.dev-fab, .dev-panel').forEach((e) => e.remove());
        return;
      default:
    }
  }

  function open() {
    if (!Save.exists()) { global.alert('Create a save first.'); return; }
    panel.hidden = false;
    draw();
  }

  function init() {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    const fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'dev-fab'; fab.textContent = 'DEV';
    fab.addEventListener('click', open);
    panel = document.createElement('div');
    panel.className = 'dev-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Developer panel');
    panel.innerHTML = '<div class="dev-head"><b>DEV PANEL</b><button class="d dev-big" type="button" data-a="cubes" data-n="100000">+100,000 Cubes</button><span class="dev-msg"></span><span class="sp"></span><button class="d" type="button" data-close>Close & reload</button><button class="d" type="button" data-x>✕</button></div><div class="dev-tabs"></div><div class="dev-body"></div>';
    panel.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; draw(); return; }
      if (e.target.closest('[data-x]')) { panel.hidden = true; return; }
      if (e.target.closest('[data-close]')) { global.location.reload(); return; }
      const b = e.target.closest('[data-a]');
      if (b) Promise.resolve(act(b)).catch((err) => say('Error: ' + err.message));
    });
    document.body.appendChild(fab);
    document.body.appendChild(panel);
  }

  global.DevPanel = { open: () => (panel ? open() : (global.__devOpen = true)) };
  function start() { init(); if (global.__devOpen) { global.__devOpen = false; open(); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
