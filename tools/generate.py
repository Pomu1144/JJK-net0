#!/usr/bin/env python3
"""tools/generate.py - builds the game's data and generated art.

Writes data/*.json and the stylised SVG portraits in assets/portraits/ and
assets/enemies/. Run from the repo root:  python3 tools/generate.py
Everything is deterministic, so re-running produces identical files.
"""
import json, math, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def out(path, obj):
    p = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        if isinstance(obj, str):
            f.write(obj)
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write('\n')

# ---------------------------------------------------------------------------
# Elements (same five as NXBNVNB). Colours match the orb art.
ELEMENTS = {
    'Body':    {'c1': '#3f8fe0', 'c2': '#0b2a52', 'glow': '#9fd0ff'},
    'Skill':   {'c1': '#33b56a', 'c2': '#0a3b23', 'glow': '#a6f0c2'},
    'Heart':   {'c1': '#e0453f', 'c2': '#4a0c0e', 'glow': '#ffb0a4'},
    'Bravery': {'c1': '#e3b52c', 'c2': '#4a3506', 'glow': '#fff0a6'},
    'Wisdom':  {'c1': '#9a5ae0', 'c2': '#2a0f4d', 'glow': '#dcc0ff'},
}

MAX_LEVEL = {3: 30, 4: 50, 5: 70, 6: 100, 7: 100}
# statsBase / statsMax ranges per rarity (NXBNVNB scale)
RANGES = {
    3: ({'hp': 3200, 'atk': 270, 'speed': 100}, {'hp': 7600, 'atk': 600, 'speed': 210}),
    4: ({'hp': 5200, 'atk': 460, 'speed': 115}, {'hp': 12400, 'atk': 1040, 'speed': 260}),
    5: ({'hp': 8600, 'atk': 760, 'speed': 135}, {'hp': 21000, 'atk': 1780, 'speed': 310}),
    6: ({'hp': 14800, 'atk': 1380, 'speed': 150}, {'hp': 35500, 'atk': 3350, 'speed': 360}),
    7: ({'hp': 27200, 'atk': 2640, 'speed': 200}, {'hp': 55400, 'atk': 5280, 'speed': 400}),
}
PROFILES = {  # unused by Phantom Parade units (they carry their own profile)
    'balanced': {'hp': 1.0, 'atk': 1.0, 'speed': 1.0},
    'tank':     {'hp': 1.22, 'atk': 0.88, 'speed': 0.92},
    'striker':  {'hp': 0.9, 'atk': 1.16, 'speed': 1.0},
    'speed':    {'hp': 0.9, 'atk': 1.02, 'speed': 1.2},
}
# Real stats from NXBNVNB for the three characters that share art
REAL = {
    'gojo_9005':   ({'hp': 27200, 'atk': 2640, 'speed': 202}, {'hp': 55400, 'atk': 5280, 'speed': 404}),
    'sukuna_9006': ({'hp': 27400, 'atk': 2700, 'speed': 199}, {'hp': 54800, 'atk': 5400, 'speed': 398}),
    'sukuna_9007': ({'hp': 28800, 'atk': 2780, 'speed': 186}, {'hp': 57600, 'atk': 5560, 'speed': 372}),
}

def T(name, cost, mult, target='single', desc='', **effect):
    t = {'name': name, 'cost': cost, 'mult': mult, 'target': target, 'desc': desc}
    if effect:
        t['effect'] = effect
    return t

def U(name, kind, cost, mult, target='all', desc='', **effect):
    u = {'name': name, 'kind': kind, 'cost': cost, 'mult': mult, 'target': target, 'desc': desc}
    if effect:
        u['effect'] = effect
    return u

def P(name, desc, **effect):
    return {'name': name, 'desc': desc, 'effect': effect}

def S(name, desc, **effect):
    return {'name': name, 'desc': desc, 'effect': effect}

# id, name, title, element, rarity, kanji, profile, art(hair, hairColor, sigil), basic, technique, ultimate, passives, support, affiliation
CHARS = [
    # Every other unit comes from Phantom Parade: tools/pp-units.json (tools/pp_units.py).
    # ---------------- 7 stars (art from NXBNVNB) ----------------
    ('gojo_9005', 'Gojo Satoru', 'The Strongest', 'Skill', 7, '五条', 'balanced', ('spiky', '#f2f4f8', 'eye'),
     'Infinity Strike', T('Cursed Technique Lapse: Blue', 7, 2.6, 'all', desc='Attraction pulls every curse in: 2.6x to all.'),
     U('Domain Expansion: Unlimited Void', 'domain', 14, 5.5, 'all', desc='Infinite information: 5.5x to all curses and stuns them.', type='stun', chance=100),
     [P('Infinity', 'Damage taken -30%.', type='guard', pct=30), P('Six Eyes', 'Start battle with +4 cursed energy.', type='ceStart', amount=4)],
     S('Throughout Heaven and Earth', 'Team attack +25%.', type='atk', pct=25), 'Tokyo Jujutsu High'),
    ('sukuna_9006', 'Ryomen Sukuna', 'King of Curses', 'Body', 7, '宿儺', 'striker', ('spiky', '#f2a0b4', 'mouth'),
     'Claw', T('Dismantle', 7, 2.8, 'all', desc='Invisible slashes across the field: 2.8x to all.'),
     U('Domain Expansion: Malevolent Shrine', 'domain', 14, 6.0, 'all', desc='Cleave and Dismantle without a barrier: 6.0x to all curses.'),
     [P('King of Curses', 'Attack +25%.', type='atk', pct=25), P('Reversed Cursed Technique', 'Recovers 5% health each turn.', type='regen', pct=5)],
     S('Know Your Place', 'Team attack +25%.', type='atk', pct=25), 'Disaster'),
    ('sukuna_9007', 'Ryomen Sukuna', 'Heian Era', 'Bravery', 7, '宿儺', 'striker', ('spiky', '#f2a0b4', 'flame'),
     'Four-Armed Strike', T('Cleave', 7, 4.8, desc='Adjusts to toughness: 4.8x attack to one curse.'),
     U('Divine Flame: Open', 'ultimate', 14, 6.5, 'all', desc='Fuga: 6.5x to all curses and heavy burn.', type='burn', pct=12, turns=3),
     [P('Four Arms', 'Speed +15%.', type='speed', pct=15), P('Heian Terror', 'Critical chance +20%.', type='crit', pct=20)],
     S('Golden Age of Jujutsu', 'Team attack +20%.', type='atk', pct=20), 'Heian Era'),
]

def rnd_for(key):
    return random.Random(sum(ord(c) * (i + 1) for i, c in enumerate(key)))

# Real art from Phantom Parade (tools/pp-art.json, files from tools/pp_assets.py).
PP = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pp-art.json')))


HERE = os.path.dirname(os.path.abspath(__file__))
PP_UNITS = json.load(open(os.path.join(HERE, 'pp-units.json')))


def pp_art(gid, slug):
    """Portrait crop, card art, icon and skill icons for a Phantom Parade unit."""
    base = f'assets/pp/units/{slug}/'
    art = {'portrait': f'assets/pp/portraits/{gid}.webp', 'full': base + 'art.webp', 'icon': base + 'icon.webp',
           'source': 'phantom-parade', 'generated': False}
    skills = {k: base + k + '.webp' for k in ('normal', 's1', 's2', 'ult')
              if os.path.exists(os.path.join(HERE, '..', base, k + '.webp'))}
    if skills:
        art['skills'] = skills
    return art


def pp_unit_art(gid, group):
    c = PP[group].get(gid)
    return pp_art(gid, c['unit']) if c else None


RARITY_LABEL = {5: 'SR', 6: 'SSR', 7: 'SSR'}
ELEMENT_COLOR = {'Heart': 'Red', 'Body': 'Blue', 'Skill': 'Green', 'Bravery': 'Yellow', 'Wisdom': 'Purple'}


def scaled_stats(cid, rar, pf):
    r = rnd_for(cid)
    lo, hi = RANGES[rar]
    jitter = lambda: 0.97 + r.random() * 0.06
    rnd = lambda k, v: int(round(v / (10 if k != 'speed' else 1))) * (10 if k != 'speed' else 1)
    sb = {k: rnd(k, lo[k] * pf[k] * jitter()) for k in lo}
    sm = {k: rnd(k, hi[k] * pf[k] * jitter()) for k in hi}
    return sb, sm


def build_characters():
    out_list = []
    for u in PP_UNITS:
        rar = u['rarity']
        sb, sm = scaled_stats(u['id'], rar, u['profile'])
        out_list.append({
            'id': u['id'], 'name': u['name'], 'title': u['title'], 'element': u['element'], 'rarity': rar,
            'rarityLabel': RARITY_LABEL[rar], 'color': u['color'], 'role': u['role'],
            'maxLevel': MAX_LEVEL[rar], 'kanji': u['kanji'], 'affiliation': u['affiliation'],
            'statsBase': sb, 'statsMax': sm,
            'art': pp_art(u['id'], u['slug']),
            'basic': u['basic'], 'technique': u['skills'][0], 'technique2': u['skills'][1],
            'ultimate': u['ultimate'], 'passives': u['passives'], 'support': u['support'],
        })
    # Limited units with art shared from NXBNVNB.
    for (cid, name, title, el, rar, kanji, prof, art, basic, tech, ult, passives, support, aff) in CHARS:
        sb, sm = REAL[cid]
        out_list.append({
            'id': cid, 'name': name, 'title': title, 'element': el, 'rarity': rar,
            'rarityLabel': RARITY_LABEL[rar], 'limited': True, 'color': ELEMENT_COLOR[el], 'role': 'Attacker',
            'maxLevel': MAX_LEVEL[rar], 'kanji': kanji, 'affiliation': aff,
            'statsBase': sb, 'statsMax': sm,
            'art': {'portrait': f'assets/characters/{cid}/portrait_7S.webp', 'full': f'assets/characters/{cid}/full_7S.webp', 'generated': False},
            'basic': {'name': basic, 'mult': 1.0}, 'technique': tech, 'technique2': None,
            'ultimate': ult, 'passives': passives, 'support': support,
        })
    return out_list

# ---------------------------------------------------------------------------
# Enemies (curses)
ENEMIES = [
    # id, name, grade, element, hp, atk, speed, kanji, look, boss, skill
    ('fly_head', 'Fly Head', 'Grade 4', 'Body', 900, 140, 80, '蠅', ('blob', 3), False, None),
    ('grasshopper', 'Grasshopper Curse', 'Grade 3', 'Skill', 1400, 190, 120, '蝗', ('spike', 2), False, {'name': 'Leap Slash', 'mult': 1.8, 'target': 'single', 'every': 3}),
    ('eye_curse', 'Many-Eyed Curse', 'Grade 3', 'Wisdom', 1300, 170, 90, '眼', ('blob', 7), False, {'name': 'Piercing Gaze', 'mult': 0.8, 'target': 'all', 'every': 3}),
    ('womb_spawn', 'Womb Spawn', 'Grade 2', 'Heart', 2600, 250, 100, '胎', ('worm', 2), False, {'name': 'Gnash', 'mult': 1.7, 'target': 'single', 'every': 3}),
    ('cursed_womb', 'Special Grade Cursed Womb', 'Special Grade', 'Heart', 11000, 360, 110, '呪胎', ('womb', 4), True,
     {'name': 'Womb Shriek', 'mult': 1.1, 'target': 'all', 'every': 3, 'effect': {'type': 'weaken', 'pct': 15, 'turns': 2}}),
    ('transfigured', 'Transfigured Human', 'Grade 3', 'Body', 2000, 230, 95, '改', ('worm', 1), False, {'name': 'Flail', 'mult': 1.6, 'target': 'single', 'every': 3}),
    ('mahito_boss', 'Mahito', 'Special Grade', 'Skill', 36000, 820, 165, '真人', ('humanoid', 2), True,
     {'name': 'Idle Transfiguration', 'mult': 2.4, 'target': 'single', 'every': 3, 'effect': {'type': 'burn', 'pct': 6, 'turns': 2}}),
    ('cursed_corpse', 'Cursed Corpse', 'Grade 2', 'Bravery', 2600, 290, 110, '骸', ('spike', 2), False, {'name': 'Rampage', 'mult': 1.6, 'target': 'single', 'every': 3}),
    ('todo_boss', 'Aoi Todo', 'Grade 1', 'Bravery', 40000, 960, 170, '東堂', ('humanoid', 2), True,
     {'name': 'Boogie Woogie', 'mult': 2.0, 'target': 'single', 'every': 3, 'effect': {'type': 'stun', 'chance': 40}}),
    ('cursed_bud', 'Cursed Bud', 'Grade 2', 'Heart', 2400, 260, 105, '芽', ('plant', 2), False, {'name': 'Drain', 'mult': 1.5, 'target': 'single', 'every': 3}),
    ('hanami_boss', 'Hanami', 'Special Grade', 'Heart', 60000, 1150, 150, '花御', ('plant', 2), True,
     {'name': 'Cursed Buds', 'mult': 1.3, 'target': 'all', 'every': 3, 'effect': {'type': 'weaken', 'pct': 20, 'turns': 2}}),
    ('shibuya_curse', 'Shibuya Curse', 'Grade 2', 'Wisdom', 4200, 430, 120, '渋', ('blob', 4), False, {'name': 'Veil Crush', 'mult': 1.5, 'target': 'single', 'every': 3}),
    ('finger_bearer', 'Finger Bearer', 'Grade 1', 'Body', 7800, 560, 115, '指', ('worm', 3), False, {'name': 'Finger Burst', 'mult': 1.0, 'target': 'all', 'every': 3}),
    ('smallpox', 'Smallpox Deity', 'Special Grade', 'Wisdom', 11000, 640, 120, '疱瘡', ('womb', 3), False,
     {'name': 'Coffin Countdown', 'mult': 1.9, 'target': 'single', 'every': 3, 'effect': {'type': 'stun', 'chance': 35}}),
    ('dagon_boss', 'Dagon', 'Special Grade', 'Skill', 90000, 1500, 150, '陀艮', ('octo', 2), True,
     {'name': 'Death Swarm', 'mult': 1.4, 'target': 'all', 'every': 3}),
    ('jogo_boss', 'Jogo', 'Special Grade', 'Heart', 110000, 1850, 175, '漏瑚', ('volcano', 1), True,
     {'name': 'Maximum: Meteor', 'mult': 1.6, 'target': 'all', 'every': 3, 'effect': {'type': 'burn', 'pct': 6, 'turns': 2}}),
    ('sukuna_boss', 'Ryomen Sukuna', 'King of Curses', 'Body', 170000, 2400, 260, '宿儺', ('humanoid', 4), True,
     {'name': 'Malevolent Shrine', 'mult': 1.7, 'target': 'all', 'every': 3, 'effect': {'type': 'burn', 'pct': 5, 'turns': 2}}),
]

def enemy_svg(e):
    eid, name, grade, el, hp, atk, spd, kanji, (look, eyes), boss, _ = e
    E = ELEMENTS[el]
    r = rnd_for(eid)
    body = ''
    if look in ('blob', 'womb', 'spike', 'worm', 'plant', 'octo'):
        n = 14
        pts = []
        for i in range(n):
            ang = 2 * math.pi * i / n
            rad = 92 + r.uniform(-14, 14)
            if look == 'spike' and i % 2 == 0:
                rad += 30
            pts.append((150 + math.cos(ang) * rad * 1.05, 200 + math.sin(ang) * rad * (1.15 if look == 'worm' else 1.0)))
        # smooth closed outline: quadratic segments through the midpoints
        segs = []
        for i in range(n):
            p1 = pts[(i + 1) % n]
            m = ((pts[(i + 1) % n][0] + pts[(i + 2) % n][0]) / 2, (pts[(i + 1) % n][1] + pts[(i + 2) % n][1]) / 2)
            segs.append(f'Q{p1[0]:.0f},{p1[1]:.0f} {m[0]:.0f},{m[1]:.0f}')
        m0 = ((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2)
        d = f'M{m0[0]:.0f},{m0[1]:.0f} ' + ' '.join(segs) + 'z'
        extra = ''
        if look == 'octo':
            extra = ''.join(f'<path d="M{110+i*20},270 q{r.randint(-20,20)},50 {r.randint(-30,30)},100" stroke="url(#eb-{eid})" stroke-width="16" stroke-linecap="round" fill="none"/>' for i in range(5))
        if look == 'plant':
            extra = '<path d="M100,120 C80,80 70,60 50,50 M200,120 C220,80 230,60 250,50" stroke="#d5dcb4" stroke-width="10" fill="none" stroke-linecap="round"/>'
        if look == 'worm':
            extra = ''.join(f'<path d="M{80+i*28},{280+r.randint(-6,6)} l{r.randint(-6,6)},34" stroke="#0b0b10" stroke-width="7" stroke-linecap="round"/>' for i in range(6))
        body = extra + f'<path d="{d}" fill="url(#eb-{eid})" stroke="{E["glow"]}" stroke-opacity=".5" stroke-width="3"/>'
    elif look == 'humanoid':
        body = (f'<path d="M50,400 C60,310 100,280 150,280 C200,280 240,310 250,400z" fill="url(#eb-{eid})" stroke="{E["glow"]}" stroke-opacity=".5" stroke-width="3"/>'
                f'<ellipse cx="150" cy="190" rx="62" ry="72" fill="url(#eb-{eid})" stroke="{E["glow"]}" stroke-opacity=".5" stroke-width="3"/>'
                f'<path d="M96,160 C100,100 200,100 204,160 C190,140 110,140 96,160z" fill="#0b0b10"/>')
        if eid == 'sukuna_boss':
            body += '<path d="M112,214 l14,-6 M188,214 l-14,-6 M118,236 l12,-4 M182,236 l-12,-4" stroke="#0b0b10" stroke-width="4"/>'
        if eid == 'mahito_boss':
            body += '<path d="M120,170 l40,60 M128,180 l-8,6 M140,198 l-8,6 M152,214 l-8,6" stroke="#2a3340" stroke-width="3"/>'
    elif look == 'volcano':
        body = (f'<path d="M50,400 C60,310 100,290 150,290 C200,290 240,310 250,400z" fill="#3a2a1e"/>'
                f'<path d="M84,280 L112,120 L188,120 L216,280z" fill="#8c6c4b" stroke="#ffb347" stroke-opacity=".6" stroke-width="3"/>'
                '<path d="M112,120 q38,-26 76,0" fill="#ff7a2e"/><path d="M124,112 q10,-40 26,-56 q-4,30 10,44 q10,-24 8,-50 q22,24 14,62z" fill="#ffb347"/>')
    # eyes
    eye_svg = ''
    if look == 'volcano':
        eye_svg = '<circle cx="150" cy="200" r="22" fill="#fff6dc"/><circle cx="150" cy="200" r="9" fill="#250d02"/>'
    elif look == 'humanoid':
        eye_svg = f'<path d="M118,196 q14,-8 26,0 M156,196 q14,-8 26,0" stroke="{E["glow"]}" stroke-width="5" stroke-linecap="round" fill="none"/>'
        if eyes >= 4:
            eye_svg += f'<path d="M124,176 q10,-6 18,0 M158,176 q10,-6 18,0" stroke="{E["glow"]}" stroke-width="3" stroke-linecap="round" fill="none"/>'
    else:
        for i in range(eyes):
            ex = 150 + (r.uniform(-50, 50) if eyes > 1 else 0)
            ey = 180 + (r.uniform(-40, 30) if eyes > 2 else 0)
            if eyes == 2:
                ex = 120 + i * 60; ey = 180
            rr = r.uniform(9, 17) if eyes > 2 else 16
            eye_svg += f'<ellipse cx="{ex:.0f}" cy="{ey:.0f}" rx="{rr:.0f}" ry="{rr*0.8:.0f}" fill="#fff6dc"/><circle cx="{ex:.0f}" cy="{ey:.0f}" r="{rr*0.42:.0f}" fill="#120808"/>'
        eye_svg += '<path d="M104,236 q46,30 92,0 q-46,14 -92,0z" fill="#120808"/>' + ''.join(f'<path d="M{110+i*14},238 l6,10 l6,-10" fill="#f6ecd2"/>' for i in range(6))
    crown = ''
    if boss:
        crown = '<path d="M90,96 l14,-34 l16,26 l14,-38 l16,30 l16,-30 l14,38 l16,-26 l14,34" fill="none" stroke="#e8433a" stroke-width="5" stroke-linejoin="round"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
<defs>
<radialGradient id="eb-{eid}" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="{E['c1']}"/><stop offset="0.6" stop-color="{E['c2']}"/><stop offset="1" stop-color="#050507"/></radialGradient>
<radialGradient id="ea-{eid}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="{'#ff3b30' if boss else E['glow']}" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="150" cy="200" r="160" fill="url(#ea-{eid})"/>
<text x="150" y="250" text-anchor="middle" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP','IPAMincho',serif" font-size="{150 if len(kanji)==1 else 110}" font-weight="700" fill="#000" fill-opacity="0.35">{kanji}</text>
{body}
{eye_svg}
{crown}
</svg>
'''

def build_enemies():
    lst = []
    for e in ENEMIES:
        eid, name, grade, el, hp, atk, spd, kanji, look, boss, skill = e
        lst.append({'id': eid, 'name': name, 'grade': grade, 'element': el, 'kanji': kanji,
                    'stats': {'hp': hp, 'atk': atk, 'speed': spd}, 'boss': boss,
                    'skill': skill, 'art': f'assets/enemies/{eid}.svg'})
        pp = pp_unit_art(eid, 'enemies')
        if pp:
            lst[-1]['art'] = pp['portrait']
        out(f'assets/enemies/{eid}.svg', enemy_svg(e))
    return lst

# ---------------------------------------------------------------------------
# Missions
def W(*specs):
    """wave from ('enemy_id', level) tuples"""
    return [{'enemy': e, 'level': lv} for e, lv in specs]

def stage(sid, name, stamina, waves, yen, rank_exp, unit_exp, turn_goal, boss=False, first=None, drops=None, rec=None, desc=''):
    return {'id': sid, 'name': name, 'desc': desc, 'stamina': stamina, 'boss': boss, 'turnGoal': turn_goal,
            'recommendedPower': rec, 'waves': waves,
            'rewards': {'yen': yen, 'rankExp': rank_exp, 'unitExp': unit_exp, 'drops': drops or []},
            'firstClear': first or {'cubes': 5}}

D_S = [{'item': 'talisman_s', 'chance': 60, 'qty': 1}]
D_M = [{'item': 'talisman_s', 'chance': 80, 'qty': 2}, {'item': 'talisman_m', 'chance': 35, 'qty': 1}]
D_L = [{'item': 'talisman_m', 'chance': 70, 'qty': 1}, {'item': 'talisman_l', 'chance': 25, 'qty': 1}]
D_X = [{'item': 'talisman_m', 'chance': 90, 'qty': 2}, {'item': 'talisman_l', 'chance': 50, 'qty': 1}, {'item': 'ticket', 'chance': 15, 'qty': 1}]

MISSIONS = {'chapters': [
    {'id': 'ch1', 'scale': 1.3, 'name': 'Cursed Womb', 'kanji': '呪胎戴天', 'arc': 'Arc I', 'element': 'Heart',
     'desc': 'A finger of Ryomen Sukuna surfaces at Sugisawa Third High. A boy swallows it.',
     'stages': [
        stage('1-1', 'Sugisawa Third High', 3, [W(('fly_head', 1), ('fly_head', 1)), W(('fly_head', 1), ('grasshopper', 1))], 300, 20, 120, 8, desc='Night school. Something is crawling on the rooftop.', drops=D_S, rec=1500),
        stage('1-2', 'Rooftop Rescue', 3, [W(('fly_head', 2), ('grasshopper', 1), ('fly_head', 2)), W(('eye_curse', 2), ('grasshopper', 2))], 360, 24, 160, 9, drops=D_S, rec=1800, desc='Get Megumi and the seniors off the roof.'),
        stage('1-3', 'Eishu Detention Center', 4, [W(('womb_spawn', 1), ('fly_head', 3)), W(('eye_curse', 3), ('eye_curse', 3)), W(('grasshopper', 3), ('womb_spawn', 2))], 450, 30, 220, 12, drops=D_S, rec=2200, desc='A womb has matured in the detention center.'),
        stage('1-4', 'Inside the Barrier', 4, [W(('womb_spawn', 3), ('eye_curse', 4)), W(('grasshopper', 4), ('womb_spawn', 3), ('fly_head', 5)), W(('womb_spawn', 4), ('womb_spawn', 4))], 520, 34, 280, 12, drops=D_M, rec=2600, desc='The corridors twist into a curse’s domain.'),
        stage('1-5', 'Special Grade Cursed Womb', 5, [W(('womb_spawn', 4), ('womb_spawn', 4)), W(('cursed_womb', 2), ('womb_spawn', 4))], 800, 50, 420, 14, boss=True, drops=D_M, rec=3200, first={'cubes': 15, 'items': {'talisman_m': 2}}, desc='BOSS — the womb is born.'),
     ]},
    {'id': 'ch2', 'scale': 2.0, 'name': 'Origin of Obedience', 'kanji': '幼魚と逆罰', 'arc': 'Arc II', 'element': 'Skill',
     'desc': 'Mysterious deaths in Kawasaki. A patchwork curse is reshaping human souls.',
     'stages': [
        stage('2-1', 'Movie Theatre Murders', 5, [W(('transfigured', 4), ('transfigured', 4)), W(('transfigured', 5), ('eye_curse', 6), ('transfigured', 5))], 900, 55, 520, 12, drops=D_M, rec=4500),
        stage('2-2', 'Satomi Sewers', 5, [W(('transfigured', 6), ('womb_spawn', 5)), W(('transfigured', 6), ('transfigured', 6), ('grasshopper', 8))], 980, 60, 600, 12, drops=D_M, rec=5200),
        stage('2-3', 'Junpei’s School', 6, [W(('eye_curse', 9), ('transfigured', 7), ('eye_curse', 9)), W(('transfigured', 8), ('womb_spawn', 7)), W(('transfigured', 8), ('transfigured', 8), ('transfigured', 8))], 1100, 66, 700, 14, drops=D_M, rec=6000),
        stage('2-4', 'Transfigured Horde', 6, [W(('transfigured', 9), ('transfigured', 9), ('transfigured', 9)), W(('womb_spawn', 9), ('transfigured', 10)), W(('transfigured', 10), ('womb_spawn', 10), ('transfigured', 10))], 1200, 72, 820, 14, drops=D_M, rec=7000),
        stage('2-5', 'Mahito', 8, [W(('transfigured', 10), ('transfigured', 10)), W(('mahito_boss', 1), ('transfigured', 10))], 1800, 100, 1200, 18, boss=True, drops=D_L, rec=9000, first={'cubes': 20, 'items': {'talisman_l': 1}}, desc='BOSS — Mahito. Touch nothing.'),
     ]},
    {'id': 'ch3', 'scale': 2.6, 'name': 'Kyoto Goodwill Event', 'kanji': '京都姉妹校交流会', 'arc': 'Arc III', 'element': 'Bravery',
     'desc': 'Tokyo and Kyoto clash — until special grade curses crash the exchange.',
     'stages': [
        stage('3-1', 'Team Battle Begins', 6, [W(('cursed_corpse', 6), ('cursed_corpse', 6)), W(('grasshopper', 12), ('cursed_corpse', 7), ('eye_curse', 12))], 1300, 76, 900, 12, drops=D_M, rec=9500),
        stage('3-2', 'Forest Ambush', 6, [W(('cursed_corpse', 8), ('cursed_corpse', 8), ('cursed_corpse', 8)), W(('womb_spawn', 12), ('cursed_corpse', 9))], 1400, 80, 980, 12, drops=D_M, rec=10500),
        stage('3-3', 'What Type of Woman?', 7, [W(('cursed_corpse', 9), ('cursed_corpse', 9)), W(('todo_boss', 1))], 1900, 110, 1300, 16, boss=True, drops=D_L, rec=12000, first={'cubes': 15, 'items': {'ticket': 1}}, desc='BOSS — Aoi Todo wants to know your type.'),
        stage('3-4', 'The Veil Falls', 7, [W(('cursed_bud', 6), ('cursed_bud', 6), ('cursed_bud', 6)), W(('cursed_bud', 8), ('womb_spawn', 14)), W(('cursed_bud', 9), ('cursed_bud', 9), ('cursed_bud', 9))], 1600, 90, 1100, 14, drops=D_L, rec=13000),
        stage('3-5', 'Hanami', 9, [W(('cursed_bud', 10), ('cursed_bud', 10)), W(('hanami_boss', 1), ('cursed_bud', 10))], 2400, 130, 1700, 18, boss=True, drops=D_L, rec=16000, first={'cubes': 25, 'items': {'talisman_l': 2}}, desc='BOSS — a disaster curse of the forest.'),
     ]},
    {'id': 'ch4', 'scale': 2.3, 'name': 'Shibuya Incident', 'kanji': '渋谷事変', 'arc': 'Arc IV', 'element': 'Body',
     'desc': 'October 31st. A veil descends over Shibuya and the worst night in jujutsu history begins.',
     'stages': [
        stage('4-1', 'Veil Descends', 8, [W(('shibuya_curse', 5), ('shibuya_curse', 5), ('shibuya_curse', 5)), W(('finger_bearer', 3), ('shibuya_curse', 6))], 2000, 110, 1500, 14, drops=D_L, rec=18000),
        stage('4-2', 'Smallpox Deity', 8, [W(('shibuya_curse', 7), ('finger_bearer', 5)), W(('smallpox', 4), ('shibuya_curse', 8))], 2200, 120, 1700, 14, drops=D_L, rec=21000),
        stage('4-3', 'Dagon', 9, [W(('shibuya_curse', 9), ('shibuya_curse', 9), ('finger_bearer', 6)), W(('dagon_boss', 1))], 2800, 150, 2200, 16, boss=True, drops=D_X, rec=26000, first={'cubes': 25, 'items': {'ticket': 2}}, desc='BOSS — the sea swallows Shibuya Station.'),
        stage('4-4', 'Jogo', 10, [W(('finger_bearer', 8), ('finger_bearer', 8)), W(('jogo_boss', 1), ('shibuya_curse', 12))], 3200, 170, 2600, 18, boss=True, drops=D_X, rec=32000, first={'cubes': 30, 'items': {'talisman_l': 3}}, desc='BOSS — a volcano with a grudge.'),
        stage('4-5', 'The King of Curses', 12, [W(('finger_bearer', 10), ('smallpox', 8), ('finger_bearer', 10)), W(('sukuna_boss', 1))], 5000, 250, 4000, 20, boss=True, drops=D_X, rec=42000, first={'cubes': 50, 'items': {'ticket': 5}}, desc='FINAL BOSS — twenty fingers’ worth of malice.'),
     ]},
]}

ITEMS = {
    'talisman_s': {'name': 'Grade 4 Talisman', 'kind': 'exp', 'exp': 600, 'kanji': '四', 'desc': 'A paper seal holding residual cursed energy. +600 EXP.'},
    'talisman_m': {'name': 'Grade 2 Talisman', 'kind': 'exp', 'exp': 4000, 'kanji': '二', 'desc': 'A sealed charm from a grade 2 exorcism. +4,000 EXP.'},
    'talisman_l': {'name': 'Special Grade Talisman', 'kind': 'exp', 'exp': 20000, 'kanji': '特', 'desc': 'A sealed relic of a special grade curse. +20,000 EXP.'},
    'ticket': {'name': 'Summon Ticket', 'kind': 'ticket', 'kanji': '札', 'desc': 'One free summon on any banner.'},
}

SHOP = {'sections': [
    {'id': 'items', 'name': 'Talismans', 'kanji': '呪符', 'offers': [
        {'id': 'buy_ts', 'give': {'items': {'talisman_s': 1}}, 'price': {'yen': 300}},
        {'id': 'buy_ts10', 'give': {'items': {'talisman_s': 10}}, 'price': {'yen': 2700}},
        {'id': 'buy_tm', 'give': {'items': {'talisman_m': 1}}, 'price': {'yen': 1800}},
        {'id': 'buy_tl', 'give': {'items': {'talisman_l': 1}}, 'price': {'yen': 8000}},
        {'id': 'buy_tl_c', 'give': {'items': {'talisman_l': 1}}, 'price': {'cubes': 15}},
    ]},
    {'id': 'stamina', 'name': 'Stamina', 'kanji': '気力', 'offers': [
        {'id': 'refill', 'give': {'staminaRefill': True}, 'price': {'cubes': 5}},
        {'id': 'stam10', 'give': {'stamina': 10}, 'price': {'yen': 1000}},
    ]},
    {'id': 'summon', 'name': 'Summon', 'kanji': '召喚', 'offers': [
        {'id': 'ticket1', 'give': {'items': {'ticket': 1}}, 'price': {'cubes': 5}},
        {'id': 'ticket10', 'give': {'items': {'ticket': 10}}, 'price': {'cubes': 45}},
        {'id': 'ticket_yen', 'give': {'items': {'ticket': 1}}, 'price': {'yen': 6000}},
    ]},
    {'id': 'daily', 'name': 'Daily', 'kanji': '日課', 'offers': [
        {'id': 'daily_gift', 'give': {'cubes': 10, 'yen': 1000}, 'price': {}, 'daily': True},
    ]},
]}

BANNERS = {'banners': [
    {'id': 'standard', 'name': 'Jujutsu High Recruitment', 'kanji': '呪術高専', 'subtitle': 'Standard banner — every sorcerer and curse',
     'featured': [], 'element': 'Wisdom', 'pityAt': 0, 'hero': 'yuta_601'},
    {'id': 'strongest', 'name': 'The Strongest', 'kanji': '最強', 'subtitle': 'Pickup: Satoru Gojo SSR rate up',
     'featured': ['satoru_strongest', 'satoru_hollow_technique', 'satoru_strongest_blue', 'gojo_9005'], 'element': 'Body', 'pityAt': 60, 'hero': 'satoru_strongest'},
    {'id': 'king', 'name': 'King of Curses', 'kanji': '呪いの王', 'subtitle': 'Limited: Ryomen Sukuna rate up',
     'featured': ['sukuna_9006', 'sukuna_9007', 'jogo_610', 'mahito_609'], 'element': 'Heart', 'pityAt': 60, 'hero': 'sukuna_9006'},
], 'rates': {'5': 85.0, '6': 13.0, '7': 2.0}, 'featuredShare': 50,
   'cost': {'single': {'cubes': 5, 'tickets': 1}, 'multi': {'cubes': 45, 'tickets': 10}}, 'multiGuarantee': 5}


def main():
    for ch in MISSIONS['chapters']:
        if ch['id'] in PP['chapters']:
            ch['bg'] = f'assets/pp/memories/{PP["chapters"][ch["id"]]}/art.webp'
    for b in BANNERS['banners']:
        if b['id'] in PP['banners']:
            b['bg'] = f'assets/pp/memories/{PP["banners"][b["id"]]}/art.webp'
    chars = build_characters()
    out('data/characters.json', chars)
    out('data/enemies.json', build_enemies())
    out('data/missions.json', MISSIONS)
    out('data/items.json', {'items': ITEMS, 'shop': SHOP})
    out('data/banners.json', BANNERS)
    print(len(chars), 'characters,', len(ENEMIES), 'enemies,', sum(len(c['stages']) for c in MISSIONS['chapters']), 'stages')

if __name__ == '__main__':
    main()
