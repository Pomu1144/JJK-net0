/* js/rules.js — game rules and balance numbers in ONE place, plus the save-
 * level helpers built on them (unit stats, EXP, stamina, rank, rewards).
 * Pure functions where possible; anything that changes the save goes through
 * Save.update so the change is persisted.
 */
(function (global) {
  'use strict';

  /* ---------------- Elements ----------------
   * Same wheel as NXBNVNB: Body > Skill > Heart > Body,
   * Bravery and Wisdom are strong against each other. */
  const ELEMENTS = ['Body', 'Skill', 'Heart', 'Bravery', 'Wisdom'];
  const ELEMENT_KANJI = { Body: '体', Skill: '技', Heart: '心', Bravery: '勇', Wisdom: '知' };
  const STRONG_VS = { Body: ['Skill'], Skill: ['Heart'], Heart: ['Body'], Bravery: ['Wisdom'], Wisdom: ['Bravery'] };
  const ADV_MULT = 1.5;      // attacker has the advantage
  const DISADV_MULT = 0.75;  // defender has the advantage

  function elementMult(att, def) {
    if (STRONG_VS[att] && STRONG_VS[att].includes(def)) return ADV_MULT;
    if (STRONG_VS[def] && STRONG_VS[def].includes(att)) return DISADV_MULT;
    return 1;
  }

  /* ---------------- Battle tuning ---------------- */
  const BATTLE = {
    ceStart: 4, ceMax: 20, cePerRound: 2, cePerBasicHit: 1,
    gaugePerAction: 14, gaugePerHitTaken: 8, gaugeMax: 100,
    baseCrit: 10, critMult: 1.5, variance: 0.08,
    bossEnrageAt: 0.5, bossEnrageAtk: 30,
    enemyLevelHp: 0.22, enemyLevelAtk: 0.12, enemyLevelSpeed: 0.015,
  };

  /* ---------------- Levels & EXP ---------------- */
  const MAX_LEVEL = { 1: 20, 2: 25, 3: 30, 4: 50, 5: 70, 6: 100, 7: 100 };
  const expToNext = (level) => Math.round(25 * Math.pow(level, 1.4));
  const DUPE_BONUS = 2;   // % stats per duplicate
  const MAX_DUPES = 5;
  const DUPE_YEN = { 3: 200, 4: 600, 5: 2000, 6: 6000, 7: 15000 };

  /* ---------------- Stamina & rank ---------------- */
  const STAMINA_REGEN_MS = 3 * 60 * 1000;
  const maxStamina = (rank) => Math.min(99, 30 + (rank - 1) * 2);
  const rankExpToNext = (rank) => 100 + rank * 40;

  function unitDef(id) {
    if (!id) return null;
    if (id.startsWith('guest_')) {
      const s = Save.get();
      return (s && s.guests[id]) || null;
    }
    return Data.char(id);
  }

  function maxLevelOf(def) {
    return Math.max(1, Math.min(999, Number(def && def.maxLevel) || MAX_LEVEL[def && def.rarity] || 50));
  }

  /** Stats at a level: linear from statsBase (Lv1) to statsMax (max level). */
  function statsAt(def, level, dupes) {
    const ml = maxLevelOf(def);
    const t = ml <= 1 ? 1 : (Math.min(ml, Math.max(1, level)) - 1) / (ml - 1);
    const bonus = 1 + (Math.min(MAX_DUPES, dupes || 0) * DUPE_BONUS) / 100;
    const out = {};
    for (const k of ['hp', 'atk', 'speed']) {
      const lo = Number(def.statsBase[k]) || 0;
      const hi = Number(def.statsMax[k]) || lo;
      out[k] = Math.round((lo + (hi - lo) * t) * bonus);
    }
    return out;
  }

  const power = (st) => Math.round(st.hp / 10 + st.atk + st.speed * 2);

  function ownedUnit(id) {
    const s = Save.get();
    return s && s.units[id] ? s.units[id] : null;
  }

  function unitView(id) {
    const u = ownedUnit(id);
    const def = unitDef(id);
    if (!u || !def) return null;
    const stats = statsAt(def, u.level, u.dupes);
    return { id, unit: u, def, stats, power: power(stats), maxLevel: maxLevelOf(def) };
  }

  function ownedList() {
    const s = Save.get();
    if (!s) return [];
    return Object.keys(s.units).map(unitView).filter(Boolean);
  }

  /** Add a unit (or a duplicate). Returns { isNew, dupe, yen }. Call inside Save.update. */
  function addUnitTo(s, id, level) {
    const def = unitDef(id);
    if (!def) return { isNew: false, error: 'unknown unit ' + id };
    const cur = s.units[id];
    if (!cur) {
      s.units[id] = { id, level: Math.max(1, Math.min(maxLevelOf(def), level || 1)), exp: 0, dupes: 0, obtained: Date.now() };
      return { isNew: true };
    }
    if ((cur.dupes || 0) < MAX_DUPES) { cur.dupes = (cur.dupes || 0) + 1; return { isNew: false, dupe: cur.dupes }; }
    const yen = DUPE_YEN[def.rarity] || 500;
    s.currency.yen += yen;
    return { isNew: false, yen };
  }

  /** Give EXP to one unit inside a Save.update. Returns { from, to, gained }. */
  function addExpTo(s, id, exp) {
    const u = s.units[id];
    const def = unitDef(id);
    if (!u || !def) return null;
    const ml = maxLevelOf(def);
    const from = u.level;
    if (u.level >= ml) return { from, to: from, gained: 0, capped: true };
    u.exp = (u.exp || 0) + Math.max(0, Math.round(exp));
    while (u.level < ml && u.exp >= expToNext(u.level)) {
      u.exp -= expToNext(u.level);
      u.level++;
    }
    if (u.level >= ml) u.exp = 0;
    return { from, to: u.level, gained: exp };
  }

  /* ---------------- Stamina ---------------- */
  function staminaNow(s) {
    s = s || Save.get();
    const max = maxStamina(s.profile.rank);
    let cur = s.stamina.cur;
    let ts = s.stamina.ts;
    if (cur < max) {
      const ticks = Math.floor((Date.now() - ts) / STAMINA_REGEN_MS);
      if (ticks > 0) { cur = Math.min(max, cur + ticks); ts += ticks * STAMINA_REGEN_MS; }
    } else {
      ts = Date.now();
    }
    const nextIn = cur >= max ? 0 : STAMINA_REGEN_MS - (Date.now() - ts);
    return { cur, max, ts, nextIn };
  }

  function spendStamina(n) {
    return Save.update((s) => {
      const st = staminaNow(s);
      if (st.cur < n) return false;
      s.stamina = { cur: st.cur - n, ts: st.cur >= st.max ? Date.now() : st.ts };
      return true;
    });
  }

  function addStaminaTo(s, n, allowOver) {
    const st = staminaNow(s);
    const cap = allowOver ? 999 : st.max;
    s.stamina = { cur: Math.min(cap, st.cur + n), ts: st.ts };
  }

  /** Rank EXP inside a Save.update. Returns number of rank-ups. */
  function addRankExpTo(s, n) {
    let ups = 0;
    s.profile.rankExp += n;
    while (s.profile.rankExp >= rankExpToNext(s.profile.rank) && s.profile.rank < 200) {
      s.profile.rankExp -= rankExpToNext(s.profile.rank);
      s.profile.rank++;
      ups++;
    }
    if (ups) {
      const st = staminaNow(s);
      s.stamina = { cur: Math.max(st.cur, maxStamina(s.profile.rank)), ts: Date.now() };
    }
    return ups;
  }

  function teamIds(team) {
    return (team ? team.slots : []).filter(Boolean);
  }

  function teamPower(team) {
    const ids = teamIds(team).concat(team && team.support ? [team.support] : []);
    return ids.map(unitView).filter(Boolean).reduce((a, v) => a + v.power, 0);
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  global.Rules = {
    ELEMENTS, ELEMENT_KANJI, STRONG_VS, ADV_MULT, DISADV_MULT, elementMult,
    BATTLE, MAX_LEVEL, expToNext, DUPE_BONUS, MAX_DUPES,
    STAMINA_REGEN_MS, maxStamina, rankExpToNext,
    unitDef, maxLevelOf, statsAt, power, ownedUnit, unitView, ownedList,
    addUnitTo, addExpTo, staminaNow, spendStamina, addStaminaTo, addRankExpTo,
    teamIds, teamPower, today,
  };
})(window);
