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
  function price(p) {
    if (p.cubes) return UI.CUBE_SVG + ' ' + fmt(p.cubes);
    if (p.yen) return UI.YEN_SVG + ' ' + fmt(p.yen);
    return 'Free';
  }

  function draw() {
    const s = Save.get();
    const section = D.shop.sections[sec];
    $('#tabs').innerHTML = D.shop.sections.map((x, i) => `<button class="jjk-tab${i === sec ? ' active' : ''}" type="button" data-s="${i}">${esc(x.name)}</button>`).join('');
    $('#offers').innerHTML = `<div class="shop-grid">${section.offers.map((o) => {
        const claimed = o.daily && s.daily[o.id] === Rules.today();
        const afford = (!o.price.cubes || s.currency.cubes >= o.price.cubes) && (!o.price.yen || s.currency.yen >= o.price.yen);
        const k = o.give.items && Object.keys(o.give.items)[0];
        return `<div class="offer pp-parch${claimed || !afford ? ' is-off' : ''}"><span class="of-icon">${icon(o.give)}</span>
          <h4>${esc(giveText(o.give))}</h4><small>${k ? 'Owned ' + (s.items[k] || 0) : o.daily ? 'Once per day' : o.give.staminaRefill || o.give.stamina ? 'AP ' + Rules.staminaNow(s).cur + '/' + Rules.staminaNow(s).max : ''}</small>
          <span class="of-strip"><button class="jjk-btn is-small${afford && !claimed ? ' is-primary' : ''}" type="button" data-buy="${o.id}" ${claimed || !afford ? 'disabled' : ''}>${claimed ? 'Claimed' : price(o.price)}</button></span></div>`;
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
    const g = Data.char('yuji_301');
    $('#main').innerHTML = `<div class="shop-layout">
      <div class="hub-guide">${g ? Art.img(g, 'full', { cls: 'art hub-guide-art', eager: true, alt: '' }) : ''}
        <div class="pp-dialog"><span class="dlg-name">${esc(g ? g.name : 'Guide')}</span><p class="dlg-text">Do not regret, make a good choice.</p></div></div>
      <div class="shop-right"><div class="tabs" id="tabs"></div><div id="offers"></div></div></div>`;
    const i = D.shop.sections.findIndex((x) => x.id === location.hash.slice(1));
    sec = i >= 0 ? i : 0;
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { sec = +b.dataset.s; history.replaceState(null, '', '#' + D.shop.sections[sec].id); draw(); } });
    $('#offers').addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (b && !b.disabled) buy(b.dataset.buy); });
    draw();
  }

  UI.boot({ data: ['characters', 'items'], init: () => Data.load('items').then((d) => { D = d; render(); }) });
})();
