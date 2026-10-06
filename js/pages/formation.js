/* formation.html — Formation hub (Phantom Parade style): a guide with a
 * dialogue box on the left; parchment menu cards on the right lead to
 * Enhance Sorcerers (characters.html), Summon and Team Formation
 * (teams.html), with stone buttons for the Strengthening Quest and Missions. */
(function () {
  'use strict';
  const { $, esc, fmt } = UI;
  const GUIDE = 'nanami_502';
  const LINES = [
    'Consider carefully before proceeding with the formation. Type advantage decides more fights than raw power.',
    'Level your sorcerers with Training Lights first. Overtime is not something I recommend.',
    'Four in the Main line, one in Backup. The Backup does not fight, but its support skill lifts everyone.',
  ];
  const mem = (id) => `assets/pp/memories/${id}/art.webp`;

  function render() {
    const s = Save.get();
    const guide = Data.char(GUIDE) || Data.characters[0];
    const owned = Rules.ownedList();
    const team = s.teams[s.activeTeam];
    const filled = team ? team.slots.filter(Boolean).length + (team.support ? 1 : 0) : 0;
    const line = LINES[Math.floor(Date.now() / 86400000) % LINES.length];
    $('#main').innerHTML = `<div class="scr fh">
      <div class="scr-guide" style="--focus:50% 18%">
        ${guide ? Art.img(guide, 'full', { cls: 'art scr-guide-art', eager: true, alt: '' }) : ''}
        <div class="pp-dialog"><span class="dlg-name">${esc(guide ? guide.name : 'Guide')}</span><p class="dlg-text">${esc(line)}</p></div>
      </div>
      <nav class="fh-menu" aria-label="Formation">
        <a class="pp-parch fh-card" href="characters.html"><span class="parch-art" style="background-image:url('${mem('the-strongest-quarrel')}')"></span>
          <span class="parch-label scr-orn">Enhance Sorcerers</span><small class="fh-note">${owned.length} owned</small></a>
        <a class="pp-parch fh-card is-film" href="summon.html"><span class="parch-art" style="background-image:url('${mem('the-grand-break-through')}')"></span><span class="film-top"></span>
          <span class="parch-label scr-orn">Summon Sorcerers</span><small class="fh-note">Pickup</small></a>
        <a class="pp-parch fh-card is-wide is-film" href="teams.html"><span class="parch-art" style="background-image:url('${mem('here-we-come-fukuoka')}')"></span><span class="film-top"></span><span class="film-bot"></span>
          <span class="parch-label scr-orn">Team Formation</span><small class="fh-note">${esc(team ? team.name : 'Team')} · ${filled}/5 · Power ${fmt(team ? Rules.teamPower(team) : 0)}</small></a>
        <div class="fh-small">
          <a class="pp-stone" href="missions.html#strengthen">${UI.itemIcon('light_m', {})}<span>Strengthening<br>Quest</span></a>
          <a class="pp-stone" href="missions.html">${UI.icon('missions')}<span>Missions</span></a>
        </div>
      </nav>
    </div>`;
  }

  UI.boot({ back: false, data: ['characters'], init: render });
})();
