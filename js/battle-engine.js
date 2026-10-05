/* js/battle-engine.js — turn-based battle rules, no DOM.
 * battle.js drives it and animates the events it returns. Also loadable in
 * Node (module.exports) for balance simulations.
 *
 *   const S = BattleEngine.create({ allies, support, waves, rules, rng })
 *   const t = BattleEngine.nextTurn(S)      -> { actor, events, skipped }
 *   const a = BattleEngine.decide(S, actor) -> { type, target }   (AI / auto)
 *   const ev = BattleEngine.act(S, actor, a)-> events[]
 *   S.over / S.result ('win' | 'lose')
 *
 * allies: [{ id, name, element, stats:{hp,atk,speed}, technique, technique2, ultimate, passives, def }]
 *   technique / technique2 are a unit's Skill 1 and Skill 2. A skill with
 *   mult 0 does not hit: it only applies its effect (target 'allies' for
 *   heals and buffs).
 * waves:  [[{ id, name, element, stats, skill, boss, level, def }], ...]
 */
(function (global) {
  'use strict';

  function create(opts) {
    const R = opts.rules;
    const B = R.BATTLE;
    const rng = opts.rng || Math.random;
    const support = opts.support || null;
    const sup = (support && support.support && support.support.effect) || {};

    const S = {
      R, B, rng, round: 0, wave: 0, waveCount: opts.waves.length,
      ce: B.ceStart, ceMax: B.ceMax, allies: [], enemies: [], queue: [],
      over: false, result: null, koAllies: 0, seq: 0, waves: opts.waves, support,
    };

    opts.allies.forEach((a, i) => {
      const p = { atk: 0, hp: 0, speed: 0, crit: 0, guard: 0, regen: 0, lowHpAtk: 0, ceStart: 0 };
      (a.passives || []).forEach((ps) => {
        const e = ps.effect || {};
        if (e.type in p) p[e.type] += Number(e.pct || e.amount || 0);
      });
      // support / commander boost applies to every front unit
      if (sup.type === 'atk') p.atk += sup.pct || 0;
      if (sup.type === 'hp') p.hp += sup.pct || 0;
      if (sup.type === 'speed') p.speed += sup.pct || 0;
      if (sup.type === 'crit') p.crit += sup.pct || 0;
      const maxHp = Math.round(a.stats.hp * (1 + p.hp / 100));
      S.ce += p.ceStart;
      S.allies.push({
        key: 'a' + i, side: 'ally', idx: i, id: a.id, name: a.name, element: a.element, def: a.def,
        maxHp, hp: maxHp, atk: Math.round(a.stats.atk * (1 + p.atk / 100)),
        speed: Math.round(a.stats.speed * (1 + p.speed / 100)),
        crit: B.baseCrit + p.crit, guard: Math.min(60, p.guard), regen: p.regen, lowHpAtk: p.lowHpAtk,
        basic: a.basic || { name: 'Attack', mult: 1 }, technique: a.technique || null, technique2: a.technique2 || null, ultimate: a.ultimate || null,
        gauge: 0, buffs: [], dots: [], stun: 0, alive: true, acted: 0,
      });
    });
    if (sup.type === 'ce') S.ce += sup.amount || 0;
    S.ce = Math.min(S.ceMax, S.ce);
    spawnWave(S, 0);
    return S;
  }

  function spawnWave(S, w) {
    S.wave = w;
    S.enemies = S.waves[w].map((e, i) => {
      const lv = Math.max(1, e.level || 1);
      const B = S.B;
      // chapter difficulty: scale multiplies health fully and attack by half as much
      const sc = Math.max(0.1, Number(e.scale) || 1);
      const hp = Math.round(e.stats.hp * sc * (1 + B.enemyLevelHp * (lv - 1)));
      return {
        key: 'e' + w + '_' + i, side: 'enemy', idx: i, id: e.id, name: e.name, element: e.element, def: e.def || e,
        level: lv, boss: !!e.boss, maxHp: hp, hp,
        atk: Math.round(e.stats.atk * (0.5 + sc / 2) * (1 + B.enemyLevelAtk * (lv - 1))),
        speed: Math.round(e.stats.speed * (1 + B.enemyLevelSpeed * (lv - 1))),
        crit: 5, guard: 0, regen: 0, skill: e.skill || null, enraged: false,
        buffs: [], dots: [], stun: 0, alive: true, acted: 0,
      };
    });
    S.queue = [];
  }

  const living = (list) => list.filter((u) => u.alive);
  const all = (S) => S.allies.concat(S.enemies);
  const find = (S, key) => all(S).find((u) => u.key === key) || null;

  function startRound(S) {
    S.round++;
    S.ce = Math.min(S.ceMax, S.ce + S.B.cePerRound);
    S.queue = living(all(S))
      .sort((a, b) => b.speed - a.speed || (a.side === 'ally' ? -1 : 1))
      .map((u) => u.key);
    return { type: 'round', round: S.round, ce: S.ce };
  }

  function atkOf(u) {
    let mult = 1;
    for (const b of u.buffs) {
      if (b.type === 'atk') mult += b.pct / 100;
      if (b.type === 'weaken') mult -= b.pct / 100;
    }
    if (u.lowHpAtk && u.hp < u.maxHp / 2) mult += u.lowHpAtk / 100;
    if (u.enraged) mult += S_ENRAGE / 100;
    return u.atk * Math.max(0.2, mult);
  }
  let S_ENRAGE = 30;

  /** Advance to the next unit that can act. */
  function nextTurn(S) {
    const events = [];
    S_ENRAGE = S.B.bossEnrageAt ? S.B.bossEnrageAtk : 30;
    for (let guard = 0; guard < 200 && !S.over; guard++) {
      if (!S.queue.length) events.push(startRound(S));
      const key = S.queue.shift();
      const u = find(S, key);
      if (!u || !u.alive) continue;
      // start-of-turn: damage over time, regeneration
      for (const d of u.dots) {
        const dmg = Math.max(1, Math.round(u.maxHp * d.pct / 100));
        u.hp = Math.max(0, u.hp - dmg);
        events.push({ type: 'dot', to: u.key, amount: dmg, name: d.name || 'Burn' });
        d.turns--;
      }
      u.dots = u.dots.filter((d) => d.turns > 0);
      if (u.hp <= 0) { ko(S, u, events); checkEnd(S, events); continue; }
      if (u.regen && u.hp < u.maxHp) {
        const h = Math.round(u.maxHp * u.regen / 100);
        u.hp = Math.min(u.maxHp, u.hp + h);
        events.push({ type: 'heal', to: u.key, amount: h, quiet: true });
      }
      if (u.stun > 0) {
        u.stun--;
        tickBuffs(u);
        events.push({ type: 'stunned', to: u.key });
        continue;
      }
      return { actor: u, events };
    }
    return { actor: null, events };
  }

  function tickBuffs(u) {
    u.buffs.forEach((b) => b.turns--);
    u.buffs = u.buffs.filter((b) => b.turns > 0);
  }

  function ko(S, u, events) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    if (u.side === 'ally') S.koAllies++;
    S.queue = S.queue.filter((k) => k !== u.key);
    events.push({ type: 'ko', to: u.key });
  }

  function checkEnd(S, events) {
    if (S.over) return;
    if (!living(S.allies).length) {
      S.over = true; S.result = 'lose';
      events.push({ type: 'end', result: 'lose' });
      return;
    }
    if (!living(S.enemies).length) {
      if (S.wave + 1 < S.waveCount) {
        spawnWave(S, S.wave + 1);
        events.push({ type: 'wave', wave: S.wave, boss: S.enemies.some((e) => e.boss) });
      } else {
        S.over = true; S.result = 'win';
        events.push({ type: 'end', result: 'win' });
      }
    }
  }

  const techOf = (u, slot) => (slot === 1 ? u.technique2 : u.technique);
  function canTechnique(S, u, slot) { const t = techOf(u, slot || 0); return !!(u.side === 'ally' && t && S.ce >= t.cost); }
  function canUltimate(S, u) { return !!(u.side === 'ally' && u.ultimate && u.gauge >= S.B.gaugeMax && S.ce >= u.ultimate.cost); }

  function pickTargets(S, attacker, target, kind) {
    const foes = living(attacker.side === 'ally' ? S.enemies : S.allies);
    if (!foes.length) return [];
    if (kind === 'all') return foes;
    if (kind === 'random3') {
      const out = [];
      for (let i = 0; i < 3; i++) out.push(foes[Math.floor(S.rng() * foes.length)]);
      return out;
    }
    const t = target && foes.find((f) => f.key === target);
    return [t || foes[0]];
  }

  function hit(S, from, to, mult, events, label) {
    if (!to.alive) return 0;
    const B = S.B;
    const em = S.R.elementMult(from.element, to.element);
    const crit = S.rng() * 100 < from.crit;
    const varr = 1 - B.variance + S.rng() * B.variance * 2;
    let dmg = atkOf(from) * mult * em * varr * (crit ? B.critMult : 1) * (1 - (to.guard || 0) / 100);
    dmg = Math.max(1, Math.round(dmg));
    to.hp = Math.max(0, to.hp - dmg);
    events.push({ type: 'damage', from: from.key, to: to.key, amount: dmg, crit, adv: em > 1 ? 'strong' : em < 1 ? 'weak' : '', label });
    if (to.side === 'ally') to.gauge = Math.min(B.gaugeMax, to.gauge + B.gaugePerHitTaken);
    if (to.boss && !to.enraged && to.hp > 0 && to.hp <= to.maxHp * B.bossEnrageAt) {
      to.enraged = true;
      events.push({ type: 'enrage', to: to.key });
    }
    if (to.hp <= 0) ko(S, to, events);
    return dmg;
  }

  function applyEffect(S, from, targets, eff, events) {
    if (!eff) return;
    const friends = living(from.side === 'ally' ? S.allies : S.enemies);
    switch (eff.type) {
      case 'stun':
        targets.forEach((t) => { if (t.alive && S.rng() * 100 < (eff.chance || 0)) { t.stun = Math.max(t.stun, 1); events.push({ type: 'status', to: t.key, text: 'Stunned' }); } });
        break;
      case 'burn':
        targets.forEach((t) => { if (t.alive) { t.dots.push({ pct: eff.pct, turns: eff.turns || 2, name: 'Burn' }); events.push({ type: 'status', to: t.key, text: 'Burn' }); } });
        break;
      case 'weaken':
        targets.forEach((t) => { if (t.alive) { t.buffs.push({ type: 'weaken', pct: eff.pct, turns: (eff.turns || 2) + 1 }); events.push({ type: 'status', to: t.key, text: 'ATK ↓' }); } });
        break;
      case 'heal':
        friends.forEach((f) => { const h = Math.round(f.maxHp * eff.pct / 100); f.hp = Math.min(f.maxHp, f.hp + h); events.push({ type: 'heal', to: f.key, amount: h }); });
        break;
      case 'buffAtk':
        friends.forEach((f) => { f.buffs.push({ type: 'atk', pct: eff.pct, turns: (eff.turns || 2) + 1 }); events.push({ type: 'status', to: f.key, text: 'ATK ↑' }); });
        break;
      case 'ceGain':
        if (from.side === 'ally') { S.ce = Math.min(S.ceMax, S.ce + (eff.amount || 0)); events.push({ type: 'ce', amount: eff.amount, ce: S.ce }); }
        break;
      default:
    }
  }

  /** Perform an action. action: { type: 'attack'|'technique'|'ultimate'|'skill', target } */
  function act(S, actor, action) {
    const events = [];
    if (S.over || !actor || !actor.alive) return events;
    let type = action && action.type || 'attack';
    const slot = action && action.slot === 1 ? 1 : 0;
    if (type === 'technique' && !canTechnique(S, actor, slot)) type = 'attack';
    if (type === 'ultimate' && !canUltimate(S, actor)) type = 'attack';
    actor.acted++;
    let spec;
    if (actor.side === 'enemy') {
      const sk = actor.skill;
      if (type === 'skill' && sk) spec = { name: sk.name, mult: sk.mult, target: sk.target, effect: sk.effect, kind: 'skill' };
      else spec = { name: 'Attack', mult: 1, target: 'single', kind: 'attack' };
    } else if (type === 'technique') {
      const tech = techOf(actor, slot);
      spec = Object.assign({ kind: 'technique' }, tech);
      S.ce -= tech.cost;
      events.push({ type: 'ce', amount: -tech.cost, ce: S.ce });
    } else if (type === 'ultimate') {
      spec = Object.assign({ kind: actor.ultimate.kind === 'domain' ? 'domain' : 'ultimate' }, actor.ultimate);
      S.ce -= actor.ultimate.cost;
      actor.gauge = 0;
      events.push({ type: 'ce', amount: -actor.ultimate.cost, ce: S.ce });
    } else {
      spec = { name: actor.basic ? actor.basic.name : 'Attack', mult: actor.basic ? actor.basic.mult : 1, target: 'single', kind: 'attack' };
    }
    events.push({ type: 'action', from: actor.key, kind: spec.kind, name: spec.name, target: action && action.target });
    const supportOnly = spec.target === 'allies';
    const targets = supportOnly ? [] : pickTargets(S, actor, action && action.target, spec.target || 'single');
    let landed = 0;
    if (spec.mult > 0) targets.forEach((t) => { if (hit(S, actor, t, spec.mult, events, spec.name) > 0) landed++; });
    applyEffect(S, actor, targets.filter((t) => t.alive), spec.effect, events);
    if (actor.side === 'ally') {
      if (spec.kind === 'attack' && landed) {
        S.ce = Math.min(S.ceMax, S.ce + S.B.cePerBasicHit);
        events.push({ type: 'ce', amount: S.B.cePerBasicHit, ce: S.ce, quiet: true });
      }
      if (spec.kind !== 'domain' && spec.kind !== 'ultimate') actor.gauge = Math.min(S.B.gaugeMax, actor.gauge + S.B.gaugePerAction);
    }
    tickBuffs(actor);
    checkEnd(S, events);
    return events;
  }

  /** AI for enemies, and the Auto button for allies. */
  function decide(S, u) {
    const foes = living(u.side === 'ally' ? S.enemies : S.allies);
    if (!foes.length) return { type: 'attack' };
    const R = S.R;
    if (u.side === 'enemy') {
      const useSkill = u.skill && (u.acted + 1) % (u.skill.every || 3) === 0;
      let target;
      const strong = foes.filter((f) => R.elementMult(u.element, f.element) > 1);
      const r = S.rng();
      if (strong.length && r < 0.4) target = strong[Math.floor(S.rng() * strong.length)];
      else if (r < 0.65) target = foes.slice().sort((a, b) => a.hp - b.hp)[0];
      else target = foes[Math.floor(S.rng() * foes.length)];
      return { type: useSkill ? 'skill' : 'attack', target: target.key };
    }
    const best = foes.slice().sort((a, b) =>
      (R.elementMult(u.element, b.element) - R.elementMult(u.element, a.element)) || (a.hp - b.hp))[0];
    if (canUltimate(S, u)) return { type: 'ultimate', target: best.key };
    // keep enough energy for a teammate's charged ultimate
    const reserve = living(S.allies).some((a) => a !== u && a.ultimate && a.gauge >= S.B.gaugeMax - S.B.gaugePerAction)
      ? Math.max(...living(S.allies).filter((a) => a.ultimate).map((a) => a.ultimate.cost)) : 0;
    const hurt = living(S.allies).some((a) => a.hp < a.maxHp * 0.55);
    const buffed = u.buffs.some((b) => b.type === 'atk');
    const options = [0, 1].map((slot) => ({ slot, t: techOf(u, slot) }))
      .filter((o) => o.t && canTechnique(S, u, o.slot))
      .map((o) => {
        const e = o.t.effect && o.t.effect.type;
        let score = o.t.mult * (o.t.target === 'all' ? Math.min(foes.length, 3) * 0.8 : 1);
        if (e === 'heal') score = hurt ? 6 : -1;
        else if (e === 'buffAtk' && !o.t.mult) score = buffed ? -1 : 2.2;
        else if (e === 'ceGain' && !o.t.mult) score = 1.5;
        else if (!o.t.mult) score = 1.8; // stun / weaken only
        return Object.assign(o, { score });
      })
      .filter((o) => o.score > 0 && (S.ce - o.t.cost >= reserve || (foes.length === 1 && best.hp < atkOf(u) * o.t.mult)))
      .sort((a, b) => b.score - a.score);
    if (options.length) return { type: 'technique', slot: options[0].slot, target: best.key };
    return { type: 'attack', target: best.key };
  }

  const api = { create, nextTurn, act, decide, canTechnique, canUltimate, find, living };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BattleEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
