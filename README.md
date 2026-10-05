# Jujutsu Kaisen: Cursed Clash (JJK-net0)

A fan-made, Blazing-style gacha RPG set in the world of *Jujutsu Kaisen*, built as a sibling of
[NXBNVNB](https://github.com/Pomu1144/NXBNVNB) (same ink-teal + antique-gold washi UI) and playable
on its own or from the [Portal hub](https://github.com/Pomu1144/portal-container).

Plain static HTML / CSS / vanilla JS: no build step, no backend. Play it at
<https://pomu1144.github.io/JJK-net0/>.

*Fan project, not affiliated with the Jujutsu Kaisen rights holders.*

## What's in the game

| Page | What it does |
| --- | --- |
| `index.html` | Title screen: create a sorcerer (4 starter units) or continue |
| `home.html` | Jujutsu High hub: home character, rank, AP, quick tiles, nav dock |
| `characters.html` | Roster grid (filter/sort) + Enhance: stats, Command / Auto skills, Limit Break, level-up with Training Lights + JP |
| `summon.html` | 3 banners, 300 / 3,000-Cube draws, rates table, Gacha Points (250 = a featured unit), Gacha Point Cards, reveal animation |
| `teams.html` | 3 team presets: 4 front slots + 1 support (commander) whose support skill boosts the team |
| `missions.html` | Quest hub: Main Quest (4 chapters × 5 stages with bosses) and Strengthening Quests (Training Light / JP Gathering, daily runs, auto-clear at 3★) |
| `battle.html` | Turn-based battle vs waves of curses (see below) |
| `shop.html` | Exchange: Training Lights, AP, Draw Tickets, daily gift |
| `settings.html` | Audio, Display, Account, Data (export / import JSON) and **Portal** |

Only characters with real art are in the game.

- **53 units** in `data/characters.json`: the 50 units of the *Jujutsu Kaisen Phantom Parade* fan
  wiki (SR and SSR, with their wiki epithets, types, roles, Skill 1 / Skill 2 / ultimate names and
  auto skills) plus Gojo and both Sukunas as limited SSRs (art shared with NXBNVNB).
- **32 opponents** in `data/enemies.json`, every one a character with art: rival sorcerers
  (Tokyo second-years, the Kyoto students, Junpei, Toji…) and cursed spirits (Mahito, Hanami, Jogo,
  Ryomen Sukuna).
- **20 story stages** in `data/missions.json`: Entrance Exam, Origin of Obedience, Kyoto Goodwill Event and
  Shibuya Incident, plus **6 Strengthening Quest stages** (Training Light and JP Gathering, three
  difficulties each).

### Economy (from the fan wiki's [Beginner's Guide](https://jjk-phantom-parade.fandom.com/wiki/Beginner%27s_Guide))

| | |
| --- | --- |
| **JP** | Soft currency (saved as `currency.yen`). Stage rewards, JP Gathering Quest; spent on level-ups and in the Exchange. |
| **Cubes** | Premium currency. A draw is 300 Cubes, 10 draws 3,000. First clears give 300+. |
| **AP** | Stamina for stages; max AP grows with Player Rank. |
| **Training Lights** (S / M / L) | Character EXP (600 / 4,000 / 20,000); each use also costs JP (60 / 400 / 2,000). Farmed in the Training Light Quest. |
| **Gacha Points** | 1 per draw on a pickup banner; 250 exchange for any featured unit. 20 points convert into 10 **Gacha Point Cards** (up to 200 points per banner); a later banner accepts up to 100 cards, 1 point each. |
| **Limit Break** | Duplicates raise LB up to 5 (+2% stats each); beyond that they convert to JP. |

Rates follow the guide's character rates: SSR 2.5% (limited 0.5% of that), SR otherwise, and the 10th
draw of a 10x is SR or better (this game has no R units or Recollection Bits). Clear Rank:
1★ clear, 2★ at most one character defeated, 3★ nobody defeated. Strengthening Quest stages at 3★ can
be auto-cleared (same rewards, no battle) while you have AP and runs left that day (18 / 6).
Saves from before this economy are migrated on load (schema 2): Cubes ×60, talismans → Training
Lights, old pity counts → Gacha Points.

### Art
- `assets/pp/` (4.9 MB): card art, unit icons and skill icons for the 50 units, 104 memory
  illustrations, type and rarity badges, currency / item icons (`currency/`: JP, Cubes, Training
  and Recollection Lights, Gacha Point Card, Clear Rank marks) and Quest mode art (`modes/`) — from
  the Phantom Parade fan wikis, every file credited in
  `assets/pp/CREDITS.md` and `assets/pp/manifest.json`. Every unit has a 3:4 portrait crop
  (`assets/pp/portraits/`, offsets in `tools/pp-art.json`); memory scenes are the backdrops of the
  chapters and summon banners.
- Art and characters are © Gege Akutami/Shueisha, JUJUTSU KAISEN Project; Phantom Parade © Sumzap /
  TOHO. Non-commercial fan project.

### Data pipeline

```sh
python3 tools/scrape_pp_wiki.py        # in a scratch folder: wiki images -> out/ (needs ffmpeg, ImageMagick)
python3 tools/pp_assets.py path/to/out # copy into assets/pp/, cut portraits, write CREDITS.md
python3 tools/pp_units.py              # tools/pp-units-raw.json (wiki unit templates) -> tools/pp-units.json
python3 tools/generate.py              # rebuild data/*.json (roster, opponents per chapter, missions, banners)
node tools/balance.js                  # auto-battle win rates per stage
```

`tools/pp_units.py` translates each unit's wiki effect text into this engine: damage %, one or all
enemies, and one side effect (stun, poison/burn, attack down, heal, attack up, cursed energy). Stats
keep each unit's wiki proportions inside the range for its rarity (SR / SSR / limited SSR).

### Battle

* Your 4 front units vs 2–3 waves of opponents; every unit acts in speed order each turn.
* **Attack** (+1 cursed energy), **Skill 1** and **Skill 2** (spend cursed energy from a shared pool
  of 20; +2 per turn; some only buff or heal), and the **Ultimate / Domain Expansion** once the unit's
  gauge is full.
* Types follow Phantom Parade's colours on the same wheel as NXBNVNB: Blue (Body) › Green (Skill) ›
  Red (Heart) › Blue; Yellow (Bravery) ⇄ Purple (Wisdom). 1.5× / 0.75× (numbers in `js/rules.js`).
* Clear Rank stars: clear · at most 1 defeated · nobody defeated. Auto battle and 1–3× speed.
* `js/battle-engine.js` is DOM-free and loads in Node (`tools/balance.js`).

## Run locally

```sh
python3 -m http.server 8000      # from the repo root
# open http://localhost:8000/
```

All URLs are relative, so it also works under any subpath (GitHub Pages). Deployment is the
`.github/workflows/deploy-pages.yml` workflow (upload the repo root as the Pages artifact).

Smoke test (Playwright + Chromium):

```sh
python3 -m http.server 8000 &
BASE=http://localhost:8000/ node tests/smoke.js /tmp/shots   # set PLAYWRIGHT_MODULE if playwright isn't resolvable
```

## Saves

The game shares an origin (`pomu1144.github.io`) with NXBNVNB and the Portal, so it only ever uses
`localStorage` keys starting with `jjk_` — in practice one blob, `jjk_save`, with a schema version and
migrations, plus small `jjk_pref_*` UI prefs. Every read/write goes through `js/save.js`.
Settings › Data exports / imports the save as JSON; Settings › Account › Reset deletes only `jjk_*` keys.

## Portal

`js/portal-sdk.js` is copied unchanged from the hub repo and is the contract (game id `jjk-net0`).
`js/portal-port.js` is this game's side:

* **On every page** `PortalSDK.connect({ gameId: 'jjk-net0' })` runs once (resolves `null` when
  standalone). When connected, a *Portal* chip and a *Return to Portal* button appear, and the party
  is imported automatically (once per party id).
* **Import**: a card from this game adds the unit or raises its level. A card from another game
  (e.g. a Naruto card from `nxbnvnb`) becomes a playable **guest** `guest_<sourceGame>_<baseId>`:
  stats from `PortalSDK.denormalizeStats`, element / rarity / level from the card, the card's
  absolute art (falls back to a generated portrait if it can't load), and a cursed technique /
  ultimate borrowed from a same-element character. Guests work in the roster, teams and battle.
  Importing is a copy; importing the same card again only raises the level. Max 5 per import.
* **Export**: Settings › Portal › *Send to Portal* — pick up to 5 of your own units; when connected
  each is `session.grant`ed into the vault, and a Portal Code (`PRTL1.…`) is always produced.
  *Paste Portal Code* imports one. After battles, level-ups of party cards are reported with
  `session.update(cardId, { level })`.
* **Wallet**: when connected you can send JP (`coins`) and Cubes (`premium`) to the Portal
  and receive them back. Currency you send is held at the Portal, where it can be converted to other
  games' currencies or invested. Transfers are idempotent: each carries a `txId`, is stored as pending
  in the save in the same write as the local balance change, and is retried with the same `txId` on
  the next connect if the hub's answer was lost. Currency is never put in Portal Codes.
