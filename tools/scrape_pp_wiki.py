"""Download Jujutsu Kaisen Phantom Parade wiki art, organised by unit/memory.

Polite: one request at a time with a pause, cached on disk, resumable.
GIF card art is reduced to a single middle-frame WebP still.
Output: out/ + out/manifest.json (every file with its source page and URL).
"""
import json, os, re, subprocess, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = os.path.join(HERE, 'out')
UA = {'User-Agent': 'Mozilla/5.0 (jjk-net0 fan project asset survey)'}
WIKI = 'https://jujutsu-kaisen-phantom-parade.fandom.com/wiki/'
COLORS = ('Red', 'Blue', 'Green', 'Yellow', 'Purple')

images = {i['name'].replace(' ', '_'): i for i in json.load(open(os.path.join(HERE, 'allimages.json')))}
pages = json.load(open(os.path.join(HERE, 'pages.json')))
norm = lambda n: n.replace(' ', '_')


def fetch(name):
    """Original file into raw/, cached. Returns path or None."""
    info = images.get(norm(name))
    if not info:
        return None
    path = os.path.join(RAW, norm(name))
    if not os.path.exists(path):
        for attempt in range(3):
            try:
                req = urllib.request.Request(info['url'], headers=UA)
                data = urllib.request.urlopen(req, timeout=60).read()
                open(path, 'wb').write(data)
                break
            except Exception as e:  # noqa: BLE001
                print('  retry', name, e)
                time.sleep(3 * (attempt + 1))
        else:
            return None
        time.sleep(0.6)
    return path


def still(src, dst, width):
    """Middle frame of an animation, fully composited (GIFs store partial
    frames), as WebP. False if unreadable."""
    n = subprocess.run(['identify', src], capture_output=True, text=True).stdout.count('\n')
    if n < 1:
        print('  ! could not read', src)
        return False
    k = n // 2
    cmd = ['convert', src, '-coalesce']
    if n > 1:
        drop = ','.join(x for x in (f'0-{k - 1}' if k > 0 else '', f'{k + 1}-{n - 1}' if k < n - 1 else '') if x)
        if drop:
            cmd += ['-delete', drop]
    cmd += ['-resize', f'{width}x>', '-quality', '82', '-define', 'webp:method=6', dst]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0 or not os.path.exists(dst):
        print('  ! could not convert', src, r.stderr[-200:])
        return False
    return True


def copy_small(src, dst):
    r = subprocess.run(['convert', src + '[0]', '-quality', '90', dst], capture_output=True)
    if r.returncode != 0:
        print('  ! could not convert', src)


def key_of(fname):
    """'BlueSSRItadoriNormalAttack1.png' -> ('Blue', 'itadori')."""
    base = os.path.splitext(fname)[0].replace('Freecompress-', '').replace('-min', '')
    color = next((c for c in COLORS if base.startswith(c)), '')
    base = base[len(color):]
    base = re.sub(r'(NormalAttack|Skill|S1|S2|Ult|Art|Icon|Autoskill|AutoSkill)\d*(\(\d\))?\d*$', '', base)
    base = re.sub(r'^(SSR|SR)|(SSR|SR)$', '', base)
    base = re.sub(r'\d+$', '', base)
    return color, base.lower()


def parse_title(t):
    m = re.match(r'^\(\s*(.+?)\s*\)\s*(.+)$', t) or None
    if m:
        return m.group(2).strip(), m.group(1).strip()
    m = re.match(r'^(.+?)\s*\(\s*(.+?)\s*\)\s*$', t)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return t.strip(), ''


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def main():
    os.makedirs(RAW, exist_ok=True)
    manifest = {'source': 'https://jujutsu-kaisen-phantom-parade.fandom.com', 'units': [], 'memories': [], 'ui': []}
    seen = set()

    unit_icons = [n for n in images if n.endswith('.webp') and n.startswith(COLORS) and re.search(r'Icon\d*\.webp$', n)]

    for p in sorted(pages, key=lambda p: p['title']):
        t = p['title']
        if t.startswith('View source') or t.endswith('View source') or t in ('Test2',):
            continue
        imgs = [norm(i) for i in p['images']]
        is_unit = 'Energy.png' in imgs
        arts = [i for i in imgs if i.lower().endswith(('.gif',)) or re.search(r'Art\d*', i)]
        if is_unit:
            name, epithet = parse_title(t)
            rarity = 'SSR' if 'SSR.png' in imgs or any('SSR' in i for i in imgs) else 'SR'
            skills = {k: next((i for i in imgs if re.search(pat, i)), None) for k, pat in
                      (('normal', r'NormalAttack\d*\.png$'), ('s1', r'(S1\d*|Skill1(\(\d\))?)\.png$'),
                       ('s2', r'(S2\d*|Skill2(\(\d\))?)\.png$'), ('ult', r'Ult\d*\.png$'))}
            colored = [i for i in imgs if i.startswith(COLORS) and not i.endswith('Type.png')]
            color, key = key_of(colored[0]) if colored else ('', '')
            if not color:
                color = next((c for c in COLORS if c + 'Type.png' in imgs), '')
            art = next((i for i in arts if i.endswith('.gif')), None)
            icon = next((i for i in unit_icons if key_of(i) == (color, key) and (rarity in i)), None) if key else None
            sid = slug(f'{name}-{epithet}') or slug(t)
            d = os.path.join(OUT, 'units', sid)
            os.makedirs(d, exist_ok=True)
            files = {}
            print('unit', sid, color, rarity, art, icon)
            if art and os.path.exists(os.path.join(d, 'art.webp')):
                files['art'] = 'art.webp'
            elif art and (src := fetch(art)):
                if still(src, os.path.join(d, 'art.webp'), 800): files['art'] = 'art.webp'
                if src.endswith('.gif'):
                    os.remove(src)
            if icon and (src := fetch(icon)):
                copy_small(src, os.path.join(d, 'icon.webp')); files['icon'] = 'icon.webp'
            for k, f in skills.items():
                if f and (src := fetch(f)):
                    copy_small(src, os.path.join(d, k + '.webp')); files[k] = k + '.webp'
            manifest['units'].append({'id': sid, 'name': name, 'epithet': epithet, 'color': color, 'rarity': rarity,
                                      'page': WIKI + urllib.parse.quote(t.replace(' ', '_')), 'files': files,
                                      'sources': {k: images[norm(v)]['url'] for k, v in
                                                  [('art', art), ('icon', icon)] + list(skills.items()) if v and norm(v) in images}})
        elif arts and any(i in imgs for i in ('SSR.png', 'SR.png')) and any(i.startswith('Memory') for i in imgs):
            art = next((i for i in arts if i.endswith('.gif')), None)
            if not art or art in seen:
                continue
            seen.add(art)
            rarity = 'SSR' if 'SSR.png' in imgs else 'SR'
            sid = slug(t)
            d = os.path.join(OUT, 'memories', sid)
            os.makedirs(d, exist_ok=True)
            print('memory', sid, rarity, art)
            files = {}
            if os.path.exists(os.path.join(d, 'art.webp')):
                files['art'] = 'art.webp'
            elif (src := fetch(art)):
                if still(src, os.path.join(d, 'art.webp'), 720): files['art'] = 'art.webp'
                os.remove(src)
            manifest['memories'].append({'id': sid, 'title': t, 'rarity': rarity, 'page': WIKI + urllib.parse.quote(t.replace(' ', '_')),
                                         'files': files, 'sources': {'art': images[art]['url']}})

    # Shared UI pieces: type (colour) icons, rarity badges, memory skill icons.
    ui = [n for n in images if re.match(r'^(Red|Blue|Green|Yellow|Purple)Type\.png$', n)]
    ui += [n for n in ('SSR.png', 'SR.png', 'R.png', 'Icon_rarity_ssr.png', 'Energy.png') if n in images]
    ui += [n for n in images if n.startswith('Memory') and n.endswith('.png')]
    d = os.path.join(OUT, 'ui')
    os.makedirs(d, exist_ok=True)
    for n in ui:
        if (src := fetch(n)):
            out = os.path.splitext(n)[0] + '.webp'
            copy_small(src, os.path.join(d, out))
            manifest['ui'].append({'file': out, 'source': images[n]['url']})
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    print('units', len(manifest['units']), 'memories', len(manifest['memories']), 'ui', len(manifest['ui']))


if __name__ == '__main__':
    main()
