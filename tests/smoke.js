/* tests/smoke.js — end-to-end smoke test (Playwright + Chromium).
 *
 *   python3 -m http.server 8000            # from the repo root
 *   node tests/smoke.js [screenshotDir]    # BASE=http://localhost:8000/ by default
 *
 * Needs the `playwright` package; set PLAYWRIGHT_MODULE to its path if it is
 * not resolvable from here. Covers: login -> home -> 10x summon -> teams ->
 * mission -> battle (win) -> rewards saved, a forced defeat, every page with
 * zero console/page errors and no horizontal scroll at 844x390, the Portal
 * Code round trip, and the hub protocol (party import, guests, wallet
 * deposit / withdraw / refusal / lost-answer retry, grant, level report,
 * exit) against a small in-test mock hub.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE = (process.env.BASE || 'http://localhost:8000/').replace(/\/?$/, '/');
const OUT = process.argv[2] || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });

const MOCK_HUB = `<!doctype html><meta charset="utf-8"><title>Mock hub</title>
<script src="js/portal-sdk.js"></script>
<body style="margin:0;background:#111"><iframe id="f" style="width:844px;height:390px;border:0"></iframe>
<script>
window.hub = { wallet: { coins: 0, premium: 0 }, applied: {}, vault: {}, dropNext: 0, exited: false, party: null };
function startTrip(cards) {
  hub.party = { id: 'p_' + Math.random().toString(36).slice(2, 8), cards: cards.map(PortalSDK.validateCard) };
  hub.party.cards.forEach((c) => { hub.vault[c.id] = Object.assign({}, c); });
  document.getElementById('f').src = 'index.html';
}
const frame = () => document.getElementById('f').contentWindow;
const reply = (m) => frame().postMessage(Object.assign({ ns: 'portal', v: 1 }, m), location.origin);
addEventListener('message', (e) => {
  if (e.source !== frame() || e.origin !== location.origin) return;
  const m = e.data; if (!m || m.ns !== 'portal') return;
  const ack = (ok, error, extra) => reply(Object.assign({ type: 'ack', reqId: m.reqId, ok, error }, extra || {}));
  if (m.type === 'hello') return reply({ type: 'welcome', player: { name: 'HubPlayer' }, party: hub.party, wallet: hub.wallet, rates: { coins: 1, premium: 1 } });
  if (m.type === 'update') { const c = hub.vault[m.cardId]; if (!c) return ack(false, 'not in vault'); c.level = Math.max(c.level, m.patch.level || 0); return ack(true); }
  if (m.type === 'grant') { const c = PortalSDK.validateCard(m.card); if (c.sourceGame !== 'jjk-net0') return ack(false, 'own cards only'); hub.vault[c.id] = c; return ack(true); }
  if (m.type === 'deposit' || m.type === 'withdraw') {
    const apply = () => { if (hub.applied[m.txId]) return true; if (m.type === 'withdraw' && hub.wallet[m.currency] < m.amount) return false; hub.wallet[m.currency] += m.type === 'deposit' ? m.amount : -m.amount; hub.applied[m.txId] = true; return true; };
    if (hub.dropNext > 0) { hub.dropNext--; apply(); return; } // the hub applied it but the answer is lost
    return apply() ? ack(true, null, { wallet: hub.wallet }) : ack(false, 'Not enough ' + m.currency, { wallet: hub.wallet });
  }
  if (m.type === 'exit') hub.exited = true;
});
</script>`;

function watch(page, errs) {
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('deliberately-missing')) errs.push('http ' + r.status() + ' ' + r.url()); });
}
const save = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('jjk_save')));

async function gameFlow(browser) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs);

  await p.goto(BASE + 'index.html');
  await shot(p, '01-title');
  await p.fill('#name', 'Smoke Tester');
  await p.click('#start');
  await p.waitForURL(/home\.html/);
  await p.waitForSelector('.home');
  await shot(p, '02-home');
  let s = await save(p);
  check(s && s.schema === 1 && Object.keys(s.units).length === 4, 'new save with 4 starters');
  const keys = await p.evaluate(() => Object.keys(localStorage));
  check(keys.every((k) => k.startsWith('jjk_')), 'only jjk_ keys in localStorage: ' + keys.join(','));

  await p.goto(BASE + 'summon.html#standard');
  await p.click('#pull10');
  await p.waitForTimeout(1000);
  await shot(p, '03-summon-reveal');
  await p.waitForSelector('#rv-close:not([hidden])', { timeout: 8000 });
  await shot(p, '04-summon-results');
  await p.click('#rv-close');
  s = await save(p);
  check(s.stats.pulls === 10 && s.currency.cubes === 55, '10x summon spent 45 cubes (cubes ' + s.currency.cubes + ')');

  await p.goto(BASE + 'teams.html');
  await p.click('#auto');
  await p.waitForTimeout(200);
  await shot(p, '05-teams');
  s = await save(p);
  check(s.teams[0].slots.every(Boolean) && !!s.teams[0].support, 'team auto-filled with 4 front + support');

  await p.goto(BASE + 'missions.html');
  await shot(p, '06-missions');
  await p.click('[data-stage="1-1"]');
  await p.waitForSelector('#go');
  await p.click('#go');
  await p.waitForURL(/battle\.html/);
  await p.waitForSelector('.act-atk:not([disabled])', { timeout: 10000 });
  await shot(p, '07-battle');
  for (let i = 0; i < 2; i++) {
    const enemy = await p.$('.bt-enemies .bu:not(.is-ko)');
    if (enemy) await enemy.click();
    const b = await p.waitForSelector('.act-atk:not([disabled]), .results', { timeout: 15000 });
    if (await b.evaluate((el) => el.classList.contains('results'))) break;
    await b.click();
    await p.waitForTimeout(600);
  }
  await p.click('#auto');
  await p.waitForSelector('.results', { timeout: 120000 });
  await p.waitForTimeout(1600);
  await shot(p, '08-battle-results');
  s = await save(p);
  check(s.progress['1-1'] && s.progress['1-1'].stars >= 1, 'stage 1-1 cleared with ' + (s.progress['1-1'] || {}).stars + ' stars');
  check(s.stats.wins === 1 && s.currency.yen > 5000 && s.stamina.cur === 27, 'rewards saved (yen ' + s.currency.yen + ', stamina ' + s.stamina.cur + ')');
  check(s.currency.cubes === 60, 'first-clear bonus +5 cubes');

  // forced defeat: one 3-star unit against the final boss
  await p.evaluate(() => Save.update((st) => {
    ['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '3-4', '3-5', '4-1', '4-2', '4-3', '4-4'].forEach((id) => { st.progress[id] = st.progress[id] || { stars: 1, clears: 1, best: 9 }; });
    st.teams[2].slots = ['yuji_301', null, null, null]; st.teams[2].support = null;
    st.stamina = { cur: 99, ts: Date.now() }; st.settings.autoBattle = true; st.settings.battleSpeed = 3;
  }));
  await p.goto(BASE + 'battle.html?stage=4-5&team=2');
  await p.waitForSelector('.results', { timeout: 120000 });
  await shot(p, '09-battle-defeat');
  check(await p.$('.results.is-lose') !== null, 'defeat screen shown');

  for (const pg of ['index', 'home', 'characters', 'summon', 'teams', 'missions', 'shop', 'settings']) {
    await p.goto(BASE + pg + '.html');
    await p.waitForTimeout(900);
    const ov = await p.evaluate(() => {
      const m = document.getElementById('main');
      return { doc: document.documentElement.scrollWidth - innerWidth, main: m ? m.scrollWidth - m.clientWidth : 0 };
    });
    check(ov.doc <= 0 && ov.main <= 0, pg + ': no horizontal scroll');
  }
  await p.goto(BASE + 'characters.html');
  await p.click('.ucard');
  await p.waitForSelector('[data-feed="talisman_s"]');
  await p.click('[data-feed="talisman_s"]');
  await shot(p, '10-character-detail');
  await p.goto(BASE + 'shop.html#daily');
  await p.click('[data-buy="daily_gift"]');
  s = await save(p);
  check(!!s.daily.daily_gift, 'daily gift claimed');
  await p.goto(BASE + 'settings.html#portal');
  await p.waitForTimeout(600);
  await shot(p, '11-settings-portal');
  check((await p.textContent('.portal-status b')).includes('Standalone'), 'standalone status shown');
  check(await p.$eval('#w-dep', (b) => b.disabled), 'wallet disabled when standalone');

  // Portal Code out ...
  await p.click('#send-pick .ucard[data-id="megumi_401"]');
  await p.click('#send-pick .ucard[data-id="panda_404"]');
  await p.click('#send-go');
  const code = await p.inputValue('#code-out');
  check(code.startsWith('PRTL1.'), 'Portal Code made');
  check(!code.includes('cubes') && !code.includes('yen'), 'no currency in Portal Codes');
  await p.fill('#code-in', 'PRTL1.garbage');
  await p.click('#code-go');
  check((await p.textContent('#code-msg')).includes('damaged'), 'bad code shows a clear error');
  check(errs.length === 0, 'game flow: zero console/page errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await ctx.close();
  return code;
}

async function codeRoundTrip(browser, code) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs);
  await p.goto(BASE + 'index.html');
  await p.fill('#name', 'Second Device');
  await p.click('#start');
  await p.waitForURL(/home\.html/);
  await p.evaluate(() => Save.update((s) => { delete s.units.megumi_401; }));
  await p.goto(BASE + 'settings.html#portal');
  const foreign = await p.evaluate((root) => PortalSDK.encodeCode([{ sourceGame: 'nxbnvnb', baseId: 'kakashi_100', name: 'Kakashi Hatake', element: 'Wisdom', rarity: 6, level: 40, maxLevel: 100, stats: { hp: 0.5, atk: 0.4, speed: 0.5 }, art: { portrait: root + 'deliberately-missing.webp' } }]), BASE);
  await p.fill('#code-in', code);
  await p.click('#code-go');
  let s = await save(p);
  check(!!s.units.megumi_401 && !!s.units.panda_404, 'code import adds / keeps own units: ' + (await p.textContent('#code-msg')));
  await p.fill('#code-in', foreign);
  await p.click('#code-go');
  s = await save(p);
  check(!!s.units.guest_nxbnvnb_kakashi_100 && s.units.guest_nxbnvnb_kakashi_100.level === 40, 'foreign code becomes a playable guest');
  await p.goto(BASE + 'characters.html');
  await p.waitForTimeout(600);
  const fb = await p.evaluate(() => { const i = document.querySelector('.ucard[data-id="guest_nxbnvnb_kakashi_100"] img.art'); return !!i && i.src.startsWith('data:image/svg'); });
  check(fb, 'guest with broken art falls back to generated SVG');
  check(errs.every((e) => e.includes('deliberately-missing') || e.includes('Failed to load resource')), 'code round trip: no unexpected errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await ctx.close();
}

async function hubFlow(browser) {
  const ctx = await browser.newContext({ viewport: { width: 860, height: 400 } });
  await ctx.route(BASE + '__mockhub.html', (r) => r.fulfill({ body: MOCK_HUB, contentType: 'text/html' }));
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs);
  await p.goto(BASE + 'index.html');
  await p.fill('#name', 'Hub Tester');
  await p.click('#start');
  await p.waitForURL(/home\.html/);
  await p.goto(BASE + '__mockhub.html');
  await p.evaluate((root) => startTrip([
    { sourceGame: 'nxbnvnb', baseId: 'naruto_001', name: 'Naruto Uzumaki', element: 'Heart', rarity: 5, level: 30, maxLevel: 70, stats: { hp: 0.3, atk: 0.2, speed: 0.4 }, art: { portrait: root + 'assets/characters/sukuna_9006/portrait_7S.webp' } },
    { sourceGame: 'jjk-net0', baseId: 'gojo_9005', name: 'Gojo Satoru', element: 'Skill', rarity: 7, level: 5, maxLevel: 100, stats: { hp: 0.74, atk: 0.53, speed: 0.73 }, art: {} },
  ]), BASE);
  const fr = () => p.frames().find((f) => f !== p.mainFrame());
  await p.waitForTimeout(2200);
  let f = fr();
  let s = await save(f);
  check(s.units.gojo_9005 && s.units.gojo_9005.level === 5 && s.units.guest_nxbnvnb_naruto_001, 'hub party auto-imported (own card + guest)');
  check(!!(await f.$('.portal-chip')) && !!(await f.$('#portal-exit')), 'Portal chip + Return button');
  await f.goto(BASE + 'settings.html#portal');
  await p.waitForTimeout(1500);
  f = fr();
  const wallet = () => f.evaluate(() => ({ cur: JSON.parse(localStorage.getItem('jjk_save')).currency, hub: Object.assign({}, PortalPort.session.wallet), pending: PortalPort.pendingTx.length }));
  const move = async (btn, amt, cur, waitMs) => { await f.fill('#w-amt', String(amt)); await f.selectOption('#w-cur', cur); await f.click(btn); await p.waitForTimeout(waitMs || 600); return f.textContent('#w-msg'); };
  const w0 = await wallet();
  await move('#w-dep', 1000, 'coins');
  await move('#w-dep', 20, 'premium');
  await move('#w-wd', 400, 'coins');
  let w = await wallet();
  check(w.cur.yen === w0.cur.yen - 600 && w.cur.cubes === w0.cur.cubes - 20 && w.hub.coins === 600 && w.hub.premium === 20, 'deposit coins+premium, withdraw coins');
  const refused = await move('#w-wd', 9999, 'premium');
  w = await wallet();
  check(w.cur.cubes === w0.cur.cubes - 20 && w.pending === 0, 'refused withdraw changes nothing: ' + refused);
  await shot(p, '12-hub-wallet');
  await p.evaluate(() => { hub.dropNext = 2; });
  await move('#w-wd', 10, 'premium', 5600);
  await move('#w-dep', 100, 'coins', 5600);
  w = await wallet();
  check(w.pending === 2 && w.cur.cubes === w0.cur.cubes - 20 && w.cur.yen === w0.cur.yen - 700, 'lost answers keep 2 transfers pending');
  await f.goto(BASE + 'home.html');
  await p.waitForTimeout(1500);
  f = fr();
  w = await wallet();
  check(w.pending === 0 && w.cur.cubes === w0.cur.cubes - 10 && w.cur.yen === w0.cur.yen - 700 && w.hub.premium === 10 && w.hub.coins === 700, 'pending transfers retried once on reconnect (same txId)');
  await f.evaluate(() => Save.update((st) => { st.teams[0].slots = ['gojo_9005', 'guest_nxbnvnb_naruto_001', 'yuji_301', 'nobara_402']; st.units.gojo_9005.exp = 236; st.settings.autoBattle = true; st.settings.battleSpeed = 3; }));
  await f.goto(BASE + 'battle.html?stage=1-1&team=0');
  await p.waitForTimeout(1500);
  f = fr();
  await shot(p, '13-hub-battle-guest');
  await f.waitForSelector('.results', { timeout: 120000 });
  await p.waitForTimeout(2000);
  const lv = await p.evaluate(() => hub.vault['jjk-net0:gojo_9005'].level);
  check(lv === 6, 'level-up reported to the hub (Lv ' + lv + ')');
  await f.click('#res-portal');
  await p.waitForTimeout(300);
  check(await p.evaluate(() => hub.exited), 'Return to Portal sends exit');
  check(errs.length === 0, 'hub flow: zero console/page errors' + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    const code = await gameFlow(browser);
    await codeRoundTrip(browser, code);
    await hubFlow(browser);
  } catch (err) {
    fails++;
    console.error('ERROR', err);
  } finally {
    await browser.close();
  }
  console.log(fails ? fails + ' check(s) FAILED' : 'ALL CHECKS PASSED');
  console.log('screenshots: ' + OUT);
  process.exit(fails ? 1 : 0);
})();
