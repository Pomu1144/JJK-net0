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
    if os.path.exists(os.path.join(HERE, '..', base, 'art-anim.webp')):
        art['anim'] = base + 'art-anim.webp'  # animated card art (tools/animate_pp_art.py)
    skills = {k: base + k + '.webp' for k in ('normal', 's1', 's2', 'ult')
              if os.path.exists(os.path.join(HERE, '..', base, k + '.webp'))}
    if skills:
        art['skills'] = skills
    return art


RARITY_LABEL = {5: 'SR', 6: 'SSR', 7: 'SSR'}
# Phantom Parade's focus tag shown before the role: 体 Physical, 呪 Jujutsu, 複 Combined.
def focus_of(raw):
    f = (raw or '').lower()
    if 'juj' in f:
        return 'Jujutsu', '呪'
    if 'phys' in f or 'taij' in f or f == 'hp':
        return 'Physical', '体'
    return 'Combined', '複'

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
            'focus': focus_of(u['focus'])[0], 'focusKanji': focus_of(u['focus'])[1],
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
            'focus': 'Combined', 'focusKanji': '複',
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

# Every enemy is a character with real art. The stat templates above (and
# the waves that use them) set each fight's power; CAST decides who fills
# each template in each chapter, cycling through the list so a wave of the
# same template shows different opponents.
CAST = {
    'ch1': {'fly_head': ['panda_need_help', 'maki_longsword_battle'], 'grasshopper': ['toge_403'],
            'eye_curse': ['saki_resolve_heart'], 'womb_spawn': ['masamichi_lesson_awareness'],
            'cursed_womb': ['masamichi_cursed_corpse']},
    'ch2': {'transfigured': ['junpei_value_life', 'kaito_his_resolve'], 'eye_curse': ['saki_bring_on'],
            'womb_spawn': ['junpei_misunderstand_value'], 'grasshopper': ['kaito_his_resolve'], 'mahito_boss': ['mahito_609']},
    'ch3': {'cursed_corpse': ['miwa_302', 'mai_303', 'kamo_405', 'momo_304', 'mechamaru_305', 'kasumi_zanshin', 'noritoshi_blood_gosanke', 'momo_underestimate'],
            'grasshopper': ['mechamaru_sword_option'], 'eye_curse': ['yoshinobu_cursed_energy'], 'womb_spawn': ['aoi_rowdy_first'],
            'todo_boss': ['todo_504'], 'cursed_bud': ['yoshinobu_cursed_energy', 'aoi_fight_together', 'mechamaru_sword_option'],
            'hanami_boss': ['hanami_508']},
    'ch4': {'shibuya_curse': ['geto_604', 'suguru_protecting_non'], 'finger_bearer': ['mahito_609'],
            'smallpox': ['hanami_508'], 'dagon_boss': ['toji_602'], 'jogo_boss': ['jogo_610'], 'sukuna_boss': ['sukuna_9006']},
    # Strengthening Quests: sparring partners at Jujutsu High
    'tl': {'fly_head': ['panda_need_help', 'maki_longsword_battle'], 'grasshopper': ['toge_403'], 'eye_curse': ['saki_resolve_heart'],
           'transfigured': ['junpei_value_life', 'kaito_his_resolve'], 'cursed_corpse': ['miwa_302', 'mai_303', 'momo_304']},
    'jp': {'fly_head': ['maki_longsword_battle'], 'grasshopper': ['toge_403'], 'eye_curse': ['saki_bring_on'],
           'transfigured': ['junpei_misunderstand_value'], 'cursed_corpse': ['kamo_405', 'kasumi_zanshin', 'mechamaru_305']},
}
# Chapter / stage text that matches the new opponents.
STORY = {
    'ch1': {'name': 'Entrance Exam', 'kanji': '入学試験', 'desc': 'Principal Yaga tests the new first-year, and the second-years want a spar.',
            'stages': {'1-1': ('Training Grounds', 'Panda and Maki want to see what the new kid can do.'),
                       '1-2': ('Rooftop Spar', 'Toge joins in. Keep your guard up.'),
                       '1-3': ('Night Practice', 'Saki Rindo shows up with something to prove.'),
                       '1-4': ("The Principal's Office", 'Cursed corpses, and the man who sews them.'),
                       '1-5': ('Masamichi Yaga', 'Why do you want to be a sorcerer? Answer with your fists.')}},
    'ch2': {'stages': {'2-1': ('Movie Theatre', 'Something happened at the cinema. Junpei was there.'),
                       '2-2': ('Satomi Sewers', 'Following the trail underground.'),
                       '2-3': ('Junpei’s School', 'Junpei has chosen a side.'),
                       '2-4': ('Lost Resolve', 'Every sorcerer you meet doubts you now.'),
                       '2-5': ('Mahito', 'The curse that toys with souls.')}},
    'ch3': {'stages': {'3-1': ('Team Battle Begins', 'Kyoto’s students split up to hunt you down.'),
                       '3-2': ('Forest Ambush', 'Miwa, Mai and Momo set a trap.'),
                       '3-3': ('What Type of Woman?', 'Aoi Todo asks the only question that matters.'),
                       '3-4': ('The Veil Falls', 'The exchange is interrupted; even Kyoto’s principal moves.'),
                       '3-5': ('Hanami', 'A cursed spirit of the forest, here to stop it all.')}},
    'ch4': {'stages': {'4-1': ('Veil Descends', 'Shibuya on Halloween night. Someone with Geto’s face is waiting.'),
                       '4-2': ('Hanami’s Last Stand', 'Mahito and Hanami hold the station.'),
                       '4-3': ('The Sorcerer Killer', 'A man who should be dead walks the platform.'),
                       '4-4': ('Jogo', 'The volcano curse, at full power.'),
                       '4-5': ('The King of Curses', 'Ryomen Sukuna is awake.')}},
}

BOSS_GRADE = {'mahito_609': 'Special Grade Curse', 'hanami_508': 'Special Grade Curse', 'jogo_610': 'Special Grade Curse',
              'sukuna_9006': 'King of Curses', 'toji_602': 'Sorcerer Killer', 'masamichi_cursed_corpse': 'Principal'}


def cast_enemies():
    """Rewrite every wave with the chapter's cast; return the enemy list."""
    tpl = {e[0]: e for e in ENEMIES}
    by_unit = {u['id']: u for u in PP_UNITS}
    real = {c[0]: c for c in CHARS}
    made = {}
    for ch in MISSIONS['chapters'] + MISSIONS['quests']:
        cast, turn = CAST[ch['id']], {}
        story = STORY.get(ch['id'], {})
        for k in ('name', 'kanji', 'desc'):
            if k in story:
                ch[k] = story[k]
        for st in ch['stages']:
            if st['id'] in story.get('stages', {}):
                st['name'], st['desc'] = story['stages'][st['id']]
            for wave in st['waves']:
                for slot in wave:
                    t = slot['enemy']
                    pool = cast[t]
                    unit = pool[turn.get(t, 0) % len(pool)]
                    turn[t] = turn.get(t, 0) + 1
                    eid = f'foe_{unit}' if not tpl[t][9] else f'boss_{unit}'
                    slot['enemy'] = eid
                    if eid in made:
                        continue
                    _, _, grade, _, hp, atk, spd, _, _, boss, skill = tpl[t]
                    if unit in by_unit:
                        u = by_unit[unit]
                        name, el, kanji = u['name'], u['element'], u['kanji']
                        art = f'assets/pp/portraits/{unit}.webp'
                        sk_name = (u['skills'][1] or u['skills'][0])['name'] if not boss else u['ultimate']['name']
                        title, role = u['title'], u['role']
                    else:
                        c = real[unit]
                        name, el, kanji, title, role = c[1], c[3], c[5], c[2], 'Attacker'
                        art = f'assets/characters/{unit}/portrait_7S.webp'
                        sk_name = c[10]['name'] if boss else c[9]['name']
                    made[eid] = {'id': eid, 'unit': unit, 'name': name, 'title': title,
                                 'grade': BOSS_GRADE.get(unit, 'Grade 1 Sorcerer') if boss else role,
                                 'element': el, 'kanji': kanji, 'stats': {'hp': hp, 'atk': atk, 'speed': spd}, 'boss': boss,
                                 'skill': dict(skill, name=sk_name) if skill else None, 'art': art}
    return list(made.values())


# ---------------------------------------------------------------------------
# Missions
def W(*specs):
    """wave from ('enemy_id', level) tuples"""
    return [{'enemy': e, 'level': lv} for e, lv in specs]

def stage(sid, name, stamina, waves, yen, rank_exp, unit_exp, turn_goal, boss=False, first=None, drops=None, rec=None, desc=''):
    return {'id': sid, 'name': name, 'desc': desc, 'stamina': stamina, 'boss': boss, 'turnGoal': turn_goal,
            'recommendedPower': rec, 'waves': waves,
            'rewards': {'yen': yen, 'rankExp': rank_exp, 'unitExp': unit_exp, 'drops': drops or []},
            'firstClear': first or {'cubes': 300}}

D_S = [{'item': 'light_s', 'chance': 60, 'qty': 1}]
D_M = [{'item': 'light_s', 'chance': 80, 'qty': 2}, {'item': 'light_m', 'chance': 35, 'qty': 1}]
D_L = [{'item': 'light_m', 'chance': 70, 'qty': 1}, {'item': 'light_l', 'chance': 25, 'qty': 1}]
D_X = [{'item': 'light_m', 'chance': 90, 'qty': 2}, {'item': 'light_l', 'chance': 50, 'qty': 1}, {'item': 'ticket', 'chance': 15, 'qty': 1}]

MISSIONS = {'chapters': [
    {'id': 'ch1', 'scale': 1.3, 'name': 'Cursed Womb', 'kanji': '呪胎戴天', 'arc': 'Arc I', 'element': 'Heart',
     'desc': 'A finger of Ryomen Sukuna surfaces at Sugisawa Third High. A boy swallows it.',
     'stages': [
        stage('1-1', 'Sugisawa Third High', 3, [W(('fly_head', 1), ('fly_head', 1)), W(('fly_head', 1), ('grasshopper', 1))], 300, 20, 120, 8, desc='Night school. Something is crawling on the rooftop.', drops=D_S, rec=1500),
        stage('1-2', 'Rooftop Rescue', 3, [W(('fly_head', 2), ('grasshopper', 1), ('fly_head', 2)), W(('eye_curse', 2), ('grasshopper', 2))], 360, 24, 160, 9, drops=D_S, rec=1800, desc='Get Megumi and the seniors off the roof.'),
        stage('1-3', 'Eishu Detention Center', 4, [W(('womb_spawn', 1), ('fly_head', 3)), W(('eye_curse', 3), ('eye_curse', 3)), W(('grasshopper', 3), ('womb_spawn', 2))], 450, 30, 220, 12, drops=D_S, rec=2200, desc='A womb has matured in the detention center.'),
        stage('1-4', 'Inside the Barrier', 4, [W(('womb_spawn', 3), ('eye_curse', 4)), W(('grasshopper', 4), ('womb_spawn', 3), ('fly_head', 5)), W(('womb_spawn', 4), ('womb_spawn', 4))], 520, 34, 280, 12, drops=D_M, rec=2600, desc='The corridors twist into a curse’s domain.'),
        stage('1-5', 'Special Grade Cursed Womb', 5, [W(('womb_spawn', 4), ('womb_spawn', 4)), W(('cursed_womb', 2), ('womb_spawn', 4))], 800, 50, 420, 14, boss=True, drops=D_M, rec=3200, first={'cubes': 900, 'items': {'light_m': 2}}, desc='BOSS — the womb is born.'),
     ]},
    {'id': 'ch2', 'scale': 2.5, 'name': 'Origin of Obedience', 'kanji': '幼魚と逆罰', 'arc': 'Arc II', 'element': 'Skill',
     'desc': 'Mysterious deaths in Kawasaki. A patchwork curse is reshaping human souls.',
     'stages': [
        stage('2-1', 'Movie Theatre Murders', 5, [W(('transfigured', 4), ('transfigured', 4)), W(('transfigured', 5), ('eye_curse', 6), ('transfigured', 5))], 900, 55, 520, 12, drops=D_M, rec=4500),
        stage('2-2', 'Satomi Sewers', 5, [W(('transfigured', 6), ('womb_spawn', 5)), W(('transfigured', 6), ('transfigured', 6), ('grasshopper', 8))], 980, 60, 600, 12, drops=D_M, rec=5200),
        stage('2-3', 'Junpei’s School', 6, [W(('eye_curse', 9), ('transfigured', 7), ('eye_curse', 9)), W(('transfigured', 8), ('womb_spawn', 7)), W(('transfigured', 8), ('transfigured', 8), ('transfigured', 8))], 1100, 66, 700, 14, drops=D_M, rec=6000),
        stage('2-4', 'Transfigured Horde', 6, [W(('transfigured', 9), ('transfigured', 9), ('transfigured', 9)), W(('womb_spawn', 9), ('transfigured', 10)), W(('transfigured', 10), ('womb_spawn', 10), ('transfigured', 10))], 1200, 72, 820, 14, drops=D_M, rec=7000),
        stage('2-5', 'Mahito', 8, [W(('transfigured', 10), ('transfigured', 10)), W(('mahito_boss', 1), ('transfigured', 10))], 1800, 100, 1200, 18, boss=True, drops=D_L, rec=9000, first={'cubes': 1200, 'items': {'light_l': 1}}, desc='BOSS — Mahito. Touch nothing.'),
     ]},
    {'id': 'ch3', 'scale': 3.3, 'name': 'Kyoto Goodwill Event', 'kanji': '京都姉妹校交流会', 'arc': 'Arc III', 'element': 'Bravery',
     'desc': 'Tokyo and Kyoto clash — until special grade curses crash the exchange.',
     'stages': [
        stage('3-1', 'Team Battle Begins', 6, [W(('cursed_corpse', 6), ('cursed_corpse', 6)), W(('grasshopper', 12), ('cursed_corpse', 7), ('eye_curse', 12))], 1300, 76, 900, 12, drops=D_M, rec=9500),
        stage('3-2', 'Forest Ambush', 6, [W(('cursed_corpse', 8), ('cursed_corpse', 8), ('cursed_corpse', 8)), W(('womb_spawn', 12), ('cursed_corpse', 9))], 1400, 80, 980, 12, drops=D_M, rec=10500),
        stage('3-3', 'What Type of Woman?', 7, [W(('cursed_corpse', 9), ('cursed_corpse', 9)), W(('todo_boss', 1))], 1900, 110, 1300, 16, boss=True, drops=D_L, rec=12000, first={'cubes': 900, 'items': {'ticket': 1}}, desc='BOSS — Aoi Todo wants to know your type.'),
        stage('3-4', 'The Veil Falls', 7, [W(('cursed_bud', 6), ('cursed_bud', 6), ('cursed_bud', 6)), W(('cursed_bud', 8), ('womb_spawn', 14)), W(('cursed_bud', 9), ('cursed_bud', 9), ('cursed_bud', 9))], 1600, 90, 1100, 14, drops=D_L, rec=13000),
        stage('3-5', 'Hanami', 9, [W(('cursed_bud', 10), ('cursed_bud', 10)), W(('hanami_boss', 1), ('cursed_bud', 10))], 2400, 130, 1700, 18, boss=True, drops=D_L, rec=16000, first={'cubes': 1500, 'items': {'light_l': 2}}, desc='BOSS — a disaster curse of the forest.'),
     ]},
    {'id': 'ch4', 'scale': 1.9, 'name': 'Shibuya Incident', 'kanji': '渋谷事変', 'arc': 'Arc IV', 'element': 'Body',
     'desc': 'October 31st. A veil descends over Shibuya and the worst night in jujutsu history begins.',
     'stages': [
        stage('4-1', 'Veil Descends', 8, [W(('shibuya_curse', 5), ('shibuya_curse', 5), ('shibuya_curse', 5)), W(('finger_bearer', 3), ('shibuya_curse', 6))], 2000, 110, 1500, 14, drops=D_L, rec=18000),
        stage('4-2', 'Smallpox Deity', 8, [W(('shibuya_curse', 7), ('finger_bearer', 5)), W(('smallpox', 4), ('shibuya_curse', 8))], 2200, 120, 1700, 14, drops=D_L, rec=21000),
        stage('4-3', 'Dagon', 9, [W(('shibuya_curse', 9), ('shibuya_curse', 9), ('finger_bearer', 6)), W(('dagon_boss', 1))], 2800, 150, 2200, 16, boss=True, drops=D_X, rec=26000, first={'cubes': 1500, 'items': {'ticket': 2}}, desc='BOSS — the sea swallows Shibuya Station.'),
        stage('4-4', 'Jogo', 10, [W(('finger_bearer', 8), ('finger_bearer', 8)), W(('jogo_boss', 1), ('shibuya_curse', 12))], 3200, 170, 2600, 18, boss=True, drops=D_X, rec=32000, first={'cubes': 1800, 'items': {'light_l': 3}}, desc='BOSS — a volcano with a grudge.'),
        stage('4-5', 'The King of Curses', 12, [W(('finger_bearer', 10), ('smallpox', 8), ('finger_bearer', 10)), W(('sukuna_boss', 1))], 5000, 250, 4000, 20, boss=True, drops=D_X, rec=42000, first={'cubes': 3000, 'items': {'ticket': 5}}, desc='FINAL BOSS — twenty fingers’ worth of malice.'),
     ]},
]}


# Strengthening Quests (guide: Training Light Quest / JP Gathering Quest). Each
# difficulty unlocks after a main-story boss, has its own enemy scale, a daily
# run limit shared by the quest, and can be auto-cleared once it has 3 stars.
def qstage(sid, name, ap, scale, waves, yen, rank_exp, unit_exp, drops, unlock, rec):
    s = stage(sid, name, ap, waves, yen, rank_exp, unit_exp, 0, drops=drops, rec=rec, first={'cubes': 300})
    s.update({'scale': scale, 'unlock': unlock})
    del s['turnGoal']
    return s

L = lambda item, chance, qty: {'item': item, 'chance': chance, 'qty': qty}
MISSIONS['quests'] = [
    {'id': 'tl', 'mode': 'strengthen', 'name': 'Training Light Quest', 'kanji': '修練の燈クエスト', 'daily': 18,
     'art': 'assets/pp/modes/training-light-quest.webp', 'icon': 'assets/pp/currency/training-light.webp',
     'desc': 'Spar at Jujutsu High for Training Lights, the orange orbs that level up your characters.',
     'stages': [
        qstage('tl-1', 'Beginner', 6, 1.3, [W(('fly_head', 2), ('grasshopper', 2)), W(('eye_curse', 3), ('fly_head', 3))], 200, 30, 200, [L('light_s', 100, 3), L('light_m', 30, 1)], None, 1800),
        qstage('tl-2', 'Intermediate', 10, 2.5, [W(('transfigured', 6), ('transfigured', 6)), W(('eye_curse', 8), ('transfigured', 8), ('grasshopper', 8))], 400, 60, 600, [L('light_s', 100, 5), L('light_m', 100, 2), L('light_l', 20, 1)], '2-5', 6500),
        qstage('tl-3', 'Advanced', 15, 3.3, [W(('cursed_corpse', 8), ('cursed_corpse', 8), ('cursed_corpse', 8)), W(('cursed_corpse', 10), ('transfigured', 12))], 800, 100, 1200, [L('light_m', 100, 4), L('light_l', 60, 1)], '3-5', 13000),
     ]},
    {'id': 'jp', 'mode': 'strengthen', 'name': 'JP Gathering Quest', 'kanji': 'JP獲得クエスト', 'daily': 6,
     'art': 'assets/pp/modes/jp-quest.webp', 'icon': 'assets/pp/currency/jp.webp',
     'desc': 'JP is the general currency you need to power up characters. Clear these for a lot of it.',
     'stages': [
        qstage('jp-1', 'Beginner', 6, 1.3, [W(('fly_head', 2), ('grasshopper', 2)), W(('eye_curse', 3), ('fly_head', 3))], 3000, 30, 150, [], None, 1800),
        qstage('jp-2', 'Intermediate', 10, 2.5, [W(('transfigured', 6), ('transfigured', 6)), W(('eye_curse', 8), ('transfigured', 8), ('grasshopper', 8))], 8000, 60, 400, [], '2-5', 6500),
        qstage('jp-3', 'Advanced', 15, 3.3, [W(('cursed_corpse', 8), ('cursed_corpse', 8), ('cursed_corpse', 8)), W(('cursed_corpse', 10), ('transfigured', 12))], 20000, 100, 800, [], '3-5', 13000),
     ]},
]

ITEMS = {
    'light_s': {'name': 'Training Light (S)', 'kind': 'exp', 'exp': 600, 'jp': 60, 'kanji': '燈', 'icon': 'assets/pp/currency/training-light.webp',
                'desc': 'An orange orb of cursed energy from the Training Light Quest. +600 character EXP (costs 60 JP to use).'},
    'light_m': {'name': 'Training Light (M)', 'kind': 'exp', 'exp': 4000, 'jp': 400, 'kanji': '燈', 'icon': 'assets/pp/currency/training-light.webp',
                'desc': 'A brighter Training Light. +4,000 character EXP (costs 400 JP to use).'},
    'light_l': {'name': 'Training Light (L)', 'kind': 'exp', 'exp': 20000, 'jp': 2000, 'kanji': '燈', 'icon': 'assets/pp/currency/training-light.webp',
                'desc': 'A blazing Training Light. +20,000 character EXP (costs 2,000 JP to use).'},
    'ticket': {'name': 'Draw Ticket', 'kind': 'ticket', 'kanji': '札', 'desc': 'One free draw on any banner. Earns a Gacha Point like any draw.'},
    'ssr_ticket': {'name': 'SSR-Character Guaranteed Ticket', 'kind': 'ssr', 'kanji': '確', 'icon': 'assets/pp/currency/gacha-card.webp',
                   'desc': 'One draw that is always an SSR character. Reward for finishing all 7 days of Novice Missions.'},
    'gp_card': {'name': 'Gacha Point Card', 'kind': 'gp', 'kanji': '点', 'icon': 'assets/pp/currency/gacha-card.webp',
                'desc': 'Worth 1 Gacha Point on any pickup banner (up to 100 per banner). Made by converting 20 Gacha Points into 10 cards.'},
}

SHOP = {'sections': [
    {'id': 'items', 'name': 'Training Lights', 'kanji': '修練の燈', 'offers': [
        {'id': 'buy_ts', 'give': {'items': {'light_s': 1}}, 'price': {'yen': 300}},
        {'id': 'buy_ts10', 'give': {'items': {'light_s': 10}}, 'price': {'yen': 2700}},
        {'id': 'buy_tm', 'give': {'items': {'light_m': 1}}, 'price': {'yen': 1800}},
        {'id': 'buy_tl', 'give': {'items': {'light_l': 1}}, 'price': {'yen': 8000}},
        {'id': 'buy_tl_c', 'give': {'items': {'light_l': 1}}, 'price': {'cubes': 900}},
    ]},
    {'id': 'stamina', 'name': 'AP', 'kanji': '行動力', 'offers': [
        {'id': 'refill', 'give': {'staminaRefill': True}, 'price': {'cubes': 300}},
        {'id': 'stam10', 'give': {'stamina': 10}, 'price': {'yen': 1000}},
    ]},
    {'id': 'summon', 'name': 'Draw', 'kanji': 'ガチャ', 'offers': [
        {'id': 'ticket1', 'give': {'items': {'ticket': 1}}, 'price': {'cubes': 300}},
        {'id': 'ticket10', 'give': {'items': {'ticket': 10}}, 'price': {'cubes': 3000}},
        {'id': 'ticket_yen', 'give': {'items': {'ticket': 1}}, 'price': {'yen': 6000}},
    ]},
    {'id': 'daily', 'name': 'Daily', 'kanji': '日課', 'offers': [
        {'id': 'daily_gift', 'give': {'cubes': 600, 'yen': 1000, 'fp': 10}, 'price': {}, 'daily': True},
    ]},
    # Friendship Point exchange: FP come from the daily gift and from clears with a Backup unit
    {'id': 'friend', 'name': 'Friendship Point', 'kanji': '友情', 'hub': 'friend', 'offers': [
        {'id': 'fp_ts3', 'give': {'items': {'light_s': 3}}, 'price': {'fp': 30}},
        {'id': 'fp_tm', 'give': {'items': {'light_m': 1}}, 'price': {'fp': 60}},
        {'id': 'fp_ap10', 'give': {'stamina': 10}, 'price': {'fp': 40}},
        {'id': 'fp_jp', 'give': {'yen': 3000}, 'price': {'fp': 50}},
        {'id': 'fp_gp', 'give': {'items': {'gp_card': 1}}, 'price': {'fp': 150}},
        {'id': 'fp_ticket', 'give': {'items': {'ticket': 1}}, 'price': {'fp': 400}},
    ]},
]}

BANNERS = {'banners': [
    {'id': 'standard', 'name': 'Jujutsu High Recruitment', 'kanji': '呪術高専', 'subtitle': 'Standard banner — every sorcerer and curse',
     'featured': [], 'element': 'Wisdom', 'exchangeAt': 0, 'hero': 'yuta_601'},
    {'id': 'strongest', 'name': 'The Strongest', 'kanji': '最強', 'subtitle': 'Pickup: Satoru Gojo SSR rate up',
     'featured': ['satoru_strongest', 'satoru_hollow_technique', 'satoru_strongest_blue', 'gojo_9005'], 'element': 'Body', 'exchangeAt': 250, 'hero': 'satoru_strongest'},
    {'id': 'king', 'name': 'King of Curses', 'kanji': '呪いの王', 'subtitle': 'Limited: Ryomen Sukuna rate up',
     'featured': ['sukuna_9006', 'sukuna_9007', 'jogo_610', 'mahito_609'], 'element': 'Heart', 'exchangeAt': 250, 'hero': 'sukuna_9006'},
], 'rates': {'5': 97.5, '6': 2.0, '7': 0.5}, 'featuredShare': 50,
   'cost': {'single': {'cubes': 300, 'tickets': 1}, 'multi': {'cubes': 3000, 'tickets': 10}}, 'multiGuarantee': 5, 'dailyCost': 100,
   'gp': {'exchangeAt': 250, 'convertPoints': 20, 'convertCards': 10, 'convertMax': 200, 'redeemMax': 100}}


# ---------------------------------------------------------------------------
# Event banners: the Japanese server's gacha history (fan wiki "Timeline Of
# Events (JP)"), parsed into tools/pp-banners.json. Featured units are wiki
# page titles, mapped to unit ids through tools/pp-new-units.json; a banner
# keeps only featured units that are in the game (i.e. have art) and is
# dropped if none are.
def event_banners(chars):
    by_id = {c['id']: c for c in chars}
    path = os.path.join(HERE, 'pp-banners.json')
    if not os.path.exists(path):
        return []
    map_path = os.environ.get('PP_UNIT_MAP') or os.path.join(HERE, 'pp-new-units.json')
    ids = json.load(open(map_path)) if os.path.exists(map_path) else {}
    norm = lambda s: ' '.join(''.join(ch if ch.isalnum() else ' ' for ch in s.lower()).split())
    ids_n = {norm(k): v for k, v in ids.items()}
    # SSR list titles that the unit pages renamed (redirects / retranslations)
    ids_n.update({norm(k): v for k, v in {
        '(Small Fry and Reverse Retribution) Junpei Yoshino': 'junpei_misunderstand_value',
        '(Hollow Technique: Purple) Satoru Gojo': 'satoru_hollow_technique',
        '(Cursed Energy Focusing) Yuji Itadori': 'yuji_cursed_energy',
        '(Inspiration Of Death) Mahito': 'mahito_609',
        '(Overtime Work) Kento Nanami': 'kento_overtime_work',
    }.items()})
    out = []
    for b in json.load(open(path)):
        feat = []
        for title in b['featured']:
            uid = ids.get(title) or ids_n.get(norm(title))
            if uid in by_id and uid not in feat:
                feat.append(uid)
        if not feat:
            continue
        hero = by_id[feat[0]]
        slug = ''.join(ch if ch.isalnum() else '-' for ch in os.path.splitext(b['file'])[0].lower())
        slug = '-'.join(x for x in slug.split('-') if x)
        out.append({'id': b['id'], 'name': b['name'], 'kanji': hero.get('kanji', ''), 'event': True, 'kind': b['kind'],
                    'subtitle': f"{b['kind']} · " + ' / '.join(by_id[f]['name'] for f in feat),
                    'start': b['start'], 'end': b['end'], 'rerun': b['rerun'],
                    'featured': feat, 'element': hero['element'], 'exchangeAt': 250, 'hero': feat[0],
                    'bg': f'assets/pp/banners/{slug}.webp', 'art': True})
    out.sort(key=lambda x: x['start'], reverse=True)
    return out


def main():
    for ch in MISSIONS['chapters']:
        if ch['id'] in PP['chapters']:
            ch['bg'] = f'assets/pp/memories/{PP["chapters"][ch["id"]]}/art.webp'
    for b in BANNERS['banners']:
        if b['id'] in PP['banners']:
            b['bg'] = f'assets/pp/memories/{PP["banners"][b["id"]]}/art.webp'
    chars = build_characters()
    out('data/characters.json', chars)
    out('data/enemies.json', cast_enemies())
    out('data/missions.json', MISSIONS)
    out('data/items.json', {'items': ITEMS, 'shop': SHOP})
    BANNERS['banners'] = [b for b in BANNERS['banners'] if not b.get('event')] + event_banners(chars)
    out('data/banners.json', BANNERS)
    print(len(chars), 'characters,', len(ENEMIES), 'enemies,', sum(len(c['stages']) for c in MISSIONS['chapters']), 'stages')

if __name__ == '__main__':
    main()
