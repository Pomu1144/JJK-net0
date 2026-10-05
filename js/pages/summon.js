/* summon.html — the Phantom Parade Gacha screen: full-bleed featured art, banner
 * list with live countdowns (left), banner logo + description (right), the
 * featured unit's name (bottom left) and the three draw buttons with the
 * Exclusive Gacha Pt bar (bottom right). Paid / Free Cubes in the top bar.
 *
 * Cubes: currency.cubes are Free Cubes, currency.paidCubes are Paid Cubes.
 * Draws spend Free first, then Paid; the Limited ×1 daily draw needs Paid. */
(function () {
  'use strict';
  const { $, $$, esc, fmt } = UI;
  let B = null;
  let current = null;

  function pool(rarity) { return Data.characters.filter((c) => c.rarity === rarity); }

  function rollRarity(minRarity) {
    const rates = B.rates;
    const keys = Object.keys(rates).map(Number).filter((r) => r >= (minRarity || 0));
    const total = keys.reduce((a, k) => a + rates[k], 0);
    let x = Math.random() * total;
    for (const k of keys.sort()) { x -= rates[k]; if (x < 0) return k; }
    return keys[keys.length - 1];
  }

  function pickUnit(banner, rarity) {
    const feat = banner.featured.map((id) => Data.char(id)).filter((c) => c && c.rarity === rarity);
    if (feat.length && Math.random() * 100 < B.featuredShare) return feat[Math.floor(Math.random() * feat.length)];
    const p = pool(rarity);
    return p[Math.floor(Math.random() * p.length)];
  }

  /** n draws on a banner inside a Save.update. Each draw on a pickup banner
   *  earns 1 Gacha Point (the guide's pity: 250 points = a featured unit). */
  function pull(s, banner, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const lastOfMulti = n === 10 && i === 9 && !out.some((o) => o.def.rarity >= B.multiGuarantee);
      const def = pickUnit(banner, rollRarity(lastOfMulti ? B.multiGuarantee : 0));
      const r = Rules.addUnitTo(s, def.id, 1);
      out.push({ def, isNew: r.isNew, dupe: r.dupe, yen: r.yen });
    }
    if (banner.exchangeAt) s.gacha.points[banner.id] = (s.gacha.points[banner.id] || 0) + n;
    s.stats.pulls += n;
    return out;
  }

  /* ---------- Cubes: Free (currency.cubes) + Paid (currency.paidCubes) ---------- */
  const free = (s) => Number(s.currency.cubes) || 0;
  const paid = (s) => Number(s.currency.paidCubes) || 0;
  /** spend n Cubes, Free first then Paid; false (and nothing spent) if short */
  function spendCubes(s, n) {
    if (free(s) + paid(s) < n) return false;
    const f = Math.min(free(s), n);
    s.currency.cubes = free(s) - f;
    s.currency.paidCubes = paid(s) - (n - f);
    return true;
  }

  const GP = () => B.gp || { exchangeAt: 250, convertPoints: 20, convertCards: 10, convertMax: 200, redeemMax: 100 };
  function gpState(s, b) {
    const g = GP();
    const points = s.gacha.points[b.id] || 0;
    const converted = s.gacha.converted[b.id] || 0;
    const redeemed = s.gacha.redeemed[b.id] || 0;
    const cards = s.items.gp_card || 0;
    return {
      points, converted, redeemed, cards,
      canExchange: !!b.exchangeAt && points >= (b.exchangeAt || g.exchangeAt),
      canConvert: !!b.exchangeAt && points >= g.convertPoints && converted + g.convertPoints <= g.convertMax,
      redeemable: b.exchangeAt ? Math.max(0, Math.min(cards, g.redeemMax - redeemed)) : 0,
    };
  }

  function costFor(kind) {
    const s = Save.get();
    if (kind === 'daily') {
      const n = B.dailyCost || 100;
      const used = s.daily.gacha_daily === Rules.today();
      return { type: 'paid', n, used, short: used || paid(s) < n };
    }
    const c = B.cost[kind];
    if ((s.items.ticket || 0) >= c.tickets) return { type: 'ticket', n: c.tickets };
    return { type: 'cubes', n: c.cubes, short: free(s) + paid(s) < c.cubes };
  }

  /* ---------- banner timers ---------- */
  const today = () => Rules.today();
  const isLive = (b) => b.event && b.start <= today() && (!b.end || b.end >= today());
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = (d) => { const [y, m, dd] = d.split('-'); return +dd + ' ' + MONTHS[+m - 1] + ' ' + y; };
  const dateRange = (b) => fmtDay(b.start) + (b.end ? ' – ' + fmtDay(b.end) : '');
  const p2 = (n) => String(n).padStart(2, '0');

  function timerText(b) {
    if (!b.event) return 'No end date';
    if (isLive(b) && b.end) {
      const ms = Math.max(0, new Date(b.end + 'T23:59:59').getTime() - Date.now());
      const sec = Math.floor(ms / 1000);
      return 'Ends after ' + Math.floor(sec / 86400) + 'd ' + p2(Math.floor(sec / 3600) % 24) + 'h ' + p2(Math.floor(sec / 60) % 60) + 'm ' + p2(sec % 60) + 'sec';
    }
    const [y, mo] = b.start.split('-');
    return 'JP ' + MONTHS[+mo - 1] + ' ' + y + (b.rerun ? ' · Rerun' : '') + ' · Replay';
  }

  /* ---------- top bar: Paid / Free Cubes + Gacha Record ---------- */
  function topHtml() {
    return `<div class="g-cubes">
      <span class="g-cube is-paid" title="Paid Cubes"><i>${UI.CUBE_SVG}<small>Paid</small></i><b id="g-paid">0</b></span>
      <a class="g-plus" href="shop.html#summon" aria-label="Get Cubes" title="Get Cubes">${UI.icon('plus')}</a>
      <span class="g-cube is-free" title="Free Cubes"><i>${UI.CUBE_SVG}<small>Free</small></i><b id="g-free">0</b></span>
      <button class="pp-stone g-record" id="history" type="button">Gacha Record</button>
    </div>`;
  }
  function paintCubes() {
    const s = Save.get();
    if (!s || !$('#g-paid')) return;
    $('#g-paid').textContent = fmt(paid(s));
    $('#g-free').textContent = fmt(free(s));
  }

  /* ---------- the screen ---------- */
  function descText(b) {
    const feats = b.featured.map((id) => Data.char(id)).filter(Boolean);
    const pick = feats.length ? `<span class="g-rateup">${feats.map((d) => esc(d.name)).filter((n, i, a) => a.indexOf(n) === i).slice(0, 2).join(' & ')} rate up! </span>` : '';
    return `${pick}Characters &amp; Recollection Bits of R or above are obtainable! '10-Draw' guarantees an entity of SR or above!`;
  }

  function logoHtml(b) {
    if (b.event && b.bg) return `<div class="g-logo is-art"><img src="${esc(b.bg)}" alt="${esc(b.name)}"></div>`;
    const title = b.id === 'standard' ? 'Phantom Parade' : b.name;
    return `<div class="g-logo is-text"><b>${esc(title)}</b><i>Gacha</i></div>`;
  }

  function drawPanel() {
    const s = Save.get();
    const b = current;
    const hero = Data.char(b.hero);
    const one = costFor('single'), ten = costFor('multi'), day = costFor('daily');
    const t = UI.typeOf(hero || b.element).toLowerCase();
    $('.gacha').className = 'gacha t-' + t;
    $('#g-bg').innerHTML = `${b.bg ? `<img class="g-blur" src="${esc(b.bg)}" alt="" aria-hidden="true">` : ''}
      <i class="g-rays" aria-hidden="true"></i>
      ${hero ? Art.img(hero, 'full', { cls: 'g-hero', eager: true, alt: '' }) : ''}
      <i class="g-burst" aria-hidden="true"></i>`;
    $('#g-name').innerHTML = hero ? `<span class="g-name-ic">${UI.rarityBadge(hero)}${UI.typeBadge(hero)}</span>
      <span class="g-name-t"><small>${esc(hero.title || '')}</small><b>${esc(hero.name)}</b></span>` : '';
    $('#g-info').innerHTML = `${logoHtml(b)}
      <div class="g-desc"><p>${descText(b)}</p><button class="pp-stone" type="button" id="rates">Gacha Details</button></div>`;
    const cube = (c) => (c.type === 'ticket' ? UI.itemIcon('ticket', {}) : UI.CUBE_SVG);
    const st = gpState(s, b);
    $('#g-draws').innerHTML = `
      <div class="g-pull-row">
        ${s.items.ssr_ticket ? `<div class="g-pcol"><span class="g-cap is-gold">×${s.items.ssr_ticket} owned</span><button class="g-pull is-ssr" id="pull-ssr" type="button"><b>SSR Ticket</b><span class="g-cost">SSR guaranteed</span></button></div>` : ''}
        <div class="g-pcol"><span class="g-cap">Reset at 0:00 Every Day</span>
          <button class="g-pull is-daily${day.used ? ' is-used' : ''}" id="pull-daily" type="button" ${day.short ? 'disabled' : ''}>
            <b>Limited to 1<br>time(s) one day</b><span class="g-cost"><em>Paid</em>${UI.CUBE_SVG}<span>${fmt(day.n)}</span></span></button>
          <i class="g-sticker" aria-label="${day.used ? 0 : 1} time(s) left"><b>${day.used ? 0 : 1}</b>time(s)<br>left</i></div>
        <div class="g-pcol"><span class="g-cap is-blank"></span>
          <button class="g-pull" id="pull1" type="button" ${one.short ? 'disabled' : ''}><b>Draw 1 time(s)</b><span class="g-cost">${cube(one)}<span>${fmt(one.n)}</span></span></button></div>
        <div class="g-pcol"><span class="g-cap is-gold">SR or Above Guaranteed</span>
          <button class="g-pull" id="pull10" type="button" ${ten.short ? 'disabled' : ''}><b>Draw 10 time(s)</b><span class="g-cost">${cube(ten)}<span>${fmt(ten.n)}</span></span></button></div>
      </div>
      <div class="g-pt"><span class="g-ptbar"><span>Exclusive Gacha Pt</span><b id="g-pts">${b.exchangeAt ? fmt(st.points) : '—'}</b></span>
        <button class="pp-stone g-exch${st.canExchange ? ' is-ready' : ''}" id="gp-open" type="button" ${b.exchangeAt ? '' : 'disabled'}>Exchange</button></div>`;
    $('#pull1').addEventListener('click', () => doPull('single'));
    $('#pull10').addEventListener('click', () => doPull('multi'));
    $('#pull-daily').addEventListener('click', () => doPull('daily'));
    if ($('#pull-ssr')) $('#pull-ssr').addEventListener('click', ssrTicket);
    $('#gp-open').addEventListener('click', gpModal);
    $('#rates').addEventListener('click', showRates);
    $$('#banners .ban-item').forEach((x) => x.classList.toggle('active', x.dataset.id === b.id));
    const at = $('#banners .ban-item.active');
    if (at && at.scrollIntoView) at.scrollIntoView({ block: 'nearest' });
    paintCubes();
  }

  function showHistory() {
    const log = (Save.get().gachaLog || []).slice().reverse();
    UI.modal(log.length ? `<table class="rates g-hist"><thead><tr><th>Unit</th><th>Banner</th><th>When</th></tr></thead><tbody>${log.map((r) => {
      const d = Data.char(r.id);
      const bn = B.banners.find((x) => x.id === r.b);
      return `<tr><td>${d ? UI.rarityBadge(d) + ' ' + esc(d.name) + ' <small class="muted">' + esc(d.title || '') + '</small>' : esc(r.id)}</td><td>${esc(bn ? bn.name : r.b === 'ssr_ticket' ? 'SSR Ticket' : r.b)}</td><td class="muted">${new Date(r.t).toLocaleString()}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="muted">No draws yet.</p>', { title: 'Gacha Record', sub: '最近100件' });
  }

  /** SSR-Character Guaranteed Ticket (Novice Mission reward): one SSR from the whole pool. */
  function ssrTicket() {
    let got = null;
    Save.update((s) => {
      if (!(s.items.ssr_ticket > 0)) return;
      s.items.ssr_ticket--;
      const p = pool(6);
      const def = p[Math.floor(Math.random() * p.length)];
      got = Object.assign({ def }, Rules.addUnitTo(s, def.id, 1));
      logPulls(s, 'ssr_ticket', [got]);
    });
    if (got) { reveal([got], 'exchange'); drawPanel(); }
  }

  function logPulls(s, bid, results) {
    if (!Array.isArray(s.gachaLog)) s.gachaLog = [];
    results.forEach((r) => s.gachaLog.push({ t: Date.now(), b: bid, id: r.def.id }));
    if (s.gachaLog.length > 100) s.gachaLog.splice(0, s.gachaLog.length - 100);
  }

  /* ---------- Exclusive Gacha Pt: exchange / convert / use cards (modal) ---------- */
  function gpHtml(s, b) {
    const g = GP(), st = gpState(s, b), at = b.exchangeAt || g.exchangeAt;
    return `<div class="pity gp"><small>${UI.GP_ICON} Exclusive Gacha Pt · ${esc(b.name)}</small>
      <div class="bar"><i style="width:${Math.min(100, st.points / at * 100)}%"></i></div>
      <small><b>${st.points}</b> / ${at} — exchange ${at} for any featured unit</small>
      <div class="row gp-btns"><button class="jjk-btn is-small${st.canExchange ? ' is-primary' : ''}" id="gp-exchange" type="button" ${st.canExchange ? '' : 'disabled'}>Exchange</button>
        <button class="jjk-btn is-small" id="gp-convert" type="button" ${st.canConvert ? '' : 'disabled'} title="Turn ${g.convertPoints} points into ${g.convertCards} Gacha Point Cards (up to ${g.convertMax} points per banner)">${g.convertPoints} GP → ${g.convertCards} ${UI.GP_ICON}</button>
        <button class="jjk-btn is-small" id="gp-redeem" type="button" ${st.redeemable ? '' : 'disabled'} title="Gacha Point Cards are worth 1 point each, up to ${g.redeemMax} per banner">Use ${st.redeemable} ${UI.GP_ICON}</button></div>
      <small class="muted">Cards owned ${st.cards} · converted here ${st.converted}/${g.convertMax} · used here ${st.redeemed}/${g.redeemMax}</small></div>`;
  }

  let gpm = null;
  function gpModal() {
    if (!current.exchangeAt) return;
    gpm = UI.modal(`<div id="gp-body">${gpHtml(Save.get(), current)}</div>`, { title: 'Gacha Point Exchange', sub: 'ガチャポイント', cls: 'is-small', onClose: () => { gpm = null; } });
    gpm.el.addEventListener('click', (e) => {
      const btn = e.target.closest('button[id^="gp-"]');
      if (!btn || btn.disabled) return;
      if (btn.id === 'gp-exchange') { gpm.close(); exchange(); } else if (btn.id === 'gp-convert') convert();
      else if (btn.id === 'gp-redeem') redeem();
    });
  }
  function repaintGp() {
    const body = gpm && gpm.el.querySelector('#gp-body');
    if (body) body.innerHTML = gpHtml(Save.get(), current);
  }

  function exchange() {
    const b = current;
    const s = Save.get();
    if (!gpState(s, b).canExchange) return;
    const feats = b.featured.map((id) => Data.char(id)).filter(Boolean);
    const m = UI.modal(`<p class="muted" style="margin-top:0">Spend ${b.exchangeAt} Gacha Points on one featured unit. A unit you already own gains a Limit Break.</p>
      <div class="gp-pick">${feats.map((d) => `<button type="button" class="gp-unit" data-id="${esc(d.id)}">${UI.unitTile(d, { tag: 'span', badge: s.units[d.id] ? `<span class="uc-badge badge">LB ${s.units[d.id].dupes || 0}</span>` : '<span class="uc-badge badge is-new">NEW</span>' })}<small>${esc(d.name)}</small></button>`).join('')}</div>`,
    { title: 'Gacha Point Exchange', sub: 'ガチャポイント交換' });
    m.el.addEventListener('click', (e) => {
      const btn = e.target.closest('.gp-unit');
      if (!btn) return;
      let got = null;
      Save.update((st) => {
        if (!gpState(st, b).canExchange) return;
        st.gacha.points[b.id] -= b.exchangeAt;
        got = Object.assign({ def: Data.char(btn.dataset.id) }, Rules.addUnitTo(st, btn.dataset.id, 1));
      });
      m.close();
      if (got) { reveal([got], 'exchange'); drawPanel(); }
    });
  }

  function convert() {
    const g = GP(), b = current;
    const ok = Save.update((s) => {
      if (!gpState(s, b).canConvert) return false;
      s.gacha.points[b.id] -= g.convertPoints;
      s.gacha.converted[b.id] = (s.gacha.converted[b.id] || 0) + g.convertPoints;
      s.items.gp_card = (s.items.gp_card || 0) + g.convertCards;
      return true;
    });
    if (ok) { UI.toast(g.convertPoints + ' Gacha Points → ' + g.convertCards + ' Gacha Point Cards', 'good'); UI.sfx('heal'); }
    drawPanel();
    repaintGp();
  }

  function redeem() {
    const b = current;
    let n = 0;
    Save.update((s) => {
      n = gpState(s, b).redeemable;
      if (!n) return;
      s.items.gp_card -= n;
      s.gacha.redeemed[b.id] = (s.gacha.redeemed[b.id] || 0) + n;
      s.gacha.points[b.id] = (s.gacha.points[b.id] || 0) + n;
    });
    if (n) { UI.toast('Used ' + n + ' Gacha Point Card' + (n > 1 ? 's' : '') + ' on ' + b.name, 'good'); UI.sfx('heal'); }
    drawPanel();
    repaintGp();
  }

  /* ---------- Gacha Details: banner, featured units, rates ---------- */
  function showRates() {
    const b = current;
    const feats = b.featured.map((id) => Data.char(id)).filter(Boolean);
    const rows = Object.keys(B.rates).sort().reverse().map((r) => {
      const fr = feats.filter((c) => c.rarity === Number(r));
      const lbl = Number(r) >= 7 ? 'Limited SSR' : UI.rarityOf(Number(r));
      return `<tr><td>${UI.rarityBadge(Number(r))}${Number(r) >= 7 ? ' <span class="limited-tag">LIMITED</span>' : ''}</td><td><b>${B.rates[r].toFixed(1)}%</b></td><td>${fr.length ? fr.map((f) => esc(f.name + ' (' + f.title + ')')).join(', ') + ` — ${B.featuredShare}% of ${lbl} pulls` : '<span class="muted">—</span>'}</td><td class="muted">${pool(Number(r)).length} units</td></tr>`;
    }).join('');
    UI.modal(`${b.event ? `<p class="muted" style="margin-top:0">${esc(b.kind)} gacha · Japanese server ${esc(dateRange(b))}${b.rerun ? ' (rerun)' : ''}. Replayed here from the fan wiki's event timeline.</p>` : ''}
      ${feats.length ? `<div class="gp-pick g-featpick">${feats.map((d) => `<div class="gp-unit">${UI.unitTile(d, { tag: 'span' })}<small>${esc(d.title || '')}<br><b>${esc(d.name)}</b></small></div>`).join('')}</div>` : '<p class="muted">Every unit in the game can appear.</p>'}
      <table class="rates"><thead><tr><th>Rarity</th><th>Rate</th><th>Featured</th><th>Pool</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted" style="font-size:12px">A draw costs ${fmt(B.cost.single.cubes)} Cubes, 10 draws ${fmt(B.cost.multi.cubes)}; Free Cubes are spent first, then Paid Cubes. The Limited draw (once a day, resets at 0:00) costs ${fmt(B.dailyCost || 100)} Paid Cubes. The 10th draw of a 10x is always ${UI.rarityOf(B.multiGuarantee)} or better. ${b.exchangeAt ? `Every draw on this banner earns 1 Exclusive Gacha Pt; ${b.exchangeAt} points exchange for any featured unit. Points stay on this banner unless you convert them: 20 points → 10 Gacha Point Cards (up to 200 points per banner), and a later banner accepts up to 100 cards.` : ''} Duplicates raise Limit Break (+${Rules.DUPE_BONUS}% stats each, up to LB ${Rules.MAX_DUPES}); after that they convert to JP.</p>`,
    { title: 'Gacha Details', sub: 'ガチャ詳細 · ' + b.name });
  }

  function doPull(kind) {
    const n = kind === 'multi' ? 10 : 1;
    const cost = costFor(kind);
    let results = null;
    const ok = Save.update((s) => {
      if (kind === 'daily') {
        if (s.daily.gacha_daily === Rules.today() || paid(s) < cost.n) return false;
        s.currency.paidCubes = paid(s) - cost.n;
        s.daily.gacha_daily = Rules.today();
      } else if (cost.type === 'ticket') { if ((s.items.ticket || 0) < cost.n) return false; s.items.ticket -= cost.n; }
      else if (!spendCubes(s, cost.n)) return false;
      results = pull(s, current, n);
      logPulls(s, current.id, results);
      return true;
    });
    if (!ok) {
      UI.toast(kind === 'daily' ? (cost.used ? 'The Limited draw resets at 0:00.' : 'The Limited draw needs ' + cost.n + ' Paid Cubes.') : 'Not enough Cubes — visit the Shop.', 'bad');
      return;
    }
    reveal(results, kind);
    drawPanel();
  }

  function reveal(results, kind) {
    const top = Math.max(...results.map((r) => r.def.rarity));
    const ov = document.createElement('div');
    ov.className = 'reveal r' + top + ' is-' + UI.rarityOf(top).toLowerCase();
    ov.innerHTML = `<div class="reveal-seal"><div class="seal-paper"><span>${top >= 6 ? '特級' : top >= 5 ? '一級' : '呪'}</span></div><div class="seal-burst"></div></div>
      <h2 class="rv-title">Summon Results</h2>
      <div class="reveal-cards">${results.map((r, i) => `
        <div class="rcard r${r.def.rarity} is-${UI.rarityOf(r.def).toLowerCase()}" style="--d:${i * 0.12}s">
          <div class="rcard-in">
            <div class="rcard-back"><span>呪</span></div>
            <div class="rcard-front">${UI.unitTile(r.def, { tag: 'span', badge: r.isNew ? '<span class="uc-badge badge is-new">NEW</span>' : r.dupe ? `<span class="uc-badge badge">LB ${r.dupe}</span>` : r.yen ? `<span class="uc-badge badge">${fmt(r.yen)} JP</span>` : '' })}</div>
          </div></div>`).join('')}</div>
      <div class="reveal-actions"><button class="jjk-btn" id="rv-skip" type="button">Skip</button>
        ${kind === 'exchange' || kind === 'daily' ? '' : `<button class="jjk-btn" id="rv-again" type="button" hidden>Draw ${kind === 'multi' ? '10' : '1'} time(s) again</button>`}
        <button class="jjk-btn is-primary rv-back" id="rv-close" type="button" hidden>Back to Gacha</button></div>`;
    document.body.appendChild(ov);
    UI.sfx('pull');
    const finish = () => {
      ov.classList.add('done');
      $('#rv-skip', ov).hidden = true;
      $('#rv-close', ov).hidden = false;
      if ($('#rv-again', ov)) $('#rv-again', ov).hidden = false;
      if (top >= 6) UI.sfx('rare');
    };
    requestAnimationFrame(() => ov.classList.add('go'));
    const timer = setTimeout(finish, 1300 + results.length * 120 + 600);
    $('#rv-skip', ov).addEventListener('click', () => { clearTimeout(timer); ov.classList.add('skip'); finish(); });
    $('#rv-close', ov).addEventListener('click', () => ov.remove());
    if ($('#rv-again', ov)) $('#rv-again', ov).addEventListener('click', () => { ov.remove(); doPull(kind); });
  }

  /* ---------- banner list (Live / Events / Standard) ----------
   * Event banners replay the Japanese server's gacha history (fan wiki
   * "Timeline Of Events (JP)"). Every one can be drawn on; the ones whose
   * original JP dates include today are live and count down. */
  let listTab = 'live';

  function itemHtml(b) {
    const h = Data.char(b.hero);
    const img = b.event ? `<img src="${esc(b.bg)}" alt="" loading="lazy">` : h ? Art.img(h, 'full', { alt: '' }) : '';
    return `<div class="ban-item${b.event ? ' is-event' : ''}${isLive(b) ? ' is-live' : ''}" data-id="${esc(b.id)}">
      <button class="ban-tab" data-id="${esc(b.id)}" type="button" title="${esc(b.name)}">${img}${b.event ? '' : `<span>${esc(b.name)}</span>`}</button>
      <small class="ban-time" data-id="${esc(b.id)}">${esc(timerText(b))}</small></div>`;
  }

  function drawList() {
    const events = B.banners.filter((b) => b.event);
    let live = events.filter(isLive);
    if (!live.length) live = events.slice(0, 4);
    let body = '';
    if (listTab === 'live') body = live.map(itemHtml).join('');
    else if (listTab === 'events') {
      let month = '';
      body = events.map((b) => {
        const m = b.start.slice(0, 7);
        const head = m !== month ? `<small class="ban-group">${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}</small>` : '';
        month = m;
        return head + itemHtml(b);
      }).join('');
    } else body = B.banners.filter((b) => !b.event).map(itemHtml).join('');
    $('#banners').innerHTML = `<div class="ban-filter" role="tablist">${[['live', 'Live'], ['events', 'Events'], ['standard', 'Standard']].map(([k, l]) => `<button type="button" role="tab" data-list="${k}" class="${k === listTab ? 'on' : ''}" aria-selected="${k === listTab}">${l}</button>`).join('')}</div>
      <div class="ban-scroll">${body}</div>`;
    $$('#banners .ban-item').forEach((t) => t.classList.toggle('active', !!current && t.dataset.id === current.id));
  }

  function tick() {
    $$('#banners .ban-time').forEach((el) => {
      const b = B.banners.find((x) => x.id === el.dataset.id);
      if (b && b.event && isLive(b)) el.textContent = timerText(b);
    });
  }

  function render() {
    const right = $('.topbar .top-right');
    if (right && !$('.g-cubes')) right.insertAdjacentHTML('afterbegin', topHtml());
    $('#history').addEventListener('click', showHistory);
    $('#main').innerHTML = `<div class="gacha">
      <div class="g-bg" id="g-bg"></div>
      <aside class="g-list" id="banners"></aside>
      <aside class="g-info" id="g-info"></aside>
      <div class="g-name" id="g-name"></div>
      <div class="g-draws" id="g-draws"></div>
    </div>`;
    $('#banners').addEventListener('click', (e) => {
      const f = e.target.closest('[data-list]');
      if (f) { listTab = f.dataset.list; drawList(); return; }
      const t = e.target.closest('.ban-tab');
      if (!t) return;
      current = B.banners.find((b) => b.id === t.dataset.id);
      history.replaceState(null, '', '#' + current.id);
      UI.sfx('tap');
      drawPanel();
    });
    const events = B.banners.filter((b) => b.event);
    current = B.banners.find((b) => b.id === location.hash.slice(1)) || events.find(isLive) || events[0] || B.banners[1] || B.banners[0];
    listTab = !current.event ? 'standard' : isLive(current) || (!events.some(isLive) && events.slice(0, 4).includes(current)) ? 'live' : 'events';
    drawList();
    drawPanel();
    Save.onChange(paintCubes);
    setInterval(tick, 1000);
  }

  UI.boot({
    data: ['characters', 'banners'],
    back: false,
    hud: false,
    header: () => '<header class="jjk-page-header g-head"><h1 class="g-head-tab">Gacha</h1></header>',
    init: () => Data.load('banners').then((b) => { B = b; render(); }),
  });
})();
