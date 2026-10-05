/* formation.html — Formation hub (Phantom Parade style): a guide with a
 * dialogue box on the left, parchment menu cards on the right that lead to
 * Enhance Sorcerers (characters.html) and Team Formation (teams.html). */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  const GUIDE = 'nanami_502';
  const LINES = [
    'Consider carefully before proceeding with the formation. Type advantage decides more fights than raw power.',
    'Level your sorcerers with talismans first. Overtime is not something I recommend.',
    'Four in the Main line, one in Backup. The Backup does not fight, but its support skill lifts everyone.',
  ];
  const mem = (id) => `assets/pp/memories/${id}/art.webp`;

  function render() {
    const s = Save.get();
    const guide = Data.char(GUIDE) || Data.characters[0];
    const owned = Rules.ownedList();
    const team = s.teams[s.activeTeam];
    const line = LINES[Math.floor(Date.now() / 86400000) % LINES.length];
    $('#main').innerHTML = `<div class="hub">
      <div class="hub-guide">
        ${guide ? Art.img(guide, 'full', { cls: 'art hub-guide-art', eager: true, alt: '' }) : ''}
        <div class="pp-dialog"><span class="dlg-name">${esc(guide ? guide.name : 'Guide')}</span><p class="dlg-text">${esc(line)}</p></div>
      </div>
      <div class="hub-menu">
        <a class="pp-parch hub-card" href="characters.html"><span class="parch-art" style="background-image:url('${mem('the-strongest-quarrel')}')"></span>
          <span class="parch-label">Enhance<br>Sorcerers</span><small class="hub-note">${owned.length} units</small></a>
        <a class="pp-parch hub-card is-film" href="summon.html"><span class="parch-art" style="background-image:url('${mem('the-grand-break-through')}')"></span><span class="film-top"></span>
          <span class="parch-label">Summon<br>Sorcerers</span><small class="hub-note">Pickup</small></a>
        <a class="pp-parch hub-card is-wide" href="teams.html"><span class="parch-art" style="background-image:url('${mem('here-we-come-fukuoka')}')"></span>
          <span class="parch-label">Team Formation</span><small class="hub-note">${esc(team.name)} · Power ${fmt(Rules.teamPower(team))}</small></a>
        <div class="hub-small">
          <a class="pp-stone" href="shop.html#items">${UI.itemIcon('talisman_m', {})}<span>Talisman<br>Shop</span></a>
          <a class="pp-stone" href="shop.html#daily">${UI.icon('gift')}<span>Daily<br>Gift</span></a>
        </div>
      </div>
    </div>`;
  }

  UI.boot({ data: ['characters'], init: render });
})();
