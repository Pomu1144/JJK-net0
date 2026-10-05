"""tools/fetch_pp_units.py - fetch Phantom Parade unit pages from a fan wiki.

  python3 tools/fetch_pp_units.py                 # new wiki: every SSR on SSR_Character
  python3 tools/fetch_pp_units.py --list SR_Character
  python3 tools/fetch_pp_units.py --wiki old "Page title" ...

Reads the `{{Character Page|...}}` template of every unit page through the
MediaWiki API and merges it into tools/pp-units-raw.json (slug -> {title, tabs,
fields, wiki, page}). Existing entries are kept; pass --refresh to refetch.
Unit pages listed on a rarity page also record their list icon (`listIcon`).

A page is skipped when its card art is the same file as a unit already in the
raw file (the new wiki retranslated many epithets of the old wiki's units), or
when its card art was never uploaded (the game only uses units with real art).

  python3 tools/fetch_pp_units.py --art           # art for new-wiki units -> assets/pp/

`--art` downloads each new-wiki unit's card art (animated GIF/WebP -> middle
frame, fully composited, WebP <= 800 px wide), list icon and skill icons into
assets/pp/units/<slug>/, cuts its 3:4 portrait (x offset from tools/pp-art.json
"characters", by game id from tools/pp-units.json - run tools/pp_units.py
first), and adds the unit to assets/pp/manifest.json and CREDITS.md.
Needs ImageMagick.

Polite: one request at a time, ~0.6 s apart, retries on 429/5xx.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'pp-units-raw.json')
WIKIS = {
    'new': 'https://jjk-phantom-parade.fandom.com',
    'old': 'https://jujutsu-kaisen-phantom-parade.fandom.com',
}
UA = {'User-Agent': 'Mozilla/5.0 (jjk-net0 fan project; unit data survey)'}
_last = [0.0]


def api(base, **params):
    params.setdefault('format', 'json')
    params.setdefault('formatversion', '2')
    url = base + '/api.php?' + urllib.parse.urlencode(params)
    for attempt in range(5):
        wait = 0.6 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504):
                raise
            print('  retry', e.code, file=sys.stderr)
        except (urllib.error.URLError, TimeoutError) as e:
            print('  retry', e, file=sys.stderr)
        time.sleep(3 * (attempt + 1))
    raise RuntimeError('giving up on ' + url)


def split_params(body):
    """Split template text on top-level '|' (ignores [[...]] / {{...}} nesting)."""
    out, cur, depth, i = [], [], 0, 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ('[[', '{{'):
            depth += 1; cur.append(two); i += 2; continue
        if two in (']]', '}}') and depth:
            depth -= 1; cur.append(two); i += 2; continue
        if body[i] == '|' and depth == 0:
            out.append(''.join(cur)); cur = []; i += 1; continue
        cur.append(body[i]); i += 1
    out.append(''.join(cur))
    return out


def templates(text, name):
    """Bodies of every {{name|...}} (or {{name (Adjustment)|...}}) in text (nesting-aware)."""
    found = []
    for m in re.finditer(r'\{\{\s*' + re.escape(name) + r'(?:[\s_]*\([^)|}]*\))?\s*\|', text):
        depth, i = 1, m.end()
        while i < len(text) and depth:
            if text.startswith('{{', i):
                depth += 1; i += 2
            elif text.startswith('}}', i):
                depth -= 1; i += 2
            else:
                i += 1
        found.append(text[m.end():i - 2])
    return found


def fields_of(body):
    f = {}
    for p in split_params(body):
        if '=' in p:
            k, v = p.split('=', 1)
            f[k.strip()] = v.strip()
    return f


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def parse_title(t):
    m = re.match(r'^\(\s*(.+?)\s*\)\s*(.+)$', t)
    if m:
        return m.group(2).strip(), m.group(1).strip()
    m = re.match(r'^(.+?)\s*\(\s*(.+?)\s*\)\s*$', t)
    return (m.group(1).strip(), m.group(2).strip()) if m else (t.strip(), '')


def unit_slug(title):
    name, epithet = parse_title(title)
    return slug(f'{name}-{epithet}') or slug(title)


def list_page(base, page):
    """[(title, icon)] from a rarity list page ({{Character List}} per colour tab)."""
    text = api(base, action='parse', page=page, prop='wikitext', redirects=1)['parse']['wikitext']
    out = []
    for body in templates(text, 'Character List'):
        f = fields_of(body)
        for k, v in f.items():
            m = re.match(r'Character Link (\d+)$', k)
            if m and v:
                out.append((v, f.get('Unit' + m.group(1), '')))
    return out


def fetch_page(base, title):
    """(resolved title, template fields, tab count) or None when the page has no unit template."""
    try:
        d = api(base, action='parse', page=title, prop='wikitext', redirects=1)
    except urllib.error.HTTPError:
        d = {}
    if 'parse' not in d:
        hits = api(base, action='query', list='search', srsearch=title, srlimit=3)['query']['search']
        if not hits:
            return None
        d = api(base, action='parse', page=hits[0]['title'], prop='wikitext', redirects=1)
        if 'parse' not in d:
            return None
    text = d['parse']['wikitext']
    bodies = templates(text, 'Character Page')
    if not bodies:
        return None
    return d['parse']['title'], fields_of(bodies[0]), len(bodies)


def art_key(fields):
    """'[[File:Freecompress-BlueGojoSSRArt1-min.gif]]' -> 'bluegojoart1' (same art = same unit)."""
    a = re.sub(r'\[\[File:|\]\]|\.(gif|png|webp)\b|\s', '', fields.get('Card Art', '')).split('|')[0]
    a = a.replace('Freecompress-', '').replace('-min', '').replace('SSR', '')
    return {'MakiZeninRebelliousFailurecompressed': 'RedMakiArt1'}.get(a, a).lower()


def image_info(base, names):
    """{name: {url, width, height, size}} for files that exist (tries .png/.gif/.jpeg/.webp)."""
    want = {}
    for n in names:
        n = re.sub(r'\[\[File:|\]\]', '', n or '').split('|')[0].strip()
        if n:
            want[n] = [n] if re.search(r'\.\w{3,4}$', n) else [n + e for e in ('.gif', '.png', '.jpeg', '.jpg', '.webp')]
    cands = sorted({c for cs in want.values() for c in cs})
    found = {}
    for i in range(0, len(cands), 50):
        d = api(base, action='query', titles='|'.join('File:' + c for c in cands[i:i + 50]),
                prop='imageinfo', iiprop='url|size')
        for pg in d['query']['pages']:
            if pg.get('imageinfo'):
                ii = pg['imageinfo'][0]
                found[pg['title'][5:].replace('_', ' ')] = {'url': ii['url'], 'width': ii['width'], 'height': ii['height'],
                                                             'size': ii['size'], 'file': pg['title'][5:]}
    out = {}
    for n, cs in want.items():
        hit = next((found[c.replace('_', ' ')] for c in cs if c.replace('_', ' ') in found), None)
        if hit:
            out[n] = hit
    return out


def download(url, path):
    for attempt in range(4):
        wait = 0.6 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(path, 'wb') as f:
                shutil.copyfileobj(r, f)
            return True
        except Exception as e:  # noqa: BLE001
            print('  retry', url, e, file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    return False


def still(src, dst, width=800):
    """Middle frame of an animation (GIF or animated WebP), fully composited, as WebP."""
    n = subprocess.run(['identify', src], capture_output=True, text=True).stdout.count('\n')
    if n < 1:
        return False
    k = n // 2  # only frames 0..k are read: enough to composite frame k, half the memory
    cmd = ['convert', f'{src}[0-{k}]', '-coalesce']
    if k > 0:
        cmd += ['-delete', f'0-{k - 1}']
    cmd += ['-resize', f'{width}x>', '-quality', '80', '-define', 'webp:method=6', dst]
    return subprocess.run(cmd, capture_output=True).returncode == 0 and os.path.exists(dst)


def small(src, dst, box):
    return subprocess.run(['convert', src + '[0]', '-resize', f'{box}x{box}>', '-quality', '86', dst],
                          capture_output=True).returncode == 0


def fetch_art(raw):
    root = os.path.dirname(HERE)
    dest = os.path.join(root, 'assets', 'pp')
    manifest = json.load(open(os.path.join(dest, 'manifest.json')))
    known = {u['id'] for u in manifest['units']}
    units = {u['slug']: u for u in json.load(open(os.path.join(HERE, 'pp-units.json')))}
    xs = json.load(open(os.path.join(HERE, 'pp-art.json')))['characters']
    sys.path.insert(0, HERE)
    from pp_assets import crop
    tmp = tempfile.mkdtemp(prefix='ppart-')
    added = []
    for s, u in raw.items():
        base = u.get('wiki')
        if base != WIKIS['new']:
            continue
        d = os.path.join(dest, 'units', s)
        f = u['fields']
        parts = {'art': f.get('Card Art'), 'icon': u.get('listIcon'), 'normal': f.get('NormalAttackImg'),
                 's1': f.get('Skill1Img'), 's2': f.get('Skill2Img'), 'ult': f.get('UltImg')}
        if not os.path.exists(os.path.join(d, 'art.webp')):
            info = image_info(base, parts.values())
            os.makedirs(d, exist_ok=True)
            files, sources = {}, {}
            for k, name in parts.items():
                name = re.sub(r'\[\[File:|\]\]', '', name or '').split('|')[0].strip()
                ii = info.get(name)
                if not ii:
                    print('  ! no file', s, k, name)
                    continue
                src = os.path.join(tmp, ii['file'].replace(' ', '_'))
                if not download(ii['url'], src):
                    continue
                ok = still(src, os.path.join(d, 'art.webp')) if k == 'art' else \
                    small(src, os.path.join(d, k + '.webp'), 100 if k == 'icon' else 70)
                os.remove(src)
                if ok:
                    files[k] = k + '.webp'
                    sources[k] = ii['url']
            if 'art' not in files:
                print('  ! no card art for', s)
                shutil.rmtree(d)
                continue
            name, epithet = parse_title(u['title'])
            entry = {'id': s, 'name': re.sub(r'\s*\(Teen\)', ' (Teen)', name), 'epithet': epithet,
                     'color': f.get('Type', '').replace('Type', ''), 'rarity': f.get('Rarity', '').strip(),
                     'page': u['page'], 'wiki': base, 'files': files, 'sources': sources}
            manifest['units'] = [m for m in manifest['units'] if m['id'] != s] + [entry]
            added.append(entry)
            print('art', s, sorted(files))
        g = units.get(s)
        if g:
            crop(os.path.join(d, 'art.webp'), os.path.join(dest, 'portraits', g['id'] + '.webp'),
                 xs.get(g['id'], {}).get('x', 0.5))
        else:
            print('  ! not in tools/pp-units.json yet (run tools/pp_units.py, then --art again):', s)
    shutil.rmtree(tmp, ignore_errors=True)
    json.dump(manifest, open(os.path.join(dest, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    # CREDITS.md: one section for units taken from the new wiki.
    cred = os.path.join(dest, 'CREDITS.md')
    text = open(cred).read()
    head = '## Units (jjk-phantom-parade.fandom.com)'
    lines = [head, '', 'Card art, unit icons and skill icons of these units come from the newer fan wiki at '
             f'{WIKIS["new"]} (same treatment as above).', '']
    for m in sorted((m for m in manifest['units'] if m.get('wiki') == WIKIS['new']), key=lambda m: (m['name'], m['epithet'])):
        lines.append(f'- [{m["name"]} ({m["epithet"]}) — {m["color"]} {m["rarity"]}]({m["page"]}) → `units/{m["id"]}/`')
    block = '\n'.join(lines) + '\n\n'
    if head in text:
        text = re.sub(re.escape(head) + r'.*?(?=\n## )\n', lambda _: block, text, flags=re.S)
    else:
        text = text.replace('## Memories', block + '## Memories', 1)
    open(cred, 'w').write(text)
    print(len(added), 'units given art')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('titles', nargs='*')
    ap.add_argument('--wiki', default='new', choices=sorted(WIKIS))
    ap.add_argument('--list', default=None, help='rarity list page (default SSR_Character when no titles)')
    ap.add_argument('--refresh', action='store_true')
    ap.add_argument('--skip', default=None, help='JSON file with titles to skip (already in the game)')
    ap.add_argument('--out', default=RAW, help='raw JSON to merge into (default tools/pp-units-raw.json)')
    ap.add_argument('--art', action='store_true', help='download art for new-wiki units instead')
    a = ap.parse_args()
    base = WIKIS[a.wiki]
    out = a.out
    raw = json.load(open(out)) if os.path.exists(out) else {}
    if a.art:
        return fetch_art(raw)
    arts = {art_key(u['fields']): (u.get('wiki'), u['title']) for u in raw.values()}
    have = {(u.get('wiki'), t) for u in raw.values() for t in (u['title'], u.get('listTitle'))}
    todo = [(t, '') for t in a.titles]
    if a.list or not todo:
        todo += list_page(base, a.list or 'SSR_Character')
    skip = set(json.load(open(a.skip))) if a.skip else set()
    missing = []
    for title, icon in todo:
        if title in skip or (not a.refresh and (base, title) in have):
            continue
        got = fetch_page(base, title)
        if not got:
            print('  ! no unit page:', title)
            missing.append(title)
            continue
        real, fields, tabs = got
        if arts.get(art_key(fields), (base, real)) != (base, real):
            print('  = already in the game (same card art):', real)
            continue
        if not image_info(base, [fields.get('Card Art')]):
            print('  ! card art not uploaded:', real, fields.get('Card Art'))
            missing.append(real + ' (no card art file)')
            continue
        s = unit_slug(real)
        if s in raw and raw[s].get('wiki') != base:
            s += '-' + a.wiki
        raw[s] = {'title': real, 'tabs': tabs, 'fields': fields, 'wiki': base,
                  'page': base + '/wiki/' + urllib.parse.quote(real.replace(' ', '_'))}
        if icon:
            raw[s]['listIcon'] = icon
        if real != title:
            raw[s]['listTitle'] = title
        print('ok', s, '|', real)
        json.dump(raw, open(out, 'w'), indent=1, ensure_ascii=False)
    print(len(raw), 'units in', out, '| skipped:', missing)


if __name__ == '__main__':
    main()
