"""tools/animate_pp_art.py - animated card art for every Phantom Parade unit.

  python3 tools/animate_pp_art.py                 # every unit in assets/pp/manifest.json
  python3 tools/animate_pp_art.py <slug> ...      # just these units
  python3 tools/animate_pp_art.py --cache DIR     # keep downloaded originals in DIR

In the game each unit's card art is a short looping animation. The fan wikis
host it as an animated GIF or an animated WebP (named .gif) of 400-1689 px
width, 56-180 frames, about 6 s. For every unit this script

  1. finds the best upload of its card art: the file in the manifest plus the
     newer wiki's re-upload of old-wiki units (same name without
     "Freecompress-"/"-min"), picking the widest, then a full-colour WebP over
     a dithered GIF, then the larger file;
  2. writes assets/pp/units/<slug>/art-anim.webp - an animated, looping WebP
     at the source's native size, every k-th frame kept so the rate is <= 20 fps
     with an even cadence (30 fps -> 15, 25 fps -> 12.5, 20 fps kept; each kept frame
     lasts as long as the frames it replaces, so timing is unchanged),
     lossy quality 60 (50 if the result is over 4.5 MB);
  3. rewrites art.webp, the still poster (middle frame, native size, q 82);
  4. recuts the 3:4 portrait in assets/pp/portraits/ from that still;
  5. records the chosen file in assets/pp/manifest.json (sources.art,
     files.anim, anim {width, height, frames, fps, ms}).

Then run tools/generate.py so characters get art.anim.

Needs Pillow (pip install pillow; WebP support) and ImageMagick (portraits).
Polite: one request at a time, ~0.6 s apart, retries on 429/5xx.
"""
import argparse, json, os, re, sys, tempfile, time, urllib.parse, urllib.request
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEST = os.path.join(ROOT, 'assets', 'pp')
sys.path.insert(0, HERE)
from fetch_pp_units import api, WIKIS  # noqa: E402

UA = {'User-Agent': 'Mozilla/5.0 (jjk-net0 fan project; animated card art)'}
MAX_FPS = 20
QUALITY, QUALITY_BIG, BIG = 60, 50, 4_500_000
_last = [0.0]


def download(url, path):
    for attempt in range(5):
        wait = 0.6 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
            with open(path, 'wb') as f:
                f.write(data)
            return True
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504):
                print('  !', e.code, url)
                return False
        except (urllib.error.URLError, TimeoutError) as e:
            print('  retry', e)
        time.sleep(3 * (attempt + 1))
    return False


def wiki_of(url):
    return 'new' if '/jjk-phantom-parade/' in url else 'old'


def file_of(url):
    return urllib.parse.unquote(url.split('/revision/')[0].rsplit('/', 1)[1]).replace(' ', '_')


def image_info(wiki, names):
    r = api(WIKIS[wiki], action='query', prop='imageinfo', iiprop='url|size|mime',
            titles='|'.join('File:' + n for n in names))
    out = {}
    for p in r['query']['pages']:
        if p.get('imageinfo'):
            ii = p['imageinfo'][0]
            out[p['title'][5:].replace(' ', '_')] = dict(ii, wiki=wiki, name=p['title'][5:].replace(' ', '_'))
    return out


def candidates(unit):
    """Every upload of this unit's card art on the two wikis (imageinfo dicts)."""
    url = unit['sources']['art']
    w, name = wiki_of(url), file_of(url)
    found = list(image_info(w, [name]).values())
    if w == 'old':
        alt = re.sub(r'^Freecompress-', '', name).replace('-min.gif', '.gif')
        found += list(image_info('new', [alt]).values())
    return found


def is_webp(path):
    with open(path, 'rb') as f:
        head = f.read(12)
    return head[:4] == b'RIFF' and head[8:12] == b'WEBP'


def frames_of(path, max_fps):
    """Composited RGB frames of an animation, every k-th frame so the rate is
    <= max_fps with an even cadence (each kept frame lasts as long as the k
    frames it stands for), their durations (ms), the middle frame of the
    original, the original frame count and total time. Only kept frames are
    held in memory."""
    import math
    from PIL import Image, ImageSequence
    im = Image.open(path)
    n = getattr(im, 'n_frames', 1)
    durs_in = []
    for f in ImageSequence.Iterator(im):
        f.load()  # WebP frames only report their duration once decoded
        durs_in.append(f.info.get('duration') or im.info.get('duration') or 100)
    total = sum(durs_in)
    k = max(1, math.ceil(n * 1000 / total / max_fps - 1e-6)) if n > 1 else 1
    out, durs, mid = [], [], None
    for i, f in enumerate(ImageSequence.Iterator(im)):
        if i % k and i != n // 2:
            continue
        rgb = f.convert('RGB')
        if i == n // 2:
            mid = rgb
        if i % k == 0:
            out.append(rgb)
            durs.append(sum(durs_in[i:i + k]))
    return out, durs, mid or out[0], n, total


def convert(job):
    """Encode one unit (runs in a worker process)."""
    slug, src, portrait, x = job
    from PIL import Image  # noqa: F401
    d = os.path.join(DEST, 'units', slug)
    frames, durs, mid, n, total = frames_of(src, MAX_FPS)
    mid.save(os.path.join(d, 'art.webp'), quality=82, method=6)
    info = {'width': mid.width, 'height': mid.height, 'frames': n, 'ms': total}
    anim = os.path.join(d, 'art-anim.webp')
    if len(frames) > 1:
        q = QUALITY
        for q in (QUALITY, QUALITY_BIG):
            frames[0].save(anim, save_all=True, append_images=frames[1:], duration=durs, loop=0,
                           quality=q, method=6, kmax=0)
            if os.path.getsize(anim) <= BIG:
                break
        info.update(keptFrames=len(frames), fps=round(len(frames) * 1000 / total, 1), quality=q,
                    bytes=os.path.getsize(anim))
    elif os.path.exists(anim):
        os.remove(anim)
    if portrait:
        from pp_assets import crop
        crop(os.path.join(d, 'art.webp'), portrait, x)
    return slug, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('slugs', nargs='*')
    ap.add_argument('--cache', default=None, help='directory for downloaded originals (kept)')
    ap.add_argument('--jobs', type=int, default=max(1, min(4, os.cpu_count() or 1)))
    a = ap.parse_args()
    manifest = json.load(open(os.path.join(DEST, 'manifest.json')))
    gids = {u['slug']: u['id'] for u in json.load(open(os.path.join(HERE, 'pp-units.json')))}
    xs = json.load(open(os.path.join(HERE, 'pp-art.json')))['characters']
    cache = a.cache or tempfile.mkdtemp(prefix='ppanim-')
    os.makedirs(cache, exist_ok=True)
    units = [u for u in manifest['units'] if not a.slugs or u['id'] in a.slugs]
    jobs, chosen = [], {}
    for u in units:
        cands = []
        for c in candidates(u):
            path = os.path.join(cache, f'{c["wiki"]}_{c["name"]}')
            if not (os.path.exists(path) and os.path.getsize(path) == c['size']) and not download(c['url'], path):
                continue
            c['path'], c['webp'] = path, is_webp(path)
            cands.append(c)
        if not cands:
            print('  ! no card art for', u['id'])
            continue
        best = max(cands, key=lambda c: (c['width'], c['webp'], c['size']))
        chosen[u['id']] = best
        print(u['id'], '<-', best['wiki'], best['name'], f'{best["width"]}x{best["height"]}',
              'webp' if best['webp'] else 'gif', f'{best["size"] // 1000} KB', flush=True)
        gid = gids.get(u['id'])
        portrait = os.path.join(DEST, 'portraits', gid + '.webp') if gid else None
        jobs.append((u['id'], best['path'], portrait, xs.get(gid, {}).get('x', 0.5)))
    with ProcessPoolExecutor(a.jobs) as ex:
        for slug, info in ex.map(convert, jobs):
            u = next(m for m in manifest['units'] if m['id'] == slug)
            c = chosen[slug]
            u['sources']['art'] = c['url']
            u['files']['art'] = 'art.webp'
            if 'bytes' in info:
                u['files']['anim'] = 'art-anim.webp'
            else:
                u['files'].pop('anim', None)
            u['anim'] = {k: info[k] for k in ('width', 'height', 'frames', 'ms', 'keptFrames', 'fps') if k in info}
            print('  done', slug, info, flush=True)
    json.dump(manifest, open(os.path.join(DEST, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    total = sum(os.path.getsize(os.path.join(DEST, 'units', u['id'], 'art-anim.webp'))
                for u in manifest['units'] if os.path.exists(os.path.join(DEST, 'units', u['id'], 'art-anim.webp')))
    print(f'{len(jobs)} units processed; animated art total {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
