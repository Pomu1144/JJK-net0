/* novice.html — Novice Mission: 7 days of beginner missions (Phantom Parade).
 *
 * Day N unlocks N-1 local days after the save was created. Mission progress is
 * derived from the save (stats, stage progress, units, teams, rank …), so no
 * other page needs a hook. Claimed state: save.novice = { claimed: {id: true},
 * final: bool }. Claiming all 35 missions unlocks the final reward, an
 * SSR-Character Guaranteed Ticket (items.ssr_ticket).
 *
 * The file also exposes window.Novice (status() for the Home "!" dot); it only
 * builds the page when loaded by novice.html.
 */
(function (global) {
  'use strict';

  const DAY_MS = 864e5;
  let D = null;          // data/novice.json
  let ITEMS = {};        // data/items.json → items
  let byId = {};

  /* ---------- progress, derived from the save ---------- */
  const isMain = (k) => /^\d+-\d+$/.test(k);
  const isQuest = (k) => /^(tl|jp)-\d+$/.test(k);
  const ownUnits = (s) => Object.values(s.units || {}).filter((u) => u && !String(u.id).startsWith('guest_'));
  const prog = (s, test) => Object.entries(s.progress || {}).filter(([k]) => test(k)).map(([, v]) => v || {});
  const METRIC = {
    clear: (s, m) => (s.progress && s.progress[m.arg] ? 1 : 0),
    pulls: (s) => (s.stats && s.stats.pulls) || 0,
    wins: (s) => (s.stats && s.stats.wins) || 0,
    battles: (s) => (s.stats && s.stats.battles) || 0,
    dailyGift: (s) => (s.daily && s.daily.daily_gift ? 1 : 0),
    support: (s) => (s.teams || []).filter((t) => t && t.support).length,
    teamsFull: (s) => (s.teams || []).filter((t) => t && t.slots.every(Boolean)).length,
    units: (s) => ownUnits(s).length,
    unitLevel: (s, m) => ownUnits(s).filter((u) => (u.level || 1) >= m.arg).length,
    ssr: (s) => ownUnits(s).filter((u) => { const d = Rules.unitDef(u.id); return d && d.rarity >= 6; }).length,
    questStages: (s) => prog(s, isQuest).length,
    questRuns: (s) => prog(s, isQuest).reduce((a, p) => a + (p.clears || 0), 0),
    stars: (s) => prog(s, isMain).reduce((a, p) => a + (p.stars || 0), 0),
    threeStar: (s) => prog(s, isMain).filter((p) => p.stars >= 3).length,
    rank: (s) => (s.profile && s.profile.rank) || 1,
  };
  const value = (s, m) => (METRIC[m.metric] ? METRIC[m.metric](s, m) : 0);
  const done = (s, m) => value(s, m) >= m.target;
  const nov = (s) => s.novice || { claimed: {}, final: false };
  const isClaimed = (s, m) => !!nov(s).claimed[m.id];

  /** local days since the save was made (0 on the first day) */
  function dayIndex(s) {
    const c = new Date(Number(s.created) || Date.now());
    const n = new Date();
    const a = new Date(c.getFullYear(), c.getMonth(), c.getDate());
    const b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.max(0, Math.round((b - a) / DAY_MS));
  }
  const dayOpen = (s, day) => day - 1 <= dayIndex(s);
  const all = () => D.days.flatMap((d) => d.missions);
  const ready = (s, m) => dayOpen(s, m.day) && !isClaimed(s, m) && done(s, m);
  const claimedCount = (s) => all().filter((m) => isClaimed(s, m)).length;
  const finalReady = (s) => !nov(s).final && claimedCount(s) >= all().length;

  function prepare(d) {
    D = d;
    byId = {};
    D.days.forEach((x) => x.missions.forEach((m) => { m.day = x.day; byId[m.id] = m; }));
    return D;
  }
  function load() {
    return Promise.all([Data.load('novice'), Data.load('items')]).then(([n, it]) => { ITEMS = (it && it.items) || {}; return prepare(n); });
  }

  /** For the Home button: { hidden, claimable } */
  function status() {
    return load().then(() => {
      const s = Save.get();
      if (!s) return { hidden: true, claimable: 0 };
      const n = all().filter((m) => ready(s, m)).length + (finalReady(s) ? 1 : 0);
      return { hidden: !!nov(s).final, claimable: n };
    });
  }

  /* ---------- rewards ---------- */
  let uid = 0;
  /** Drawn ticket: 'ssr' (gold, SSR-Character Guaranteed) or 'draw' (red Draw Ticket). */
  function ticketSvg(kind, cls) {
    const ssr = kind === 'ssr';
    const id = 'nvtk' + (++uid);
    const g = ssr ? ['#fff7cf', '#f0c24a', '#a8701a'] : ['#d6503f', '#9a2a20', '#5a120d'];
    const ink = ssr ? '#4e2f06' : '#f6dc8a';
    return `<svg class="nv-ticket ${cls || ''}" viewBox="0 0 72 44" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset=".55" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/></linearGradient>
      ${ssr ? `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff9ccf" stop-opacity=".0"/><stop offset=".45" stop-color="#9fe8ff" stop-opacity=".55"/><stop offset=".6" stop-color="#ffffff" stop-opacity=".7"/><stop offset=".75" stop-color="#b58cff" stop-opacity=".45"/><stop offset="1" stop-color="#ff9ccf" stop-opacity="0"/></linearGradient>` : ''}</defs>
      <path d="M5 3h62a3 3 0 0 1 3 3v10a6 6 0 0 0 0 12v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V28a6 6 0 0 0 0-12V6a3 3 0 0 1 3-3z" fill="url(#${id})" stroke="${ssr ? '#6b4a10' : '#f1d98a'}" stroke-width="1.6"/>
      ${ssr ? `<path d="M22 5h20l-12 34H10z" fill="url(#${id}s)"/>` : ''}
      <path d="M21 7v30" stroke="${ink}" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="2 2.4"/>
      <text x="12" y="27" text-anchor="middle" font-size="13" font-weight="800" fill="${ink}" font-family="'Kaisei Tokumin',serif">${ssr ? '★' : '札'}</text>
      <text x="46" y="${ssr ? 29 : 27}" text-anchor="middle" font-size="${ssr ? 17 : 11}" font-weight="900" letter-spacing="${ssr ? 1 : .5}" fill="${ink}" font-family="Cinzel,'Kaisei Tokumin',serif">${ssr ? 'SSR' : 'DRAW'}</text>
    </svg>`;
  }
  const FRAME = { cubes: 'f-blue', yen: 'f-gold', light_s: 'f-grey', light_m: 'f-purple', light_l: 'f-gold', ticket: 'f-red', gp_card: 'f-blue', ssr_ticket: 'f-ssr' };
  function rewardName(id) {
    if (id === 'cubes') return 'Cubes';
    if (id === 'yen') return 'JP';
    if (ITEMS[id]) return ITEMS[id].name;
    if (id === 'ssr_ticket' && D && D.final) return D.final.name;
    return id;
  }
  function rewardIcon(id) {
    if (id === 'cubes') return '<img class="nv-rw-img" src="assets/pp/currency/cubes.webp" alt="" aria-hidden="true">';
    if (id === 'yen') return '<img class="nv-rw-img" src="assets/pp/currency/jp.webp" alt="" aria-hidden="true">';
    if (id === 'ticket') return ticketSvg('draw');
    if (id === 'ssr_ticket') return ticketSvg('ssr');
    return UI.itemIcon(id, ITEMS);
  }
  function rewardTile(r, cls) {
    const name = rewardName(r.id);
    return `<span class="nv-rw ${FRAME[r.id] || 'f-grey'} ${cls || ''}" title="${UI.esc(name + ' ×' + UI.fmt(r.n))}"><span class="nv-rw-ic">${rewardIcon(r.id)}</span><b class="nv-rw-n">${UI.fmtShort(r.n)}</b><span class="sr-only">${UI.esc(name)}</span></span>`;
  }
  function grant(s, id, n) {
    if (id === 'cubes') s.currency.cubes += n;
    else if (id === 'yen') s.currency.yen += n;
    else s.items[id] = (s.items[id] || 0) + n;
  }

  /* ================= page ================= */
  if (!global.document || !document.body || document.body.dataset.page !== 'novice') {
    global.Novice = { load, status, ticketSvg };
    return;
  }
  const { $, esc } = UI;
  let cur = 1;          // selected day
  let first = true;

  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function cardState(s, m) {
    if (isClaimed(s, m)) return 'claimed';
    if (!dayOpen(s, m.day)) return 'locked';
    return done(s, m) ? 'ready' : 'todo';
  }

  function card(s, m) {
    const st = cardState(s, m);
    const v = Math.min(value(s, m), m.target);
    const pct = Math.round((v / m.target) * 100);
    let btn;
    if (st === 'ready') btn = `<button class="jjk-btn is-primary nv-btn" type="button" data-claim="${esc(m.id)}">Claim</button>`;
    else if (st === 'claimed') btn = '<button class="jjk-btn nv-btn" type="button" disabled>Claimed</button>';
    else if (st === 'locked') btn = '<button class="jjk-btn nv-btn" type="button" disabled>Challenge</button>';
    else btn = `<a class="jjk-btn nv-btn" href="${esc(m.link)}">Challenge</a>`;
    return `<article class="nv-card is-${st}" data-id="${esc(m.id)}">
      <p class="nv-text">${esc(m.text).replace(/(Lv|Rank|Quest) (\d)/g, '$1\u00a0$2')}</p>
      <div class="nv-prog"><span class="bar"><i style="width:${pct}%"></i></span><b>${UI.fmt(v)}<span>/${UI.fmt(m.target)}</span></b></div>
      <div class="nv-rws">${m.rewards.map((r) => rewardTile(r)).join('')}</div>
      ${btn}
      ${st === 'claimed' ? '<span class="nv-stamp" aria-hidden="true">済</span>' : ''}
      ${st === 'ready' ? '<i class="nav-dot nv-dot" aria-hidden="true">!</i>' : ''}
    </article>`;
  }

  function order(s, list) {
    const rank = { ready: 0, todo: 1, locked: 1, claimed: 2 };
    return list.slice().sort((a, b) => rank[cardState(s, a)] - rank[cardState(s, b)]);
  }

  function draw(anim) {
    const s = Save.get();
    const di = dayIndex(s);
    const day = D.days[cur - 1];
    const total = all().length;
    const got = claimedCount(s);
    const anyReady = all().some((m) => ready(s, m));
    const fin = nov(s).final;
    const finOk = finalReady(s);

    $('#nv-tabs').innerHTML = D.days.map((d) => {
      const open = dayOpen(s, d.day);
      const r = open && d.missions.some((m) => ready(s, m));
      const allDone = d.missions.every((m) => isClaimed(s, m));
      return `<button class="jjk-tab nv-tab${d.day === cur ? ' active' : ''}${open ? '' : ' is-locked'}${allDone ? ' is-done' : ''}" type="button" role="tab" aria-selected="${d.day === cur}" data-day="${d.day}"
        title="${open ? 'Day ' + d.day : 'Unlocks in ' + plural(d.day - 1 - di, 'day')}">Day ${d.day}${r ? '<i class="nav-dot nv-tdot" aria-hidden="true">!</i>' : ''}</button>`;
    }).join('');

    const open = dayOpen(s, cur);
    const dayDone = day.missions.filter((m) => isClaimed(s, m)).length;
    $('#nv-info').innerHTML = open
      ? `<span>Day ${cur} · <b>${dayDone}/${day.missions.length}</b> claimed</span>`
      : `<span class="nv-lockline">${LOCK} Unlocks in <b>${plural(cur - 1 - di, 'day')}</b> · progress already counts</span>`;

    const row = $('#nv-row');
    row.classList.toggle('is-anim', !!anim);
    row.innerHTML = order(s, day.missions).map((m) => card(s, m)).join('');
    if (anim) row.scrollLeft = 0;

    $('#nv-final').innerHTML = `${ticketSvg('ssr', 'nv-final-tk')}<span class="nv-final-n">×${D.final.n}</span>${finOk ? '<i class="nav-dot" aria-hidden="true">!</i>' : ''}`;
    $('#nv-final').classList.toggle('is-got', !!fin);
    $('#nv-count').innerHTML = `<b>${got}</b>/${total}`;
    $('#nv-count-bar').style.width = Math.round((got / total) * 100) + '%';
    const ca = $('#nv-claimall');
    ca.disabled = !(anyReady || finOk);
    ca.textContent = fin ? 'Complete' : 'Claim All';
  }

  const LOCK = '<svg class="nv-lock" viewBox="0 0 14 16" aria-hidden="true"><path d="M3.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#e8cf86" stroke-width="2"/><rect x="1" y="7" width="12" height="9" rx="1.5" fill="#d9b65c" stroke="#5a4214"/><circle cx="7" cy="11" r="1.4" fill="#5a4214"/></svg>';

  function showGot(rew, title) {
    const list = Object.entries(rew).map(([id, n]) => ({ id, n }));
    if (!list.length) return;
    const m = UI.modal(`<div class="nv-got">${list.map((r) => `<div class="nv-got-it">${rewardTile(r, 'is-big')}<small>${esc(rewardName(r.id))}</small></div>`).join('')}</div>
      <div class="modal-actions"><button class="jjk-btn is-primary" type="button" data-a="ok">OK</button></div>`, { title: title || 'Rewards Obtained', sub: '獲得報酬', cls: 'is-small nv-modal' });
    m.el.querySelector('[data-a="ok"]').addEventListener('click', m.close);
  }

  /** claim the given missions (and the final ticket when withFinal and earned) */
  function claim(ids, withFinal) {
    const rew = {};
    let n = 0;
    let finalGot = false;
    Save.update((s) => {
      if (!s.novice) s.novice = { claimed: {}, final: false };
      ids.forEach((id) => {
        const m = byId[id];
        if (!m || !ready(s, m)) return;
        s.novice.claimed[id] = true;
        m.rewards.forEach((r) => { grant(s, r.id, r.n); rew[r.id] = (rew[r.id] || 0) + r.n; });
        n++;
      });
      if (withFinal && finalReady(s)) {
        s.novice.final = true;
        grant(s, D.final.item, D.final.n);
        rew[D.final.item] = (rew[D.final.item] || 0) + D.final.n;
        finalGot = true;
      }
    });
    if (!n && !finalGot) { UI.toast('Nothing to claim yet.', 'bad'); draw(); return; }
    UI.sfx(finalGot ? 'rare' : 'heal');
    draw();
    showGot(rew, finalGot ? 'Novice Mission Complete!' : n > 1 ? 'Rewards Obtained ×' + n : 'Rewards Obtained');
  }

  function finalInfo() {
    const s = Save.get();
    const total = all().length;
    const got = claimedCount(s);
    const fin = nov(s).final;
    const ok = finalReady(s);
    const m = UI.modal(`<div class="nv-fin">
        <div class="nv-fin-tk">${ticketSvg('ssr')}</div>
        <div class="nv-fin-txt"><b>${esc(D.final.name)} ×${D.final.n}</b>
          <p>${esc((ITEMS[D.final.item] && ITEMS[D.final.item].desc) || 'One draw that is guaranteed to give an SSR sorcerer.')}</p>
          <div class="nv-prog"><span class="bar"><i style="width:${Math.round(got / total * 100)}%"></i></span><b>${got}<span>/${total}</span></b></div>
          <small>${fin ? 'Already received.' : ok ? 'Every mission is complete. Claim your ticket!' : 'Claim all ' + total + ' Novice Missions to receive it.'}</small></div></div>
      <div class="modal-actions">${ok ? '<button class="jjk-btn is-primary" type="button" data-a="claim">Claim</button>' : ''}<button class="jjk-btn" type="button" data-a="ok">Close</button></div>`,
    { title: 'Final Reward', sub: '7日間達成報酬', cls: 'is-small nv-modal' });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      m.close();
      if (b.dataset.a === 'claim') claim([], true);
    });
  }

  function pickDay() {
    const s = Save.get();
    const h = /^#day([1-7])$/.exec(location.hash);
    if (h) return Math.min(D.days.length, +h[1]);
    const open = D.days.filter((d) => dayOpen(s, d.day));
    const r = open.find((d) => d.missions.some((m) => ready(s, m)));
    if (r) return r.day;
    const todo = open.find((d) => d.missions.some((m) => !isClaimed(s, m)));
    if (todo) return todo.day;
    return open.length ? open[open.length - 1].day : 1;
  }

  function render() {
    const g = Data.char('satoru_strongest') || Data.characters.find((c) => /gojo/i.test(c.name));
    $('#main').classList.add('nv-main');
    $('#main').innerHTML = `<div class="nv">
      <div class="nv-left">
        ${g ? Art.img(g, 'portrait', { cls: 'nv-art', eager: true, alt: '' }) : ''}
        <div class="nv-promo">
          <span class="nv-promo-tk">${ticketSvg('ssr')}${ticketSvg('draw', 'is-back')}</span>
          <p>Complete Missions <br>To Get <em>Generous Rewards!</em></p>
        </div>
      </div>
      <section class="nv-panel jjk-panel" aria-label="Novice Missions">
        <div class="nv-head">
          <div class="nv-tabs" id="nv-tabs" role="tablist"></div>
          <button class="nv-final" id="nv-final" type="button" title="Final reward: ${esc(D.final.name)}" aria-label="Final reward"></button>
        </div>
        <div class="nv-info" id="nv-info"></div>
        <div class="nv-row" id="nv-row"></div>
        <div class="nv-foot">
          <span class="nv-foot-tk">${ticketSvg('ssr')}</span>
          <div class="nv-foot-txt"><p>Complete <b>7-day Mission</b> to obtain <em>SSR-Character-Guaranteed Gacha Ticket!</em></p>
            <div class="nv-foot-prog"><span class="bar"><i id="nv-count-bar"></i></span><span id="nv-count"></span></div></div>
          <button class="jjk-btn is-primary nv-claimall" id="nv-claimall" type="button">Claim All</button>
        </div>
      </section>
    </div>`;
    cur = pickDay();
    $('#nv-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      const d = +b.dataset.day;
      if (b.classList.contains('is-locked')) UI.toast('Day ' + d + ' unlocks in ' + plural(d - 1 - dayIndex(Save.get()), 'day') + '.');
      if (d === cur) return;
      cur = d;
      history.replaceState(null, '', '#day' + d);
      UI.sfx('tap');
      draw(true);
    });
    $('#nv-row').addEventListener('click', (e) => {
      const b = e.target.closest('[data-claim]');
      if (b) claim([b.dataset.claim], true);
    });
    $('#nv-claimall').addEventListener('click', () => {
      const s = Save.get();
      claim(all().filter((m) => ready(s, m)).map((m) => m.id), true);
    });
    $('#nv-final').addEventListener('click', finalInfo);
    // vertical wheel scrolls the card row sideways on desktop
    $('#nv-row').addEventListener('wheel', (e) => {
      const r = e.currentTarget;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && r.scrollWidth > r.clientWidth) { r.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    window.addEventListener('hashchange', () => {
      const h = /^#day([1-7])$/.exec(location.hash);
      if (h && +h[1] !== cur) { cur = +h[1]; draw(true); }
    });
    draw(first);
    first = false;
  }

  global.Novice = { load, status, ticketSvg };
  UI.boot({ nav: false, data: ['characters', 'items', 'novice'], init: () => load().then(render) });
})(window);
