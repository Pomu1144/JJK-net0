/* index.html — title screen: create or continue a sorcerer. */
(function () {
  'use strict';
  const { $, esc } = UI;
  // Tokyo second-years plus Shoko as healer (all SR).
  const STARTERS = ['maki_weaker_curse', 'panda_at_shortest', 'toge_baton_counterattack', 'shoko_reverse_curse'];

  function render() {
    const s = Save.get();
    const main = $('#main');
    main.classList.add('title-main');
    main.innerHTML = `<section class="title-screen">
      <div class="title-bg"></div>
      <img class="title-shards" src="assets/ui/ink/shards.webp" alt="">
      <img class="title-hero" src="assets/characters/gojo_9005/full_7S.webp" alt="" fetchpriority="high">
      <div class="title-box">
        <h1 class="title-kanji">呪術廻戦</h1>
        <p class="title-en">Cursed Clash</p>
        <div class="title-form jjk-panel" id="form">
          ${s ? `
            <label>Welcome back</label>
            <div class="row"><b class="grow" style="font-size:18px">${esc(s.profile.name)}</b><span class="jjk-chip">Rank ${s.profile.rank}</span></div>
            <a class="jjk-btn is-primary is-wide" id="continue" href="home.html">Enter Jujutsu High</a>
            <p class="title-note">Not you? Change the name or start over in Settings › Account.</p>` : `
            <label for="name">Sorcerer name</label>
            <div class="row"><input class="input" id="name" maxlength="24" autocomplete="nickname" placeholder="e.g. Itadori" required></div>
            <button class="jjk-btn is-primary is-wide" id="start" type="button">Enrol at Jujutsu High</button>
            <p class="title-note">Your progress is saved in this browser. A fan-made game, not affiliated with the Jujutsu Kaisen rights holders.</p>`}
          <p class="msg is-bad" id="msg" role="alert"></p>
        </div>
      </div>
    </section>`;
    const start = $('#start');
    if (start) {
      const input = $('#name');
      const go = () => {
        const name = input.value.trim();
        if (name.length < 2) { $('#msg').textContent = 'Enter a name of at least 2 letters.'; input.focus(); return; }
        Save.create(name);
        Save.update((st) => {
          STARTERS.forEach((id) => Rules.addUnitTo(st, id, 1));
          st.teams[0].slots = STARTERS.slice();
          st.profile.homeUnit = 'yuji_301';
        });
        location.href = 'home.html';
      };
      start.addEventListener('click', go);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      PortalPort.ready.then((sess) => { if (sess && !input.value) input.value = sess.player.name; });
    }
  }

  UI.boot({ requireSave: false, shell: false, data: ['characters'], init: render });
})();
