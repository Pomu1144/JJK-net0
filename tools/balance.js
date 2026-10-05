/* tools/balance.js — auto-battle simulations for balance checks.
 *   node tools/balance.js
 * Runs the real engine (js/battle-engine.js + js/rules.js) with the Auto AI
 * for a few team setups against every stage, and prints win rates.
 *   node tools/balance.js --legacy     # Black Flash + Break turned off
 *   BREAK_RATIO=0.8 node tools/balance.js  # try another Break gauge size
 */
global.window = global;
require('../js/rules.js');
require('../js/battle-engine.js');
const E = global.BattleEngine, R = global.Rules;
if (process.argv.includes('--legacy')) { R.BATTLE.blackFlash = false; R.BATTLE.break = false; }
if (process.env.BREAK_RATIO) R.BATTLE.breakHpRatio = Number(process.env.BREAK_RATIO);
const tally = { blackFlash: 0, breaks: 0, battles: 0 };
const chars = require('../data/characters.json');
const enemies = new Map(require('../data/enemies.json').map((e) => [e.id, e]));
const M = require('../data/missions.json');
const byId = new Map(chars.map((c) => [c.id, c]));

function ally(id, level) {
  const d = byId.get(id);
  return { id, name: d.name, element: d.element, stats: R.statsAt(d, level, 0), basic: d.basic,
    technique: d.technique, technique2: d.technique2, ultimate: d.ultimate, passives: d.passives, def: d };
}

function run(team, level, supportId, stage, chapter) {
  let seed = 7;
  const waves = stage.waves.map((w) => w.map((x) => Object.assign({}, enemies.get(x.enemy), { level: x.level, scale: chapter.scale || 1 })));
  let wins = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    seed = (seed * 9301 + 49297 + i) % 233280;
    let st = seed;
    const rng = () => ((st = (st * 9301 + 49297) % 233280) / 233280);
    const S = E.create({ allies: team.map((id) => ally(id, level)), support: supportId ? byId.get(supportId) : null, waves, rules: R, rng });
    let guard = 0;
    while (!S.over && guard++ < 3000) {
      const t = E.nextTurn(S);
      if (!t.actor || S.over) continue;
      const ev = E.act(S, t.actor, E.decide(S, t.actor));
      for (const e of ev) { if (e.blackFlash) tally.blackFlash++; if (e.type === 'break') tally.breaks++; }
    }
    tally.battles++;
    if (S.result === 'win') wins++;
  }
  return Math.round((wins / N) * 100);
}

const pick = (rar, n, offset = 0) => chars.filter((c) => c.rarity === rar).slice(offset, offset + n).map((c) => c.id);
const STARTERS = ['maki_weaker_curse', 'panda_at_shortest', 'toge_baton_counterattack', 'shoko_reverse_curse'];
const setups = [
  ['Starters SR Lv1', STARTERS, 1],
  ['Starters SR Lv35', STARTERS, 35],
  ['Starters SR Lv70 (max)', STARTERS, 70],
  ['SSR team Lv60', pick(6, 4, 4), 60],
  ['SSR team Lv100 (max)', pick(6, 4, 4), 100],
  ['Top SSR Lv100', ['satoru_strongest', 'toji_602', 'yuta_601', 'yuji_301'], 100],
];
const header = ['setup'.padEnd(24)].concat(M.chapters.flatMap((c) => c.stages.map((s) => s.id.padStart(4)))).join(' ');
console.log(header);
for (const [label, team, lv] of setups) {
  const row = [label.padEnd(24)];
  for (const c of M.chapters) for (const s of c.stages) row.push(String(run(team, lv, null, s, c)).padStart(4));
  console.log(row.join(' '));
}
console.log(`\nBlack Flash hits: ${(tally.blackFlash / tally.battles).toFixed(2)}/battle · Breaks: ${(tally.breaks / tally.battles).toFixed(2)}/battle (breakHpRatio ${R.BATTLE.breakHpRatio}${R.BATTLE.break ? '' : ', off'})`);
