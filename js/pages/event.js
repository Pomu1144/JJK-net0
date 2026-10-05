/* event.html — Phantom Parade "Map Event": a night-city map (one page per
 * area) with stage nodes joined by dotted paths. Battle / elite / boss nodes
 * start a battle (battle.html?stage=<nodeId>&team=N); chest and story nodes
 * resolve here. Event Missions and the Exchange spend the event currency.
 * Data: data/events.json. Save: s.events[eventId] (see Rules.eventStateOf).
 */
(function () {
  'use strict';
  const { $, $$, esc, fmt } = UI;
  const W = 1600, H = 900;          // world coordinate space (node x/y are % of it)
  const BATTLE_TYPES = ['battle', 'elite', 'boss'];
  const STAR_TEXT = '1★ clear · 2★ at most 1 character defeated · 3★ no characters defeated';
  let EV = null, ITEMS = {}, areaIdx = 0;

  /* ---------------- helpers ---------------- */
  const evState = (s) => ((s || Save.get()).events || {})[EV.id] || { tokens: 0, earned: 0, wins: 0, cleared: {}, missions: {}, bought: {} };
  const allNodes = () => EV.areas.flatMap((a) => a.nodes);
  const nodeById = (id) => allNodes().find((n) => n.id === id) || null;
  const areaOf = (id) => EV.areas.find((a) => a.nodes.some((n) => n.id === id));
  const isBattle = (n) => BATTLE_TYPES.includes(n.type);
  const cleared = (id) => !!evState().cleared[id];
  const open = (n) => Rules.eventNodeOpen(Save.get(), EV, n);
  const label = (n) => { if (n.label) return n.label; const a = areaOf(n.id); return (EV.areas.indexOf(a) + 1) + '-' + (a.nodes.indexOf(n) + 1); };
  const areaOpen = (a) => open(a.nodes[0]);
  const medalImg = (cls) => `<img class="ev-medal ${cls || ''}" src="${esc(EV.currency.icon)}" alt="" aria-hidden="true">`;

  /** 'char:id' | 'enemy:id' | 'npc:key' -> a def Art.img can draw. */
  function face(ref) {
    const [k, id] = String(ref || '').split(':');
    if (k === 'char') return Data.char(id);
    if (k === 'enemy') {
      const e = Data.enemy(id);
      return e ? { id: 'enemy_' + e.id, name: e.name, element: e.element, kanji: e.kanji, art: { portrait: e.art, icon: e.art, full: e.art } } : null;
    }
    if (k === 'npc') return (EV.npcs || {})[id] || null;
    return null;
  }
  function nodeFace(n) {
    const f = face(n.face);
    if (f) return f;
    const last = n.waves && n.waves[n.waves.length - 1];
    return last ? face('enemy:' + last[0].enemy) : null;
  }

  function seeded(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** Reward chips for a { medals, cubes, yen, ap, items } object. */
  function giveHtml(g) {
    const out = [];
    if (!g) return '';
    if (g.medals) out.push(`<span class="ev-chip">${medalImg()}<b>${fmt(g.medals)}</b></span>`);
    if (g.cubes) out.push(`<span class="ev-chip">${UI.CUBE_SVG}<b>${fmt(g.cubes)}</b></span>`);
    if (g.yen) out.push(`<span class="ev-chip">${UI.YEN_SVG}<b>${fmt(g.yen)}</b></span>`);
    if (g.ap) out.push(`<span class="ev-chip">${UI.STAM_SVG}<b>${fmt(g.ap)} AP</b></span>`);
    Object.entries(g.items || {}).forEach(([k, n]) => out.push(`<span class="ev-chip" title="${esc(ITEMS[k] ? ITEMS[k].name : k)}">${UI.itemIcon(k, ITEMS)}<b>×${fmt(n)}</b></span>`));
    return out.join('');
  }
  function giveText(g) {
    const out = [];
    if (g.medals) out.push(fmt(g.medals) + ' ' + EV.currency.short);
    if (g.cubes) out.push(fmt(g.cubes) + ' Cubes');
    if (g.yen) out.push(fmt(g.yen) + ' JP');
    if (g.ap) out.push(g.ap + ' AP');
    Object.entries(g.items || {}).forEach(([k, n]) => out.push(n + '× ' + (ITEMS[k] ? ITEMS[k].name : k)));
    return out.join(', ');
  }
  /** Apply a reward inside a Save.update. Medals count toward "earned". */
  function applyGive(s, g) {
    const e = Rules.eventStateOf(s, EV.id);
    s.currency.cubes += g.cubes || 0;
    s.currency.yen += g.yen || 0;
    Object.entries(g.items || {}).forEach(([k, n]) => { s.items[k] = (s.items[k] || 0) + n; });
    if (g.ap) Rules.addStaminaTo(s, g.ap, true);
    if (g.medals) { e.tokens += g.medals; e.earned += g.medals; }
  }

  /* ---------------- missions ---------------- */
  function missionProgress(m) {
    const e = evState();
    const g = m.goal;
    const nodes = allNodes();
    const done = (f) => nodes.filter((n) => f(n) && e.cleared[n.id]).length;
    switch (g.type) {
      case 'cleared': return [Math.min(g.n, Object.keys(e.cleared).filter((id) => nodeById(id)).length), g.n];
      case 'earned': return [Math.min(g.n, e.earned || 0), g.n];
      case 'wins': return [Math.min(g.n, e.wins || 0), g.n];
      case 'stars3': return [Math.min(g.n, nodes.filter((n) => isBattle(n) && e.cleared[n.id] >= 3).length), g.n];
      case 'node': return [e.cleared[g.node] ? 1 : 0, 1];
      case 'chests': { const t = nodes.filter((n) => n.type === 'chest').length; return [done((n) => n.type === 'chest'), t]; }
      case 'stories': { const t = nodes.filter((n) => n.type === 'story').length; return [done((n) => n.type === 'story'), t]; }
      default: return [0, 1];
    }
  }
  const claimable = () => EV.missions.filter((m) => { const [a, b] = missionProgress(m); return a >= b && !evState().missions[m.id]; });

  /* ---------------- the city (procedural SVG, seeded per area) ---------------- */
  function citySvg(area) {
    const rnd = seeded(area.seed || 1);
    const red = area.tint === 'red';
    const r = (a, b) => a + rnd() * (b - a);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const roofs = red ? ['#1d1a26', '#231c28', '#1a1f2c', '#2a2030', '#18161f'] : ['#162033', '#1b2639', '#1f2a3c', '#152a36', '#1a1f30'];
    const neon = red ? ['#ff3d6e', '#ff9a3c', '#c94bff', '#ff5a3c', '#36e0ff'] : ['#36e0ff', '#ff4fa3', '#ffd04a', '#7a7dff', '#4dffb5'];
    const out = [];
    const glow = [];
    const lamps = [];
    // roads: a rotated, uneven grid
    const xs = [], ys = [];
    for (let x = -260; x < W + 260; x += r(80, 150)) xs.push(Math.round(x));
    for (let y = -220; y < H + 220; y += r(70, 120)) ys.push(Math.round(y));
    const major = (i) => i % 3 === 1;
    xs.forEach((x, i) => {
      const w = major(i) ? 20 : 9;
      out.push(`<rect x="${x - w / 2}" y="-300" width="${w}" height="${H + 600}" fill="${major(i) ? '#1b2230' : '#121823'}"/>`);
      if (major(i)) out.push(`<line x1="${x}" y1="-300" x2="${x}" y2="${H + 300}" stroke="#d8c48a" stroke-opacity=".18" stroke-width="1" stroke-dasharray="10 12"/>`,
        `<line x1="${x - 5}" y1="-300" x2="${x - 5}" y2="${H + 300}" stroke="${red ? '#ff6b5a' : '#ff5a4a'}" stroke-opacity=".35" stroke-width="1.6" stroke-dasharray="${r(8, 30)} ${r(30, 90)}"/>`,
        `<line x1="${x + 5}" y1="-300" x2="${x + 5}" y2="${H + 300}" stroke="#fff3d0" stroke-opacity=".3" stroke-width="1.6" stroke-dasharray="${r(8, 30)} ${r(30, 90)}"/>`);
      for (let y = -200; y < H + 200; y += r(34, 60)) lamps.push([x + (major(i) ? 12 : 6) * (rnd() < 0.5 ? -1 : 1), y]);
    });
    ys.forEach((y, j) => {
      const w = major(j) ? 18 : 8;
      out.push(`<rect x="-300" y="${y - w / 2}" width="${W + 600}" height="${w}" fill="${major(j) ? '#1b2230' : '#121823'}"/>`);
      if (major(j)) out.push(`<line x1="-300" y1="${y}" x2="${W + 300}" y2="${y}" stroke="#d8c48a" stroke-opacity=".18" stroke-width="1" stroke-dasharray="10 12"/>`,
        `<line x1="-300" y1="${y - 4}" x2="${W + 300}" y2="${y - 4}" stroke="#ff5a4a" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="${r(8, 30)} ${r(30, 90)}"/>`,
        `<line x1="-300" y1="${y + 4}" x2="${W + 300}" y2="${y + 4}" stroke="#fff3d0" stroke-opacity=".28" stroke-width="1.5" stroke-dasharray="${r(8, 30)} ${r(30, 90)}"/>`);
      for (let x = -200; x < W + 200; x += r(34, 60)) lamps.push([x, y + (major(j) ? 11 : 5) * (rnd() < 0.5 ? -1 : 1)]);
    });
    // blocks -> buildings
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < ys.length - 1; j++) {
        const gx = major(i) ? 11 : 6, gy = major(j) ? 10 : 5;
        const bx = xs[i] + gx, by = ys[j] + gy, bw = xs[i + 1] - xs[i] - gx - (major(i + 1) ? 11 : 6), bh = ys[j + 1] - ys[j] - gy - (major(j + 1) ? 10 : 5);
        if (bw < 12 || bh < 12) continue;
        const roll = rnd();
        if (roll < 0.07) { // park / shrine grounds
          out.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#0c1a16" rx="3"/>`);
          for (let t = 0; t < bw * bh / 260; t++) out.push(`<circle cx="${(bx + r(4, bw - 4)).toFixed(1)}" cy="${(by + r(4, bh - 4)).toFixed(1)}" r="${r(3, 7).toFixed(1)}" fill="${pick(['#10261d', '#13301f', '#0e2219'])}"/>`);
          continue;
        }
        if (roll < 0.11) { // parking lot
          out.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#141a22"/><rect x="${bx + 3}" y="${by + 3}" width="${bw - 6}" height="${bh - 6}" fill="url(#ev-lot)"/>`);
          continue;
        }
        // split the block into 1-4 lots
        const lots = [[bx, by, bw, bh]];
        const splits = Math.floor(r(0, 3.2));
        for (let k = 0; k < splits; k++) {
          const [lx, ly, lw, lh] = lots.shift();
          if (lw > lh && lw > 40) { const c = lw * r(0.35, 0.65); lots.push([lx, ly, c - 2, lh], [lx + c + 2, ly, lw - c - 2, lh]); }
          else if (lh > 40) { const c = lh * r(0.35, 0.65); lots.push([lx, ly, lw, c - 2], [lx, ly + c + 2, lw, lh - c - 2]); }
          else lots.push([lx, ly, lw, lh]);
        }
        lots.forEach(([lx, ly, lw, lh]) => {
          const tall = rnd();
          const sh = tall > 0.75 ? r(7, 14) : r(2, 6);
          out.push(`<rect x="${(lx + sh * 0.6).toFixed(1)}" y="${(ly + sh).toFixed(1)}" width="${lw.toFixed(1)}" height="${lh.toFixed(1)}" fill="#02040a" opacity=".75"/>`);
          out.push(`<rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${lw.toFixed(1)}" height="${lh.toFixed(1)}" fill="${pick(roofs)}" stroke="#ffffff" stroke-opacity="${tall > 0.75 ? 0.13 : 0.06}" stroke-width="1"/>`);
          if (lw > 14 && lh > 14) out.push(`<rect x="${(lx + 3).toFixed(1)}" y="${(ly + 3).toFixed(1)}" width="${(lw - 6).toFixed(1)}" height="${(lh - 6).toFixed(1)}" fill="url(#ev-win${Math.floor(rnd() * 3)})" opacity="${r(0.25, 0.95).toFixed(2)}"/>`);
          if (tall > 0.88 && lw > 30 && lh > 30) { // rooftop: helipad / tank
            const cx = lx + lw / 2, cy = ly + lh / 2, rr = Math.min(lw, lh) * 0.28;
            out.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" fill="#0f1520" stroke="#e8d9a8" stroke-opacity=".35" stroke-width="1.2"/>`,
              `<circle cx="${(lx + 5).toFixed(1)}" cy="${(ly + 5).toFixed(1)}" r="1.6" fill="#ff3b3b"/>`);
            glow.push(`<circle cx="${(lx + 5).toFixed(1)}" cy="${(ly + 5).toFixed(1)}" r="7" fill="#ff3b3b" opacity=".25"/>`);
          }
          if (rnd() < 0.22) { // neon sign on the street edge
            const c = pick(neon);
            const vx = rnd() < 0.5;
            const nw = vx ? 3 : Math.min(lw - 4, r(10, 26)), nh = vx ? Math.min(lh - 4, r(10, 26)) : 3;
            const nx = vx ? lx + (rnd() < 0.5 ? 0 : lw - 3) : lx + 2, ny = vx ? ly + 2 : ly + (rnd() < 0.5 ? 0 : lh - 3);
            out.push(`<rect x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" width="${nw.toFixed(1)}" height="${nh.toFixed(1)}" fill="${c}"/>`);
            glow.push(`<rect x="${(nx - 6).toFixed(1)}" y="${(ny - 6).toFixed(1)}" width="${(nw + 12).toFixed(1)}" height="${(nh + 12).toFixed(1)}" rx="6" fill="${c}" opacity=".22"/>`);
          }
        });
      }
    }
    // railway band (Shinjuku) or scramble crossing (Shibuya)
    const extra = [];
    if (!red) {
      const rx = W * 0.47;
      extra.push(`<rect x="${rx - 26}" y="-300" width="52" height="${H + 600}" fill="#0d1119"/>`,
        `<rect x="${rx - 26}" y="-300" width="52" height="${H + 600}" fill="url(#ev-rail)"/>`,
        `<line x1="${rx - 14}" y1="-300" x2="${rx - 14}" y2="${H + 300}" stroke="#7d8796" stroke-width="1.4"/><line x1="${rx - 6}" y1="-300" x2="${rx - 6}" y2="${H + 300}" stroke="#7d8796" stroke-width="1.4"/>`,
        `<line x1="${rx + 6}" y1="-300" x2="${rx + 6}" y2="${H + 300}" stroke="#7d8796" stroke-width="1.4"/><line x1="${rx + 14}" y1="-300" x2="${rx + 14}" y2="${H + 300}" stroke="#7d8796" stroke-width="1.4"/>`,
        `<rect x="${rx - 9}" y="${H * 0.18}" width="18" height="180" rx="3" fill="#2b6f4a" stroke="#9ff2c0" stroke-opacity=".5"/>`);
      glow.push(`<rect x="${rx - 20}" y="${H * 0.18 - 12}" width="40" height="204" rx="12" fill="#6bffb0" opacity=".12"/>`);
    } else {
      const ix = xs[Math.floor(xs.length / 2)], iy = ys[Math.floor(ys.length / 2)];
      extra.push(`<rect x="${ix - 70}" y="${iy - 60}" width="140" height="120" fill="#1b2230"/>`);
      for (let k = -1; k <= 1; k += 2) {
        extra.push(`<rect x="${ix - 64}" y="${iy + k * 44 - 7}" width="128" height="14" fill="url(#ev-zebra-v)"/>`,
          `<rect x="${ix + k * 54 - 7}" y="${iy - 52}" width="14" height="104" fill="url(#ev-zebra-h)"/>`);
      }
      extra.push(`<g transform="rotate(40 ${ix} ${iy})"><rect x="${ix - 70}" y="${iy - 6}" width="140" height="12" fill="url(#ev-zebra-v)"/></g>`,
        `<g transform="rotate(-40 ${ix} ${iy})"><rect x="${ix - 70}" y="${iy - 6}" width="140" height="12" fill="url(#ev-zebra-v)"/></g>`);
      glow.push(`<rect x="${ix - 120}" y="${iy - 110}" width="240" height="220" rx="60" fill="#ffd0a0" opacity=".08"/>`);
    }
    const lampSvg = lamps.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3"/>`).join('');
    const lampGlow = lamps.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/>`).join('');
    const rot = red ? 6 : -9;
    return `<svg class="ev-city" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="ev-win0" width="7" height="9" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="3" height="4" fill="#ffd98a"/></pattern>
        <pattern id="ev-win1" width="9" height="8" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="5" height="3" fill="#bfe6ff"/><rect x="1" y="5" width="2" height="2" fill="#ffe3a6" opacity=".6"/></pattern>
        <pattern id="ev-win2" width="16" height="14" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="3" height="3" fill="#ffcf6e"/><rect x="10" y="8" width="3" height="3" fill="#fff0c8"/><rect x="9" y="2" width="3" height="3" fill="#2a3448"/></pattern>
        <pattern id="ev-lot" width="10" height="20" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="1" height="20" fill="#5b6575" opacity=".5"/></pattern>
        <pattern id="ev-rail" width="52" height="7" patternUnits="userSpaceOnUse"><rect x="4" y="0" width="44" height="2" fill="#2a2f38"/></pattern>
        <pattern id="ev-zebra-v" width="10" height="14" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="5" height="14" fill="#e8e6dc" opacity=".75"/></pattern>
        <pattern id="ev-zebra-h" width="14" height="10" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="14" height="5" fill="#e8e6dc" opacity=".75"/></pattern>
      </defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="#060a12"/>
      <g transform="rotate(${rot} ${W / 2} ${H / 2})">
        ${out.join('')}${extra.join('')}
        <g fill="${red ? '#ffb070' : '#ffd27a'}" opacity=".18">${lampGlow}</g>
        <g fill="${red ? '#ffd0a0' : '#fff0c0'}">${lampSvg}</g>
        ${glow.join('')}
      </g>
    </svg>`;
  }

  /* ---------------- map ---------------- */
  function currentNode(area) {
    // the first open, uncleared node on this page; else the last cleared one
    const ns = area.nodes;
    const next = (f) => ns.find((n) => open(n) && !cleared(n.id) && f(n));
    return next((n) => n.type !== 'chest' && n.type !== 'elite') || next((n) => n.type === 'elite') || next(() => true) || ns.slice().reverse().find((n) => cleared(n.id)) || ns[0];
  }

  function pathD(a, b, lw, lh) {
    const x1 = a.x / 100 * lw, y1 = a.y / 100 * lh, x2 = b.x / 100 * lw, y2 = b.y / 100 * lh;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const bend = ((a.id.charCodeAt(a.id.length - 1) + b.id.charCodeAt(b.id.length - 1)) % 2 ? 1 : -1) * Math.min(60, len * 0.18);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${(mx - dy / len * bend).toFixed(1)} ${(my + dx / len * bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="#d9b65c" stroke="#3a2a0c" stroke-width="1.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#d9b65c" stroke-width="2.4"/><circle cx="12" cy="15" r="1.6" fill="#3a2a0c"/><path d="M12 15.5v2.6" stroke="#3a2a0c" stroke-width="1.4"/></svg>';
  const CHEST_SVG = '<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M5 17h38v19H5z" fill="#7a3b16" stroke="#2a1205" stroke-width="1.6"/><path d="M5 17c0-9 6-13 19-13s19 4 19 13z" fill="#a14f1c" stroke="#2a1205" stroke-width="1.6"/><path d="M5 17h38M5 24h38" stroke="#f0c75a" stroke-width="2.4"/><path d="M14 4.6v31.4M34 4.6v31.4" stroke="#f0c75a" stroke-width="2.4"/><rect x="20" y="19" width="8" height="10" rx="1.5" fill="#ffe28a" stroke="#5a3a0c" stroke-width="1.2"/><circle cx="24" cy="23.4" r="1.4" fill="#5a3a0c"/></svg>';
  const CHEST_OPEN_SVG = '<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M5 20h38v16H5z" fill="#5c2c10" stroke="#2a1205" stroke-width="1.6"/><path d="M7 20L11 4h26l4 16z" fill="#2e1607" stroke="#2a1205" stroke-width="1.6"/><path d="M5 26h38" stroke="#b8923a" stroke-width="2.2"/><path d="M14 20v16M34 20v16" stroke="#b8923a" stroke-width="2.2"/></svg>';
  const STORY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H11l-5 4v-4H4z" fill="#f4ecd8" stroke="#3a1d12" stroke-width="1.4"/><path d="M8 9h8M8 12h5" stroke="#8e2b22" stroke-width="1.6" stroke-linecap="round"/></svg>';

  function nodeHtml(n, cur) {
    const isOpen = open(n);
    const done = cleared(n.id);
    // two steps away from anything open: unexplored (magnifier) instead of a padlock
    const near = isOpen || (n.from || []).some((id) => { const p = nodeById(id); return p && open(p); });
    const st = done ? 'is-cleared' : isOpen ? 'is-open' : near ? 'is-locked' : 'is-hidden';
    const f = nodeFace(n);
    const stars = evState().cleared[n.id] || 0;
    const cls = `ev-node t-${n.type} ${st}${n === cur ? ' is-current' : ''}`;
    const pos = `left:${n.x}%;top:${n.y}%`;
    const title = esc(label(n) + ' · ' + n.name);
    let inner = '';
    if (n.type === 'chest') {
      inner = `<span class="ev-hex"><span class="ev-hex-in">${done ? CHEST_OPEN_SVG : CHEST_SVG}</span></span>`;
    } else if (n.type === 'boss') {
      inner = `<span class="ev-vortex"><i class="vx1"></i><i class="vx2"></i><i class="vx3"></i></span><span class="ev-flame"><i></i><i></i><i></i></span>
        <span class="ev-ring"><span class="ev-face">${f ? Art.img(f, 'portrait', { alt: '' }) : ''}</span></span><span class="ev-tag">BOSS</span>`;
    } else if (n.type === 'elite') {
      inner = `<span class="ev-shield"><span class="ev-face">${f ? Art.img(f, 'portrait', { alt: '' }) : ''}</span></span>`;
    } else {
      inner = `<span class="ev-ring"><span class="ev-face">${f ? Art.img(f, 'portrait', { alt: '' }) : ''}</span></span>${n.type === 'story' ? `<span class="ev-bubble">${STORY_SVG}</span>` : ''}`;
    }
    const lock = st === 'is-locked' || (st === 'is-hidden' && n.type === 'boss') ? `<span class="ev-lock">${LOCK_SVG}</span>` : st === 'is-hidden' ? '<span class="ev-lock is-search"><img src="assets/ui/jjk/glyph_search.webp" alt=""></span>' : '';
    const plate = n.type === 'chest' ? '' : `<span class="ev-plate"><b>${n.type === 'story' ? 'STORY' : esc(label(n))}</b>${isBattle(n) ? `<span class="ev-stars">${[1, 2, 3].map((i) => `<i class="${i <= stars ? 'on' : ''}">★</i>`).join('')}</span>` : ''}</span>`;
    return `<button class="${cls}" type="button" style="${pos}" data-node="${esc(n.id)}" title="${title}" aria-label="${title}${done ? ' (cleared)' : isOpen ? '' : ' (locked)'}">${inner}${lock}${plate}</button>`;
  }

  function avatarHtml(cur) {
    const s = Save.get();
    const team = s.teams[s.activeTeam] || s.teams[0];
    const id = (s.profile.homeUnit && Rules.unitView(s.profile.homeUnit) ? s.profile.homeUnit : null) || Rules.teamIds(team)[0] || Object.keys(s.units)[0];
    const v = id && Rules.unitView(id);
    if (!v) return '';
    return `<div class="ev-avatar${cur.type === 'boss' ? ' at-boss' : ''}" style="left:${cur.x}%;top:${cur.y}%" aria-hidden="true"><span class="ev-av-pin">${Art.img(v.def, 'portrait', { alt: '' })}</span><span class="ev-av-shadow"></span></div>`;
  }

  function drawMap() {
    const area = EV.areas[areaIdx];
    const cur = currentNode(area);
    $('#ev-world').className = 'ev-world tint-' + (area.tint || 'blue');
    $('#ev-world').innerHTML = `
      <div class="ev-photo" style="background-image:url('${esc(area.art || EV.bg)}')"></div>
      ${citySvg(area)}
      <div class="ev-haze"></div>
      <div class="ev-layer" id="ev-layer"><svg class="ev-paths" id="ev-paths" aria-hidden="true"></svg>
      ${area.nodes.map((n) => nodeHtml(n, cur)).join('')}
      ${avatarHtml(cur)}</div>`;
    $('#ev-area').textContent = area.name;
    $('#ev-area-k').textContent = area.kanji || '';
    paintChrome();
    sizeWorld();
    centerOn(cur);
  }

  function paintChrome() {
    const e = evState();
    const s = Save.get();
    const total = allNodes().length;
    const n = Object.keys(e.cleared).filter((id) => nodeById(id)).length;
    $('#ev-cleared').innerHTML = `Stages Cleared: <b>${n}</b>/${total}`;
    $$('.ev-tokens').forEach((el) => { el.textContent = fmt(e.tokens); });
    const c = claimable().length;
    const badge = $('#ev-mis-badge');
    badge.textContent = c;
    badge.hidden = !c;
    const ap = Rules.staminaNow(s);
    $('#ev-ap-bar').style.width = Math.min(100, ap.cur / ap.max * 100) + '%';
    $('#ev-rank').textContent = s.profile.rank;
    const fb = $('#ev-formidable');
    fb.classList.toggle('is-ready', !!e.cleared[EV.formidable.unlock]);
  }

  /* The node layer sits right of the side buttons and above the foot plates,
   * at least as big as the screen and never squashed below ~1.6:1 (a portrait
   * phone pans sideways inside #ev-map). Paths are drawn in layer pixels. */
  function sizeWorld() {
    const map = $('#ev-map'), world = $('#ev-world'), layer = $('#ev-layer');
    if (!map || !world || !layer) return;
    const vw = map.clientWidth, vh = map.clientHeight;
    const side = $('.ev-side');
    const padL = side ? Math.round(side.getBoundingClientRect().right) + 4 : 16, padR = 12, padT = 0, padB = Math.min(46, vh * 0.08);
    let lw = vw - padL - padR, lh = vh - padT - padB;
    lw = Math.max(lw, lh * 1.6);
    lh = Math.max(lh, lw * 0.45);
    world.style.width = Math.round(lw + padL + padR) + 'px';
    world.style.height = Math.round(lh + padT + padB) + 'px';
    Object.assign(layer.style, { left: padL + 'px', top: padT + 'px', width: Math.round(lw) + 'px', height: Math.round(lh) + 'px' });
    world.style.setProperty('--ns', Math.round(Math.max(46, Math.min(80, Math.min(lh, lw * 0.5625) * 0.09))) + 'px');
    drawPaths(Math.round(lw), Math.round(lh));
  }
  function drawPaths(lw, lh) {
    const area = EV.areas[areaIdx];
    const svg = $('#ev-paths');
    const out = [];
    area.nodes.forEach((n) => (n.from || []).forEach((pid) => {
      const p = area.nodes.find((x) => x.id === pid);
      if (!p) return;
      const state = cleared(n.id) ? 'done' : open(n) ? 'open' : 'locked';
      out.push(`<path class="ev-path is-${state}" d="${pathD(p, n, lw, lh)}"/>`);
    }));
    svg.setAttribute('viewBox', `0 0 ${lw} ${lh}`);
    svg.innerHTML = out.join('');
  }
  function centerOn(n) {
    const map = $('#ev-map'), layer = $('#ev-layer');
    if (!map || !layer || !n) return;
    map.scrollLeft = Math.max(0, layer.offsetLeft + n.x / 100 * layer.offsetWidth - map.clientWidth / 2);
    map.scrollTop = Math.max(0, layer.offsetTop + n.y / 100 * layer.offsetHeight - map.clientHeight / 2);
  }

  /* ---------------- node actions ---------------- */
  function onNode(id) {
    const n = nodeById(id);
    if (!n) return;
    UI.sfx('tap');
    if (!open(n)) {
      const prev = (n.from || []).map(nodeById).filter(Boolean);
      UI.toast(prev.length ? 'Locked — clear ' + prev.map((p) => label(p) + ' ' + p.name).join(' or ') + ' first.' : 'Locked.', 'bad');
      return;
    }
    if (n.type === 'chest') return openChest(n);
    if (n.type === 'story') return playStory(n);
    prepare(n);
  }

  function openChest(n) {
    if (cleared(n.id)) { UI.toast('Already opened: ' + giveText(n.reward)); return; }
    Save.update((s) => { applyGive(s, n.reward); Rules.eventStateOf(s, EV.id).cleared[n.id] = 1; });
    UI.sfx('rare');
    const btn = $(`.ev-node[data-node="${n.id}"]`);
    if (btn) btn.classList.add('is-popping');
    const m = UI.modal(`<div class="ev-chest-open">${CHEST_OPEN_SVG}<div class="ev-gives">${giveHtml(n.reward)}</div></div>
      <div class="modal-actions"><button class="jjk-btn is-primary" type="button" data-a="ok">OK</button></div>`, { title: n.name, sub: 'TREASURE OBTAINED', cls: 'is-small', onClose: drawMap });
    m.el.querySelector('[data-a="ok"]').addEventListener('click', () => m.close());
  }

  function playStory(n) {
    let i = 0;
    const first = !cleared(n.id);
    const m = UI.modal('<div class="ev-story" id="ev-story"></div>', { title: n.name, sub: label(n) + ' · STORY', cls: 'ev-story-modal', onClose: finish });
    const box = m.el.querySelector('#ev-story');
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (first && i >= n.lines.length - 1) {
        Save.update((s) => { applyGive(s, n.reward); Rules.eventStateOf(s, EV.id).cleared[n.id] = 1; });
        UI.toast('Story cleared: ' + giveText(n.reward), 'good');
      }
      drawMap();
    }
    const paint = () => {
      const [ref, name, text] = n.lines[i];
      const f = face(ref);
      box.innerHTML = `<div class="ev-story-art">${f ? Art.img(f, 'portrait', { alt: '', eager: true }) : ''}</div>
        <div class="pp-dialog ev-dlg"><span class="dlg-name">${esc(name)}</span><p class="dlg-text">${esc(text)}</p></div>
        <div class="ev-story-foot"><small>${i + 1} / ${n.lines.length}</small><span class="grow"></span>
          <button class="jjk-btn is-small" type="button" data-a="skip">Skip</button>
          <button class="jjk-btn is-small is-primary" type="button" data-a="next">${i < n.lines.length - 1 ? 'Next ▸' : first ? 'Finish · claim' : 'Close'}</button></div>`;
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'skip') i = n.lines.length - 1;
      else if (i < n.lines.length - 1) { i++; paint(); return; }
      if (b.dataset.a === 'next' || b.dataset.a === 'skip') { i = n.lines.length - 1; m.close(); }
    });
    paint();
  }

  function prepare(n) {
    let pick = Save.get().activeTeam;
    const m = UI.modal('<div id="prep"></div>', { title: label(n) + ' · ' + n.name, sub: n.type === 'boss' ? 'BOSS STAGE' : n.type === 'elite' ? 'ELITE STAGE' : 'EVENT STAGE', cls: 'ev-prep-modal' });
    const body = m.el.querySelector('#prep');
    const foes = [];
    n.waves.flat().forEach((w) => { if (!foes.some((x) => x.enemy === w.enemy)) foes.push(w); });
    const done = cleared(n.id);
    const paint = () => {
      const s = Save.get();
      const stam = Rules.staminaNow(s);
      const t = s.teams[pick];
      const cnt = Rules.teamIds(t).length;
      const fc = Object.assign({}, n.firstClear);
      body.innerHTML = `<p class="muted ev-prep-desc">${esc(n.desc || '')} Clear Rank: ${STAR_TEXT}.</p>
        <div class="ev-prep-row"><div class="ev-foes">${foes.map((w) => { const f = face('enemy:' + w.enemy); return `<span class="ev-foe${w.enemy.startsWith('boss_') ? ' is-boss' : ''}" title="${esc(f ? f.name : '')}">${f ? Art.img(f, 'portrait', { alt: '' }) : ''}<small>Lv${w.level}</small></span>`; }).join('')}</div>
          <div class="ev-prep-meta"><span>${n.waves.length} waves</span><span>Rec. power <b>${fmt(n.recommendedPower)}</b></span></div></div>
        <div class="ev-prep-rw"><b>Rewards</b>${giveHtml({ medals: n.rewards.medals, yen: n.rewards.yen })}${(n.rewards.drops || []).map((d) => `<span class="ev-chip">${UI.itemIcon(d.item, ITEMS)}<b>×${d.qty}</b><small>${d.chance}%</small></span>`).join('')}</div>
        <div class="ev-prep-rw${done ? ' is-done' : ''}"><b>First clear</b>${giveHtml(fc)}${done ? '<em>Claimed</em>' : ''}</div>
        <div class="team-choice">${s.teams.map((tm, i) => `<button type="button" data-team="${i}" class="pp-card${i === pick ? ' active' : ''}"><b>${esc(tm.name)}</b><small>Power ${fmt(Rules.teamPower(tm))}</small>
          <div class="mini">${tm.slots.concat([tm.support]).map((id, j) => { const v = id && Rules.unitView(id); return `<span class="${j === 4 ? 'sup' : ''}">${v ? Art.img(v.def, 'portrait', { alt: '' }) : ''}</span>`; }).join('')}</div></button>`).join('')}</div>
        <div class="row wrap"><span>${UI.STAM_SVG} Cost <b>${n.stamina}</b> · you have <b class="${stam.cur < n.stamina ? '' : 'gold'}">${stam.cur}</b></span>
          <span class="grow"></span>
          <a class="jjk-btn is-small" href="teams.html">Edit teams</a>
          ${stam.cur < n.stamina ? '<a class="jjk-btn is-small" href="shop.html#stamina">Refill AP</a>' : ''}
          <button class="jjk-btn is-primary" id="go" type="button" ${cnt && stam.cur >= n.stamina ? '' : 'disabled'}>Start · ${n.stamina} ${UI.icon('bolt')}</button></div>
        ${cnt ? '' : '<p class="msg is-bad">This team has no front units.</p>'}`;
    };
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-team]');
      if (b) { pick = +b.dataset.team; paint(); return; }
      if (e.target.closest('#go')) {
        Save.update((s) => { s.activeTeam = pick; });
        location.href = 'battle.html?stage=' + encodeURIComponent(n.id) + '&team=' + pick;
      }
    });
    paint();
  }

  /* ---------------- side panels ---------------- */
  function openMissions() {
    const m = UI.modal('<div id="ev-mis"></div>', { title: 'Event Missions', sub: EV.name.toUpperCase(), cls: 'ev-mis-modal', onClose: paintChrome });
    const box = m.el.querySelector('#ev-mis');
    const paint = () => {
      const e = evState();
      const list = EV.missions.slice().sort((a, b) => {
        const rank = (x) => { const [p, g] = missionProgress(x); return e.missions[x.id] ? 2 : p >= g ? 0 : 1; };
        return rank(a) - rank(b);
      });
      const c = claimable().length;
      box.innerHTML = `<div class="ev-mis-top"><span>${medalImg()} <b class="ev-tokens">${fmt(e.tokens)}</b> ${esc(EV.currency.name)}s · earned ${fmt(e.earned)}</span><span class="grow"></span>
        <button class="jjk-btn is-small is-primary" type="button" data-claim-all ${c ? '' : 'disabled'}>Claim all${c ? ' (' + c + ')' : ''}</button></div>
        <div class="ev-mis-list">${list.map((x) => {
          const [p, g] = missionProgress(x);
          const got = !!e.missions[x.id];
          const ready = p >= g && !got;
          return `<div class="ev-mis pp-card${got ? ' is-got' : ''}${ready ? ' is-ready' : ''}">
            <div class="grow"><b>${esc(x.text)}</b><div class="ev-mis-prog"><div class="bar"><i style="width:${(p / g * 100).toFixed(1)}%"></i></div><small>${fmt(p)}/${fmt(g)}</small></div></div>
            <div class="ev-gives">${giveHtml(x.reward)}</div>
            ${got ? '<img class="ev-stamp" src="assets/ui/jjk/stamp_claimed.webp" alt="Claimed">' : `<button class="jjk-btn is-small${ready ? ' is-primary' : ''}" type="button" data-claim="${esc(x.id)}" ${ready ? '' : 'disabled'}>${ready ? 'Claim' : 'Go'}</button>`}
          </div>`;
        }).join('')}</div>`;
    };
    const claim = (ids) => {
      const got = { medals: 0, cubes: 0, yen: 0, items: {} };
      Save.update((s) => {
        const e = Rules.eventStateOf(s, EV.id);
        ids.forEach((id) => {
          const x = EV.missions.find((q) => q.id === id);
          if (!x || e.missions[id]) return;
          applyGive(s, x.reward);
          e.missions[id] = true;
          got.medals += x.reward.medals || 0; got.cubes += x.reward.cubes || 0; got.yen += x.reward.yen || 0;
          Object.entries(x.reward.items || {}).forEach(([k, n]) => { got.items[k] = (got.items[k] || 0) + n; });
        });
      });
      UI.sfx('win');
      UI.toast('Mission rewards: ' + giveText(got), 'good');
      paint(); paintChrome();
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-claim]');
      if (b && !b.disabled) return claim([b.dataset.claim]);
      if (e.target.closest('[data-claim-all]')) claim(claimable().map((x) => x.id));
    });
    paint();
  }

  function openExchange() {
    const m = UI.modal('<div id="ev-ex"></div>', { title: 'Exchange', sub: 'TRADE ' + EV.currency.name.toUpperCase() + 'S', cls: 'ev-ex-modal', onClose: paintChrome });
    const box = m.el.querySelector('#ev-ex');
    const nameOf = (g) => g.cubes ? fmt(g.cubes) + ' Cubes' : g.yen ? fmt(g.yen) + ' JP' : g.ap ? g.ap + ' AP' : Object.entries(g.items || {}).map(([k, n]) => (n > 1 ? n + '× ' : '') + (ITEMS[k] ? ITEMS[k].name : k)).join(', ');
    const iconOf = (g) => g.cubes ? '<img class="item-ic" src="assets/pp/currency/cubes.webp" alt="">' : g.yen ? '<img class="item-ic" src="assets/pp/currency/jp.webp" alt="">' : g.ap ? UI.STAM_SVG.replace('cur-ic', 'item-ic') : UI.itemIcon(Object.keys(g.items)[0], ITEMS);
    const paint = () => {
      const e = evState();
      box.innerHTML = `<div class="ev-mis-top"><span>${medalImg()} <b class="ev-tokens">${fmt(e.tokens)}</b> ${esc(EV.currency.name)}s</span></div>
        <div class="ev-ex-grid">${EV.exchange.map((x) => {
          const left = x.stock - (e.bought[x.id] || 0);
          const can = left > 0 && e.tokens >= x.price;
          return `<div class="ev-ex pp-card${left > 0 ? '' : ' is-out'}">
            <span class="ev-ex-ic">${iconOf(x.give)}</span>
            <b class="ev-ex-name">${esc(nameOf(x.give))}</b>
            <small class="ev-ex-stock">${left > 0 ? 'Stock ' + left + '/' + x.stock : 'SOLD OUT'}</small>
            <button class="jjk-btn is-small${can ? ' is-primary' : ''}" type="button" data-buy="${esc(x.id)}" ${can ? '' : 'disabled'}>${medalImg()} ${fmt(x.price)}</button>
          </div>`;
        }).join('')}</div>`;
    };
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-buy]');
      if (!b || b.disabled) return;
      const x = EV.exchange.find((q) => q.id === b.dataset.buy);
      const ok = Save.update((s) => {
        const e = Rules.eventStateOf(s, EV.id);
        if (e.tokens < x.price || (e.bought[x.id] || 0) >= x.stock) return false;
        e.tokens -= x.price;
        e.bought[x.id] = (e.bought[x.id] || 0) + 1;
        const g = Object.assign({}, x.give); delete g.medals;
        applyGive(s, g);
        return true;
      });
      if (ok) { UI.sfx('pull'); UI.toast('Exchanged: ' + nameOf(x.give), 'good'); } else UI.toast('Not enough ' + EV.currency.name + 's.', 'bad');
      paint(); paintChrome();
    });
    paint();
  }

  function openMove() {
    const m = UI.modal(`<div class="ev-areas">${EV.areas.map((a, i) => {
      const ok = areaOpen(a);
      const n = a.nodes.filter((x) => cleared(x.id)).length;
      return `<button class="pp-parch ev-area-card${i === areaIdx ? ' active' : ''}${ok ? '' : ' is-locked'}" type="button" data-area="${i}" ${ok ? '' : 'disabled'}>
        <span class="parch-art" style="background-image:url('${esc(a.art || EV.bg)}')"></span>
        <span class="ev-area-k">${esc(a.kanji || '')}</span><span class="parch-label">${esc(a.name)}</span>
        <span class="ev-area-prog">${ok ? 'Cleared ' + n + '/' + a.nodes.length : 'LOCKED · clear ' + esc(label(nodeById(a.nodes[0].from[0]))) + ' first'}</span></button>`;
    }).join('')}</div>`, { title: 'Map Movement', sub: 'CHOOSE AN AREA', cls: 'is-small ev-move-modal' });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-area]');
      if (!b || b.disabled) return;
      areaIdx = +b.dataset.area;
      history.replaceState(null, '', '#' + EV.areas[areaIdx].id);
      m.close();
      drawMap();
    });
  }

  function openHelp() {
    UI.modal(`<div class="help-text ev-help"><p><b>${esc(EV.name)}</b> — ${esc(EV.desc)}</p>
      <ul><li><b>Battle nodes</b> cost AP and award ${esc(EV.currency.name)}s every clear, plus a first-clear bonus.</li>
      <li><b>Shield nodes</b> are elite stages: optional, harder, and worth more medals.</li>
      <li><b>Gold hexagons</b> are treasure chests; <b>speech bubbles</b> are story scenes. Both resolve instantly.</li>
      <li>Clearing a node opens the nodes joined to it. A padlock means the next step; a magnifier means unexplored.</li>
      <li>Defeat the swirling <b>boss</b> to unlock the next area. Use <b>Map Movement</b> to switch areas.</li>
      <li><b>Event Missions</b> reward milestones; the <b>Exchange</b> trades medals for Training Lights, Draw Tickets, Gacha Point Cards, Cubes and more (limited stock).</li></ul></div>`,
    { title: 'Event Map · Help', cls: 'is-small' });
  }

  function openFormidable() {
    const f = EV.formidable;
    const ok = cleared(f.unlock);
    UI.toast(ok ? f.name + ' opens in a later update.' : f.name + ' is locked — defeat the final boss (' + label(nodeById(f.unlock)) + ') first.', ok ? '' : 'bad');
  }

  /* ---------------- shell ---------------- */
  function header() {
    return `<header class="jjk-page-header ev-header"><a class="jjk-icon-btn jjk-back" href="missions.html" aria-label="Back">${UI.icon('back')}</a>
      <div class="ev-titles"><h1 class="jjk-title-plate"><span>Event Map</span></h1>
      <div class="ev-area-name"><b id="ev-area">—</b><small id="ev-area-k"></small></div></div></header>`;
  }

  function render() {
    const right = $('.topbar .top-right');
    right.insertAdjacentHTML('afterbegin', `<div class="ev-hud">
      <span class="ev-rank" title="Player Rank"><small>Rank</small><span class="ev-rank-em"><img src="assets/ui/jjk/rank_emblem.webp" alt=""><b id="ev-rank">1</b></span></span>
      <a class="ev-ap" href="shop.html#stamina" title="AP">${UI.STAM_SVG}<span class="ev-ap-in"><span class="ev-ap-bar"><i id="ev-ap-bar"></i></span><b id="hud-stam">0/0</b><small id="hud-stam-t"></small></span><i class="hud-plus">${UI.icon('plus')}</i></a>
      <span class="ev-cur" title="${esc(EV.currency.name)}s">${medalImg()}<b class="ev-tokens">0</b></span>
      <button class="pp-stone help-btn" id="ev-help" type="button" aria-label="Help" title="Help">?</button></div>`);
    $('#main').innerHTML = `<div class="ev-map" id="ev-map"><div class="ev-world" id="ev-world"></div></div>
      <div class="ev-vignette" aria-hidden="true"></div>
      <nav class="ev-side" aria-label="Event">
        <button class="ev-side-btn" id="ev-formidable" type="button"><span class="ev-orb is-boss"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c-6 0-10 4.5-10 10 0 3 1.2 5 2.8 6.6L8 26l4-2 1.5 3L16 25l2.5 2 1.5-3 4 2-.8-6.4C24.8 18 26 16 26 13c0-5.5-4-10-10-10z" fill="#2a0d14" stroke="#ff8b7a" stroke-width="1.4"/><path d="M10.5 13.5l4 1.5-1 2.5zM21.5 13.5l-4 1.5 1 2.5z" fill="#ff3b30"/><path d="M8 7L4 3M24 7l4-4" stroke="#ff8b7a" stroke-width="1.6" stroke-linecap="round"/></svg><span class="ev-orb-lock">${LOCK_SVG}</span></span><span class="ev-side-l">Formidable<br>Battle</span></button>
        <button class="ev-side-btn" id="ev-missions" type="button"><span class="ev-orb"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="4" width="18" height="24" rx="2" fill="#f4ecd8" stroke="#3a2a16" stroke-width="1.4"/><rect x="12" y="2.5" width="8" height="4" rx="1" fill="#b69a5c" stroke="#3a2a16"/><path d="M10 12l2 2 3-3.5M10 18l2 2 3-3.5M10 24l2 2 3-3.5" stroke="#8e2b22" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M17 13h5M17 19h5M17 25h4" stroke="#3a2a16" stroke-width="1.5" stroke-linecap="round"/></svg></span><i class="ev-badge" id="ev-mis-badge" hidden>0</i><span class="ev-side-l">Event<br>Mission</span></button>
        <button class="ev-side-btn" id="ev-exchange" type="button"><span class="ev-orb"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4v23M9 28h14M6 8h20" stroke="#e6d29a" stroke-width="2" stroke-linecap="round"/><path d="M6 8l-4 9h8zM26 8l-4 9h8z" fill="none" stroke="#e6d29a" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 17a4 2.4 0 0 0 8 0zM22 17a4 2.4 0 0 0 8 0z" fill="#d9b65c"/><circle cx="16" cy="4.5" r="2" fill="#d9b65c"/></svg></span><span class="ev-side-l">Exchange</span><span class="ev-side-cur">${medalImg()}<b class="ev-tokens">0</b></span></button>
      </nav>
      <div class="ev-info"><span class="ev-info-k">${esc(EV.kanji)}</span><b>${esc(EV.name)}</b><small>${esc(EV.period)}</small></div>
      <div class="ev-foot">
        <button class="ev-move" id="ev-move" type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 8l8-3 8 3 8-3v19l-8 3-8-3-8 3z" fill="#e8e0cb" stroke="#3a2a16" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 5v19M20 8v19" stroke="#3a2a16" stroke-width="1.2"/><circle cx="23.5" cy="13" r="3.2" fill="#b13a2c"/><path d="M23.5 16.2l-2.2 3.5h4.4z" fill="#b13a2c"/></svg><span>Map Movement</span></button>
        <div class="ev-cleared" id="ev-cleared"></div>
      </div>`;
    UI.paintHud();
    $('#ev-help').addEventListener('click', openHelp);
    $('#ev-missions').addEventListener('click', () => { UI.sfx('tap'); openMissions(); });
    $('#ev-exchange').addEventListener('click', () => { UI.sfx('tap'); openExchange(); });
    $('#ev-formidable').addEventListener('click', openFormidable);
    $('#ev-move').addEventListener('click', () => { UI.sfx('tap'); openMove(); });
    $('#ev-world').addEventListener('click', (e) => {
      if (dragged) return;
      const b = e.target.closest('[data-node]');
      if (b) onNode(b.dataset.node);
    });
    dragPan($('#ev-map'));
    window.addEventListener('resize', () => { sizeWorld(); });
    window.addEventListener('hashchange', () => {
      const i = EV.areas.findIndex((x) => x.id === location.hash.slice(1));
      if (i >= 0 && i !== areaIdx && areaOpen(EV.areas[i])) { areaIdx = i; drawMap(); }
    });
    Save.onChange(() => { if ($('#ev-cleared')) paintChrome(); });
    setInterval(() => { if ($('#ev-ap-bar')) { const ap = Rules.staminaNow(); $('#ev-ap-bar').style.width = Math.min(100, ap.cur / ap.max * 100) + '%'; } }, 1000);

    // area from the hash, else the furthest open area
    const hash = location.hash.slice(1);
    const hi = EV.areas.findIndex((a) => a.id === hash);
    if (hi >= 0 && areaOpen(EV.areas[hi])) areaIdx = hi;
    else {
      const fromNode = EV.areas.findIndex((a) => a.nodes.some((n) => n.id === hash));
      areaIdx = fromNode >= 0 && areaOpen(EV.areas[fromNode]) ? fromNode : Math.max(0, EV.areas.map(areaOpen).lastIndexOf(true));
    }
    drawMap();
    if (hash === 'exchange') openExchange();   // from the Exchange hub's Event card
  }

  /* mouse drag to pan (touch scrolls natively) */
  let dragged = false;
  function dragPan(map) {
    let sx = 0, sy = 0, sl = 0, st = 0, down = false;
    map.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; dragged = false; sx = e.clientX; sy = e.clientY; sl = map.scrollLeft; st = map.scrollTop;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) { dragged = true; map.classList.add('is-dragging'); }
      if (dragged) { map.scrollLeft = sl - dx; map.scrollTop = st - dy; }
    });
    window.addEventListener('pointerup', () => { down = false; map.classList.remove('is-dragging'); setTimeout(() => { dragged = false; }, 0); });
  }

  UI.boot({
    back: 'missions.html', nav: false, hud: false, header,
    data: ['characters', 'enemies', 'items', 'events'],
    init: () => Promise.all([Data.load('events'), Data.load('items')]).then(([E, it]) => {
      EV = E.events[0];
      ITEMS = it.items;
      render();
    }),
  });
  // test hook
  window.__event = () => ({ ev: EV, state: evState(), area: areaIdx });
})();
