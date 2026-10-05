"""tools/pp_assets.py - bring scraped Phantom Parade art into the game.

  python3 tools/scrape_pp_wiki.py        # (in a scratch folder) download + convert -> out/
  python3 tools/pp_assets.py <out-dir>   # copy into assets/pp/, cut portraits
  python3 tools/generate.py              # rebuild data/*.json using tools/pp-art.json

Copies every unit's art/icon/skill icons and every memory illustration into
assets/pp/, writes 3:4 portrait crops for the characters and bosses listed in
tools/pp-art.json, and writes assets/pp/CREDITS.md from the scrape manifest.
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'assets', 'pp')


def crop(src, dst, x):
    w, h = map(int, subprocess.run(['identify', '-format', '%w %h', src], capture_output=True, text=True).stdout.split())
    cw = round(h * 3 / 4)
    left = max(0, min(w - cw, round(w * x - cw / 2)))
    subprocess.run(['convert', src, '-crop', f'{cw}x{h}+{left}+0', '+repage', '-quality', '84',
                    '-define', 'webp:method=6', dst], check=True)


def main(src_dir):
    cfg = json.load(open(os.path.join(ROOT, 'tools', 'pp-art.json')))
    manifest = json.load(open(os.path.join(src_dir, 'manifest.json')))
    if os.path.exists(DEST):
        shutil.rmtree(DEST)
    for sub in ('units', 'memories', 'ui'):
        shutil.copytree(os.path.join(src_dir, sub), os.path.join(DEST, sub))
    os.makedirs(os.path.join(DEST, 'portraits'))
    # Every unit gets a 3:4 portrait; tools/pp-art.json can move the crop.
    units = json.load(open(os.path.join(ROOT, 'tools', 'pp-units.json')))
    crops = [(u['id'], u['slug'], cfg['characters'].get(u['id'], {}).get('x', 0.5)) for u in units]
    for gid, unit, x in crops:
        art = os.path.join(DEST, 'units', unit, 'art.webp')
        if not os.path.exists(art):
            sys.exit(f'missing art for {gid}: {unit}')
        crop(art, os.path.join(DEST, 'portraits', gid + '.webp'), x)
    for group in ('chapters', 'banners'):
        for gid, mem in cfg[group].items():
            if not os.path.exists(os.path.join(DEST, 'memories', mem, 'art.webp')):
                sys.exit(f'missing memory art for {gid}: {mem}')
    shutil.copy(os.path.join(src_dir, 'manifest.json'), os.path.join(DEST, 'manifest.json'))

    lines = ['# Phantom Parade art credits', '',
             'Art in this folder comes from *Jujutsu Kaisen Phantom Parade* (© Gege Akutami/Shueisha, '
             'JUJUTSU KAISEN Project; game © Sumzap / TOHO), collected from the fan wiki at '
             f'{manifest["source"]}. It is used here for a non-commercial fan project. '
             'Each entry links the wiki page it came from; full file URLs are in `manifest.json`.', '',
             "Card art is animated in the game. Each unit's animated card art is the wiki's own upload at its native size (an animated GIF, or an animated WebP named .gif; where both wikis host the same art the full-colour WebP or larger upload is used), re-encoded by `tools/animate_pp_art.py` as a looping animated WebP (`units/<slug>/art-anim.webp`: native width, <= 20 fps by keeping every k-th frame with the original timing, lossy quality 60). `art.webp` is the middle frame as a still poster, and the 3:4 portraits are cut from it. The exact source file of each unit is `sources.art` in `manifest.json`. Skill and unit icons are converted to WebP.", '',
             '## Units', '']
    for u in sorted(manifest['units'], key=lambda u: u['name']):
        lines.append(f'- [{u["name"]} ({u["epithet"]}) — {u["color"]} {u["rarity"]}]({u["page"]}) → `units/{u["id"]}/`')
    lines += ['', '## Memories', '']
    for m in sorted(manifest['memories'], key=lambda m: m['title']):
        lines.append(f'- [{m["title"]}]({m["page"]}) → `memories/{m["id"]}/`')
    lines += ['', '## UI', '', 'Colour-type icons, rarity badges and memory skill icons in `ui/`; sources in `manifest.json`.', '']
    open(os.path.join(DEST, 'CREDITS.md'), 'w').write('\n'.join(lines))
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(DEST) for f in fs)
    print(f'assets/pp: {size / 1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'out')
