"""tools/clean_pp_anim.py - de-grain and upscale the animated card art.

  python3 tools/clean_pp_anim.py --cache DIR            # every unit (resumable)
  python3 tools/clean_pp_anim.py --cache DIR <slug> ... # just these units

Most wiki uploads are ~600 px animations converted from dithered GIFs, so the
dither shows as grain once a phone stretches them full-screen. For each unit
this re-downloads the chosen original (assets/pp/manifest.json sources.art),
runs every kept frame through Real-ESRGAN's anime-video model at 2x (which
removes the dither and sharpens line art), scales to WIDTH and writes:

  assets/pp/units/<slug>/art-anim.webp  animated, <= MAX_FPS, quality QUALITY
  assets/pp/units/<slug>/art.webp       still poster (cleaned middle frame)
  assets/pp/portraits/<id>.webp         3:4 portrait recut from that still

Sources already WIDTH or wider skip the model. Units finished are listed in
<cache>/clean-done.json so a stopped run picks up where it left off.

Needs Pillow, ImageMagick (portraits), realesrgan-ncnn-py and libomp5
(pip install realesrgan-ncnn-py; apt-get install libomp5). Runs on the CPU
(~2 s a frame on one core), so units run --jobs at a time; all of them take
about an hour on 4 cores.
"""
import argparse, json, os, sys, time
from concurrent.futures import ProcessPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from animate_pp_art import DEST, download, frames_of, wiki_of, file_of  # noqa: E402

WIDTH, MAX_FPS = 900, 15
QUALITY, QUALITY_BIG, BIG = 80, 72, 5_000_000


_model = []


def clean(slug, src, portrait, x):
    from PIL import Image
    if not _model:
        from realesrgan_ncnn_py import Realesrgan
        _model.append(Realesrgan(gpuid=-1, model=0))  # realesr-animevideov3, x2
    model = _model[0]
    t0 = time.time()
    d = os.path.join(DEST, 'units', slug)
    frames, durs, mid, n, total = frames_of(src, MAX_FPS)
    up = frames[0].width < WIDTH

    def fix(f):
        if up:
            f = model.process_pil(f)
        if f.width > WIDTH:
            f = f.resize((WIDTH, round(f.height * WIDTH / f.width)), Image.LANCZOS)
        return f

    out = [fix(f) for f in frames]
    still = fix(mid)
    still.save(os.path.join(d, 'art.webp'), quality=85, method=6)
    if portrait:
        from pp_assets import crop
        crop(os.path.join(d, 'art.webp'), portrait, x)
    info = {'width': still.width, 'height': still.height, 'frames': n, 'ms': total}
    if len(out) > 1:
        anim = os.path.join(d, 'art-anim.webp')
        for q in (QUALITY, QUALITY_BIG):
            out[0].save(anim, save_all=True, append_images=out[1:], duration=durs, loop=0,
                        quality=q, method=4, kmax=0)
            if os.path.getsize(anim) <= BIG:
                break
        info.update(keptFrames=len(out), fps=round(len(out) * 1000 / total, 1), quality=q,
                    bytes=os.path.getsize(anim), cleaned=up)
    info['secs'] = round(time.time() - t0)
    return slug, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('slugs', nargs='*')
    ap.add_argument('--cache', required=True, help='directory for originals and progress')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 1)
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    mpath = os.path.join(DEST, 'manifest.json')
    done_path = os.path.join(a.cache, 'clean-done.json')
    done = json.load(open(done_path)) if os.path.exists(done_path) else {}
    gids = {u['slug']: u['id'] for u in json.load(open(os.path.join(HERE, 'pp-units.json')))}
    xs = json.load(open(os.path.join(HERE, 'pp-art.json')))['characters']
    units = [u for u in json.load(open(mpath))['units']
             if u.get('files', {}).get('anim') and (not a.slugs or u['id'] in a.slugs)
             and (a.slugs or u['id'] not in done)]
    jobs = []
    for u in units:  # downloads one at a time (polite), then encode in parallel
        url = u['sources']['art']
        src = os.path.join(a.cache, f'{wiki_of(url)}_{file_of(url)}')
        if not os.path.exists(src) and not download(url, src):
            print('! download failed', u['id'], flush=True)
            continue
        gid = gids.get(u['id'])
        jobs.append((u['id'], src, os.path.join(DEST, 'portraits', gid + '.webp') if gid else None,
                     xs.get(gid, {}).get('x', 0.5)))
    print(len(jobs), 'units to clean', flush=True)
    with ProcessPoolExecutor(a.jobs) as ex:
        futs = [ex.submit(clean, *j) for j in jobs]
        for i, f in enumerate(as_completed(futs), 1):
            slug, info = f.result()
            done[slug] = info
            json.dump(done, open(done_path, 'w'), indent=1)
            print(f'[{i}/{len(jobs)}] {slug} {info.get("width")}x{info.get("height")} '
                  f'{info.get("keptFrames")}f {info.get("bytes", 0) // 1000} KB {info["secs"]}s', flush=True)
    # record the new sizes in the manifest (read fresh: other tools may have written it)
    m = json.load(open(mpath))
    for u in m['units']:
        if u['id'] in done:
            u['anim'] = {k: done[u['id']][k] for k in ('width', 'height', 'frames', 'ms', 'keptFrames', 'fps') if k in done[u['id']]}
    json.dump(m, open(mpath, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
