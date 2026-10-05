/* shop.html — spend Yen / Cubes on talismans, stamina, summon tickets, daily gift. */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  let D = null;
  let sec = 0;

  function giveText(g) {
    const parts = [];
    Object.entries(g.items || {}).forEach(([k, n]) => parts.push(n + '× ' + D.items[k].name));
    if (g.staminaRefill) parts.push('Full stamina refill');
    if (g.stamina) parts.push('+' + g.stamina + ' stamina (can exceed max)');
    if (g.cubes) parts.push(g.cubes + ' Cursed Cubes');
    if (g.yen) parts.push('¥' + fmt(g.yen));
    return parts.join(' + ');
  }
  function icon(g) {
    const k = g.items && Object.keys(g.items)[0];
    if (k) return UI.itemIcon(k, D.items);
    if (g.staminaRefill || g.stamina) return UI.STAM_SVG;
    return UI.CUBE_SVG;
  }

  // scene art behind each offer (Phantom Parade memories)
  const ART = {
    buy_ts: 'curse-born-from-the-land', buy_ts10: 'instincts-of-a-curse', buy_tm: 'mission-begins',
    buy_tl: 'malevolent-shrine', buy_tl_c: 'the-last-of-my-cursed-energy',
    refill: 'hot-pot-party', stam10: 'strawberry-parfait-of-youth',
    ticket1: 'non-standard', ticket10: 'the-grand-break-through', ticket_yen: 'strong-lineup',
    daily_gift: 'i-bought-local-souvenirs',
  };
  const SECTION_ART = { items: 'curse-born-from-the-land', stamina: 'hot-pot-party', summon: 'non-standard', daily: 'i-bought-local-souvenirs' };
  const LOCK = '<svg viewBox="0 0 14 16" aria-hidden="true"><path d="M3.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#e8cf86" stroke-width="2"/><rect x="1" y="7" width="12" height="9" rx="1.5" fill="#d9b65c" stroke="#5a4214"/><circle cx="7" cy="11" r="1.4" fill="#5a4214"/></svg>';

  /** short card label + quantity badge for an offer */
  function label(g) {
    const k = g.items && Object.keys(g.items)[0];
    if (k) return { name: D.items[k].name, qty: g.items[k] };
    if (g.staminaRefill) return { name: 'Stamina Refill', qty: 0 };
    if (g.stamina) return { name: 'Stamina +' + g.stamina, qty: 0 };
    return { name: 'Daily Gift', qty: 0 };
  }
  function priceHtml(p) {
    if (p.cubes) return `<span class="sx-price">${UI.CUBE_SVG}${fmt(p.cubes)}</span>`;
    if (p.yen) return `<span class="sx-price">${UI.YEN_SVG}${fmt(p.yen)}</span>`;
    return '<span class="sx-price is-free">Free</span>';
  }

  function draw(anim) {
    const s = Save.get();
    const section = D.shop.sections[sec];
    const st = Rules.staminaNow(s);
    $('#tabs').innerHTML = D.shop.sections.map((x, i) => `<button class="jjk-tab${i === sec ? ' active' : ''}" type="button" data-s="${i}">${esc(x.name)}</button>`).join('');
    $('#offers').innerHTML = `<div class="sx-grid${anim ? ' is-anim' : ''}">${section.offers.map((o) => {
      const claimed = o.daily && s.daily[o.id] === Rules.today();
      const full = o.give.staminaRefill && st.cur >= st.max;
      const afford = (!o.price.cubes || s.currency.cubes >= o.price.cubes) && (!o.price.yen || s.currency.yen >= o.price.yen);
      const off = claimed || !afford || full;
      const why = claimed ? 'Claimed today' : full ? 'Stamina full' : !afford ? (o.price.cubes ? 'Not enough Cubes' : 'Not enough Yen') : '';
      const k = o.give.items && Object.keys(o.give.items)[0];
      const l = label(o.give);
      const own = k ? 'Owned ' + fmt(s.items[k] || 0) : o.daily ? 'Once a day' : (o.give.staminaRefill || o.give.stamina) ? 'AP ' + st.cur + '/' + st.max : '';
      const sub = o.give.stamina ? 'Can exceed max' : o.give.staminaRefill ? 'Refills to max' : o.daily ? fmt(o.give.cubes || 0) + ' Cubes + ¥' + fmt(o.give.yen || 0) : '';
      return `<button class="pp-parch sx-card${o.daily && !claimed ? ' is-due' : ''}" type="button" data-buy="${o.id}" ${off ? 'disabled' : ''} title="${esc(giveText(o.give) + (why ? ' — ' + why : ''))}">
        <span class="parch-art" style="background-image:url('assets/pp/memories/${ART[o.id] || SECTION_ART[section.id] || 'daily-routine'}/art.webp')"></span>
        <span class="sx-item">${icon(o.give)}</span>${l.qty ? `<span class="sx-qty">×${fmt(l.qty)}</span>` : ''}
        ${off ? `<span class="sx-lock">${LOCK}<small>${esc(why)}</small></span>` : ''}
        <span class="sx-label scr-orn">${esc(l.name)}</span>${sub ? `<span class="sx-sub">${esc(sub)}</span>` : ''}
        <span class="sx-strip"><span class="sx-own">${esc(own)}</span>${claimed ? '<span class="sx-price">Claimed</span>' : priceHtml(o.price)}</span>
      </button>`;
    }).join('')}</div>`;
  }

  function buy(id) {
    const o = D.shop.sections.flatMap((x) => x.offers).find((x) => x.id === id);
    if (!o) return;
    const ok = Save.update((s) => {
      if (o.daily && s.daily[o.id] === Rules.today()) return 'Already claimed today.';
      if (o.give.staminaRefill) { const st = Rules.staminaNow(s); if (st.cur >= st.max) return 'Stamina is already full.'; }
      if ((o.price.cubes || 0) > s.currency.cubes) return 'Not enough Cubes.';
      if ((o.price.yen || 0) > s.currency.yen) return 'Not enough Yen.';
      s.currency.cubes -= o.price.cubes || 0;
      s.currency.yen -= o.price.yen || 0;
      Object.entries(o.give.items || {}).forEach(([k, n]) => { s.items[k] = (s.items[k] || 0) + n; });
      if (o.give.staminaRefill) { const st = Rules.staminaNow(s); s.stamina = { cur: Math.max(st.cur, st.max), ts: Date.now() }; }
      if (o.give.stamina) Rules.addStaminaTo(s, o.give.stamina, true);
      s.currency.cubes += o.give.cubes || 0;
      s.currency.yen += o.give.yen || 0;
      if (o.daily) s.daily[o.id] = Rules.today();
      return true;
    });
    if (ok === true) { UI.toast('Received: ' + giveText(o.give), 'good'); UI.sfx('heal'); } else UI.toast(ok, 'bad');
    draw();
  }

  function render() {
    const g = Data.char('shoko_reverse_curse') || Data.char('yuji_301');
    $('#main').innerHTML = `<div class="scr sx">
      <div class="scr-guide" style="--focus:50% 0%">${g ? Art.img(g, 'portrait', { cls: 'art scr-guide-art', eager: true, alt: '' }) : ''}
        <div class="pp-dialog"><span class="dlg-name">${esc(g ? g.name : 'Guide')}</span><p class="dlg-text">Do not regret, make a good choice.</p></div></div>
      <div class="sx-right"><div class="tabs" id="tabs" role="tablist"></div><div class="sx-scroll" id="offers"></div></div></div>`;
    const i = D.shop.sections.findIndex((x) => x.id === location.hash.slice(1));
    sec = i >= 0 ? i : 0;
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { sec = +b.dataset.s; history.replaceState(null, '', '#' + D.shop.sections[sec].id); draw(true); $('#offers').scrollTop = 0; } });
    $('#offers').addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (b && !b.disabled) buy(b.dataset.buy); });
    // HUD links (shop.html#stamina, #summon) change only the hash while on this page
    window.addEventListener('hashchange', () => {
      const j = D.shop.sections.findIndex((x) => x.id === location.hash.slice(1));
      if (j >= 0 && j !== sec) { sec = j; draw(true); $('#offers').scrollTop = 0; }
    });
    draw(true);
  }

  UI.boot({ data: ['characters', 'items'], init: () => Data.load('items').then((d) => { D = d; render(); }) });
})();
