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
| `home.html` | Jujutsu High hub: home character, rank, stamina, quick tiles, nav dock |
| `characters.html` | Roster grid (filter/sort) + detail: stats, techniques, passives, support skill, level-up with talismans |
| `summon.html` | 3 banners, x1 / x10 pulls, rates table, pity (60), 10x ★5 guarantee, CSS reveal animation |
| `teams.html` | 3 team presets: 4 front slots + 1 support (commander) whose support skill boosts the team |
| `missions.html` | 4 chapters (Cursed Womb, Origin of Obedience, Kyoto Goodwill, Shibuya) × 5 stages with bosses, stamina, stars, first-clear bonus |
| `battle.html` | Turn-based battle vs waves of curses (see below) |
| `shop.html` | Talismans (EXP), stamina, summon tickets, daily gift |
| `settings.html` | Audio, Display, Account, Data (export / import JSON) and **Portal** |

31 characters (★3–★7) in `data/characters.json`, 17 curses in `data/enemies.json`, 20 stages in
`data/missions.json`. `tools/generate.py` rebuilds all data and generated art.

### Art
- **Phantom Parade art** (`assets/pp/`, 4.5 MB): card art, icons and skill icons for 50 units and
  104 memory illustrations from the *Jujutsu Kaisen Phantom Parade* fan wiki, with every file
  credited in `assets/pp/CREDITS.md` and `assets/pp/manifest.json`. 20 characters and the Mahito,
  Todo, Hanami and Jogo bosses use it; memory scenes are the backdrops of the four chapters and the
  three summon banners. Mapping and portrait crops: `tools/pp-art.json`.
- Gojo and both Sukunas use art shared with NXBNVNB.
- Characters the wiki has no art for (Choso, Mei Mei, Naoya, Kenjaku, Yuki, Hakari, Kashimo,
  Higuruma) keep a generated SVG portrait (`assets/portraits/`).

Refreshing the art:

```sh
python3 tools/scrape_pp_wiki.py        # run in a scratch folder: downloads + converts to out/ (needs ffmpeg, ImageMagick)
python3 tools/pp_assets.py path/to/out # copies into assets/pp/, cuts portraits, writes CREDITS.md
python3 tools/generate.py              # rebuilds data/*.json
```

### Battle

* Your 4 front units vs 2–3 waves of curses; every unit acts in speed order each turn.
* **Attack** (+1 cursed energy), **Cursed Technique** (spends cursed-energy orbs from a shared pool of
  20; +2 per turn) and, for ★5+, **Domain Expansion / Ultimate** once the unit's gauge is full.
* Elements as in NXBNVNB: Body › Skill › Heart › Body; Bravery ⇄ Wisdom. 1.5× / 0.75×
  (all numbers live in `js/rules.js`).
* Stars: clear · nobody knocked out · clear within the turn goal. Auto battle and 1–3× speed.
* `js/battle-engine.js` is DOM-free (also loads in Node for balance simulations).

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
* **Wallet**: when connected you can send Yen (`coins`) and Cursed Cubes (`premium`) to the Portal
  and receive them back. Currency you send is held at the Portal, where it can be converted to other
  games' currencies or invested. Transfers are idempotent: each carries a `txId`, is stored as pending
  in the save in the same write as the local balance change, and is retried with the same `txId` on
  the next connect if the hub's answer was lost. Currency is never put in Portal Codes.
