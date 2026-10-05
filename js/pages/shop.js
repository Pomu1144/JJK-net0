/* shop.html — the Exchange hub (Phantom Parade): six exchange cards, each
 * opening its shop. Rare Mat. = JP / Cubes shop (Training Lights, AP, Draw
 * Tickets, daily gift); Friendship Point = FP shop; Event = the Event Map's
 * medal exchange; Gacha Point = your points per banner. */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  let D = null;
  let sec = 0;
  let view = 'hub';     // 'hub' | 'rare' | 'friend' | 'gacha'
  const FP_SVG = '<img class="cur-ic" src="assets/pp/currency/friend-point.webp" alt="" aria-hidden="true">';

  function giveText(g) {
    const parts = [];
    Object.entries(g.items || {}).forEach(([k, n]) => parts.push(n + '× ' + D.items[k].name));
    if (g.staminaRefill) parts.push('Full AP refill');
    if (g.stamina) parts.push('+' + g.stamina + ' AP (can exceed max)');
    if (g.cubes) parts.push(fmt(g.cubes) + ' Cubes');
    if (g.yen) parts.push(fmt(g.yen) + ' JP');
    if (g.fp) parts.push(g.fp + ' Friendship Points');
    return parts.join(' + ');
  }
  function icon(g) {
    const k = g.items && Object.keys(g.items)[0];
    if (k) return UI.itemIcon(k, D.items);
    if (g.staminaRefill || g.stamina) return UI.STAM_SVG;
    if (g.yen && !g.cubes) return UI.YEN_SVG;
    return UI.CUBE_SVG;
  }

  // scene art behind each offer (Phantom Parade memories)
  const ART = {
    buy_ts: 'curse-born-from-the-land', buy_ts10: 'instincts-of-a-curse', buy_tm: 'mission-begins',
    buy_tl: 'malevolent-shrine', buy_tl_c: 'the-last-of-my-cursed-energy',
    refill: 'hot-pot-party', stam10: 'strawberry-parfait-of-youth',
    ticket1: 'non-standard', ticket10: 'the-grand-break-through', ticket_yen: 'strong-lineup',
    daily_gift: 'i-bought-local-souvenirs',
    fp_ts3: 'curse-born-from-the-land', fp_tm: 'mission-begins', fp_ap10: 'strawberry-parfait-of-youth', fp_jp: 'i-bought-local-souvenirs', fp_gp: 'non-standard', fp_ticket: 'strong-lineup',
  };
  const SECTION_ART = { items: 'curse-born-from-the-land', stamina: 'hot-pot-party', summon: 'non-standard', daily: 'i-bought-local-souvenirs' };
  const LOCK = '<svg viewBox="0 0 14 16" aria-hidden="true"><path d="M3.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#e8cf86" stroke-width="2"/><rect x="1" y="7" width="12" height="9" rx="1.5" fill="#d9b65c" stroke="#5a4214"/><circle cx="7" cy="11" r="1.4" fill="#5a4214"/></svg>';

  /** short card label + quantity badge for an offer */
  function label(g) {
    const k = g.items && Object.keys(g.items)[0];
    if (k) return { name: D.items[k].name, qty: g.items[k] };
    if (g.staminaRefill) return { name: 'AP Refill', qty: 0 };
    if (g.stamina) return { name: 'AP +' + g.stamina, qty: 0 };
    if (g.yen && !g.cubes) return { name: fmt(g.yen) + ' JP', qty: 0 };
    return { name: 'Daily Gift', qty: 0 };
  }
  function priceHtml(p) {
    if (p.cubes) return `<span class="sx-price">${UI.CUBE_SVG}${fmt(p.cubes)}</span>`;
    if (p.yen) return `<span class="sx-price">${UI.YEN_SVG}${fmt(p.yen)}</span>`;
    if (p.fp) return `<span class="sx-price">${FP_SVG}${fmt(p.fp)}</span>`;
    return '<span class="sx-price is-free">Free</span>';
  }

  function draw(anim) {
    const s = Save.get();
    const list = sections();
    const section = list[sec] || list[0];
    const st = Rules.staminaNow(s);
    $('#tabs').innerHTML = list.map((x, i) => `<button class="jjk-tab${i === sec ? ' active' : ''}" type="button" data-s="${i}">${esc(x.name)}</button>`).join('');
    $('#offers').innerHTML = `<div class="sx-grid${anim ? ' is-anim' : ''}">${section.offers.map((o) => {
      const claimed = o.daily && s.daily[o.id] === Rules.today();
      const full = o.give.staminaRefill && st.cur >= st.max;
      const afford = (!o.price.cubes || s.currency.cubes >= o.price.cubes) && (!o.price.yen || s.currency.yen >= o.price.yen) && (!o.price.fp || (s.currency.fp || 0) >= o.price.fp);
      const off = claimed || !afford || full;
      const why = claimed ? 'Claimed today' : full ? 'AP full' : !afford ? (o.price.cubes ? 'Not enough Cubes' : o.price.fp ? 'Not enough FP' : 'Not enough JP') : '';
      const k = o.give.items && Object.keys(o.give.items)[0];
      const l = label(o.give);
      const own = k ? 'Owned ' + fmt(s.items[k] || 0) : o.daily ? 'Once a day' : (o.give.staminaRefill || o.give.stamina) ? 'AP ' + st.cur + '/' + st.max : '';
      const sub = o.give.stamina ? 'Can exceed max' : o.give.staminaRefill ? 'Refills to max' : o.daily ? fmt(o.give.cubes || 0) + ' Cubes + ' + fmt(o.give.yen || 0) + ' JP' : '';
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
      if (o.give.staminaRefill) { const st = Rules.staminaNow(s); if (st.cur >= st.max) return 'AP is already full.'; }
      if ((o.price.cubes || 0) > s.currency.cubes) return 'Not enough Cubes.';
      if ((o.price.yen || 0) > s.currency.yen) return 'Not enough JP.';
      if ((o.price.fp || 0) > (s.currency.fp || 0)) return 'Not enough Friendship Points.';
      s.currency.fp = (s.currency.fp || 0) - (o.price.fp || 0) + (o.give.fp || 0);
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

  // Exchange hub cards (art from the game's Exchange screen, assets/pp/ui/exchange)
  const CARDS = [
    { id: 'event', name: 'Event', href: 'event.html#exchange' },
    { id: 'domain', name: 'Domain Investigation', soon: true, count: () => 0 },
    { id: 'cursed', name: 'Cursed Object', soon: true },
    { id: 'rare', name: 'Rare Materials', view: 'rare' },
    { id: 'friend', name: 'Friendship Point', view: 'friend', count: (s) => s.currency.fp || 0 },
    { id: 'gacha', name: 'Gacha Point', view: 'gacha' },
  ];
  const RARE = ['items', 'stamina', 'summon', 'daily'];
  const sections = () => D.shop.sections.filter((x) => (view === 'friend' ? x.id === 'friend' : RARE.includes(x.id)));

  function drawHub() {
    const s = Save.get();
    $('#ex-body').innerHTML = `<div class="ex-grid">${CARDS.map((c) => `
      <${c.soon ? 'div' : c.href ? 'a' : 'button'} class="ex-card${c.soon ? ' is-soon' : ''}" ${c.href ? `href="${c.href}"` : c.view ? `type="button" data-view="${c.view}"` : ''} aria-label="${esc(c.name)}">
        <img src="assets/pp/ui/exchange/${c.id}.webp" alt="">
        ${c.count ? `<b class="ex-count">${fmt(c.count(s))}</b>` : ''}
        ${c.soon ? '<span class="ex-soon">COMING SOON</span>' : ''}
      </${c.soon ? 'div' : c.href ? 'a' : 'button'}>`).join('')}</div>`;
  }

  function drawGacha() {
    const s = Save.get();
    const B = D.banners;
    const rows = B.banners.filter((b) => b.exchangeAt && (s.gacha.points[b.id] || 0) > 0);
    $('#offers').innerHTML = `<div class="ex-gp">
      <p class="muted">Gacha Points are earned per banner (1 per draw). ${B.gp ? B.gp.exchangeAt : 250} points on a banner exchange for any of its featured units on the Summon screen. You own ${UI.GP_ICON} <b>${fmt(s.items.gp_card || 0)}</b> Gacha Point Cards.</p>
      ${rows.length ? rows.map((b) => `<a class="ex-gp-row pp-card" href="summon.html#${esc(b.id)}"><img src="${esc(b.bg || '')}" alt=""><span><b>${esc(b.name)}</b><small>${esc(b.subtitle || '')}</small></span><em>${fmt(s.gacha.points[b.id])} / ${b.exchangeAt}</em></a>`).join('') : '<p class="muted">No Gacha Points yet. Draw on a pickup banner to start collecting.</p>'}
    </div>`;
  }

  function show(v, anim) {
    view = v;
    const sub = v !== 'hub';
    $('#ex-body').hidden = sub;
    $('#ex-sub').hidden = !sub;
    if (!sub) { drawHub(); return; }
    const c = CARDS.find((x) => x.view === v);
    $('#ex-sub-title').textContent = c ? c.name : '';
    $('#tabs').hidden = v === 'gacha';
    if (v === 'gacha') { drawGacha(); return; }
    const list = sections();
    const i = list.findIndex((x) => x.id === location.hash.slice(1));
    sec = i >= 0 ? i : 0;
    draw(anim);
  }

  function route() {
    const h = location.hash.slice(1);
    if (h === 'friend' || h === 'gacha' || h === 'rare') return show(h, true);
    if (RARE.includes(h)) return show('rare', true);
    show('hub');
  }

  function render() {
    const g = Data.char('yuji_301') || Data.char('shoko_reverse_curse');
    $('#main').innerHTML = `<div class="scr sx ex">
      <div class="scr-guide" style="--focus:50% 0%">${g ? Art.img(g, 'portrait', { cls: 'art scr-guide-art', eager: true, alt: '' }) : ''}
        <div class="pp-dialog"><span class="dlg-name">${esc(g ? g.name : 'Guide')}</span><p class="dlg-text">Do not regret, make a good choice.</p></div></div>
      <div class="sx-right">
        <div id="ex-body"></div>
        <div id="ex-sub" hidden><div class="ex-sub-head"><button class="pp-stone" type="button" id="ex-back">${UI.icon('back')}<span>Exchange</span></button><h2 id="ex-sub-title"></h2>
          <span class="ex-fp">${FP_SVG}<b id="ex-fp"></b></span></div>
          <div class="tabs" id="tabs" role="tablist"></div><div class="sx-scroll" id="offers"></div></div>
      </div></div>`;
    $('#ex-body').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) { UI.sfx('tap'); history.replaceState(null, '', '#' + b.dataset.view); show(b.dataset.view, true); } });
    $('#ex-back').addEventListener('click', () => { history.replaceState(null, '', location.pathname); show('hub'); });
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { sec = +b.dataset.s; history.replaceState(null, '', '#' + sections()[sec].id); draw(true); $('#offers').scrollTop = 0; } });
    $('#offers').addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (b && !b.disabled) buy(b.dataset.buy); });
    // HUD links (shop.html#stamina, #summon) change only the hash while on this page
    window.addEventListener('hashchange', route);
    const paintFp = () => { const el = $('#ex-fp'); if (el) el.textContent = fmt(Save.get().currency.fp || 0); };
    Save.onChange(paintFp); paintFp();
    route();
  }

  UI.boot({ data: ['characters', 'items'], init: () => Promise.all([Data.load('items'), Data.load('banners')]).then(([d, b]) => { D = d; D.banners = b; render(); }) });
})();
