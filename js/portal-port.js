/* js/portal-port.js — this game's side of the Portal (js/portal-sdk.js is
 * the contract; gameId 'jjk-net0').
 *
 *   PortalPort.init()              connect once per page (null when standalone),
 *                                  auto-import the party once per party id and
 *                                  show the Portal chip + Return button
 *   PortalPort.ready               Promise<session|null>
 *   PortalPort.cardFor(unitId)     owned unit -> validated Portal card
 *   PortalPort.importCards(cards)  cards -> units (own cards raise/add, foreign
 *                                  cards become playable guests). Max 5.
 *   PortalPort.reportLevels(ids)   after a battle: session.update for party cards
 *   PortalPort.cardIdFor(unitId)   the Portal card id a unit corresponds to
 *   PortalPort.deposit(cur, n)     game -> hub wallet   (cur: 'coins' | 'premium')
 *   PortalPort.withdraw(cur, n)    hub wallet -> game
 *
 * Currency mapping: Yen (soft) <-> 'coins', Cursed Cubes (premium) <-> 'premium'.
 * Transfers are idempotent: each has a txId from PortalSDK.newTxId() and is kept
 * as pending in the save (save.portal.pendingTx, written in the same atomic
 * save as the local balance change) until the hub answers. A refusal undoes it;
 * no answer leaves it pending and it is retried with the SAME txId on the next
 * connect. Currency never travels in Portal Codes.
 */
(function (global) {
  'use strict';

  const GAME_ID = 'jjk-net0';
  const FRANCHISE = 'jjk';
  let session = null;
  let readyP = null;

  const SDK = () => global.PortalSDK;

  function cardFor(unitId) {
    const v = Rules.unitView(unitId);
    if (!v) throw new Error('You do not own that unit.');
    if (v.def.guest) throw new Error(v.def.name + ' is a guest from ' + v.def.sourceGame + ' and can only travel home as they came.');
    return SDK().validateCard({
      sourceGame: GAME_ID,
      baseId: v.def.id,
      name: v.def.name,
      title: v.def.title,
      franchise: FRANCHISE,
      element: v.def.element,
      rarity: v.def.rarity,
      level: v.unit.level,
      maxLevel: v.maxLevel,
      stats: SDK().normalizeStats(v.def.statsMax),
      art: { portrait: SDK().absUrl(v.def.art.portrait), full: SDK().absUrl(v.def.art.full) },
    });
  }

  function guestIdFor(card) {
    return ('guest_' + card.sourceGame + '_' + card.baseId).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120);
  }

  function cardIdFor(unitId) {
    const def = Rules.unitDef(unitId);
    if (!def) return null;
    if (def.guest) return def.sourceGame + ':' + def.baseId;
    return GAME_ID + ':' + def.id;
  }

  /** Same-element template from our roster for a guest's skills. */
  function templateFor(element, rarity) {
    const pool = Data.characters.filter((c) => c.element === element && c.technique);
    if (!pool.length) return Data.characters[0];
    pool.sort((a, b) => Math.abs(a.rarity - rarity) - Math.abs(b.rarity - rarity) || a.rarity - b.rarity);
    return pool[0];
  }

  function guestDef(card) {
    const tpl = templateFor(card.element, card.rarity);
    const raw = SDK().denormalizeStats(card.stats);
    // a card with empty stats still needs to be playable: fall back to the template's
    const statsMax = {
      hp: raw.hp > 0 ? raw.hp : tpl.statsMax.hp,
      atk: raw.atk > 0 ? raw.atk : tpl.statsMax.atk,
      speed: raw.speed > 0 ? raw.speed : tpl.statsMax.speed,
    };
    const statsBase = { hp: Math.round(statsMax.hp * 0.5), atk: Math.round(statsMax.atk * 0.5), speed: Math.round(statsMax.speed * 0.5) };
    const rarity = card.rarity;
    const ult = tpl.ultimate || (rarity >= 5 ? { name: 'Unleashed Strike', kind: 'ultimate', cost: 10, mult: 4.0, target: 'single', desc: 'A borrowed finisher: 4.0x attack to one curse.' } : null);
    return {
      id: guestIdFor(card),
      guest: true,
      sourceGame: card.sourceGame,
      baseId: card.baseId,
      cardId: card.id,
      franchise: card.franchise,
      name: card.name,
      title: card.title || 'Portal Guest',
      element: card.element,
      rarity,
      maxLevel: card.maxLevel,
      kanji: Rules.ELEMENT_KANJI[card.element] || '客',
      affiliation: 'Guest · ' + card.sourceGame,
      statsBase, statsMax,
      art: { portrait: card.art.portrait || '', full: card.art.full || card.art.portrait || '', generated: false },
      basic: { name: 'Strike', mult: 1.0 },
      technique: tpl.technique,
      technique2: tpl.technique2 || null,
      ultimate: ult,
      passives: (tpl.passives || []).slice(0, 1),
      support: tpl.support,
      borrowedFrom: tpl.id,
    };
  }

  /**
   * Import up to 5 cards. Returns [{ name, unitId, action, error? }]
   * action: 'added' | 'raised' | 'kept' | 'error'
   */
  async function importCards(cards) {
    await Data.load('characters');
    if (!Array.isArray(cards)) throw new Error('Nothing to import.');
    if (cards.length > SDK().MAX_PARTY) throw new Error('At most ' + SDK().MAX_PARTY + ' characters can be imported at once.');
    const results = [];
    Save.update((s) => {
      for (const raw of cards) {
        let card;
        try { card = SDK().validateCard(raw); } catch (err) { results.push({ name: (raw && raw.name) || '?', action: 'error', error: err.message }); continue; }
        if (card.sourceGame === GAME_ID) {
          const def = Data.char(card.baseId);
          if (!def) { results.push({ name: card.name, action: 'error', error: 'Unknown character id ' + card.baseId }); continue; }
          const lvl = Math.min(Rules.maxLevelOf(def), card.level);
          const u = s.units[def.id];
          if (!u) {
            s.units[def.id] = { id: def.id, level: lvl, exp: 0, dupes: 0, obtained: Date.now(), viaPortal: true };
            results.push({ name: def.name, unitId: def.id, action: 'added', level: lvl });
          } else if (lvl > u.level) {
            u.level = lvl; u.exp = 0;
            results.push({ name: def.name, unitId: def.id, action: 'raised', level: lvl });
          } else results.push({ name: def.name, unitId: def.id, action: 'kept', level: u.level });
        } else {
          const def = guestDef(card);
          const lvl = Math.min(def.maxLevel, card.level);
          const had = s.guests[def.id];
          // keep the stored definition fresh (art / stats may have changed at home)
          s.guests[def.id] = def;
          const u = s.units[def.id];
          if (!u) {
            s.units[def.id] = { id: def.id, level: lvl, exp: 0, dupes: 0, obtained: Date.now(), guest: true };
            results.push({ name: def.name, unitId: def.id, action: 'added', level: lvl, guest: true });
          } else if (lvl > u.level) {
            u.level = lvl; u.exp = 0;
            results.push({ name: def.name, unitId: def.id, action: 'raised', level: lvl, guest: true });
          } else results.push({ name: def.name, unitId: def.id, action: had ? 'kept' : 'added', level: u.level, guest: true });
        }
      }
    });
    return results;
  }

  /* ---------------- Wallet ---------------- */
  const LOCAL = { coins: 'yen', premium: 'cubes' };
  const inflight = new Set();

  function emitWallet() {
    global.dispatchEvent(new CustomEvent('portal:wallet', { detail: session ? session.wallet : null }));
  }

  function dropPending(txId, mutate) {
    Save.update((s) => {
      const list = s.portal.pendingTx || [];
      const tx = list.find((t) => t.txId === txId);
      s.portal.pendingTx = list.filter((t) => t.txId !== txId);
      if (tx && mutate) mutate(s, tx);
    });
  }

  /** Send one (new or pending) transfer to the hub and settle it locally. */
  async function settle(tx) {
    if (inflight.has(tx.txId)) throw new Error('That transfer is already in progress.');
    inflight.add(tx.txId);
    try {
      const fn = tx.type === 'deposit' ? session.deposit : session.withdraw;
      const wallet = await fn(tx.currency, tx.amount, tx.txId);
      dropPending(tx.txId, (s, t) => {
        if (t.type === 'withdraw') s.currency[LOCAL[t.currency]] += t.amount;
      });
      emitWallet();
      return { ok: true, wallet };
    } catch (err) {
      if (err && err.refused) {
        dropPending(tx.txId, (s, t) => {
          if (t.type === 'deposit') s.currency[LOCAL[t.currency]] += t.amount; // refund
        });
        emitWallet();
        throw err;
      }
      const e = new Error('The Portal did not answer. The transfer is saved and will be retried next time you connect.');
      e.pending = true;
      throw e;
    } finally {
      inflight.delete(tx.txId);
    }
  }

  function checkAmount(currency, amount) {
    if (!LOCAL[currency]) throw new Error('Unknown currency.');
    if (!Number.isInteger(amount) || amount < 1) throw new Error('Enter a whole amount of at least 1.');
    if (amount > 1e9) throw new Error('That amount is too large.');
  }

  async function deposit(currency, amount) {
    if (!session) throw new Error('Open the game from the Portal to move currency.');
    checkAmount(currency, amount);
    const tx = { txId: SDK().newTxId(), type: 'deposit', currency, amount, ts: Date.now() };
    const ok = Save.update((s) => {
      const k = LOCAL[currency];
      if ((s.currency[k] || 0) < amount) return false;
      s.currency[k] -= amount;
      s.portal.pendingTx = (s.portal.pendingTx || []).concat([tx]);
      return true;
    });
    if (!ok) throw new Error('Not enough ' + (currency === 'coins' ? 'Yen' : 'Cursed Cubes') + '.');
    return settle(tx);
  }

  async function withdraw(currency, amount) {
    if (!session) throw new Error('Open the game from the Portal to move currency.');
    checkAmount(currency, amount);
    const tx = { txId: SDK().newTxId(), type: 'withdraw', currency, amount, ts: Date.now() };
    Save.update((s) => { s.portal.pendingTx = (s.portal.pendingTx || []).concat([tx]); });
    return settle(tx);
  }

  async function retryPending() {
    const s = Save.get();
    if (!s || !session) return;
    for (const tx of (s.portal.pendingTx || []).slice()) {
      try { await settle(tx); } catch (err) { console.warn('[portal] pending transfer', tx.txId, err.message); }
    }
  }

  function showChip() {
    if (!session) return;
    let slot = document.getElementById('portal-slot');
    if (!slot) { // pages without a HUD (title screen): a small floating corner
      slot = document.createElement('div');
      slot.id = 'portal-slot';
      slot.className = 'portal-float';
      document.body.appendChild(slot);
    }
    slot.innerHTML = `<span class="portal-chip jjk-chip" title="Connected to the Portal as ${UI.esc(session.player.name)}">${UI.icon('portal')} Portal</span>
      <button class="portal-exit jjk-btn" type="button" id="portal-exit">${UI.icon('exit')}<span>Return to Portal</span></button>`;
    document.getElementById('portal-exit').addEventListener('click', () => session.exit());
  }

  async function autoImport() {
    const s = Save.get();
    if (!s || !session || !session.party.cards.length) return;
    const pid = session.party.id;
    if (pid && s.portal.importedParties.includes(pid)) {
      Save.update((st) => { st.portal.lastPartyCards = session.party.cards; });
      return;
    }
    try {
      const res = await importCards(session.party.cards);
      Save.update((st) => {
        st.portal.importedParties = st.portal.importedParties.concat(pid ? [pid] : []).slice(-20);
        st.portal.lastPartyCards = session.party.cards;
      });
      const n = res.filter((r) => r.action !== 'error').length;
      if (n && global.UI) UI.toast('Portal party arrived: ' + n + ' character' + (n === 1 ? '' : 's'), 'good');
      global.dispatchEvent(new CustomEvent('portal:imported', { detail: res }));
    } catch (err) {
      console.warn('[portal] import failed', err);
      if (global.UI) UI.toast('Portal import failed: ' + err.message, 'bad');
    }
  }

  function init() {
    if (readyP) return readyP;
    if (!SDK()) { readyP = Promise.resolve(null); return readyP; }
    readyP = SDK().connect({ gameId: GAME_ID })
      .then(async (sess) => {
        session = sess || null;
        if (session) {
          showChip();
          await retryPending();
          await autoImport();
        }
        global.dispatchEvent(new CustomEvent('portal:ready', { detail: session }));
        return session;
      })
      .catch((err) => { console.warn('[portal]', err); return null; });
    return readyP;
  }

  /** After a battle: report level-ups for units that are cards in the current party. */
  async function reportLevels(unitIds) {
    const sess = await (readyP || Promise.resolve(null));
    if (!sess) return [];
    const done = [];
    for (const id of unitIds) {
      const cid = cardIdFor(id);
      const card = cid && sess.party.cards.find((c) => c.id === cid);
      const u = Rules.ownedUnit(id);
      if (!card || !u || u.level <= card.level) continue;
      try {
        await sess.update(cid, { level: u.level });
        card.level = u.level;
        done.push({ id, level: u.level });
      } catch (err) { console.warn('[portal] update failed', err); }
    }
    return done;
  }

  global.PortalPort = {
    GAME_ID,
    init,
    get ready() { return readyP || init(); },
    get session() { return session; },
    cardFor, cardIdFor, importCards, reportLevels, guestIdFor,
    deposit, withdraw, retryPending, LOCAL,
    get pendingTx() { const s = Save.get(); return (s && s.portal.pendingTx) || []; },
  };
})(window);
