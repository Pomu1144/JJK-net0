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
    const c = B.cost[kind];
    if ((s.items.ticket || 0) >= c.tickets) return { type: 'ticket', n: c.tickets, label: c.tickets + ' Ticket' + (c.tickets > 1 ? 's' : '') };
    return { type: 'cubes', n: c.cubes, label: fmt(c.cubes) + ' Cubes', short: s.currency.cubes < c.cubes };
  }

  function drawPanel() {
    const s = Save.get();
    const b = current;
    const hero = Data.char(b.hero);
    const one = costFor('single'), ten = costFor('multi');
    const feats = b.featured.map((id) => Data.char(id)).filter(Boolean);
    $('#banner-art').innerHTML = `
      <div class="ban-stage t-${UI.typeOf(b.element).toLowerCase()}">
        ${b.bg ? `<div class="scene-bg" style="background-image:url('${esc(b.bg)}')"></div>` : ''}
        ${hero ? Art.img(hero, 'full', { cls: 'ban-hero', eager: true, alt: '' }) : ''}
        <span class="ban-kanji">${esc(b.kanji)}</span>
        <div class="ban-copy"><span class="pk-label">${b.featured.length ? 'PICKUP' : 'STANDARD'}</span>
          <h2 class="ban-title">${esc(b.name)}</h2><p>${esc(b.subtitle)}</p></div>
        ${feats.length ? `<div class="ban-film"><span class="film-holes"></span><div class="ban-feat">${feats.map((d) => UI.unitTile(d, { tag: 'span' })).join('')}</div><span class="film-holes"></span></div>` : ''}
        ${b.exchangeAt ? `<span class="ban-rate">SSR rate up · ${B.featuredShare}%</span>` : ''}
      </div>`;
    $('#side').innerHTML = `
      <h3>${esc(b.name)}</h3>
      ${b.exchangeAt ? gpHtml(s, b) : '<p class="muted" style="font-size:11.5px;margin:0">The standard banner has no Gacha Points. Every 10x draw guarantees an SR or better.</p>'}
      <button class="draw-btn is-single" id="pull1" type="button" ${one.short ? 'disabled' : ''}><span class="n">1<small>回</small></span><span class="t">Summon ×1<small>${one.type === 'ticket' ? UI.itemIcon('ticket', {}) : UI.CUBE_SVG} ${esc(one.label)}</small></span></button>
      <button class="draw-btn is-multi" id="pull10" type="button" ${ten.short ? 'disabled' : ''}><span class="n">10<small>回</small></span><span class="t">Summon ×10<small>${ten.type === 'ticket' ? UI.itemIcon('ticket', {}) : UI.CUBE_SVG} ${esc(ten.label)}</small></span></button>
      <div class="row" style="gap:6px;margin-top:6px"><button class="jjk-btn is-small grow" id="rates" type="button">Rates</button><a class="jjk-btn is-small grow" href="shop.html#summon">Get Cubes</a></div>
      <small class="muted have">You have ${UI.CUBE_SVG} ${fmt(s.currency.cubes)} · ${UI.itemIcon('ticket', {})} ${s.items.ticket || 0}${s.items.gp_card ? ' · ' + UI.GP_ICON + ' ' + s.items.gp_card : ''}</small>`;
    $('#pull1').addEventListener('click', () => doPull('single'));
    if (b.exchangeAt) {
      $('#gp-exchange').addEventListener('click', exchange);
      $('#gp-convert').addEventListener('click', convert);
      $('#gp-redeem').addEventListener('click', redeem);
    }
    $('#pull10').addEventListener('click', () => doPull('multi'));
    $('#rates').addEventListener('click', showRates);
    $$('#banners .ban-tab').forEach((t) => t.classList.toggle('active', t.dataset.id === b.id));
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
      if (cost.type === 'ticket') { if ((s.items.ticket || 0) < cost.n) return false; s.items.ticket -= cost.n; }
      else { if (s.currency.cubes < cost.n) return false; s.currency.cubes -= cost.n; }
      results = pull(s, current, n);
      return true;
    });
    if (!ok) { UI.toast('Not enough Cubes — visit the Shop.', 'bad'); return; }
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
        ${kind === 'exchange' ? '' : `<button class="jjk-btn" id="rv-again" type="button" hidden>Summon ${kind === 'multi' ? '×10' : '×1'} again</button>`}
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

  function render() {
    $('#main').innerHTML = `<div class="summon">
      <aside class="ban-list jjk-panel" id="banners"><h4>Banners</h4>${B.banners.map((b) => {
        const h = Data.char(b.hero);
        return `<button class="ban-tab el-${b.element.toLowerCase()}" data-id="${b.id}" type="button">${h ? Art.img(h, 'full', { alt: '' }) : ''}<span>${esc(b.name)}</span></button>`;
      }).join('')}</aside>
      <section class="ban-main" id="banner-art"></section>
      <aside class="ban-side jjk-panel" id="side"></aside>
    </div>`;
    $('#banners').addEventListener('click', (e) => {
      const t = e.target.closest('.ban-tab');
      if (!t) return;
      current = B.banners.find((b) => b.id === t.dataset.id);
      history.replaceState(null, '', '#' + current.id);
      drawPanel();
    });
    current = B.banners.find((b) => b.id === location.hash.slice(1)) || B.banners[1] || B.banners[0];
    drawPanel();
  }

  UI.boot({ data: ['characters', 'banners'], init: () => Data.load('banners').then((b) => { B = b; render(); }) });
})();
