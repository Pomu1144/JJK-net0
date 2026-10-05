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
    for (const c of M.chapters.concat(M.quests || [])) for (const st of c.stages) if (st.id === sid) { stage = st; chapter = c; }
    if (!stage) return fail('Unknown mission "' + (sid || '') + '".');
    const s = Save.get();
    // stage must be unlocked; Strengthening Quests also have a daily run limit
    if (chapter.mode === 'strengthen') {
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

  /* ---------------- rendering ---------------- */
  function unitHtml(u) {
    const tsrc = u.def && u.def.color ? u.def : u.element;
    const t = UI.typeOf(tsrc).toLowerCase();
    if (u.side === 'ally') {
      const lv = (Rules.unitView(u.id) || { unit: {} }).unit.level;
      return `<div class="bu ally t-${t} el-${u.element.toLowerCase()}" data-key="${u.key}" aria-label="${esc(u.name)}">
        <div class="bu-name">${esc(u.name)}</div>
        <div class="bu-row"><div class="bu-art">${Art.img(u.def, 'icon', { eager: true, alt: '' })}${UI.typeBadge(tsrc, 'bu-type')}${lv ? `<span class="bu-lv">Lv<b>${lv}</b></span>` : ''}<span class="bu-fx"></span><span class="bu-status"></span></div>
          <div class="bu-bars"><div class="bu-hp"><i></i><span></span></div>${u.ultimate ? '<div class="bu-gauge"><i></i></div>' : ''}</div></div>
      </div>`;
    }
    return `<div class="bu enemy${u.boss ? ' is-boss' : ''} t-${t} el-${u.element.toLowerCase()}" data-key="${u.key}" role="button" tabindex="0" aria-label="${esc(u.name)}">
      <div class="bu-hp"><i></i><span></span></div>${u.brkMax ? '<div class="bu-brk" title="Break gauge"><i></i></div>' : ''}
      <div class="bu-art"><img class="art" src="${esc(u.def.art)}" alt="" draggable="false">${UI.typeBadge(tsrc, 'bu-type')}${u.boss ? '<span class="bu-boss">BOSS</span>' : ''}<span class="bu-lv">Lv<b>${u.level}</b></span><span class="bu-fx"></span><span class="bu-status"></span></div>
      <div class="bu-name">${esc(u.name)}</div>
    </div>`;
  }

  function build() {
    const sup = supportId && Rules.unitView(supportId);
    if (chapter.bg) document.body.style.setProperty('--scene', `url('${new URL(chapter.bg, location.href).href}')`);
    $('#main').innerHTML = `<div class="battle el-${(chapter.element || 'Body').toLowerCase()}">
      <div class="bt-top">
        <div class="bt-wave-plate"><span class="bt-wave" id="wave"></span><span class="bt-round" id="round"></span></div>
        <div class="bt-ce" id="ce" title="Cursed energy"><img class="ce-ic" src="assets/pp/ui/Energy.webp" alt=""><span class="ce-label">呪力</span><span class="ce-pips"></span><b></b></div>
        <span class="grow"></span>
        ${sup ? `<span class="bt-support" title="${esc(sup.def.support.desc)}">${Art.img(sup.def, 'icon', { alt: '' })}<small>${esc(sup.def.support.name)}</small></span>` : ''}
        <button class="pp-stone bt-sq" id="speed" type="button" title="Battle speed">${speed}x</button>
        <button class="pp-stone bt-sq" id="auto" type="button" aria-pressed="${auto}" title="Auto battle">Auto</button>
      </div>
      <div class="bt-field"><div class="bt-side bt-enemies" id="enemies"></div></div>
      <div class="bt-actor" id="actor"></div>
      <div class="bt-panel" id="panel"></div>
      <div class="bt-side bt-allies" id="allies"></div>
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
      w({ type: b.dataset.act, slot: Number(b.dataset.slot || 0), target: target });
    });
    const back = $('.jjk-back');
    if (back) back.addEventListener('click', async (e) => {
      e.preventDefault();
      if (S.over || await UI.confirm('Retreat from battle? The AP spent is not refunded.', 'Retreat', 'Retreat')) location.href = 'missions.html';
    });
    paint();
  }

  function drawEnemies() {
    $('#enemies').innerHTML = S.enemies.map(unitHtml).join('');
    $('#enemies').classList.toggle('has-boss', S.enemies.some((e) => e.boss));
    if (!S.enemies.some((e) => e.key === target && e.alive)) target = null;
  }

  function paint() {
    $('#wave').innerHTML = '<small>WAVE</small>' + (S.wave + 1) + '/' + S.waveCount;
    $('#round').textContent = 'Turn ' + Math.max(1, S.round);
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
      const brk = el.querySelector('.bu-brk i');
      if (brk) brk.style.width = (u.broken ? 0 : Math.max(0, u.brk / u.brkMax * 100)) + '%';
      el.classList.toggle('is-broken', !!u.broken && u.alive);
      el.classList.toggle('is-ko', !u.alive);
      el.classList.toggle('is-active', current === u);
      el.classList.toggle('is-target', u.key === target);
      const st = [];
      if (u.stun) st.push('<i class="s-stun" title="Stunned">✦</i>');
      if (u.dots.length) st.push('<i class="s-burn" title="Burning">火</i>');
      if (u.buffs.some((b) => b.type === 'weaken')) st.push('<i class="s-weak" title="Attack down">↓</i>');
      if (u.buffs.some((b) => b.type === 'atk')) st.push('<i class="s-up" title="Attack up">↑</i>');
      if (u.broken) st.push('<i class="s-break" title="Broken">破</i>');
      if (u.enraged) st.push('<i class="s-rage" title="Enraged">怒</i>');
      el.querySelector('.bu-status').innerHTML = st.join('');
    }
  }

  function drawActor(u) {
    const a = $('#actor');
    if (!a) return;
    if (!u || u.side !== 'ally') { a.classList.remove('on'); return; }
    if (a.dataset.key !== u.key) { a.dataset.key = u.key; a.innerHTML = Art.img(u.def, 'full', { alt: '', eager: true }); }
    a.classList.add('on');
  }

  function drawPanel() {
    const p = $('#panel');
    const u = current;
    drawActor(u);
    if (!u || u.side !== 'ally') {
      p.innerHTML = `<div class="bt-wait">${u ? esc(u.name) + ' is acting…' : ''}</div>`;
      return;
    }
    const ul = u.ultimate;
    const fk = u.def && u.def.focusKanji ? `<i class="act-fk">${esc(u.def.focusKanji)}</i>` : '';
    const sk = (k, fb) => `<span class="act-ic">${u.def && u.def.art && u.def.art.skills && u.def.art.skills[k] ? `<img src="${esc(u.def.art.skills[k])}" alt="">` : UI.icon(fb)}${fk}</span>`;
    const confirm = '<span class="act-ok">Confirm</span>';
    const can = !!waiting && !auto;
    const ready = E.canUltimate(S, u);
    const techBtn = (t, slot) => `<button class="act act-tech" data-act="technique" data-slot="${slot}" type="button" ${can && t && E.canTechnique(S, u, slot) ? '' : 'disabled'}>${sk('s' + (slot + 1), 'bolt')}<span class="act-tx"><small class="act-k">Skill ${slot + 1}</small><b>${t ? esc(t.name) : '—'}</b></span><span class="act-ce">${t ? t.cost : ''}</span>${confirm}</button>`;
    const tgt = target && E.find(S, target);
    p.innerHTML = `
      <div class="bt-who"><small class="bt-hint">${auto ? 'Auto battle on' : tgt ? 'Selected enemy: ' + esc(tgt.name) : 'Tap an enemy to target'}</small><span class="bt-hp">${esc(u.name)} · ${fmt(u.hp)}/${fmt(u.maxHp)} HP</span></div>
      <button class="act act-atk" data-act="attack" type="button" ${can ? '' : 'disabled'}>${sk('normal', 'attack')}<span class="act-tx"><small class="act-k">Attack</small><b>${esc(u.basic.name)}</b></span><span class="act-ce plus">+1</span>${confirm}</button>
      ${techBtn(u.technique, 0)}
      ${u.technique2 ? techBtn(u.technique2, 1) : ''}
      <button class="act act-ult${ready ? ' is-ready' : ''}" data-act="ultimate" type="button" ${can && ready ? '' : 'disabled'} style="--g:${ul ? Math.floor(u.gauge) : 0}%">
        ${sk('ult', 'bolt')}<span class="act-tx"><small class="act-k">${ul ? (ul.kind === 'domain' ? 'Domain Expansion' : 'Ultimate') + (u.gauge < 100 ? ' · ' + Math.floor(u.gauge) + '%' : '') : 'Ultimate'}</small><b>${ul ? esc(ul.name.replace(/^Domain Expansion: /, '')) : 'None'}</b></span><span class="act-ce">${ul ? ul.cost : ''}</span>${confirm}</button>`;
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
        case 'round': paint(); break;
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
  function finish() {
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
      res = Rules.grantClearTo(s, stage, { team: teamUnitIds, support: supportId, stars, round: S.round, quest: chapter.mode === 'strengthen' ? chapter.id : null });
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
      <div class="res-head"><span class="res-k">${win ? '任務完了' : '敗北'}</span><h2 class="res-title">${win ? 'MISSION CLEAR' : 'DEFEAT'}</h2><span class="res-sub">${esc(stage.id + ' · ' + stage.name)}</span></div>
      ${win ? `<div class="res-stars">${conds.map((c, i) => `<div class="res-star pp-card${c.ok ? ' on' : ''}" style="--d:${0.2 + i * 0.25}s"><i>★</i><small>${esc(c.text)}</small></div>`).join('')}</div>
      <div class="res-rewards">
        <span class="rw">${UI.YEN_SVG} ${fmt(r.yen)} JP</span><span class="rw">Rank EXP +${fmt(r.rankExp)}${res.rankUps ? ' · <b class="gold">RANK UP!</b>' : ''}</span>
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
        <a class="jjk-btn" href="missions.html#${esc(chapter.id)}">Missions</a>
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
    if (win && chapter.mode === 'strengthen') $('#next-slot', ov).innerHTML = `<a class="jjk-btn is-primary" href="missions.html#${esc(chapter.id)}">Back to ${esc(chapter.name)}</a>`;
    else if (win) list.then((M) => {
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
