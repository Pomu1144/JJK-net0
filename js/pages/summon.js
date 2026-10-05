/* summon.html — banners, x1 / x10 pulls, rates, pity and the reveal. */
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

  /** n pulls on a banner; pity counter is updated in the passed save. */
  function pull(s, banner, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let def;
      const pityAt = banner.pityAt || 0;
      const count = (s.pity[banner.id] || 0) + 1;
      if (pityAt && count >= pityAt) {
        const feats = banner.featured.map((id) => Data.char(id)).filter(Boolean).sort((a, b) => b.rarity - a.rarity);
        def = feats.filter((f) => f.rarity === feats[0].rarity)[Math.floor(Math.random() * feats.filter((f) => f.rarity === feats[0].rarity).length)];
      } else {
        const lastOfMulti = n === 10 && i === 9 && !out.some((o) => o.def.rarity >= B.multiGuarantee);
        def = pickUnit(banner, rollRarity(lastOfMulti ? B.multiGuarantee : 0));
      }
      const featuredHit = banner.featured.includes(def.id) && def.rarity >= 6;
      s.pity[banner.id] = featuredHit ? 0 : count;
      const r = Rules.addUnitTo(s, def.id, 1);
      out.push({ def, isNew: r.isNew, dupe: r.dupe, yen: r.yen, pity: featuredHit && pityAt && count >= pityAt });
    }
    s.stats.pulls += n;
    return out;
  }

  function costFor(kind) {
    const s = Save.get();
    const c = B.cost[kind];
    if ((s.items.ticket || 0) >= c.tickets) return { type: 'ticket', n: c.tickets, label: c.tickets + ' Ticket' + (c.tickets > 1 ? 's' : '') };
    return { type: 'cubes', n: c.cubes, label: c.cubes + ' Cubes', short: s.currency.cubes < c.cubes };
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
        ${b.pityAt ? `<span class="ban-rate">SSR rate up · ${B.featuredShare}%</span>` : ''}
      </div>`;
    $('#side').innerHTML = `
      <h3>${esc(b.name)}</h3>
      ${b.pityAt ? `<div class="pity"><small>Pity</small><div class="bar"><i style="width:${Math.min(100, (s.pity[b.id] || 0) / b.pityAt * 100)}%"></i></div><small><b>${s.pity[b.id] || 0}</b> / ${b.pityAt} — a featured SSR is guaranteed at ${b.pityAt}</small></div>` : '<p class="muted" style="font-size:11.5px;margin:0">No pity on the standard banner. Every 10x guarantees an SR or better.</p>'}
      <button class="draw-btn is-single" id="pull1" type="button" ${one.short ? 'disabled' : ''}><span class="n">1<small>回</small></span><span class="t">Summon ×1<small>${one.type === 'ticket' ? UI.itemIcon('ticket', {}) : UI.CUBE_SVG} ${esc(one.label)}</small></span></button>
      <button class="draw-btn is-multi" id="pull10" type="button" ${ten.short ? 'disabled' : ''}><span class="n">10<small>回</small></span><span class="t">Summon ×10<small>${ten.type === 'ticket' ? UI.itemIcon('ticket', {}) : UI.CUBE_SVG} ${esc(ten.label)}</small></span></button>
      <div class="row" style="gap:6px;margin-top:6px"><button class="jjk-btn is-small grow" id="rates" type="button">Rates</button><a class="jjk-btn is-small grow" href="shop.html#summon">Get Cubes</a></div>
      <small class="muted have">You have ${UI.CUBE_SVG} ${fmt(s.currency.cubes)} · ${UI.itemIcon('ticket', {})} ${s.items.ticket || 0}</small>`;
    $('#pull1').addEventListener('click', () => doPull('single'));
    $('#pull10').addEventListener('click', () => doPull('multi'));
    $('#rates').addEventListener('click', showRates);
    $$('#banners .ban-tab').forEach((t) => t.classList.toggle('active', t.dataset.id === b.id));
  }

  function showRates() {
    const b = current;
    const rows = Object.keys(B.rates).sort().reverse().map((r) => {
      const feats = b.featured.map((id) => Data.char(id)).filter((c) => c && c.rarity === Number(r));
      const lbl = Number(r) >= 7 ? 'Limited SSR' : UI.rarityOf(Number(r));
      return `<tr><td>${UI.rarityBadge(Number(r))}${Number(r) >= 7 ? ' <span class="limited-tag">LIMITED</span>' : ''}</td><td><b>${B.rates[r].toFixed(1)}%</b></td><td>${feats.length ? feats.map((f) => esc(f.name + ' (' + f.title + ')')).join(', ') + ` — ${B.featuredShare}% of ${lbl} pulls` : '<span class="muted">—</span>'}</td><td class="muted">${pool(Number(r)).length} units</td></tr>`;
    }).join('');
    UI.modal(`<table class="rates"><thead><tr><th>Rarity</th><th>Rate</th><th>Featured</th><th>Pool</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted" style="font-size:12px">10x summons guarantee at least one ${UI.rarityOf(B.multiGuarantee)} or better. ${b.pityAt ? `Pity: after ${b.pityAt - 1} pulls without a featured SSR, the next pull is a featured unit. The counter carries over and resets when you pull one.` : ''} Duplicates add +${Rules.DUPE_BONUS}% stats (up to +${Rules.MAX_DUPES}); beyond that they convert to Yen.</p>`,
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
            <div class="rcard-front">${UI.unitTile(r.def, { tag: 'span', badge: r.isNew ? '<span class="uc-badge badge is-new">NEW</span>' : r.dupe ? `<span class="uc-badge badge">+${r.dupe}</span>` : r.yen ? `<span class="uc-badge badge">¥${fmt(r.yen)}</span>` : '' })}</div>
          </div></div>`).join('')}</div>
      <div class="reveal-actions"><button class="jjk-btn" id="rv-skip" type="button">Skip</button>
        <button class="jjk-btn" id="rv-again" type="button" hidden>Summon ${kind === 'multi' ? '×10' : '×1'} again</button>
        <button class="jjk-btn is-primary rv-back" id="rv-close" type="button" hidden>Back to Summon</button></div>`;
    document.body.appendChild(ov);
    UI.sfx('pull');
    const finish = () => {
      ov.classList.add('done');
      $('#rv-skip', ov).hidden = true;
      $('#rv-close', ov).hidden = false;
      $('#rv-again', ov).hidden = false;
      if (top >= 6) UI.sfx('rare');
    };
    requestAnimationFrame(() => ov.classList.add('go'));
    const timer = setTimeout(finish, 1300 + results.length * 120 + 600);
    $('#rv-skip', ov).addEventListener('click', () => { clearTimeout(timer); ov.classList.add('skip'); finish(); });
    $('#rv-close', ov).addEventListener('click', () => ov.remove());
    $('#rv-again', ov).addEventListener('click', () => { ov.remove(); doPull(kind); });
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
