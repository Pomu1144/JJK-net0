/* settings.html — Audio, Display, Account, Data and Portal tabs. */
(function () {
  'use strict';
  const { $, $$, esc, fmt } = UI;
  const TABS = [
    ['audio', 'Audio'], ['display', 'Display'], ['account', 'Account'], ['data', 'Data'], ['portal', 'Portal'],
  ];
  let tab = 'audio';
  const picked = new Set();

  const toggle = (key, on) => `<button class="toggle" type="button" role="switch" aria-checked="${!!on}" data-toggle="${key}"><span class="tg-on">ON</span><span class="tg-off">OFF</span></button>`;
  const setMsg = (id, text, kind) => { const el = document.getElementById(id); if (el) { el.textContent = text || ''; el.className = 'msg' + (kind ? ' is-' + kind : ''); } };
  /** gold fill of a range slider up to its thumb */
  const paintRange = (el) => { if (el) el.style.setProperty('--v', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); };
  const sHead = (title, jp) => `<h3 class="pt-h"><span class="pt-h-t">${title}</span>${jp ? `<small>${jp}</small>` : ''}<i class="pt-h-rule" aria-hidden="true"></i></h3>`;

  function audioTab(s) {
    return `${sHead('Sound', '音響')}
      <div class="set-row"><label>Sound effects<small>Hits, summons and menu taps (generated in the browser)</small></label>${toggle('sfx', s.settings.sfx)}</div>
      <div class="set-row"><label for="vol">Volume<small>Effects loudness</small></label><span class="set-range"><input type="range" id="vol" min="0" max="100" step="5" value="${s.settings.volume}" style="--v:${s.settings.volume}%"><output id="vol-out" for="vol">${s.settings.volume}%</output></span></div>
      <div class="set-row"><label>Music<small>No soundtrack ships with this fan build; the setting is kept for later.</small></label>${toggle('music', s.settings.music)}</div>`;
  }

  function displayTab(s) {
    return `${sHead('Battle & Motion', '表示')}
      <div class="set-row"><span class="lbl">Battle speed<small>Animation speed in battle</small></span>
        <span class="seg" role="radiogroup" aria-label="Battle speed">${[1, 2, 3].map((n) => `<button class="pt-segb${s.settings.battleSpeed === n ? ' is-on' : ''}" role="radio" aria-checked="${s.settings.battleSpeed === n}" data-speed="${n}" type="button">×${n}</button>`).join('')}</span></div>
      <div class="set-row"><label>Auto battle by default<small>Units pick their own actions (toggle any time in battle)</small></label>${toggle('autoBattle', s.settings.autoBattle)}</div>
      <div class="set-row"><label>Reduce motion<small>Shorter animations everywhere</small></label>${toggle('reduceMotion', s.settings.reduceMotion)}</div>`;
  }

  function accountTab(s) {
    return `${sHead('Sorcerer', '術師')}
      <div class="set-row"><label for="acct-name">Sorcerer name<small>2–24 letters</small></label>
        <span class="set-field"><input class="pt-amt-in set-in" id="acct-name" maxlength="24" value="${esc(s.profile.name)}"><button class="jjk-btn is-primary is-small" id="name-save" type="button">Save</button></span></div>
      <div class="set-stats">
        <div><small>Rank</small><b>${s.profile.rank}</b></div>
        <div><small>Units</small><b>${Object.keys(s.units).length}</b></div>
        <div><small>Battles won</small><b>${s.stats.wins}<i>/${s.stats.battles}</i></b></div>
        <div><small>Summons</small><b>${s.stats.pulls}</b></div>
        <div><small>Started</small><b class="is-date">${new Date(s.created).toLocaleDateString()}</b></div>
      </div>
      ${sHead('Start Over', '初期化')}
      <div class="set-row is-danger"><span class="lbl">Reset game<small>Deletes this game's save (only keys starting with jjk_). Other games on this site are untouched.</small></span>
        <button class="jjk-btn is-red is-small" id="reset" type="button">Reset game</button></div>
      <p class="msg" id="acct-msg"></p>`;
  }

  function dataTab() {
    return `${sHead('Export', '保存')}
      <p class="pt-note">A JSON backup of your whole save. Keep it somewhere safe or move it to another browser.</p>
      <div class="pt-actions"><button class="pp-stone pt-btn" id="exp-show" type="button">Show JSON</button><button class="jjk-btn is-primary pt-btn" id="exp-dl" type="button">Download file</button><button class="pp-stone pt-btn" id="exp-copy" type="button">Copy</button></div>
      <textarea class="pt-code" id="exp-out" rows="4" readonly hidden></textarea>
      ${sHead('Import', '復元')}
      <p class="pt-note">Paste a backup or choose a file. This replaces your current save.</p>
      <textarea class="pt-code" id="imp-in" rows="3" placeholder='{"game":"jjk-net0", ...}' spellcheck="false"></textarea>
      <div class="pt-actions"><label class="pp-stone pt-btn set-file">Choose file<input type="file" id="imp-file" accept="application/json,.json"></label><span class="grow"></span><button class="jjk-btn is-primary pt-big" id="imp-go" type="button">Import save</button></div>
      <p class="msg" id="data-msg" role="status"></p>`;
  }

  function cardMini(c) {
    // a Portal card shown as a roster card (art may be from another game)
    const def = { id: 'card_' + c.id, name: c.name, title: c.title, element: c.element, rarity: c.rarity, art: c.art, kanji: '' };
    return UI.unitTile(def, { tag: 'div', level: c.level, title: c.name + ' · ' + c.sourceGame, badge: c.sourceGame !== PortalPort.GAME_ID ? '<span class="uc-badge badge is-guest">' + esc(c.sourceGame) + '</span>' : '' });
  }

  /* ---- Portal tab building blocks ---- */
  let wCur = 'coins';          // currency picked in the wallet toggle
  let wAmt = '';               // amount typed in the wallet stepper (kept across redraws)
  const CUR = { coins: { label: 'JP', icon: 'jp', local: 'yen' }, premium: { label: 'Cubes', icon: 'cubes', local: 'cubes' } };
  const curIcon = (k) => `<img class="pt-ic" src="assets/pp/currency/${CUR[k].icon}.webp" alt="" aria-hidden="true" draggable="false">`;
  const head = (title, jp, extra) => `<h3 class="pt-h"><span class="pt-h-t">${title}</span>${jp ? `<small>${jp}</small>` : ''}<i class="pt-h-rule" aria-hidden="true"></i>${extra || ''}</h3>`;
  // portal emblem: a ring of runes around a gate (drawn inline, coloured by state)
  const EMBLEM = `<svg class="pt-emblem" viewBox="0 0 64 64" aria-hidden="true">
      <defs><radialGradient id="pt-core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="var(--pt-glow-hi)"/><stop offset=".55" stop-color="var(--pt-glow)"/><stop offset="1" stop-color="var(--pt-glow)" stop-opacity="0"/></radialGradient></defs>
      <circle cx="32" cy="32" r="30" class="e-disc"/>
      <g class="e-spin"><circle cx="32" cy="32" r="26" class="e-ring" stroke-dasharray="3 4"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((d) => `<rect x="30.6" y="3.5" width="2.8" height="6" rx=".6" transform="rotate(${d} 32 32)" class="e-tick"/>`).join('')}</g>
      <circle cx="32" cy="32" r="20" class="e-ring2"/>
      <circle cx="32" cy="32" r="17" fill="url(#pt-core)" class="e-core"/>
      <path d="M24 44V27a8 8 0 0 1 16 0v17" class="e-gate"/><path d="M21 44h22" class="e-gate"/>
    </svg>`;

  function holder(title, vals, ids, off) {
    const row = (k) => `<div class="pt-cur${off ? ' is-off' : ''}"${ids ? ` id="${ids[k]}"` : ''}>${curIcon(k)}<b>${off ? '—' : fmt(vals[k])}</b><small>${CUR[k].label}</small></div>`;
    return `<div class="pt-holder${off ? ' is-off' : ''}"><h5>${title}</h5>${row('coins')}${row('premium')}</div>`;
  }

  function portalTab(s) {
    const sess = PortalPort.session;
    const own = Rules.ownedList().filter((v) => !v.def.guest).sort((a, b) => b.power - a.power);
    const cards = sess ? sess.party.cards : [];
    const pend = PortalPort.pendingTx;
    const MAX = PortalSDK.MAX_PARTY;
    const dis = sess ? '' : 'disabled';
    const localVals = { coins: s.currency.yen, premium: s.currency.cubes };
    return `<div class="pt">
      <div class="portal-status${sess ? ' is-on' : ''}">
        <span class="pt-emb">${EMBLEM}</span>
        <div class="pt-st-tx">
          <span class="pt-pill" title="Portal link"><i class="dot"></i>${sess ? 'LINK ON' : 'LINK OFF'}</span>
          <b>${sess ? 'Connected to Portal — party of ' + cards.length : 'Standalone'}</b>
          <small>${sess ? 'Playing as ' + esc(sess.player.name) + ' · party cards join your roster, level-ups are reported back.' : 'Not inside the Portal hub — characters can still travel by Portal Code.'}</small>
        </div>
        ${sess ? '<button class="jjk-btn is-small pt-exit" type="button" id="p-exit">Return to Portal</button>' : ''}
      </div>

      ${sess ? `<section class="pt-sec">${head('Incoming Party', '受取', `<span class="pt-count"><b>${cards.length}</b>/${MAX}</span>`)}
        ${cards.length ? `<div class="pt-units is-static">${cards.map(cardMini).join('')}</div>
        <div class="pt-actions"><button class="pp-stone pt-btn" id="p-reimport" type="button">Import party again</button><span class="pt-note">Already imported automatically; importing again only raises levels.</span></div>` : '<p class="pt-note">The Portal sent no characters this time.</p>'}</section>` : ''}

      <section class="pt-sec">${head('Wallet', '財布')}
        <div class="pt-wallet">
          ${holder('In this game', localVals, null, false)}
          ${holder('Held at the Portal', sess ? sess.wallet : {}, sess ? { coins: 'w-coins', premium: 'w-premium' } : null, !sess)}
          <div class="pt-xfer${sess ? '' : ' is-locked'}">
            <div class="pt-xrow">
              <div class="pt-seg" role="radiogroup" aria-label="Currency">
                ${['coins', 'premium'].map((k) => `<button class="pt-segb${wCur === k ? ' is-on' : ''}" type="button" role="radio" aria-checked="${wCur === k}" data-cur="${k}" ${dis}>${curIcon(k)}${CUR[k].label}</button>`).join('')}
                <select class="pt-cur-sel" id="w-cur" tabindex="-1" aria-hidden="true" ${dis}>${['coins', 'premium'].map((k) => `<option value="${k}"${wCur === k ? ' selected' : ''}>${CUR[k].label}</option>`).join('')}</select>
              </div>
              <div class="pt-amt">
                <input class="pt-amt-in" id="w-amt" type="number" min="1" step="1" inputmode="numeric" placeholder="Amount" aria-label="Amount" value="${esc(wAmt)}" ${dis}>
                <button class="pt-chip" type="button" data-add="100" ${dis}>+100</button><button class="pt-chip" type="button" data-add="1000" ${dis}>+1,000</button><button class="pt-chip is-max" type="button" data-add="max" title="Everything you hold in this game" ${dis}>MAX</button>
              </div>
            </div>
            <div class="pt-xrow pt-xbtns">
              <button class="jjk-btn pt-big" id="w-dep" type="button" ${dis}>Send to Portal</button>
              <button class="jjk-btn is-primary pt-big" id="w-wd" type="button" ${dis}>Receive</button>
              ${pend.length ? `<button class="pp-stone pt-btn" id="w-retry" type="button" ${dis}>Retry ${pend.length}</button>` : ''}
            </div>
            <p class="msg pt-wmsg${sess ? '' : ' is-lock'}" id="w-msg" role="status">${sess ? (pend.length ? pend.length + ' transfer(s) waiting for the Portal.' : 'Sent currency waits at the Portal — convert or invest it there.') : 'Open this game from the Portal hub to move currency.' + (pend.length ? ' ' + pend.length + ' transfer(s) will finish next time you connect.' : '')}</p>
          </div>
        </div>
      </section>

      <section class="pt-sec">${head('Send to Portal', '送信', `<span class="pt-count${picked.size >= MAX ? ' is-full' : ''}"><b>${picked.size}</b>/${MAX}</span>`)}
        <p class="pt-note">Pick up to ${MAX} of your own sorcerers. ${sess ? 'They are copied into your Portal vault and a Portal Code is made' : 'You get a Portal Code to paste into another game'} — you keep them here too.</p>
        <div class="pt-units" id="send-pick">${own.map((v) => UI.unitCard(v, { picked: picked.has(v.id), extra: '<i class="pt-stamp" aria-hidden="true"></i>' })).join('')}</div>
        <div class="pt-actions">
          <button class="jjk-btn is-primary pt-big" id="send-go" type="button" ${picked.size ? '' : 'disabled'}>${sess ? 'Send + Make Code' : 'Make Portal Code'}</button>
          <button class="pp-stone pt-btn" id="send-clear" type="button" ${picked.size ? '' : 'disabled'}>Clear</button>
        </div>
        <div class="pt-codebox" id="code-box" hidden><textarea class="pt-code" id="code-out" rows="2" readonly aria-label="Your Portal Code"></textarea><button class="jjk-btn is-primary pt-btn" id="code-copy" type="button">Copy code</button></div>
        <p class="msg" id="send-msg" role="status"></p>
      </section>

      <section class="pt-sec">${head('Paste Portal Code', '受信')}
        <div class="pt-codebox">
          <textarea class="pt-code" id="code-in" rows="2" placeholder="PRTL1.…" aria-label="Portal Code to import" spellcheck="false"></textarea>
          <button class="jjk-btn is-primary pt-big" id="code-go" type="button">Import</button>
        </div>
        <p class="pt-note">Characters from other games join as playable guests.</p>
        <p class="msg" id="code-msg" role="status"></p>
      </section>
    </div>`;
  }

  function draw() {
    const s = Save.get();
    $('#tabs').innerHTML = TABS.map(([id, label]) => `<button class="jjk-tab${id === tab ? ' active' : ''}" data-tab="${id}" type="button">${label}</button>`).join('');
    const body = { audio: audioTab, display: displayTab, account: accountTab, data: dataTab, portal: portalTab }[tab](s);
    $('#panel').className = 'settings jjk-panel is-' + tab;
    $('#panel').innerHTML = body;
  }

  async function copy(text, msgId) {
    try { await navigator.clipboard.writeText(text); setMsg(msgId, 'Copied to clipboard.', 'good'); } catch (_) { setMsg(msgId, 'Copy failed — select the text and copy it manually.', 'bad'); }
  }

  function importResultText(res) {
    const by = (a) => res.filter((r) => r.action === a);
    const parts = [];
    if (by('added').length) parts.push('Added ' + by('added').map((r) => r.name + (r.guest ? ' (guest)' : '')).join(', '));
    if (by('raised').length) parts.push('Raised ' + by('raised').map((r) => r.name + ' to Lv' + r.level).join(', '));
    if (by('kept').length) parts.push('Already had ' + by('kept').map((r) => r.name).join(', '));
    if (by('error').length) parts.push('Skipped ' + by('error').map((r) => r.name + ' (' + r.error + ')').join(', '));
    return parts.join('. ') + '.';
  }

  /** Wallet currency toggle: the two kit buttons drive the (visually hidden) #w-cur select. */
  function setCur(k) {
    if (!CUR[k]) return;
    wCur = k;
    const sel = $('#w-cur'); if (sel && sel.value !== k) sel.value = k;
    $$('.pt-segb').forEach((b) => { const on = b.dataset.cur === k; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
  }

  async function onClick(e) {
    const t = e.target;
    const tg = t.closest('[data-toggle]');
    if (tg) {
      const key = tg.dataset.toggle;
      Save.update((s) => { s.settings[key] = !s.settings[key]; });
      if (key === 'reduceMotion') document.documentElement.classList.toggle('reduce-motion', Save.get().settings.reduceMotion);
      UI.sfx('tap');
      draw();
      return;
    }
    const cb = t.closest('[data-cur]');
    if (cb && !cb.disabled) { setCur(cb.dataset.cur); UI.sfx('tap'); return; }
    const ad = t.closest('[data-add]');
    if (ad && !ad.disabled) {
      const s = Save.get();
      const have = wCur === 'coins' ? s.currency.yen : s.currency.cubes;
      const cur = Math.max(0, Math.floor(Number($('#w-amt').value) || 0));
      const v = ad.dataset.add === 'max' ? have : cur + Number(ad.dataset.add);
      $('#w-amt').value = wAmt = v > 0 ? String(v) : '';
      UI.sfx('tap');
      return;
    }
    const sp = t.closest('[data-speed]');
    if (sp) { Save.update((s) => { s.settings.battleSpeed = +sp.dataset.speed; }); draw(); return; }
    const id = t.closest('button') && t.closest('button').id;
    switch (id) {
      case 'name-save': {
        const v = $('#acct-name').value.trim();
        if (v.length < 2) return setMsg('acct-msg', 'Name must be at least 2 letters.', 'bad');
        Save.update((s) => { s.profile.name = v.slice(0, 24); });
        setMsg('acct-msg', 'Saved.', 'good');
        break;
      }
      case 'reset':
        if (await UI.confirm('Delete your sorcerer, units and progress in this browser? Export a backup first if you might want it back.', 'Delete save', 'Reset game')) {
          Save.reset();
          location.href = 'index.html';
        }
        break;
      case 'exp-show': { const ta = $('#exp-out'); ta.hidden = false; ta.value = Save.exportJSON(); ta.select(); break; }
      case 'exp-copy': copy(Save.exportJSON(), 'data-msg'); break;
      case 'exp-dl': {
        const blob = new Blob([Save.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'cursed-clash-save-' + Rules.today() + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        setMsg('data-msg', 'Downloaded.', 'good');
        break;
      }
      case 'imp-go': {
        const text = $('#imp-in').value.trim();
        if (!text) return setMsg('data-msg', 'Paste a save or choose a file first.', 'bad');
        if (!(await UI.confirm('Replace your current save with this one?', 'Import', 'Import save'))) return;
        try { Save.importJSON(text); setMsg('data-msg', 'Save imported. Welcome back, ' + Save.get().profile.name + '.', 'good'); } catch (err) { setMsg('data-msg', err.message, 'bad'); }
        break;
      }
      case 'p-exit': PortalPort.session && PortalPort.session.exit(); break;
      case 'p-reimport': {
        try { const res = await PortalPort.importCards(PortalPort.session.party.cards); UI.toast(importResultText(res), 'good'); } catch (err) { UI.toast(err.message, 'bad'); }
        break;
      }
      case 'w-dep': case 'w-wd': {
        const amt = Number($('#w-amt').value);
        const cur = $('#w-cur').value;
        const btns = $$('#w-dep, #w-wd');
        btns.forEach((b) => { b.disabled = true; });
        setMsg('w-msg', 'Talking to the Portal…');
        try {
          if (id === 'w-dep') await PortalPort.deposit(cur, amt); else await PortalPort.withdraw(cur, amt);
          draw();
          setMsg('w-msg', (id === 'w-dep' ? 'Sent ' : 'Received ') + fmt(amt) + ' ' + (cur === 'coins' ? 'JP' : 'Cubes') + (id === 'w-dep' ? ' to the Portal.' : ' from the Portal.'), 'good');
        } catch (err) {
          draw();
          setMsg('w-msg', err.message, 'bad');
        }
        UI.paintHud();
        break;
      }
      case 'w-retry':
        await PortalPort.retryPending();
        draw();
        setMsg('w-msg', PortalPort.pendingTx.length ? PortalPort.pendingTx.length + ' transfer(s) still waiting.' : 'All transfers settled.', PortalPort.pendingTx.length ? 'bad' : 'good');
        break;
      case 'send-clear': picked.clear(); draw(); break;
      case 'send-go': {
        let cards;
        try { cards = Array.from(picked).map(PortalPort.cardFor); } catch (err) { return setMsg('send-msg', err.message, 'bad'); }
        let code = '';
        try { code = PortalSDK.encodeCode(cards); } catch (err) { return setMsg('send-msg', err.message, 'bad'); }
        const sess = PortalPort.session;
        let note = 'Portal Code ready — paste it into another Portal game.';
        if (sess) {
          let ok = 0; const errs = [];
          for (const c of cards) { try { await sess.grant(c); ok++; } catch (err) { errs.push(c.name + ': ' + err.message); } }
          note = 'Sent ' + ok + ' to your Portal vault.' + (errs.length ? ' Failed: ' + errs.join('; ') : '') + ' A Portal Code was made too.';
        }
        $('#code-box').hidden = false;
        $('#code-out').value = code;
        setMsg('send-msg', note, sess && note.includes('Failed') ? 'bad' : 'good');
        break;
      }
      case 'code-copy': copy($('#code-out').value, 'send-msg'); break;
      case 'code-go': {
        const txt = $('#code-in').value.trim();
        if (!txt) return setMsg('code-msg', 'Paste a Portal Code first.', 'bad');
        let cards;
        try { cards = PortalSDK.decodeCode(txt); } catch (err) { return setMsg('code-msg', err.message, 'bad'); }
        try {
          const res = await PortalPort.importCards(cards);
          setMsg('code-msg', importResultText(res), res.every((r) => r.action === 'error') ? 'bad' : 'good');
        } catch (err) { setMsg('code-msg', err.message, 'bad'); }
        break;
      }
      default:
    }
    const card = t.closest('#send-pick .ucard');
    if (card) {
      const uid = card.dataset.id;
      if (picked.has(uid)) picked.delete(uid);
      else if (picked.size >= PortalSDK.MAX_PARTY) return UI.toast('At most ' + PortalSDK.MAX_PARTY + ' per transfer.', 'bad');
      else picked.add(uid);
      const scroll = $('#main').scrollTop;
      const row = $('#send-pick'); const sx = row ? row.scrollLeft : 0;
      draw();
      $('#main').scrollTop = scroll;
      if ($('#send-pick')) $('#send-pick').scrollLeft = sx;
    }
  }

  function render() {
    $('#main').innerHTML = '<div class="tabs" id="tabs" role="tablist"></div><section class="settings jjk-panel" id="panel"></section>';
    const h = location.hash.slice(1);
    if (TABS.some(([id]) => id === h)) tab = h;
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); draw(); } });
    $('#panel').addEventListener('click', onClick);
    $('#panel').addEventListener('input', (e) => {
      if (e.target.id === 'vol') { Save.update((s) => { s.settings.volume = +e.target.value; }); paintRange(e.target); const o = $('#vol-out'); if (o) o.textContent = e.target.value + '%'; }
      if (e.target.id === 'w-amt') wAmt = e.target.value;
    });
    $('#panel').addEventListener('change', (e) => {
      if (e.target.id === 'vol') UI.sfx('tap');
      if (e.target.id === 'w-cur') setCur(e.target.value);
      if (e.target.id === 'imp-file' && e.target.files[0]) {
        const r = new FileReader();
        r.onload = () => { $('#imp-in').value = String(r.result || ''); setMsg('data-msg', 'File loaded — press Import save.'); };
        r.onerror = () => setMsg('data-msg', 'Could not read that file.', 'bad');
        r.readAsText(e.target.files[0]);
      }
    });
    draw();
    // the Portal may connect after first paint; refresh the Portal tab when it does
    window.addEventListener('portal:ready', () => { if (tab === 'portal') draw(); });
    window.addEventListener('portal:wallet', () => { if (tab === 'portal') { const m = $('#w-msg'); const keep = m && m.textContent; const k = m && m.className; draw(); const m2 = $('#w-msg'); if (m2 && keep) { m2.textContent = keep; m2.className = k; } } });
  }

  UI.boot({ data: ['characters'], init: render });
})();
