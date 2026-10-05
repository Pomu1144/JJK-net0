/* settings.html — Audio, Display, Account, Data and Portal tabs. */
(function () {
  'use strict';
  const { $, $$, esc, fmt } = UI;
  const TABS = [
    ['audio', 'Audio'], ['display', 'Display'], ['account', 'Account'], ['data', 'Data'], ['portal', 'Portal'],
  ];
  let tab = 'audio';
  const picked = new Set();

  const toggle = (key, on) => `<button class="toggle" type="button" role="switch" aria-checked="${!!on}" data-toggle="${key}"></button>`;
  const setMsg = (id, text, kind) => { const el = document.getElementById(id); if (el) { el.textContent = text || ''; el.className = 'msg' + (kind ? ' is-' + kind : ''); } };

  function audioTab(s) {
    return `<div class="set-row"><label>Sound effects<small>Hits, summons and menu taps (generated in the browser)</small></label>${toggle('sfx', s.settings.sfx)}</div>
      <div class="set-row"><label for="vol">Volume<small>${s.settings.volume}%</small></label><input type="range" id="vol" min="0" max="100" step="5" value="${s.settings.volume}"></div>
      <div class="set-row"><label>Music<small>No soundtrack ships with this fan build; the setting is kept for later.</small></label>${toggle('music', s.settings.music)}</div>`;
  }

  function displayTab(s) {
    return `<div class="set-row"><span class="lbl">Battle speed<small>Animation speed in battle</small></span>
        <span class="seg">${[1, 2, 3].map((n) => `<button class="jjk-tab${s.settings.battleSpeed === n ? ' active' : ''}" data-speed="${n}" type="button">${n}x</button>`).join('')}</span></div>
      <div class="set-row"><label>Auto battle by default<small>Units pick their own actions (toggle any time in battle)</small></label>${toggle('autoBattle', s.settings.autoBattle)}</div>
      <div class="set-row"><label>Reduce motion<small>Shorter animations everywhere</small></label>${toggle('reduceMotion', s.settings.reduceMotion)}</div>`;
  }

  function accountTab(s) {
    return `<div class="set-row"><label for="acct-name">Sorcerer name</label>
        <input class="input" id="acct-name" maxlength="24" value="${esc(s.profile.name)}"><button class="jjk-btn is-small" id="name-save" type="button">Save</button></div>
      <div class="set-row"><span class="lbl">Record<small>Rank ${s.profile.rank} · ${Object.keys(s.units).length} units · ${s.stats.wins}/${s.stats.battles} battles won · ${s.stats.pulls} summons · started ${new Date(s.created).toLocaleDateString()}</small></span></div>
      <div class="set-row"><span class="lbl">Start over<small>Deletes this game's save (only keys starting with jjk_). Other games on this site are untouched.</small></span>
        <button class="jjk-btn is-small" id="reset" type="button">Reset game</button></div>
      <p class="msg" id="acct-msg"></p>`;
  }

  function dataTab() {
    return `<div class="section-title">Export <small>保存</small></div>
      <p class="muted" style="font-size:12px;margin:0 0 6px">A JSON backup of your whole save. Keep it somewhere safe or move it to another browser.</p>
      <div class="row wrap" style="margin-bottom:6px"><button class="jjk-btn is-small" id="exp-show" type="button">Show JSON</button><button class="jjk-btn is-small" id="exp-dl" type="button">Download file</button><button class="jjk-btn is-small" id="exp-copy" type="button">Copy</button></div>
      <textarea class="input" id="exp-out" rows="4" readonly hidden></textarea>
      <div class="section-title" style="margin-top:12px">Import <small>復元</small></div>
      <p class="muted" style="font-size:12px;margin:0 0 6px">Paste a backup or choose a file. This replaces your current save.</p>
      <textarea class="input" id="imp-in" rows="4" placeholder='{"game":"jjk-net0", ...}'></textarea>
      <div class="row wrap" style="margin-top:6px"><input type="file" id="imp-file" accept="application/json,.json" style="font-size:12px;max-width:220px"><span class="grow"></span><button class="jjk-btn is-small is-primary" id="imp-go" type="button">Import save</button></div>
      <p class="msg" id="data-msg" role="status"></p>`;
  }

  function cardMini(c) {
    // a Portal card shown as a roster card (art may be from another game)
    const def = { id: 'card_' + c.id, name: c.name, title: c.title, element: c.element, rarity: c.rarity, art: c.art, kanji: '' };
    return UI.unitTile(def, { tag: 'div', level: c.level, title: c.name + ' · ' + c.sourceGame, badge: c.sourceGame !== PortalPort.GAME_ID ? '<span class="uc-badge badge is-guest">' + esc(c.sourceGame) + '</span>' : '' });
  }

  function portalTab(s) {
    const sess = PortalPort.session;
    const own = Rules.ownedList().filter((v) => !v.def.guest).sort((a, b) => b.power - a.power);
    const cards = sess ? sess.party.cards : [];
    const pend = PortalPort.pendingTx;
    return `<div class="portal-status${sess ? ' is-on' : ''}"><span class="dot"></span>
        <div class="grow"><b>${sess ? 'Connected to Portal — party of ' + cards.length : 'Standalone'}</b>
        <small class="muted" style="display:block">${sess ? 'Playing as ' + esc(sess.player.name) + '. Party cards are copied into your roster; level-ups are reported back after battles.' : 'Not running inside the Portal hub. You can still move characters with a Portal Code.'}</small></div>
        ${sess ? '<button class="jjk-btn is-small" type="button" id="p-exit">Return to Portal</button>' : ''}</div>

      ${sess ? `<div class="section-title">Incoming party <small>${cards.length} / ${PortalSDK.MAX_PARTY}</small></div>
        ${cards.length ? `<div class="card-strip">${cards.map(cardMini).join('')}</div>
        <div class="row" style="margin-top:6px"><button class="jjk-btn is-small" id="p-reimport" type="button">Import party again</button><span class="muted" style="font-size:11px">Already imported automatically; importing again only raises levels.</span></div>` : '<p class="muted">The Portal sent no characters this time.</p>'}` : ''}

      <div class="section-title" style="margin-top:12px">Wallet <small>財布 · CURRENCY</small></div>
      <p class="muted" style="font-size:12px;margin:0 0 6px">Currency you send is held at the Portal, where you can convert it to other games' currencies or invest it. Receive brings Yen or Cubes held at the Portal back into this game. Currency never travels in Portal Codes.</p>
      <div class="wallet-grid">
        <div class="wallet-box pp-card"><h5>IN THIS GAME</h5><div>${UI.YEN_SVG} ¥${fmt(s.currency.yen)} Yen</div><div>${UI.CUBE_SVG} ${fmt(s.currency.cubes)} Cubes</div></div>
        <div class="wallet-box pp-card"><h5>HELD AT THE PORTAL</h5>${sess ? `<div id="w-coins">${UI.YEN_SVG} ¥${fmt(sess.wallet.coins)} Yen at Portal</div><div id="w-premium">${UI.CUBE_SVG} ${fmt(sess.wallet.premium)} Cubes at Portal</div>` : '<div class="muted" style="font-weight:500">—</div>'}</div>
      </div>
      <div class="row wrap">
        <input class="input" id="w-amt" type="number" min="1" step="1" inputmode="numeric" placeholder="Amount" style="width:120px" ${sess ? '' : 'disabled'}>
        <select class="input" id="w-cur" ${sess ? '' : 'disabled'}><option value="coins">Yen</option><option value="premium">Cursed Cubes</option></select>
        <button class="jjk-btn is-small" id="w-dep" type="button" ${sess ? '' : 'disabled'}>Send to Portal</button>
        <button class="jjk-btn is-small" id="w-wd" type="button" ${sess ? '' : 'disabled'}>Receive from Portal</button>
        ${pend.length ? `<button class="jjk-btn is-small" id="w-retry" type="button" ${sess ? '' : 'disabled'}>Retry ${pend.length} pending</button>` : ''}
      </div>
      <p class="msg${sess ? '' : ' muted'}" id="w-msg" role="status">${sess ? (pend.length ? pend.length + ' transfer(s) waiting for the Portal.' : '') : 'Open the game from the Portal to move currency.' + (pend.length ? ' ' + pend.length + ' transfer(s) are waiting and will finish next time you connect.' : '')}</p>

      <div class="section-title" style="margin-top:12px">Send to Portal <small>${picked.size} / ${PortalSDK.MAX_PARTY} picked</small></div>
      <p class="muted" style="font-size:12px;margin:0 0 6px">Pick up to ${PortalSDK.MAX_PARTY} of your own sorcerers (guests can't be re-sent). ${sess ? 'They are copied into your Portal vault' : 'You get a Portal Code to paste in another game'}; you keep them here too.</p>
      <div class="unit-grid card-strip" id="send-pick">${own.map((v) => UI.unitCard(v, { picked: picked.has(v.id) })).join('')}</div>
      <div class="row wrap" style="margin-top:6px"><button class="jjk-btn is-small is-primary" id="send-go" type="button" ${picked.size ? '' : 'disabled'}>${sess ? 'Send to Portal + make code' : 'Make Portal Code'}</button><button class="jjk-btn is-small" id="send-clear" type="button">Clear</button></div>
      <div id="code-box" hidden><textarea class="input code-out" id="code-out" rows="3" readonly></textarea><button class="jjk-btn is-small" id="code-copy" type="button" style="margin-top:4px">Copy code</button></div>
      <p class="msg" id="send-msg" role="status"></p>

      <div class="section-title" style="margin-top:12px">Paste Portal Code <small>受信</small></div>
      <textarea class="input" id="code-in" rows="3" placeholder="PRTL1.…"></textarea>
      <div class="row" style="margin-top:6px"><button class="jjk-btn is-small is-primary" id="code-go" type="button">Import code</button><span class="muted" style="font-size:11px">Characters from other games join as playable guests.</span></div>
      <p class="msg" id="code-msg" role="status"></p>`;
  }

  function draw() {
    const s = Save.get();
    $('#tabs').innerHTML = TABS.map(([id, label]) => `<button class="jjk-tab${id === tab ? ' active' : ''}" data-tab="${id}" type="button">${label}</button>`).join('');
    const body = { audio: audioTab, display: displayTab, account: accountTab, data: dataTab, portal: portalTab }[tab](s);
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
          setMsg('w-msg', (id === 'w-dep' ? 'Sent ' : 'Received ') + fmt(amt) + ' ' + (cur === 'coins' ? 'Yen' : 'Cubes') + (id === 'w-dep' ? ' to the Portal.' : ' from the Portal.'), 'good');
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
      draw();
      $('#main').scrollTop = scroll;
    }
  }

  function render() {
    $('#main').innerHTML = '<div class="tabs" id="tabs" role="tablist"></div><section class="settings jjk-panel" id="panel"></section>';
    const h = location.hash.slice(1);
    if (TABS.some(([id]) => id === h)) tab = h;
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); draw(); } });
    $('#panel').addEventListener('click', onClick);
    $('#panel').addEventListener('input', (e) => {
      if (e.target.id === 'vol') { Save.update((s) => { s.settings.volume = +e.target.value; }); e.target.previousElementSibling.querySelector('small').textContent = e.target.value + '%'; }
    });
    $('#panel').addEventListener('change', (e) => {
      if (e.target.id === 'vol') UI.sfx('tap');
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
