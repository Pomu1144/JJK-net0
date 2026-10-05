/* battle.html — drives js/battle-engine.js and animates its events.
 * battle.html?stage=1-1&team=0
 *
 * Phantom Parade turn flow: when the first of your units comes up in a round,
 * you SELECT an action for every unit still to act this round (tap a skill
 * card to pick it, tap it again / "Confirm" to lock it in; the action shows as
 * a tag above that unit). "Selection Complete" then plays the round out in
 * the engine's speed order (enemies keep acting on their own turns). Auto
 * battle lets the engine's AI pick instead.
 */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  const E = window.BattleEngine;
  let S = null, stage = null, chapter = null, teamIdx = 0, ITEMS = {};
  let target = null;          // selected enemy key
  let current = null;         // acting unit
  let speed = 1, auto = false;
  let teamUnitIds = [], supportId = null;
  let backHref = 'missions.html';   // event battles go back to event.html
  let plan = {};              // ally key -> confirmed action for this round
  let tags = {};              // ally key -> { k, name, ult } shown above the unit
  let sel = null;             // selection phase: { keys, idx, picked, resolve }
  let finished = false;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
  const unitEl = (key) => document.querySelector(`.bu[data-key="${key}"]`);
  const TYPE_ORDER = [['Red', 'Heart'], ['Blue', 'Body'], ['Green', 'Skill'], ['Yellow', 'Bravery']];
  const CE_IC = 'assets/pp/ui/Energy.webp';
  const BUFF_IC = { atk: 'assets/pp/ui/MemoryPhysicalUp.webp', weaken: 'assets/pp/ui/MemoryJujutsuDown.webp', regen: 'assets/pp/ui/MemoryHeal.webp', guard: 'assets/pp/ui/MemoryShieldUp.webp' };
  const SPLASH = '<svg class="bt-splash" viewBox="0 0 140 110" aria-hidden="true"><path d="M18 22c10-14 30-20 48-17 9-6 24-5 33 2 14-2 27 6 30 18 9 6 11 19 5 28 6 10 2 24-9 29-3 12-17 19-30 15-9 8-25 9-35 2-12 5-27 1-34-9-12-1-21-12-19-23-8-8-7-22 2-28-1-8 3-15 9-17zM8 84c-4 3-6 8-2 10 3 1 6-3 5-7zM128 10c3-3 8-2 8 2s-5 5-8 2zM60 104c-2 2-1 5 2 5s3-4 0-5z"/></svg>';

  /* ---------------- setup ---------------- */
  function fail(msg) {
    $('#main').innerHTML = `<div class="jjk-panel error-panel"><h2>Cannot start battle</h2><p>${esc(msg)}</p><a class="jjk-btn is-primary" href="${esc(backHref)}">${backHref.startsWith('event') ? 'Back to Event Map' : 'Back to Missions'}</a></div>`;
  }

  function setup(M, EV) {
    const q = new URLSearchParams(location.search);
    const sid = q.get('stage');
    teamIdx = Math.max(0, Math.min(2, Number(q.get('team')) || 0));
    for (const c of M.chapters.concat(M.quests || [])) for (const st of c.stages) if (st.id === sid) { stage = st; chapter = c; }
    // Map Event battle nodes (data/events.json): battle / elite / boss
    if (!stage) for (const ev of (EV && EV.events) || []) for (const area of ev.areas) for (const n of area.nodes) {
      if (n.id === sid && n.waves) {
        stage = n;
        chapter = { id: ev.id, mode: 'event', ev, area, name: area.name + ' · ' + ev.name, scale: n.scale || ev.scale || 1, bg: area.art || ev.bg, element: ev.element };
        backHref = 'event.html#' + area.id;
        const back = $('.jjk-back');
        if (back) back.setAttribute('href', backHref);
      }
    }
    if (!stage) return fail('Unknown mission "' + (sid || '') + '".');
    const s = Save.get();
    // stage must be unlocked; Strengthening Quests also have a daily run limit
    if (chapter.mode === 'event') {
      if (!Rules.eventNodeOpen(s, chapter.ev, stage)) return fail('Clear the previous stage on the Event Map first.');
    } else if (chapter.mode === 'strengthen') {
      if (stage.unlock && !s.progress[stage.unlock]) return fail('Clear Main Quest ' + stage.unlock + ' first.');
      if (Rules.questRuns(s, chapter.id) >= chapter.daily) return fail('No ' + chapter.name + ' runs left today. They reset tomorrow.');
    } else {
      const list = M.chapters.flatMap((c) => c.stages);
      const i = list.indexOf(stage);
      if (i > 0 && !s.progress[list[i - 1].id]) return fail('Clear the previous mission first.');
    }
    const team = s.teams[teamIdx];
    teamUnitIds = Rules.teamIds(team).filter((id) => Rules.unitView(id));
    supportId = team.support && Rules.unitView(team.support) ? team.support : null;
    if (!teamUnitIds.length) return fail('Your team has no front units. Set one up in Teams.');
    if (!Rules.spendStamina(stage.stamina)) return fail('Not enough AP (' + stage.stamina + ' needed). Refill it in the Shop or wait.');

    speed = s.settings.battleSpeed || 1;
    auto = !!s.settings.autoBattle;
    const allies = teamUnitIds.map((id) => {
      const v = Rules.unitView(id);
      const d = v.def;
      return { id, name: d.name, element: d.element, stats: v.stats, basic: d.basic, technique: d.technique, technique2: d.technique2, ultimate: d.ultimate, passives: d.passives, def: d };
    });
    const waves = stage.waves.map((w) => w.map((x) => Object.assign({}, Data.enemy(x.enemy), { level: x.level, scale: stage.scale || chapter.scale || 1 })));
    S = E.create({ allies, support: supportId ? Rules.unitDef(supportId) : null, waves, rules: Rules });
    build();
    loop().catch((err) => { console.error(err); UI.toast('Battle error: ' + err.message, 'bad'); });
  }

  /* ---------------- helpers ---------------- */
  const typeSrc = (u) => (u.def && u.def.color ? u.def : u.element);
  function skillIcon(u, k) {
    const sk = u.def && u.def.art && u.def.art.skills;
    return sk && sk[k] ? `<img src="${esc(sk[k])}" alt="" draggable="false">` : UI.icon(k === 'normal' ? 'attack' : 'bolt');
  }
  /** The command cards of an ally: Attack, Skill 1, Skill 2, Ultimate. */
  function cmds(u) {
    const out = [{ type: 'attack', slot: 0, k: 'normal', name: u.basic.name, cost: 0 }];
    if (u.technique) out.push({ type: 'technique', slot: 0, k: 's1', name: u.technique.name, cost: u.technique.cost });
    if (u.technique2) out.push({ type: 'technique', slot: 1, k: 's2', name: u.technique2.name, cost: u.technique2.cost });
    if (u.ultimate) out.push({ type: 'ultimate', slot: 0, k: 'ult', name: u.ultimate.name.replace(/^Domain Expansion: /, ''), cost: u.ultimate.cost, domain: u.ultimate.kind === 'domain' });
    return out;
  }
  const cmdOf = (u, a) => cmds(u).find((c) => c.type === (a.type === 'skill' ? 'technique' : a.type) && (c.type !== 'technique' || c.slot === (a.slot || 0))) || cmds(u)[0];
  const costOf = (u, a) => (a ? cmdOf(u, a).cost : 0);
  const selUnit = () => (sel ? E.find(S, sel.keys[sel.idx]) : null);
  /** Shared cursed-energy pool left after the actions already chosen (except `except`'s). */
  function projectedCE(except) {
    let ce = S.ce;
    if (sel) for (const k of sel.keys) if (k !== except && plan[k]) ce -= costOf(E.find(S, k), plan[k]);
    return Math.max(0, ce);
  }
  function usable(u, c) {
    if (c.type === 'attack') return true;
    const ce = projectedCE(u.key);
    if (c.type === 'ultimate') return u.gauge >= S.B.gaugeMax && c.cost <= ce;
    return c.cost <= ce;
  }
  /** The ally whose art / buffs are shown: the one being selected, else the one acting. */
  const focusAlly = () => selUnit() || (current && current.side === 'ally' ? current : null);
  function ensureTarget(u) {
    if (target && (E.find(S, target) || {}).alive) return;
    target = u ? E.decide(S, u).target || null : null;
    if (!target) { const f = S.enemies.find((e) => e.alive); target = f ? f.key : null; }
  }

  /* ---------------- rendering ---------------- */
  function unitHtml(u) {
    const t = UI.typeOf(typeSrc(u)).toLowerCase();
    if (u.side === 'ally') {
      return `<div class="bu ally t-${t}" data-key="${u.key}" role="button" tabindex="0" aria-label="${esc(u.name)}">
        <div class="bu-tag"></div>
        <span class="bu-plate" aria-hidden="true"></span>
        <div class="bu-body">
          <div class="bu-art"><span class="bu-aura"></span><span class="bu-face">${Art.img(u.def, 'portrait', { eager: true, alt: '' })}</span><span class="bu-ring" aria-hidden="true"></span>${UI.typeBadge(typeSrc(u), 'bu-tb')}<span class="bu-ko" aria-hidden="true">KO</span><span class="bu-fx"></span><span class="bu-status"></span></div>
          <div class="bu-bars">
            <div class="bu-num bu-hpn"></div>
            <div class="bu-row"><svg class="bu-heart" viewBox="0 0 20 18" aria-hidden="true"><path d="M10 17 2.6 9.7C.4 7.5.6 4 3 2.3 5 .9 7.7 1.4 10 4c2.3-2.6 5-3.1 7-1.7 2.4 1.7 2.6 5.2.4 7.4z"/></svg><div class="bu-hp"><i></i><span></span></div></div>
            <div class="bu-num bu-cen"></div>
            <div class="bu-row"><img class="bu-ceic" src="${CE_IC}" alt=""><div class="bu-ce"><i></i></div></div>
          </div>
        </div>
        ${u.ultimate ? '<div class="bu-gauge" title="Ultimate gauge"><i></i></div>' : ''}
      </div>`;
    }
    const weak = TYPE_ORDER.map(([c, el]) => {
      const w = Rules.elementMult(el, u.element) > 1;
      return `<i class="k-${c.toLowerCase()}${w ? ' is-weak' : ''}">${Art.TYPES[c].kanji}</i>`;
    }).join('');
    return `<div class="bu enemy${u.boss ? ' is-boss' : ''} t-${t}" data-key="${u.key}" role="button" tabindex="0" aria-label="${esc(u.name)} Lv ${u.level}">
      <div class="be-head">
        <div class="be-kanji" title="Weak to the highlighted type">${weak}</div>
        <div class="be-hprow">${UI.typeBadge(typeSrc(u), 'bu-type')}<div class="bu-hp"><i></i><span></span></div></div>
        ${u.brkMax ? '<div class="bu-brk" title="Break gauge"><i></i></div>' : ''}
        <div class="bu-status"></div>
      </div>
      <div class="bu-art"><img class="art" src="${esc(u.def.art)}" alt="" draggable="false">${u.boss ? '<span class="bu-boss">BOSS</span>' : ''}<span class="bu-reticle"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30"/><circle class="in" cx="50" cy="50" r="22"/><path d="M50 4v18M50 78v18M4 50h18M78 50h18"/><path class="ar" d="M44 6l6-6 6 6zM44 94l6 6 6-6z"/></svg><b>WEAK</b></span><span class="bu-fx"></span></div>
    </div>`;
  }

  function stoneBtn(id, glyph, title, extra) {
    return `<button class="bt-sq" id="${id}" type="button" title="${title}" aria-label="${title}" ${extra || ''}>${glyph}</button>`;
  }

  function build() {
    if (chapter.bg) document.body.style.setProperty('--scene', `url('${new URL(chapter.bg, location.href).href}')`);
    $('#main').innerHTML = `<div class="battle el-${(chapter.element || 'Body').toLowerCase()}">
      <div class="bt-wave-plate">${SPLASH}<span class="bt-wave" id="wave"></span><span class="bt-round" id="round"></span></div>
      <div class="bt-tr">
        ${stoneBtn('speed', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/></svg><small id="speed-x"></small>', 'Battle speed')}
        ${stoneBtn('auto', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8.5A7.5 7.5 0 0 0 5.6 7.4M5 15.5a7.5 7.5 0 0 0 13.4 1.1" fill="none"/><path d="M3.6 4.2l2.8 4.6 4.6-2.6zM20.4 19.8l-2.8-4.6-4.6 2.6z"/></svg>', 'Auto battle', `aria-pressed="${auto}"`)}
        <button class="bt-sq is-menu" id="menu" type="button" title="Menu" aria-label="Menu"></button>
      </div>
      <div class="bt-field" id="enemies"></div>
      <div class="bt-actor" id="actor"></div>
      <div class="bt-panel" id="panel"></div>
      <div class="bt-party">
        <div class="bt-prow">
          <div class="bt-allies" id="allies"></div>
          <button class="bt-complete" id="complete" type="button" disabled><i class="bt-cmp-glow" aria-hidden="true"></i><span>Selection<br>Complete</span></button>
        </div>
        <div class="bt-buffs" id="buffs"></div>
      </div>
      <div class="bt-banner" id="banner"></div>
    </div>`;
    $('#allies').innerHTML = S.allies.map(unitHtml).join('');
    drawEnemies();
    const onEnemy = (e) => { const b = e.target.closest('.bu'); if (b) selectTarget(b.dataset.key); };
    $('#enemies').addEventListener('click', onEnemy);
    $('#enemies').addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnemy(e); });
    const onAlly = (e) => {
      const b = e.target.closest('.bu');
      if (!b || !sel) return;
      const i = sel.keys.indexOf(b.dataset.key);
      if (i < 0) return;
      sel.idx = i;
      const u = selUnit();
      sel.picked = plan[u.key] ? cmds(u).indexOf(cmdOf(u, plan[u.key])) : -1;
      UI.sfx('tap');
      drawAll();
    };
    $('#allies').addEventListener('click', onAlly);
    $('#allies').addEventListener('keydown', (e) => { if (e.key === 'Enter') onAlly(e); });
    $('#auto').addEventListener('click', () => {
      auto = !auto;
      $('#auto').setAttribute('aria-pressed', auto);
      Save.update((s) => { s.settings.autoBattle = auto; });
      if (auto && sel) endSelection();
      drawAll();
    });
    $('#speed').addEventListener('click', () => {
      speed = speed >= 3 ? 1 : speed + 1;
      Save.update((s) => { s.settings.battleSpeed = speed; });
      drawSpeed();
    });
    $('#menu').addEventListener('click', retreat);
    $('#complete').addEventListener('click', () => {
      if (!sel) return;
      const missing = sel.keys.find((k) => !plan[k]);
      if (missing) {
        sel.idx = sel.keys.indexOf(missing); sel.picked = -1;
        UI.toast('Choose an action for ' + E.find(S, missing).name + ' first.');
        drawAll();
        return;
      }
      UI.sfx('tap');
      endSelection();
    });
    $('#panel').addEventListener('click', (e) => {
      const b = e.target.closest('.act');
      if (!b || b.disabled || !sel) return;
      const i = Number(b.dataset.i);
      if (sel.picked === i) confirmPick();
      else { sel.picked = i; UI.sfx('tap'); drawPanel(); }
    });
    const back = $('.jjk-back');
    if (back) back.addEventListener('click', (e) => { e.preventDefault(); retreat(); });
    drawSpeed();
    paint();
  }

  async function retreat() {
    if (S.over || await UI.confirm('Retreat from battle? The AP spent is not refunded.', 'Retreat', 'Retreat')) location.href = backHref;
  }

  function drawSpeed() { const x = $('#speed-x'); if (x) x.textContent = '×' + speed; $('#speed').classList.toggle('is-on', speed > 1); }

  function drawEnemies() {
    $('#enemies').innerHTML = S.enemies.map(unitHtml).join('');
    $('#enemies').dataset.n = S.enemies.length;
    $('#enemies').classList.toggle('has-boss', S.enemies.some((e) => e.boss));
    if (!S.enemies.some((e) => e.key === target && e.alive)) target = null;
  }

  function roundIcon(src, title, txt, cls) {
    return `<i class="bt-ric ${cls || ''}" title="${esc(title)}">${src ? `<img src="${esc(src)}" alt="">` : esc(txt || '')}</i>`;
  }
  function statusIcons(u) {
    const st = [];
    if (u.stun) st.push(roundIcon('', 'Stunned', '✦', 's-stun'));
    if (u.dots.length) st.push(roundIcon('', 'Burning', '火', 's-burn'));
    if (u.buffs.some((b) => b.type === 'weaken')) st.push(roundIcon(BUFF_IC.weaken, 'Attack down', '', 's-weak'));
    if (u.buffs.some((b) => b.type === 'atk')) st.push(roundIcon(BUFF_IC.atk, 'Attack up', '', 's-up'));
    if (u.broken) st.push(roundIcon('', 'Broken', '破', 's-break'));
    if (u.enraged) st.push(roundIcon('', 'Enraged', '怒', 's-rage'));
    return st;
  }

  function paint() {
    if (!S) return;
    $('#wave').innerHTML = '<small>WAVE</small>' + (S.wave + 1) + '/' + S.waveCount;
    $('#round').textContent = 'Turn ' + Math.max(1, S.round);
    const fa = focusAlly();
    const atk = fa || S.allies.find((a) => a.alive);
    for (const u of S.allies.concat(S.enemies)) {
      const el = unitEl(u.key);
      if (!el) continue;
      const pct = Math.max(0, u.hp / u.maxHp * 100);
      el.querySelector('.bu-hp i').style.width = pct + '%';
      el.querySelector('.bu-hp').classList.toggle('low', pct < 30);
      el.querySelector('.bu-hp span').textContent = fmt(u.hp);
      el.classList.toggle('is-ko', !u.alive);
      el.querySelector('.bu-status').innerHTML = statusIcons(u).join('');
      if (u.side === 'ally') {
        const ce = sel ? projectedCE() : S.ce;
        el.querySelector('.bu-hpn').textContent = fmt(u.hp);
        el.querySelector('.bu-cen').textContent = ce;
        el.querySelector('.bu-ce i').style.width = (ce / S.ceMax * 100) + '%';
        const g = el.querySelector('.bu-gauge i');
        if (g) { g.style.width = u.gauge + '%'; el.classList.toggle('ult-ready', u.gauge >= S.B.gaugeMax); }
        el.classList.toggle('is-active', fa === u || current === u);
        el.classList.toggle('is-sel', !!sel && sel.keys.includes(u.key));
        el.classList.toggle('is-chosen', !!plan[u.key]);
        const tg = tags[u.key];
        const tagEl = el.querySelector('.bu-tag');
        tagEl.className = 'bu-tag' + (tg ? ' on' : '') + (tg && tg.ult ? ' is-ult' : '');
        tagEl.innerHTML = tg ? `<span class="bt-tic">${skillIcon(u, tg.k)}</span><b>${tg.ult ? '“' + esc(tg.name) + '”' : esc(tg.name)}</b>` : '';
      } else {
        const brk = el.querySelector('.bu-brk i');
        if (brk) brk.style.width = (u.broken ? 0 : Math.max(0, u.brk / u.brkMax * 100)) + '%';
        el.classList.toggle('is-broken', !!u.broken && u.alive);
        el.classList.toggle('is-target', u.key === target && u.alive);
        el.classList.toggle('is-weak', !!atk && Rules.elementMult(atk.element, u.element) > 1);
        el.classList.toggle('is-active', current === u);
      }
    }
    const c = $('#complete');
    const ready = !!sel && sel.keys.every((k) => plan[k]);
    c.disabled = !sel;
    c.classList.toggle('is-ready', ready);
    drawBuffs(fa || S.allies.find((a) => a.alive));
  }

  function drawBuffs(u) {
    const out = [];
    const sup = supportId && Rules.unitView(supportId);
    if (sup) out.push(`<i class="bt-ric is-support" title="${esc(sup.def.support.name + ': ' + sup.def.support.desc)}">${Art.img(sup.def, 'icon', { alt: '' })}</i>`);
    if (u) {
      out.push(...statusIcons(u));
      if (u.regen) out.push(roundIcon(BUFF_IC.regen, 'Regeneration'));
      if (u.guard) out.push(roundIcon(BUFF_IC.guard, 'Damage cut ' + u.guard + '%'));
    }
    $('#buffs').innerHTML = out.join('');
  }

  function drawActor(u) {
    const a = $('#actor');
    if (!a) return;
    if (!u || u.side !== 'ally') { a.classList.remove('on'); return; }
    if (a.dataset.key !== u.key) {
      a.dataset.key = u.key;
      a.classList.remove('on');
      a.innerHTML = Art.img(u.def, 'full', { alt: '', eager: true });
      void a.offsetWidth;
    }
    a.classList.add('on');
  }

  function drawPanel() {
    const p = $('#panel');
    const u = selUnit();
    drawActor(focusAlly());
    if (!u || auto) { p.classList.remove('on'); return; }
    p.classList.add('on');
    const tk = Art.TYPES[UI.typeOf(typeSrc(u))].kanji;
    const fk = u.def && u.def.focusKanji ? `<i class="act-fk">${esc(u.def.focusKanji)}</i>` : '';
    p.innerHTML = cmds(u).map((c, i) => {
      const ok = usable(u, c);
      const isUlt = c.type === 'ultimate';
      const cls = ['act', c.type === 'attack' ? 'act-atk' : isUlt ? 'act-ult' : 'act-tech',
        isUlt && u.gauge >= S.B.gaugeMax ? 'is-ready' : '', sel.picked === i ? 'is-picked' : ''].filter(Boolean).join(' ');
      const g = isUlt && u.gauge < S.B.gaugeMax ? `<span class="act-g"><i style="width:${Math.floor(u.gauge)}%"></i></span>` : '';
      return `<button class="${cls}" data-i="${i}" data-act="${c.type}" data-slot="${c.slot}" type="button" ${ok ? '' : 'disabled'} aria-label="${esc(c.name)}">
        <span class="act-ic">${skillIcon(u, c.k)}<i class="act-tk">${tk}</i>${fk}</span>
        <span class="act-tx"><b>${isUlt ? '“' + esc(c.name) + '”' : esc(c.name)}</b>${c.cost ? `<span class="act-ce">${c.cost}<img src="${CE_IC}" alt=""></span>` : ''}${g}</span>
        <span class="act-ok">Confirm</span><span class="act-chev" aria-hidden="true"></span>
      </button>`;
    }).join('');
  }

  function drawAll() { drawPanel(); paint(); }

  function selectTarget(key) {
    const u = E.find(S, key);
    if (!u || !u.alive || u.side !== 'enemy') return;
    target = key;
    UI.sfx('tap');
    if (sel) { const a = selUnit(); if (plan[a.key]) plan[a.key].target = key; }
    paint();
  }

  /* ---------------- selection phase ---------------- */
  function selectPhase(actor) {
    const keys = [actor.key].concat(S.queue.filter((k) => {
      const u = E.find(S, k);
      return u && u.side === 'ally' && u.alive && !u.stun && !plan[k];
    }));
    return new Promise((resolve) => {
      sel = { keys, idx: 0, picked: -1, resolve };
      ensureTarget(actor);
      drawAll();
    });
  }

  function endSelection() {
    if (!sel) return;
    const r = sel.resolve;
    sel = null;
    drawAll();
    r();
  }

  function confirmPick() {
    const u = selUnit();
    const c = cmds(u)[sel.picked];
    if (!c || !usable(u, c)) return;
    ensureTarget(u);
    plan[u.key] = { type: c.type, slot: c.slot, target };
    tags[u.key] = { k: c.k, name: c.name, ult: c.type === 'ultimate' };
    UI.sfx('tap');
    const n = sel.keys.length;
    let next = -1;
    for (let j = 1; j <= n; j++) { const k = sel.keys[(sel.idx + j) % n]; if (!plan[k]) { next = (sel.idx + j) % n; break; } }
    if (next >= 0) { sel.idx = next; sel.picked = -1; }
    drawAll();
  }

  /* ---------------- animation ---------------- */
  function floatText(key, text, cls) {
    const el = unitEl(key);
    if (!el) return;
    const fx = el.querySelector('.bu-fx');
    const s = document.createElement('span');
    s.className = 'dmg ' + (cls || '');
    s.textContent = text;
    s.style.setProperty('--x', (Math.random() * 30 - 15).toFixed(0) + 'px');
    fx.appendChild(s);
    setTimeout(() => s.remove(), 1100 / speed + 200);
  }

  function pulse(key, cls, ms) {
    const el = unitEl(key);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms || 400);
  }

  async function showBanner(html, cls, ms) {
    const b = $('#banner');
    b.className = 'bt-banner show ' + (cls || '');
    b.innerHTML = html;
    await wait(ms || 900);
    b.className = 'bt-banner';
  }

  /** Black Flash: black-and-red lightning over the target (CSS in pp-battle-rules.css). */
  function blackFlashFx(key) {
    const el = unitEl(key);
    if (!el) return;
    const fx = el.querySelector('.bu-fx');
    const b = document.createElement('span');
    b.className = 'bf-bolt';
    b.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="k" d="M58 0 L36 44 L54 46 L30 100 L72 38 L52 36 L70 0Z"/><path class="r" d="M60 4 L42 42 L57 44 L38 92 L66 40 L50 38 L66 4Z"/><path class="k2" d="M8 30 L30 48 L20 52 L44 70"/><path class="r2" d="M92 26 L70 50 L82 54 L60 76"/></svg>';
    fx.appendChild(b);
    pulse(key, 'bf-hit', 520);
    const field = document.querySelector('.battle');
    if (field) { field.classList.remove('bf-screen'); void field.offsetWidth; field.classList.add('bf-screen'); setTimeout(() => field.classList.remove('bf-screen'), 450); }
    setTimeout(() => b.remove(), 700 / speed + 200);
  }

  async function domainCutIn(u, ult) {
    const ov = document.createElement('div');
    ov.className = 'domain-cut el-' + u.element.toLowerCase() + (ult.kind === 'domain' ? ' is-domain' : '');
    ov.innerHTML = `${Art.img(u.def, 'full', { alt: '', eager: true })}<div class="dc-text"><span class="dc-k">${ult.kind === 'domain' ? '領域展開' : '奥義'}</span><b>${esc(ult.name)}</b></div>`;
    document.body.appendChild(ov);
    UI.sfx('rare');
    await wait(1300);
    ov.classList.add('out');
    setTimeout(() => ov.remove(), 300);
  }

  async function animate(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'round': plan = {}; tags = {}; paint(); break;
        case 'action': {
          const u = E.find(S, ev.from);
          if (ev.kind === 'domain' || ev.kind === 'ultimate') await domainCutIn(u, u.ultimate);
          else if (ev.kind === 'technique' || ev.kind === 'skill') await showBanner(`<small>${ev.kind === 'skill' ? '術式 · Enemy technique' : '術式 · Cursed Technique'}</small><b>${esc(ev.name)}</b>`, u.side, 650);
          pulse(ev.from, u.side === 'ally' ? 'lunge-r' : 'lunge-l', 380);
          await wait(200);
          break;
        }
        case 'damage': {
          pulse(ev.to, 'hit', 360);
          if (ev.blackFlash) blackFlashFx(ev.to);
          const label = (ev.crit ? 'CRIT ' : '') + fmt(ev.amount);
          floatText(ev.to, label, (ev.crit ? 'crit ' : '') + (ev.blackFlash ? 'bf ' : '') + (ev.broken ? 'brk ' : '') + (ev.adv === 'strong' ? 'strong' : ev.adv === 'weak' ? 'weak' : ''));
          if (ev.blackFlash) floatText(ev.to, 'BLACK FLASH', 'tag black-flash');
          if (ev.adv) floatText(ev.to, ev.adv === 'strong' ? 'WEAK POINT!' : 'RESISTED', 'tag ' + ev.adv);
          UI.sfx(ev.crit || ev.blackFlash ? 'crit' : 'hit');
          if (ev.blackFlash) { paint(); await wait(260); }
          paint();
          await wait(170);
          break;
        }
        case 'dot': floatText(ev.to, fmt(ev.amount), 'dot'); pulse(ev.to, 'hit', 300); paint(); await wait(260); break;
        case 'heal': if (!ev.quiet) { floatText(ev.to, '+' + fmt(ev.amount), 'heal'); UI.sfx('heal'); } paint(); if (!ev.quiet) await wait(120); break;
        case 'status': floatText(ev.to, ev.text, 'status'); paint(); await wait(90); break;
        case 'stunned': floatText(ev.to, 'STUNNED', 'status'); paint(); await wait(420); break;
        case 'break':
          floatText(ev.to, 'BREAK!', 'tag break');
          pulse(ev.to, 'break-anim', 700);
          UI.sfx('crit');
          paint(); await wait(520); break;
        case 'broken': floatText(ev.to, ev.left ? 'BROKEN' : 'BROKEN · last turn', 'status'); paint(); await wait(380); break;
        case 'breakEnd': floatText(ev.to, 'RECOVERED', 'status'); paint(); await wait(300); break;
        case 'enrage': floatText(ev.to, 'ENRAGED!', 'crit'); pulse(ev.to, 'rage', 700); paint(); await wait(400); break;
        case 'ce': paint(); break;
        case 'ko': pulse(ev.to, 'ko-anim', 600); paint(); await wait(380); break;
        case 'wave':
          await wait(300);
          drawEnemies(); paint();
          await showBanner(ev.boss ? '<small>警告 · Warning</small><b>BOSS WAVE</b>' : `<small>Wave</small><b>${ev.wave + 1} / ${S.waveCount}</b>`, ev.boss ? 'boss' : '', ev.boss ? 1200 : 800);
          break;
        default:
      }
    }
    paint();
  }

  async function loop() {
    paint();
    await showBanner(`<small>${esc(stage.label || stage.id)} · ${esc(chapter.name)}</small><b>${esc(stage.name)}</b>`, 'start', 1000);
    let guard = 0;
    while (!S.over && guard++ < 5000) {
      const t = E.nextTurn(S);
      current = null;
      await animate(t.events);
      if (!t.actor || S.over) continue;
      const u = t.actor;
      let action;
      if (u.side === 'ally') {
        // Phantom Parade: choose every unit's action for the round, then play them out
        if (!auto && !plan[u.key]) await selectPhase(u);
        if (S.over) break;
        action = (!auto || plan[u.key]) && plan[u.key] ? Object.assign({}, plan[u.key]) : E.decide(S, u);
        delete plan[u.key];
        if (!tags[u.key]) { const c = cmdOf(u, action); tags[u.key] = { k: c.k, name: c.name, ult: c.type === 'ultimate' }; }
        if (!action.target || !(E.find(S, action.target) || {}).alive) action.target = E.decide(S, u).target;
        current = u;
        drawAll();
        await wait(240);
      } else {
        current = u;
        drawAll();
        await wait(380);
        action = E.decide(S, u);
      }
      const ev = E.act(S, u, action);
      await animate(ev);
      current = null;
      drawAll();
    }
    finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    sel = null; current = null;
    drawAll();
    const win = S.result === 'win';
    const conds = [
      { ok: win, text: 'Clear the mission' },
      { ok: win && S.koAllies <= 1, text: 'At most 1 character defeated' },
      { ok: win && S.koAllies === 0, text: 'No characters defeated' },
    ];
    const stars = conds.filter((c) => c.ok).length;
    let res = { levels: [], drops: {}, first: null, rankUps: 0 };
    Save.update((s) => {
      s.stats.battles++;
      if (!win) return;
      s.stats.wins++;
      const opts = { team: teamUnitIds, support: supportId, stars, round: S.round, quest: chapter.mode === 'strengthen' ? chapter.id : null };
      res = chapter.mode === 'event' ? Rules.grantEventClearTo(s, chapter.ev, stage, opts) : Rules.grantClearTo(s, stage, opts);
    });
    UI.sfx(win ? 'win' : 'lose');
    const leveled = res.levels.filter((l) => l.to > l.from).map((l) => l.id);
    if (leveled.length) PortalPort.reportLevels(leveled).then((done) => { if (done.length) UI.toast('Portal updated: ' + done.length + ' level-up' + (done.length > 1 ? 's' : ''), 'good'); });
    showResults(win, conds, res);
  }

  function showResults(win, conds, res) {
    const list = Data.load('missions');
    const r = stage.rewards;
    const itemLine = (obj) => Object.entries(obj || {}).map(([k, n]) => `<span class="rw">${UI.itemIcon(k, ITEMS)} ${n}× ${esc(ITEMS[k] ? ITEMS[k].name : k)}</span>`).join('');
    const ov = document.createElement('div');
    ov.className = 'results ' + (win ? 'is-win' : 'is-lose');
    ov.innerHTML = `<div class="res-box jjk-panel">
      <div class="res-head"><span class="res-k">${win ? '任務完了' : '敗北'}</span><h2 class="res-title">${win ? 'MISSION CLEAR' : 'DEFEAT'}</h2><span class="res-sub">${esc((stage.label ? chapter.area.name + ' ' + stage.label : stage.id) + ' · ' + stage.name)}</span></div>
      ${win ? `<div class="res-stars">${conds.map((c, i) => `<div class="res-star pp-card${c.ok ? ' on' : ''}" style="--d:${0.2 + i * 0.25}s"><i>★</i><small>${esc(c.text)}</small></div>`).join('')}</div>
      <div class="res-rewards">
        <span class="rw">${UI.YEN_SVG} ${fmt(r.yen)} JP</span><span class="rw">Rank EXP +${fmt(r.rankExp)}${res.rankUps ? ' · <b class="gold">RANK UP!</b>' : ''}</span>
        ${res.medals ? `<span class="rw ev-medal-rw"><img class="cur-ic" src="${esc(chapter.ev.currency.icon)}" alt=""> +${fmt(res.medals)} ${esc(chapter.ev.currency.name)}s</span>` : ''}
        ${itemLine(res.drops)}
        ${res.first ? `<span class="rw first">First clear: ${res.first.cubes ? UI.CUBE_SVG + ' ' + fmt(res.first.cubes) + ' Cubes ' : ''}</span>${itemLine(res.first.items)}` : ''}
      </div>
      <div class="res-units">${res.levels.map((l) => {
        const v = Rules.unitView(l.id);
        if (!v) return '';
        return `<div class="res-unit pp-card">${Art.img(v.def, 'icon', { alt: '' })}<small>${esc(v.def.name)}</small>
          <b>${l.to > l.from ? `Lv ${l.from} → <span class="gold">${l.to}</span>` : l.capped ? 'MAX' : 'Lv ' + l.to}</b><small>+${fmt(l.gained)} EXP${l.support ? ' (support)' : ''}</small></div>`;
      }).join('')}</div>` : `<p class="res-lose">Your opponents were too strong. Level up with Training Lights, use type advantage (影 Blue › 夜 Green › 幻 Red › 影 Blue, 行 Yellow ⇄ Purple) or bring a stronger support.</p>`}
      <div class="modal-actions">
        ${PortalPort.session ? '<button class="jjk-btn" type="button" id="res-portal">Return to Portal</button>' : ''}
        <a class="jjk-btn" href="home.html">Home</a>
        ${chapter.mode === 'event' ? '' : `<a class="jjk-btn" href="missions.html#${esc(chapter.id)}">Missions</a>`}
        <button class="jjk-btn${win ? '' : ' is-primary'}" type="button" id="retry">Retry · ${stage.stamina} ${UI.icon('bolt')}</button>
        <span id="next-slot"></span>
      </div></div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('in'));
    const rp = $('#res-portal', ov);
    if (rp) rp.addEventListener('click', () => PortalPort.session.exit());
    $('#retry', ov).addEventListener('click', () => {
      if (Rules.staminaNow().cur < stage.stamina) { UI.toast('Not enough AP — refill it in the Shop.', 'bad'); return; }
      location.reload();
    });
    if (chapter.mode === 'event') $('#next-slot', ov).innerHTML = `<a class="jjk-btn${win ? ' is-primary' : ''}" href="${esc(backHref)}">Back to Event Map</a>`;
    else if (win && chapter.mode === 'strengthen') $('#next-slot', ov).innerHTML = `<a class="jjk-btn is-primary" href="missions.html#${esc(chapter.id)}">Back to ${esc(chapter.name)}</a>`;
    else if (win) list.then((M) => {
      const all = M.chapters.flatMap((c) => c.stages);
      const nx = all[all.indexOf(all.find((x) => x.id === stage.id)) + 1];
      if (nx) $('#next-slot', ov).innerHTML = `<a class="jjk-btn is-primary" href="missions.html#${esc(M.chapters.find((c) => c.stages.includes(nx)).id)}">Next: ${esc(nx.id)}</a>`;
    });
  }

  /* dev panel hook (js/dev.js): control a running battle */
  function devEnd(win) {
    if (!S || S.over) return;
    const side = win ? S.enemies : S.allies;
    for (const u of side) if (u.alive) { u.alive = false; u.hp = 0; if (!win) S.koAllies++; }
    S.queue = [];
    S.over = true; S.result = win ? 'win' : 'lose';
    paint();
    if (sel) endSelection();
  }
  window.BattleDev = {
    win: () => devEnd(true),
    lose: () => devEnd(false),
    fillGauges: () => { if (!S) return; S.allies.forEach((a) => { if (a.alive) a.gauge = S.B.gaugeMax; }); drawAll(); },
    fillCE: () => { if (!S) return; S.ce = S.ceMax; drawAll(); },
  };

  UI.boot({
    back: 'missions.html', nav: false, hud: false,
    data: ['characters', 'enemies', 'missions', 'items'],
    init: () => Promise.all([Data.load('missions'), Data.load('items'), Data.load('events')]).then(([M, it, EV]) => { ITEMS = it.items; setup(M, EV); }),
  });
  // test hook: lets automated smoke tests read the battle state
  window.__battle = () => S;
})();
