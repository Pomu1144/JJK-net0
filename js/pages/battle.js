/* battle.html — drives js/battle-engine.js and animates its events.
 * battle.html?stage=1-1&team=0
 */
(function () {
  'use strict';
  const { $, $$, esc, fmt } = UI;
  const E = window.BattleEngine;
  let S = null, stage = null, chapter = null, teamIdx = 0, ITEMS = {};
  let target = null;          // selected enemy key
  let waiting = null;         // resolver for the player's choice
  let current = null;         // acting unit
  let speed = 1, auto = false;
  let teamUnitIds = [], supportId = null;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
  const unitEl = (key) => document.querySelector(`.bu[data-key="${key}"]`);

  /* ---------------- setup ---------------- */
  function fail(msg) {
    $('#main').innerHTML = `<div class="jjk-panel error-panel"><h2>Cannot start battle</h2><p>${esc(msg)}</p><a class="jjk-btn is-primary" href="missions.html">Back to Missions</a></div>`;
  }

  function setup(M) {
    const q = new URLSearchParams(location.search);
    const sid = q.get('stage');
    teamIdx = Math.max(0, Math.min(2, Number(q.get('team')) || 0));
    for (const c of M.chapters) for (const st of c.stages) if (st.id === sid) { stage = st; chapter = c; }
    if (!stage) return fail('Unknown mission "' + (sid || '') + '".');
    const s = Save.get();
    // stage must be unlocked
    const list = M.chapters.flatMap((c) => c.stages);
    const i = list.indexOf(stage);
    if (i > 0 && !s.progress[list[i - 1].id]) return fail('Clear the previous mission first.');
    const team = s.teams[teamIdx];
    teamUnitIds = Rules.teamIds(team).filter((id) => Rules.unitView(id));
    supportId = team.support && Rules.unitView(team.support) ? team.support : null;
    if (!teamUnitIds.length) return fail('Your team has no front units. Set one up in Teams.');
    if (!Rules.spendStamina(stage.stamina)) return fail('Not enough stamina (' + stage.stamina + ' needed). Refill it in the Shop or wait.');

    speed = s.settings.battleSpeed || 1;
    auto = !!s.settings.autoBattle;
    const allies = teamUnitIds.map((id) => {
      const v = Rules.unitView(id);
      const d = v.def;
      return { id, name: d.name, element: d.element, stats: v.stats, basic: d.basic, technique: d.technique, ultimate: d.ultimate, passives: d.passives, def: d };
    });
    const waves = stage.waves.map((w) => w.map((x) => Object.assign({}, Data.enemy(x.enemy), { level: x.level, scale: chapter.scale || 1 })));
    S = E.create({ allies, support: supportId ? Rules.unitDef(supportId) : null, waves, rules: Rules });
    build();
    loop().catch((err) => { console.error(err); UI.toast('Battle error: ' + err.message, 'bad'); });
  }

  /* ---------------- rendering ---------------- */
  function unitHtml(u) {
    const img = u.side === 'ally' ? Art.img(u.def, 'portrait', { eager: true, alt: '' }) : `<img class="art" src="${esc(u.def.art)}" alt="" draggable="false">`;
    return `<div class="bu ${u.side}${u.boss ? ' is-boss' : ''} el-${u.element.toLowerCase()}" data-key="${u.key}" ${u.side === 'enemy' ? 'role="button" tabindex="0"' : ''} aria-label="${esc(u.name)}">
      <div class="bu-art">${img}<img class="bu-orb" src="${Art.orb(u.element)}" alt="" width="18" height="18"><span class="bu-fx"></span><span class="bu-status"></span></div>
      <div class="bu-name">${u.side === 'enemy' ? `<small>Lv${u.level}</small> ` : ''}${esc(u.name)}</div>
      <div class="bu-hp"><i></i><span></span></div>
      ${u.side === 'ally' && u.ultimate ? '<div class="bu-gauge"><i></i></div>' : ''}
    </div>`;
  }

  function build() {
    const sup = supportId && Rules.unitView(supportId);
    $('#main').innerHTML = `<div class="battle el-${(chapter.element || 'Body').toLowerCase()}">
      <div class="bt-top">
        <span class="bt-wave" id="wave"></span><span class="bt-round" id="round"></span>
        <div class="bt-ce" id="ce" title="Cursed energy"><span class="ce-label">呪力</span><span class="ce-pips"></span><b></b></div>
        <span class="grow"></span>
        ${sup ? `<span class="bt-support" title="${esc(sup.def.support.desc)}">${Art.img(sup.def, 'portrait', { alt: '' })}<small>${esc(sup.def.support.name)}</small></span>` : ''}
        <button class="jjk-btn is-small" id="auto" type="button" aria-pressed="${auto}">Auto</button>
        <button class="jjk-btn is-small" id="speed" type="button">${speed}x</button>
      </div>
      <div class="bt-field">
        <div class="bt-side bt-allies" id="allies"></div>
        <div class="bt-vs">VS</div>
        <div class="bt-side bt-enemies" id="enemies"></div>
      </div>
      <div class="bt-panel" id="panel"></div>
      <div class="bt-banner" id="banner"></div>
    </div>`;
    $('#allies').innerHTML = S.allies.map(unitHtml).join('');
    drawEnemies();
    $('#enemies').addEventListener('click', (e) => { const b = e.target.closest('.bu'); if (b) selectTarget(b.dataset.key); });
    $('#enemies').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = e.target.closest('.bu'); if (b) selectTarget(b.dataset.key); } });
    $('#auto').addEventListener('click', () => {
      auto = !auto;
      $('#auto').setAttribute('aria-pressed', auto);
      Save.update((s) => { s.settings.autoBattle = auto; });
      if (auto && waiting && current) { const w = waiting; waiting = null; w(E.decide(S, current)); }
      drawPanel();
    });
    $('#speed').addEventListener('click', () => {
      speed = speed >= 3 ? 1 : speed + 1;
      $('#speed').textContent = speed + 'x';
      Save.update((s) => { s.settings.battleSpeed = speed; });
    });
    $('#panel').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled || !waiting) return;
      const w = waiting; waiting = null;
      w({ type: b.dataset.act, target: target });
    });
    const back = $('.jjk-back');
    if (back) back.addEventListener('click', async (e) => {
      e.preventDefault();
      if (S.over || await UI.confirm('Retreat from battle? The stamina spent is not refunded.', 'Retreat', 'Retreat')) location.href = 'missions.html';
    });
    paint();
  }

  function drawEnemies() {
    $('#enemies').innerHTML = S.enemies.map(unitHtml).join('');
    $('#enemies').classList.toggle('has-boss', S.enemies.some((e) => e.boss));
    if (!S.enemies.some((e) => e.key === target && e.alive)) target = null;
  }

  function paint() {
    $('#wave').textContent = 'Wave ' + (S.wave + 1) + '/' + S.waveCount;
    $('#round').textContent = 'Turn ' + Math.max(1, S.round) + ' · ★ ≤ ' + stage.turnGoal;
    const ce = $('#ce');
    ce.querySelector('b').textContent = S.ce + '/' + S.ceMax;
    ce.querySelector('.ce-pips').innerHTML = Array.from({ length: S.ceMax }, (_, i) => `<i class="${i < S.ce ? 'on' : ''}"></i>`).join('');
    for (const u of S.allies.concat(S.enemies)) {
      const el = unitEl(u.key);
      if (!el) continue;
      const pct = Math.max(0, u.hp / u.maxHp * 100);
      el.querySelector('.bu-hp i').style.width = pct + '%';
      el.querySelector('.bu-hp').classList.toggle('low', pct < 30);
      el.querySelector('.bu-hp span').textContent = fmt(u.hp);
      const g = el.querySelector('.bu-gauge i');
      if (g) { g.style.width = u.gauge + '%'; el.classList.toggle('ult-ready', E.canUltimate(S, u)); }
      el.classList.toggle('is-ko', !u.alive);
      el.classList.toggle('is-active', current === u);
      el.classList.toggle('is-target', u.key === target);
      const st = [];
      if (u.stun) st.push('<i class="s-stun" title="Stunned">✦</i>');
      if (u.dots.length) st.push('<i class="s-burn" title="Burning">火</i>');
      if (u.buffs.some((b) => b.type === 'weaken')) st.push('<i class="s-weak" title="Attack down">↓</i>');
      if (u.buffs.some((b) => b.type === 'atk')) st.push('<i class="s-up" title="Attack up">↑</i>');
      if (u.enraged) st.push('<i class="s-rage" title="Enraged">怒</i>');
      el.querySelector('.bu-status').innerHTML = st.join('');
    }
  }

  function drawPanel() {
    const p = $('#panel');
    const u = current;
    if (!u || u.side !== 'ally') {
      p.innerHTML = `<div class="bt-wait">${u ? esc(u.name) + ' is acting…' : ''}</div>`;
      return;
    }
    const t = u.technique, ul = u.ultimate;
    const can = !!waiting && !auto;
    p.innerHTML = `
      <div class="bt-who">${Art.img(u.def, 'portrait', { alt: '' })}<div><b>${esc(u.name)}</b><small>${fmt(u.hp)} / ${fmt(u.maxHp)} HP</small>
        <small class="bt-hint">${auto ? 'Auto battle on' : target ? '⌖ ' + esc((E.find(S, target) || {}).name || '') : 'Tap a curse to target'}</small></div></div>
      <button class="act act-atk" data-act="attack" type="button" ${can ? '' : 'disabled'}><b>Attack</b><small>${esc(u.basic.name)} · +1 CE</small></button>
      <button class="act act-tech" data-act="technique" type="button" ${can && E.canTechnique(S, u) ? '' : 'disabled'}><b>${t ? esc(t.name) : 'No technique'}</b><small>${t ? 'Cursed Technique · ' + t.cost + ' CE' : '—'}</small></button>
      <button class="act act-ult${E.canUltimate(S, u) ? ' is-ready' : ''}" data-act="ultimate" type="button" ${can && E.canUltimate(S, u) ? '' : 'disabled'}>
        <b>${ul ? (ul.kind === 'domain' ? 'Domain Expansion' : 'Ultimate') : 'No ultimate'}</b><small>${ul ? esc(ul.name.replace(/^Domain Expansion: /, '')) + ' · ' + ul.cost + ' CE' + (u.gauge < 100 ? ' · ' + Math.floor(u.gauge) + '%' : '') : '★5+ only'}</small></button>`;
  }

  function selectTarget(key) {
    const u = E.find(S, key);
    if (!u || !u.alive || u.side !== 'enemy') return;
    target = key;
    UI.sfx('tap');
    paint();
    drawPanel();
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
        case 'round': paint(); break;
        case 'action': {
          const u = E.find(S, ev.from);
          if (ev.kind === 'domain' || ev.kind === 'ultimate') await domainCutIn(u, u.ultimate);
          else if (ev.kind === 'technique' || ev.kind === 'skill') await showBanner(`<small>${ev.kind === 'skill' ? '呪霊 · Curse technique' : '術式 · Cursed Technique'}</small><b>${esc(ev.name)}</b>`, u.side, 650);
          pulse(ev.from, u.side === 'ally' ? 'lunge-r' : 'lunge-l', 380);
          await wait(200);
          break;
        }
        case 'damage': {
          pulse(ev.to, 'hit', 360);
          const label = (ev.crit ? 'CRIT ' : '') + fmt(ev.amount);
          floatText(ev.to, label, (ev.crit ? 'crit ' : '') + (ev.adv === 'strong' ? 'strong' : ev.adv === 'weak' ? 'weak' : ''));
          if (ev.adv) floatText(ev.to, ev.adv === 'strong' ? 'WEAK POINT!' : 'RESISTED', 'tag ' + ev.adv);
          UI.sfx(ev.crit ? 'crit' : 'hit');
          paint();
          await wait(170);
          break;
        }
        case 'dot': floatText(ev.to, fmt(ev.amount), 'dot'); pulse(ev.to, 'hit', 300); paint(); await wait(260); break;
        case 'heal': if (!ev.quiet) { floatText(ev.to, '+' + fmt(ev.amount), 'heal'); UI.sfx('heal'); } paint(); if (!ev.quiet) await wait(120); break;
        case 'status': floatText(ev.to, ev.text, 'status'); paint(); await wait(90); break;
        case 'stunned': floatText(ev.to, 'STUNNED', 'status'); paint(); await wait(420); break;
        case 'enrage': floatText(ev.to, 'ENRAGED!', 'crit'); pulse(ev.to, 'rage', 700); paint(); await wait(400); break;
        case 'ce': paint(); if (!ev.quiet && ev.amount > 0) pulse('ce', 'x', 1); break;
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

  function playerChoice(u) {
    return new Promise((resolve) => { waiting = resolve; drawPanel(); });
  }

  async function loop() {
    paint();
    await showBanner(`<small>${esc(stage.id)} · ${esc(chapter.name)}</small><b>${esc(stage.name)}</b>`, 'start', 1000);
    let guard = 0;
    while (!S.over && guard++ < 5000) {
      const t = E.nextTurn(S);
      current = t.actor;
      await animate(t.events);
      if (!t.actor || S.over) continue;
      paint();
      drawPanel();
      let action;
      if (t.actor.side === 'ally' && !auto) {
        action = await playerChoice(t.actor);
        if (!action.target || !(E.find(S, action.target) || {}).alive) {
          const d = E.decide(S, t.actor);
          action.target = d.target;
        }
      } else {
        await wait(t.actor.side === 'enemy' ? 380 : 240);
        action = E.decide(S, t.actor);
      }
      const ev = E.act(S, t.actor, action);
      await animate(ev);
      current = null;
      drawPanel();
    }
    finish();
  }

  /* ---------------- results ---------------- */
  function rollDrops() {
    const got = {};
    (stage.rewards.drops || []).forEach((d) => { if (Math.random() * 100 < d.chance) got[d.item] = (got[d.item] || 0) + (d.qty || 1); });
    return got;
  }

  function finish() {
    const win = S.result === 'win';
    const conds = [
      { ok: win, text: 'Clear the mission' },
      { ok: win && S.koAllies === 0, text: 'Nobody knocked out' },
      { ok: win && S.round <= stage.turnGoal, text: 'Clear within ' + stage.turnGoal + ' turns (' + S.round + ')' },
    ];
    const stars = conds.filter((c) => c.ok).length;
    let res = { levels: [], drops: {}, first: null, rankUps: 0 };
    Save.update((s) => {
      s.stats.battles++;
      if (!win) return;
      s.stats.wins++;
      const prev = s.progress[stage.id];
      const r = stage.rewards;
      s.currency.yen += r.yen;
      res.rankUps = Rules.addRankExpTo(s, r.rankExp);
      teamUnitIds.forEach((id) => { const lv = Rules.addExpTo(s, id, r.unitExp); if (lv) res.levels.push(Object.assign({ id }, lv)); });
      if (supportId) { const lv = Rules.addExpTo(s, supportId, Math.round(r.unitExp / 2)); if (lv) res.levels.push(Object.assign({ id: supportId, support: true }, lv)); }
      res.drops = rollDrops();
      Object.entries(res.drops).forEach(([k, n]) => { s.items[k] = (s.items[k] || 0) + n; });
      if (!prev) {
        const f = stage.firstClear || {};
        res.first = f;
        s.currency.cubes += f.cubes || 0;
        s.currency.yen += f.yen || 0;
        Object.entries(f.items || {}).forEach(([k, n]) => { s.items[k] = (s.items[k] || 0) + n; });
      }
      s.progress[stage.id] = {
        stars: Math.max(stars, (prev && prev.stars) || 0),
        clears: ((prev && prev.clears) || 0) + 1,
        best: Math.min(S.round, (prev && prev.best) || Infinity),
      };
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
      <div class="res-head"><span class="res-k">${win ? '祓除' : '敗北'}</span><h2>${win ? 'Mission Clear' : 'Defeat'}</h2><span class="res-sub">${esc(stage.id + ' · ' + stage.name)}</span></div>
      ${win ? `<div class="res-stars">${conds.map((c, i) => `<div class="res-star${c.ok ? ' on' : ''}" style="--d:${0.2 + i * 0.25}s"><i>★</i><small>${esc(c.text)}</small></div>`).join('')}</div>
      <div class="res-rewards">
        <span class="rw">${UI.YEN_SVG} ¥${fmt(r.yen)}</span><span class="rw">Rank EXP +${fmt(r.rankExp)}${res.rankUps ? ' · <b class="gold">RANK UP!</b>' : ''}</span>
        ${itemLine(res.drops)}
        ${res.first ? `<span class="rw first">First clear: ${res.first.cubes ? UI.CUBE_SVG + ' ' + res.first.cubes + ' Cubes ' : ''}</span>${itemLine(res.first.items)}` : ''}
      </div>
      <div class="res-units">${res.levels.map((l) => {
        const v = Rules.unitView(l.id);
        if (!v) return '';
        return `<div class="res-unit">${Art.img(v.def, 'portrait', { alt: '' })}<small>${esc(v.def.name)}</small>
          <b>${l.to > l.from ? `Lv ${l.from} → <span class="gold">${l.to}</span>` : l.capped ? 'MAX' : 'Lv ' + l.to}</b><small>+${fmt(l.gained)} EXP${l.support ? ' (support)' : ''}</small></div>`;
      }).join('')}</div>` : `<p class="res-lose">The curses were too strong. Level up with talismans, check element advantage (Body › Skill › Heart › Body, Bravery ⇄ Wisdom) or bring a stronger support.</p>`}
      <div class="modal-actions">
        ${PortalPort.session ? '<button class="jjk-btn" type="button" id="res-portal">Return to Portal</button>' : ''}
        <a class="jjk-btn" href="home.html">Home</a>
        <a class="jjk-btn" href="missions.html#${esc(chapter.id)}">Missions</a>
        <button class="jjk-btn${win ? '' : ' is-primary'}" type="button" id="retry">Retry · ${stage.stamina} ${UI.icon('bolt')}</button>
        <span id="next-slot"></span>
      </div></div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('in'));
    const rp = $('#res-portal', ov);
    if (rp) rp.addEventListener('click', () => PortalPort.session.exit());
    $('#retry', ov).addEventListener('click', () => {
      if (Rules.staminaNow().cur < stage.stamina) { UI.toast('Not enough stamina — refill it in the Shop.', 'bad'); return; }
      location.reload();
    });
    if (win) list.then((M) => {
      const all = M.chapters.flatMap((c) => c.stages);
      const nx = all[all.indexOf(all.find((x) => x.id === stage.id)) + 1];
      if (nx) $('#next-slot', ov).innerHTML = `<a class="jjk-btn is-primary" href="missions.html#${esc(M.chapters.find((c) => c.stages.includes(nx)).id)}">Next: ${esc(nx.id)}</a>`;
    });
  }

  UI.boot({
    back: 'missions.html', nav: false, hud: false,
    data: ['characters', 'enemies', 'missions', 'items'],
    init: () => Promise.all([Data.load('missions'), Data.load('items')]).then(([M, it]) => { ITEMS = it.items; setup(M); }),
  });
  // test hook: lets automated smoke tests read the battle state
  window.__battle = () => S;
})();
