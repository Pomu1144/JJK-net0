"""tools/pp_units.py - turn Phantom Parade wiki unit data into game units.

Input:  tools/pp-units-raw.json   (template fields of every unit page, fetched
                                   by tools/fetch_pp_units.py)
Output: tools/pp-units.json       (read by tools/generate.py)

Each unit keeps its wiki name, epithet, type colour, rarity, role, skill and
ultimate names. Numbers are translated into this game's engine: effect text is
read for damage %, target (one / all enemies), and a single side effect
(stun, poison/burn, attack down, heal, attack up, energy). Stats keep each
unit's wiki proportions inside the game's range for its rarity.
"""
import json, os, re, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
COLOR_ELEMENT = {'RedType': 'Heart', 'BlueType': 'Body', 'GreenType': 'Skill', 'YellowType': 'Bravery', 'PurpleType': 'Wisdom'}
RARITY = {'R': 4, 'SR': 5, 'SSR': 6}
ROLE_SPEED = {'attacker': 1.06, 'agitator': 1.04, 'obstructor': 1.08, 'debuffer': 1.0, 'defender': 0.9, 'tank': 0.88,
              'support': 0.97, 'supporter': 0.97, 'healer': 0.95}

# Units that were already in the game keep their ids (saves reference them).
KEEP_IDS = {
    'yuji-itadori-the-agile-body': 'yuji_301', 'kasumi-miwa-firm-interception': 'miwa_302',
    'mai-ze-nin-calculated-shot': 'mai_303', 'momo-nishimiya-aerial-reconnaissance': 'momo_304',
    'kokichi-muta-mode-albatross': 'mechamaru_305', 'megumi-fushiguro-inherited-cursed-technique': 'megumi_401',
    'nobara-kugisaki-girl-of-steel': 'nobara_402', 'toge-inumaki-compelling-cursed-speech': 'toge_403',
    'panda-don-t-blame-the-doll': 'panda_404', 'noritoshi-kamo-the-determination-within-the-bloodline': 'kamo_405',
    'yuuji-itadori-cursed-energy-black-flash': 'yuji_501', 'kento-nanami-ratio-technique': 'nanami_502',
    'maki-zen-in-rebellious-failure': 'maki_503', 'aoi-todo-memories-of-friendship': 'todo_504',
    'hanami-the-joys-of-battle': 'hanami_508', 'yuta-okkotsu-lend-me-your-strength': 'yuta_601',
    'toji-fushiguro-the-sorcerer-killer': 'toji_602', 'suguru-geto-for-the-justice': 'geto_604',
    'mahito-the-inspiration-of-death': 'mahito_609', 'jogo-cursed-spirit-s-pride': 'jogo_610',
}
KANJI = {'yuji': '虎杖', 'yuuji': '虎杖', 'megumi': '伏黒', 'nobara': '釘崎', 'toge': '狗巻', 'panda': 'パンダ', 'maki': '真希',
         'mai': '真依', 'miwa': '三輪', 'momo': '西宮', 'kokichi': '与', 'ultimate': '与', 'noritoshi': '加茂', 'aoi': '東堂',
         'kento': '七海', 'satoru': '五条', 'suguru': '夏油', 'yuta': '乙骨', 'toji': '甚爾', 'mahito': '真人', 'jogo': '漏瑚',
         'hanami': '花御', 'ieri': '家入', 'junpei': '順平', 'masamichi': '夜蛾', 'yoshinobu': '楽巌寺', 'saki': '凛堂',
         'yuuki': '海斗'}


def clean(t):
    t = re.sub(r'<br\s*/?>', ' ', t or '')
    t = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', t)
    t = re.sub(r"'''?|<[^>]+>", '', t)
    return re.sub(r'\s+', ' ', t).strip()


def num(v):
    m = re.search(r'[\d,]+(\.\d+)?', v or '')
    return float(m.group(0).replace(',', '')) if m else 0.0


def damage_pct(text):
    """Damage % of a skill's main hit: the numbers between "deal(s)" and the
    word "damage", times the hit count when the text says "N times total"."""
    t = text.lower()
    for m in re.finditer(r'\bdeals?\b(.{0,160}?)\bdamage\b', t):
        seg = m.group(1)
        nums = [float(x) for x in re.findall(r'(\d+(?:\.\d+)?)\s*%', seg)]
        if not nums:
            continue
        total = sum(nums)
        rest = t[m.end():m.end() + 140]
        if 'each' in (seg + rest[:40]) and 'physical and jujutsu' in (seg + rest[:60]) and len(nums) == 1:
            total *= 2
        times = re.search(r'\(\s*(\d+)\s*times? total', rest)
        if times and len(nums) == 1:
            total *= int(times.group(1))
        return total
    return 0.0


def side_effect(text, hits):
    """One secondary effect the engine can model, read from the effect text."""
    t = text.lower()
    m = re.search(r'(\d+)\s*%\s*chance', t)
    chance = int(m.group(1)) if m else 50
    m = re.search(r'(\d+)\s*turns?', t)
    turns = min(3, int(m.group(1))) if m else 2
    if re.search(r'\b(stun|paraly|freez|bind)', t):
        return {'type': 'stun', 'chance': max(30, min(70, chance))}
    if re.search(r'\b(poison|burn|bleed|flame)', t) and hits:
        return {'type': 'burn', 'pct': 5, 'turns': turns}
    if re.search(r'(recover|restor|heal)\w*[^.]{0,40}\b(hp|health)\b', t) or 'reverse cursed technique' in t:
        m = re.search(r'(\d+(?:\.\d+)?)\s*%', t)
        return {'type': 'heal', 'pct': int(max(10, min(30, float(m.group(1)) if m else 15)))}
    if re.search(r"(lower|reduce|decrease)s?\b[^.]{0,30}\b(enem|target)[^.]{0,40}\b(attack|damage|jujutsu)", t) or \
       re.search(r"(enem|target)\w*'?s?[^.]{0,30}\b(damage received|defen)[^.]{0,10}", t) or \
       re.search(r"lowers the selected enemy's damage", t):
        return {'type': 'weaken', 'pct': 20, 'turns': turns}
    if re.search(r'(increase|raise|boost)s?\b[^.]{0,50}\b(attack|jujutsu|physical|critical|damage)\b(?! received)', t) and 'damage received' not in t.split('increase')[1][:60]:
        return {'type': 'buffAtk', 'pct': 20 if 'allies' in t else 15, 'turns': turns}
    if re.search(r'cursed energy', t) and re.search(r'(recover|gain|restor)', t):
        return {'type': 'ceGain', 'amount': 3}
    return None


def target_of(text):
    t = text.lower()
    return 'all' if re.search(r'all (enemies|enemy|foes)|every enemy|enemies in', t) else 'single'


def skill(name, text, cost, ult=False):
    text = clean(text)
    pct = damage_pct(text)
    tgt = target_of(text)
    eff = side_effect(text, pct > 0)
    if pct:
        x = pct / 100
        if ult:
            mult = max(3.0, min(5.5, x * 0.55)) if tgt == 'single' else max(2.0, min(3.6, x * 0.35))
        else:
            mult = max(1.6, min(4.2, x)) if tgt == 'single' else max(1.2, min(2.6, x * 0.8))
        mult = round(mult, 2)
    elif eff and eff['type'] in ('heal', 'buffAtk', 'ceGain'):
        mult, tgt = 0, 'allies'
    elif eff:
        mult = 0
    else:
        # Effect text the engine can't model: a plain hit keeps the skill useful.
        mult = 3.4 if ult else 1.8
    if ult and not mult and not (eff and eff['type'] == 'heal'):
        mult, tgt = 3.0, (tgt if tgt != 'allies' else 'single')  # an ultimate always lands a hit
    out = {'name': clean(name), 'cost': cost, 'mult': mult, 'target': tgt, 'desc': text[:240]}
    if eff:
        out['effect'] = eff
    return out


PASSIVE_RULES = [
    (r'critical', 'crit', 10), (r'(max )?(hp|health)', 'hp', 10), (r'cursed energy', 'ceStart', 2),
    (r'(damage received|damage taken|defen)', 'guard', 10), (r'(recover|regenerat)', 'regen', 4),
    (r'(speed|action)', 'speed', 8), (r'(attack|jujutsu|damage)', 'atk', 10),
]


def passive(name, text):
    t = clean(text).lower()
    for pat, typ, val in PASSIVE_RULES:
        if re.search(pat, t):
            return {'name': clean(name), 'desc': clean(text)[:160], 'effect': {'type': typ, ('amount' if typ == 'ceStart' else 'pct'): val}}
    return None


STOP = {'the', 'of', 'a', 'an', 'to', 'for', 'and', 'my', 'me', 'your', 'i', 'is', 'are', 'it', 'as', 'in', 'within', 'don', 't', 's', 'teen', 'more', 'they'}


def short_id(name, epithet):
    words = [w for w in re.findall(r'[a-z0-9]+', epithet.lower()) if w not in STOP][:2]
    first = name.split()[0].lower()
    if first in ('ultimate', 'kokichi'):
        first = 'mechamaru'
    return '_'.join([first] + words)[:32]


def main():
    raw = json.load(open(os.path.join(HERE, 'pp-units-raw.json')))
    art = json.load(open(os.path.join(HERE, 'pp-art.json')))
    units = []
    for slug, u in raw.items():
        f = u['fields']
        rar = RARITY.get(clean(f.get('Rarity')).upper(), 5)
        hp, atk, juj = num(f.get('HP')), num(f.get('Attack')), num(f.get('Jujutsu'))
        m = re.match(r'^\(\s*(.+?)\s*\)\s*(.+)$', u['title']) or re.match(r'^(.+?)\s*\(\s*(.+?)\s*\)\s*$', u['title'])
        if m and u['title'].startswith('('):
            title_name, epithet = m.group(2), m.group(1)
        elif m:
            title_name, epithet = m.group(1), m.group(2)
        else:
            title_name, epithet = u['title'], clean(f.get('Role'))
        title_name = re.sub(r'\s*\(\s*teen\s*\)', '', title_name, flags=re.I).strip()
        name = title_name if len(title_name) >= len(clean(f.get('Card Name'))) else clean(f.get('Card Name'))
        name = {'Ieri Shoko': 'Shoko Ieri', 'Yuuji Itadori': 'Yuji Itadori', 'Yuuki Kaito': 'Kaito Yuki', 'Junpei': 'Junpei Yoshino'}.get(name, name)
        if epithet.upper() == 'SSR':
            epithet = clean(f.get('Ult')) or 'SSR'
        uid = KEEP_IDS.get(slug) or short_id(name, epithet)
        role = clean(f.get('Role')).lower()
        cost1 = max(2, round(num(f.get('Energy Cost S1')) / 4)) if f.get('Energy Cost S1') else 3
        cost2 = max(3, round(num(f.get('Energy Cost S2')) / 4)) if f.get('Energy Cost S2') else 7
        s1 = skill(f.get('Skill 1'), f.get('Skill 1 Effect'), cost1)
        s2 = skill(f.get('Skill 2'), f.get('Skill 2 Effect'), cost2)
        ult = skill(f.get('Ult'), f.get('Ult Effect'), 4 if rar == 5 else 6, ult=True)
        ult['kind'] = 'domain' if 'domain expansion' in ult['name'].lower() else 'ultimate'
        basic_pct = damage_pct(clean(f.get('Normal Attack Effect')))
        passives = [p for p in (passive(f.get(f'Auto Skill {i} Name'), f.get(f'Auto Skill {i} Effect')) for i in (1, 2)) if p]
        sup = passive(f.get('Auto Skill 3 Name') or f.get('Auto Skill 1 Name'), f.get('Auto Skill 3 Effect') or f.get('Auto Skill 1 Effect'))
        if sup and sup['effect']['type'] not in ('atk', 'hp', 'speed', 'crit'):
            sup = {'name': sup['name'], 'desc': sup['desc'], 'effect': {'type': 'atk', 'pct': 6}}
        first = name.split()[0].lower()
        units.append({
            'id': uid, 'slug': slug, 'name': name, 'title': epithet, 'rarity': rar,
            'rarityLabel': clean(f.get('Rarity')).upper(), 'color': clean(f.get('Type')).replace('Type', ''),
            'element': COLOR_ELEMENT.get(clean(f.get('Type')), 'Body'), 'role': clean(f.get('Role')),
            'focus': clean(f.get('Focus')), 'affiliation': clean(f.get('Affiliation')),
            'kanji': KANJI.get(first, name[:2]),
            'wiki': {'hp': hp, 'attack': atk, 'jujutsu': juj},
            'speedMult': ROLE_SPEED.get(role, 1.0),
            'basic': {'name': clean(f.get('Normal Attack')) or 'Attack', 'mult': round(max(0.9, min(1.4, basic_pct / 100 or 1.0)), 2)},
            'skills': [s1, s2], 'ultimate': ult, 'passives': passives,
            'support': sup or {'name': 'Teamwork', 'desc': 'Team attack +6%.', 'effect': {'type': 'atk', 'pct': 6}},
        })
    # Stat profile: each unit's HP / offence relative to the median of its rarity.
    for rar in set(u['rarity'] for u in units):
        group = [u for u in units if u['rarity'] == rar]
        def base(u):
            w = u['wiki']
            scale = 1 / 25 if w['hp'] > 3000 else 1  # a few pages list maxed stats
            return w['hp'] * scale, max(w['attack'], w['jujutsu']) * scale
        mh = statistics.median(base(u)[0] for u in group)
        mo = statistics.median(base(u)[1] for u in group)
        for u in group:
            h, o = base(u)
            u['profile'] = {'hp': round(max(0.85, min(1.2, h / mh)), 3), 'atk': round(max(0.85, min(1.2, o / mo)), 3), 'speed': u.pop('speedMult')}
    units.sort(key=lambda u: (-u['rarity'], u['name'], u['title']))
    json.dump(units, open(os.path.join(HERE, 'pp-units.json'), 'w'), indent=1, ensure_ascii=False)
    print(len(units), 'units')
    for u in units:
        s = u['skills']
        print(f"{u['id'][:28]:28} {u['rarityLabel']:3} {u['element']:7} {u['role'][:9]:9} | {s[0]['name'][:22]:22} {s[0]['mult']} {s[0]['target'][:3]} {(s[0].get('effect') or {}).get('type','-'):7} | {s[1]['name'][:22]:22} {s[1]['mult']} {s[1]['target'][:3]} {(s[1].get('effect') or {}).get('type','-'):7} | {u['ultimate']['mult']} {u['ultimate']['target'][:3]}")


if __name__ == '__main__':
    main()
