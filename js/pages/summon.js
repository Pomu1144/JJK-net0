/* summon.html — banners, x1 / x10 draws, rates, Gacha Points and the reveal. */
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

  const GP = () => B.gp || { exchangeAt: 250, convertPoints: 20, convertCards: 10, convertMax: 200, redeemMax: 100 };
  function gpState(s, b) {
    const g = GP();
    const points = s.gacha.points[b.id] || 0;
    const converted = s.gacha.converted[b.id] || 0;
    const redeemed = s.gacha.redeemed[b.id] || 0;
    const cards = s.items.gp_card || 0;
    return {
      points, converted, redeemed, cards,
      canExchange: points >= (b.exchangeAt || g.exchangeAt),
      canConvert: points >= g.convertPoints && converted + g.convertPoints <= g.convertMax,
      redeemable: Math.max(0, Math.min(cards, g.redeemMax - redeemed)),
    };
  }

  function costFor(kind) {
    const s = Save.get();
    if (kind === 'daily') {
      const used = s.daily.gacha_daily === Rules.today();
      return { type: 'cubes', n: B.dailyCost || 100, label: fmt(B.dailyCost || 100) + ' Cubes', short: used || s.currency.cubes < (B.dailyCost || 100), used };
    }
    const c = B.cost[kind];
    if ((s.items.ticket || 0) >= c.tickets) return { type: 'ticket', n: c.tickets, label: c.tickets + ' Ticket' + (c.tickets > 1 ? 's' : '') };
    return { type: 'cubes', n: c.cubes, label: fmt(c.cubes) + ' Cubes', short: s.currency.cubes < c.cubes };
  }

  function timerText(b) {
    if (!b.event) return b.exchangeAt ? 'Limited · permanent' : 'Permanent';
    if (isLive(b) && b.end) {
      const ms = new Date(b.end + 'T23:59:59').getTime() - Date.now();
      const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
      return 'Ends in ' + (d ? d + 'd ' : '') + h + 'h ' + m + 'm';
    }
    const [y, mo] = b.start.split('-');
    return 'JP ' + MONTHS[+mo - 1] + ' ' + y + (b.rerun ? ' · Rerun' : '');
  }

  function drawPanel() {
    const s = Save.get();
    const b = current;
    const hero = Data.char(b.hero);
    const one = costFor('single'), ten = costFor('multi'), day = costFor('daily');
    const feats = b.featured.map((id) => Data.char(id)).filter(Boolean);
    const t = UI.typeOf(b.element).toLowerCase();
    $('#g-bg').className = 'g-bg t-' + t;
    $('#g-bg').innerHTML = `${b.bg ? `<img class="g-blur" src="${esc(b.bg)}" alt="" aria-hidden="true">` : ''}
      ${hero ? Art.img(hero, 'full', { cls: 'g-hero', eager: true, alt: '' }) : ''}
      ${hero ? `<div class="g-tag">${UI.rarityBadge(hero)}<span><small>${esc(hero.title || '')}</small><b>${esc(hero.name)}</b></span>${UI.typeBadge(hero)}</div>` : ''}`;
    $('#g-info').innerHTML = `
      <div class="g-logo${b.event ? ' is-art' : ''}">${b.event ? `<img src="${esc(b.bg)}" alt="${esc(b.name)} banner">` : `<span class="g-logo-k">${esc(b.kanji)}</span>`}
        <span class="g-kind">${esc(b.event ? b.kind : b.featured.length ? 'Pickup' : 'Standard')}</span>${isLive(b) ? '<span class="g-kind is-live">LIVE</span>' : ''}</div>
      <h2 class="g-title">${esc(b.name)}</h2>
      <div class="g-desc">${b.event ? `JP server · ${esc(dateRange(b))}<br>` : ''}${feats.length ? `Featured SSR rate up: ${B.featuredShare}% of SSR draws.<br>${b.exchangeAt ? `Every draw earns 1 Gacha Point; ${b.exchangeAt} points = any featured unit.` : ''}` : 'Every sorcerer and curse in the game. Every 10x draw guarantees SR or better.'}</div>
      ${feats.length ? `<div class="g-feat">${feats.map((d) => UI.unitTile(d, { tag: 'span' })).join('')}</div>` : ''}
      <div class="g-btns"><button class="pp-stone" type="button" id="details">Details</button><button class="pp-stone" type="button" id="rates">Gacha Details</button><button class="pp-stone" type="button" id="history">History</button></div>`;
    $('#g-draws').innerHTML = `
      <div class="g-pull-row">
        <button class="g-pull is-daily" id="pull-daily" type="button" ${day.short ? 'disabled' : ''}><em>${day.used ? 'Drawn today' : 'Once a day'}</em><b>Limited ×1</b><small>${UI.CUBE_SVG} ${fmt(day.n)}</small></button>
        <button class="g-pull" id="pull1" type="button" ${one.short ? 'disabled' : ''}><b>Draw ×1</b><small>${one.type === 'ticket' ? UI.itemIcon('ticket', {}) : UI.CUBE_SVG} ${esc(one.label)}</small></button>
        <button class="g-pull is-multi" id="pull10" type="button" ${ten.short ? 'disabled' : ''}><em>SR or better guaranteed</em><b>Draw ×10</b><small>${ten.type === 'ticket' ? UI.itemIcon('ticket', {}) : UI.CUBE_SVG} ${esc(ten.label)}</small></button>
        ${s.items.ssr_ticket ? `<button class="g-pull is-ssr" id="pull-ssr" type="button"><em>×${s.items.ssr_ticket}</em><b>SSR Ticket</b><small>SSR guaranteed</small></button>` : ''}
      </div>
      <div class="g-pt">${b.exchangeAt ? gpHtml(s, b) : '<span class="muted">No Gacha Points on the standard banner</span>'}
        <a class="pp-stone g-small" href="shop.html#summon">Recharge</a></div>`;
    $('#pull1').addEventListener('click', () => doPull('single'));
    $('#pull10').addEventListener('click', () => doPull('multi'));
    $('#pull-daily').addEventListener('click', () => doPull('daily'));
    if ($('#pull-ssr')) $('#pull-ssr').addEventListener('click', ssrTicket);
    if (b.exchangeAt) {
      $('#gp-exchange').addEventListener('click', exchange);
      $('#gp-convert').addEventListener('click', convert);
      $('#gp-redeem').addEventListener('click', redeem);
    }
    $('#rates').addEventListener('click', showRates);
    $('#details').addEventListener('click', showDetails);
    $('#history').addEventListener('click', showHistory);
    $$('#banners .ban-tab').forEach((x) => x.classList.toggle('active', x.dataset.id === b.id));
    const at = $('#banners .ban-tab.active');
    if (at && at.scrollIntoView) at.scrollIntoView({ block: 'nearest' });
  }

  function showDetails() {
    const b = current;
    const feats = b.featured.map((id) => Data.char(id)).filter(Boolean);
    UI.modal(`${b.event ? `<p class="muted" style="margin-top:0">${esc(b.kind)} gacha · Japanese server ${esc(dateRange(b))}${b.rerun ? ' (rerun)' : ''}. Replayed here from the fan wiki's event timeline.</p>` : ''}
      ${feats.length ? `<div class="gp-pick">${feats.map((d) => `<div class="gp-unit">${UI.unitTile(d, { tag: 'span' })}<small>${esc(d.title || '')}<br><b>${esc(d.name)}</b></small></div>`).join('')}</div>` : '<p>Every unit in the game can appear.</p>'}`,
    { title: b.name, sub: 'ガチャ詳細' });
  }

  function showHistory() {
    const log = (Save.get().gachaLog || []).slice().reverse();
    UI.modal(log.length ? `<table class="rates g-hist"><thead><tr><th>Unit</th><th>Banner</th><th>When</th></tr></thead><tbody>${log.map((r) => {
      const d = Data.char(r.id);
      const bn = B.banners.find((x) => x.id === r.b);
      return `<tr><td>${d ? UI.rarityBadge(d) + ' ' + esc(d.name) + ' <small class="muted">' + esc(d.title || '') + '</small>' : esc(r.id)}</td><td>${esc(bn ? bn.name : r.b)}</td><td class="muted">${new Date(r.t).toLocaleString()}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="muted">No draws yet.</p>', { title: 'Gacha History', sub: '最近100件' });
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

  function gpHtml(s, b) {
    const g = GP(), st = gpState(s, b), at = b.exchangeAt || g.exchangeAt;
    return `<div class="pity gp"><small>${UI.GP_ICON} Gacha Points</small>
      <div class="bar"><i style="width:${Math.min(100, st.points / at * 100)}%"></i></div>
      <small><b>${st.points}</b> / ${at} — exchange ${at} for any featured unit</small>
      <div class="row gp-btns"><button class="jjk-btn is-small${st.canExchange ? ' is-primary' : ''}" id="gp-exchange" type="button" ${st.canExchange ? '' : 'disabled'}>Exchange</button>
        <button class="jjk-btn is-small" id="gp-convert" type="button" ${st.canConvert ? '' : 'disabled'} title="Turn ${g.convertPoints} points into ${g.convertCards} Gacha Point Cards (up to ${g.convertMax} points per banner)">${g.convertPoints} GP → ${g.convertCards} ${UI.GP_ICON}</button>
        <button class="jjk-btn is-small" id="gp-redeem" type="button" ${st.redeemable ? '' : 'disabled'} title="Gacha Point Cards are worth 1 point each, up to ${g.redeemMax} per banner">Use ${st.redeemable} ${UI.GP_ICON}</button></div>
      <small class="muted">Cards owned ${st.cards} · converted here ${st.converted}/${g.convertMax} · used here ${st.redeemed}/${g.redeemMax}</small></div>`;
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
  }

  function showRates() {
    const b = current;
    const rows = Object.keys(B.rates).sort().reverse().map((r) => {
      const feats = b.featured.map((id) => Data.char(id)).filter((c) => c && c.rarity === Number(r));
      const lbl = Number(r) >= 7 ? 'Limited SSR' : UI.rarityOf(Number(r));
      return `<tr><td>${UI.rarityBadge(Number(r))}${Number(r) >= 7 ? ' <span class="limited-tag">LIMITED</span>' : ''}</td><td><b>${B.rates[r].toFixed(1)}%</b></td><td>${feats.length ? feats.map((f) => esc(f.name + ' (' + f.title + ')')).join(', ') + ` — ${B.featuredShare}% of ${lbl} pulls` : '<span class="muted">—</span>'}</td><td class="muted">${pool(Number(r)).length} units</td></tr>`;
    }).join('');
    UI.modal(`<table class="rates"><thead><tr><th>Rarity</th><th>Rate</th><th>Featured</th><th>Pool</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted" style="font-size:12px">A draw costs ${fmt(B.cost.single.cubes)} Cubes, 10 draws ${fmt(B.cost.multi.cubes)}. The 10th draw of a 10x is always ${UI.rarityOf(B.multiGuarantee)} or better. ${b.exchangeAt ? `Every draw on this banner earns 1 Gacha Point; ${b.exchangeAt} points exchange for any featured unit. Points stay on this banner unless you convert them: 20 points → 10 Gacha Point Cards (up to 200 points per banner), and a later banner accepts up to 100 cards.` : ''} Duplicates raise Limit Break (+${Rules.DUPE_BONUS}% stats each, up to LB ${Rules.MAX_DUPES}); after that they convert to JP.</p>`,
    { title: 'Summon Rates', sub: '提供割合' });
  }

  function doPull(kind) {
    const n = kind === 'multi' ? 10 : 1;
    const cost = costFor(kind);
    let results = null;
    const ok = Save.update((s) => {
      if (kind === 'daily') { if (s.daily.gacha_daily === Rules.today() || s.currency.cubes < cost.n) return false; s.currency.cubes -= cost.n; s.daily.gacha_daily = Rules.today(); }
      else if (cost.type === 'ticket') { if ((s.items.ticket || 0) < cost.n) return false; s.items.ticket -= cost.n; }
      else { if (s.currency.cubes < cost.n) return false; s.currency.cubes -= cost.n; }
      results = pull(s, current, n);
      logPulls(s, current.id, results);
      return true;
    });
    if (!ok) { UI.toast(kind === 'daily' ? 'The Limited ×1 draw is once a day.' : 'Not enough Cubes — visit the Shop.', 'bad'); return; }
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
        ${kind === 'exchange' || kind === 'daily' ? '' : `<button class="jjk-btn" id="rv-again" type="button" hidden>Summon ${kind === 'multi' ? '×10' : '×1'} again</button>`}
        <button class="jjk-btn is-primary rv-back" id="rv-close" type="button" hidden>Back to Summon</button></div>`;
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

  /* Event banners replay the Japanese server's gacha history (fan wiki
   * "Timeline Of Events (JP)"). Every one can be drawn on; the ones whose
   * original JP dates include today are marked LIVE. */
  const today = () => Rules.today();
  const isLive = (b) => b.event && b.start <= today() && (!b.end || b.end >= today());
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = (d) => { const [y, m, dd] = d.split('-'); return +dd + ' ' + MONTHS[+m - 1] + ' ' + y; };
  const dateRange = (b) => fmtDay(b.start) + (b.end ? ' – ' + fmtDay(b.end) : '');
  let listTab = 'live';

  function tabHtml(b) {
    const h = Data.char(b.hero);
    const img = b.event ? `<img src="${esc(b.bg)}" alt="" loading="lazy">` : h ? Art.img(h, 'full', { alt: '' }) : '';
    return `<button class="ban-tab${b.event ? ' is-event' : ''}${isLive(b) ? ' is-live' : ''}" data-id="${esc(b.id)}" type="button" title="${esc(b.name)}">${img}<span>${esc(b.name)}</span></button><small class="ban-time" data-id="${esc(b.id)}">${esc(timerText(b))}</small>`;
  }

  function drawList() {
    const events = B.banners.filter((b) => b.event);
    let live = events.filter(isLive);
    const liveLabel = live.length ? 'Live now' : 'Latest';
    if (!live.length) live = events.slice(0, 4);
    let body = '';
    if (listTab === 'live') body = `<small class="ban-group">${liveLabel}</small>` + live.map(tabHtml).join('');
    else if (listTab === 'events') {
      let month = '';
      body = events.map((b) => {
        const m = b.start.slice(0, 7);
        const head = m !== month ? `<small class="ban-group">${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}</small>` : '';
        month = m;
        return head + tabHtml(b);
      }).join('');
    } else body = B.banners.filter((b) => !b.event).map(tabHtml).join('');
    $('#banners').innerHTML = `<div class="ban-filter" role="tablist">${[['live', 'Live'], ['events', 'Events'], ['standard', 'Standard']].map(([k, l]) => `<button type="button" role="tab" data-list="${k}" class="${k === listTab ? 'on' : ''}" aria-selected="${k === listTab}">${l}</button>`).join('')}</div>
      <div class="ban-scroll">${body}</div>`;
    $$('#banners .ban-tab').forEach((t) => t.classList.toggle('active', !!current && t.dataset.id === current.id));
  }

  function render() {
    $('#main').innerHTML = `<div class="gacha">
      <div class="g-bg" id="g-bg"></div>
      <aside class="g-list" id="banners"></aside>
      <aside class="g-info" id="g-info"></aside>
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
    listTab = !current.event ? 'standard' : isLive(current) || events.slice(0, 4).includes(current) ? 'live' : 'events';
    drawList();
    drawPanel();
    setInterval(() => $$('#banners .ban-time').forEach((el) => { const b = B.banners.find((x) => x.id === el.dataset.id); if (b) el.textContent = timerText(b); }), 60000);
  }

  UI.boot({ data: ['characters', 'banners'], init: () => Data.load('banners').then((b) => { B = b; render(); }) });
})();
