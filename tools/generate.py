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
PROFILES = {
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
    # ---------------- 3 stars ----------------
    ('yuji_301', 'Yuji Itadori', "Sukuna's Vessel", 'Body', 3, '虎杖', 'tank', ('spiky', '#e98ca3', 'fist'),
     'Divergent Fist', T('Divergent Fist Combo', 4, 2.2, desc='Two-beat punch on one curse: 2.2x attack.'), None,
     [P('Superhuman Body', 'Health +10%.', type='hp', pct=10)],
     S('Grit', 'Team health +8%.', type='hp', pct=8), 'Tokyo Jujutsu High'),
    ('miwa_302', 'Kasumi Miwa', 'New Shadow Style', 'Skill', 3, '三輪', 'speed', ('long', '#6aa6dc', 'blade'),
     'Sword Draw', T('Batto Sword Draw', 4, 2.3, desc='Quick-draw slash: 2.3x attack to one curse.'), None,
     [P('Simple Domain', 'Damage taken -10%.', type='guard', pct=10)],
     S('Swordswoman', 'Team speed +6%.', type='speed', pct=6), 'Kyoto Jujutsu High'),
    ('mai_303', 'Mai Zenin', 'Construction', 'Heart', 3, '真依', 'striker', ('bob', '#2c2c3a', 'bullet'),
     'Revolver Shot', T('Construction: Final Bullet', 5, 2.6, desc='A constructed bullet: 2.6x attack to one curse.'), None,
     [P('Marksman', 'Critical chance +10%.', type='crit', pct=10)],
     S('Covering Fire', 'Team attack +6%.', type='atk', pct=6), 'Kyoto Jujutsu High'),
    ('momo_304', 'Momo Nishimiya', 'Broom Rider', 'Wisdom', 3, '西宮', 'speed', ('long', '#e8c96a', 'wind'),
     'Broom Swipe', T('Gust Sweep', 4, 1.3, 'all', desc='Wind blades hit every curse: 1.3x attack.'), None,
     [P('Aerial Scout', 'Speed +10%.', type='speed', pct=10)],
     S('Scouting Report', 'Team speed +6%.', type='speed', pct=6), 'Kyoto Jujutsu High'),
    ('mechamaru_305', 'Kokichi Muta', 'Ultimate Mechamaru', 'Bravery', 3, '機械丸', 'tank', ('robot', '#8b98a6', 'gear'),
     'Rocket Fist', T('Ultra Cannon', 5, 1.4, 'all', desc='Stored energy blast at every curse: 1.4x attack.'), None,
     [P('Heavenly Restriction', 'Start battle with +2 cursed energy.', type='ceStart', amount=2)],
     S('Stored Energy', 'Start battle with +1 cursed energy.', type='ce', amount=1), 'Kyoto Jujutsu High'),
    # ---------------- 4 stars ----------------
    ('megumi_401', 'Megumi Fushiguro', 'Ten Shadows', 'Skill', 4, '伏黒', 'balanced', ('spiky', '#1f2333', 'dog'),
     'Shadow Strike', T('Divine Dogs: Totality', 5, 2.5, desc='Shadow wolf bites one curse for 2.5x and makes it bleed.', type='burn', pct=5, turns=2), None,
     [P('Shadow Retreat', 'Damage taken -8%.', type='guard', pct=8)],
     S('Shikigami Scout', 'Team attack +8%.', type='atk', pct=8), 'Tokyo Jujutsu High'),
    ('nobara_402', 'Nobara Kugisaki', 'Straw Doll', 'Heart', 4, '釘崎', 'striker', ('bob', '#d9783c', 'nail'),
     'Hammer & Nail', T('Resonance', 5, 2.6, desc='Strikes the soul through a straw doll: 2.6x and lowers its attack 20%.', type='weaken', pct=20, turns=2), None,
     [P('Black Flash Spark', 'Critical chance +8%.', type='crit', pct=8)],
     S('Hairpin', 'Team attack +8%.', type='atk', pct=8), 'Tokyo Jujutsu High'),
    ('toge_403', 'Toge Inumaki', 'Cursed Speech', 'Wisdom', 4, '狗巻', 'speed', ('short', '#ece6d6', 'mouth'),
     'Megaphone Bash', T('"Don\'t Move."', 5, 0.9, 'all', desc='Cursed Speech: 0.9x to all curses, 60% chance to stun each.', type='stun', chance=60), None,
     [P('Throat Medicine', 'Recovers 3% health each turn.', type='regen', pct=3)],
     S('Onigiri Codes', 'Team speed +8%.', type='speed', pct=8), 'Tokyo Jujutsu High'),
    ('panda_404', 'Panda', 'Gorilla Core', 'Body', 4, 'パンダ', 'tank', ('panda', '#f2f2ef', 'paw'),
     'Panda Punch', T('Drumming Beat', 5, 2.5, desc='Gorilla Core impact through guard: 2.5x attack.'), None,
     [P('Three Cores', 'Health +15%.', type='hp', pct=15)],
     S('Big Hug', 'Team health +10%.', type='hp', pct=10), 'Tokyo Jujutsu High'),
    ('kamo_405', 'Noritoshi Kamo', 'Blood Manipulation', 'Bravery', 4, '加茂', 'speed', ('ponytail', '#2d2626', 'drop'),
     'Blood Arrow', T('Piercing Blood', 5, 2.7, desc='Compressed blood beam: 2.7x attack to one curse.'), None,
     [P('Flowing Red Scale', 'Speed +10%.', type='speed', pct=10)],
     S('Clan Heir', 'Team critical chance +5%.', type='crit', pct=5), 'Kyoto Jujutsu High'),
    # ---------------- 5 stars ----------------
    ('yuji_501', 'Yuji Itadori', 'Black Flash', 'Bravery', 5, '虎杖', 'striker', ('spiky', '#e98ca3', 'flash'),
     'Divergent Fist', T('Black Flash', 6, 3.2, desc='Distortion within 0.000001s: 3.2x attack and +2 cursed energy.', type='ceGain', amount=2),
     U('Manji Kick: Black Flash Chain', 'ultimate', 10, 5.5, 'single', desc='A chain of Black Flashes: 5.5x attack to one curse.'),
     [P('Superhuman Body', 'Health +12%.', type='hp', pct=12), P('In the Zone', 'Attack +30% while below half health.', type='lowHpAtk', pct=30)],
     S('Brotherhood', 'Team attack +10%.', type='atk', pct=10), 'Tokyo Jujutsu High'),
    ('nanami_502', 'Kento Nanami', 'Ratio Technique', 'Body', 5, '七海', 'balanced', ('short', '#dbc47c', 'ratio'),
     'Blunt Blade', T('Ratio Technique 7:3', 6, 3.3, desc='Strikes the weak point: 3.3x attack to one curse.'),
     U('Overtime: Collapse', 'ultimate', 10, 3.4, 'all', desc='Overtime unlocked: brings the building down, 3.4x to every curse.'),
     [P('Overtime', 'Attack +15%.', type='atk', pct=15), P('Ratio', 'Critical chance +10%.', type='crit', pct=10)],
     S('Professional', 'Team attack +12%.', type='atk', pct=12), 'Freelance Sorcerer'),
    ('maki_503', 'Maki Zenin', 'Heavenly Restriction', 'Skill', 5, '真希', 'speed', ('ponytail', '#2f4b3b', 'spear'),
     'Polearm Thrust', T('Playful Cloud', 6, 1.8, 'all', desc='Three-section staff sweep: 1.8x to every curse.'),
     U('Split Soul Katana', 'ultimate', 10, 5.8, 'single', desc='Cuts the soul itself: 5.8x attack to one curse.'),
     [P('Physical Gifted', 'Speed +12%.', type='speed', pct=12), P('Cursed Tool Mastery', 'Critical chance +12%.', type='crit', pct=12)],
     S('Zenin Grit', 'Team speed +10%.', type='speed', pct=10), 'Tokyo Jujutsu High'),
    ('todo_504', 'Aoi Todo', 'Boogie Woogie', 'Bravery', 5, '東堂', 'tank', ('topknot', '#3b2b22', 'clap'),
     'Brawler Strike', T('Boogie Woogie', 5, 2.6, desc='Clap and swap: 2.6x attack, 30% chance to stun.', type='stun', chance=30),
     U('Black Flash: Brotherhood', 'ultimate', 10, 3.6, 'all', desc='My best friend! 3.6x attack to every curse.'),
     [P('Iron Body', 'Health +15%.', type='hp', pct=15), P('Best Friend', 'Attack +10%.', type='atk', pct=10)],
     S('What Type of Woman?', 'Team health +12%.', type='hp', pct=12), 'Kyoto Jujutsu High'),
    ('choso_505', 'Choso', 'Death Painting', 'Heart', 5, '脹相', 'balanced', ('buns', '#2a2131', 'drop'),
     'Blood Edge', T('Piercing Blood', 6, 3.4, desc='Blood beam at supersonic speed: 3.4x attack to one curse.'),
     U('Supernova', 'ultimate', 10, 3.8, 'all', desc='Exploding blood orbs: 3.8x to every curse and sets them bleeding.', type='burn', pct=6, turns=2),
     [P('Blood Regeneration', 'Recovers 4% health each turn.', type='regen', pct=4), P('Big Brother', 'Damage taken -10%.', type='guard', pct=10)],
     S('Onii-chan', 'Team health +12%.', type='hp', pct=12), 'Death Painting Wombs'),
    ('meimei_506', 'Mei Mei', 'Black Bird', 'Wisdom', 5, '冥冥', 'striker', ('braid', '#e6e2d8', 'bird'),
     'Axe Swing', T('Bird Strike', 6, 3.5, desc='Crows dive on one curse: 3.5x attack.'),
     U('Bird Strike: Limit', 'ultimate', 10, 6.0, 'single', desc='A crow sacrificed at full speed: 6.0x attack to one curse.'),
     [P('Mercenary', 'Critical chance +15%.', type='crit', pct=15), P('Paid Upfront', 'Start battle with +2 cursed energy.', type='ceStart', amount=2)],
     S('Fee Collected', 'Start battle with +1 cursed energy.', type='ce', amount=1), 'Freelance Sorcerer'),
    ('naoya_507', 'Naoya Zenin', 'Projection Sorcery', 'Skill', 5, '直哉', 'speed', ('short', '#d8b55c', 'film'),
     'Frame Strike', T('24 FPS Rush', 6, 1.5, 'random3', desc='Three rapid frames on random curses: 1.5x each.'),
     U('Domain Expansion: Time Cell Moon Palace', 'domain', 11, 4.0, 'all', desc='Every frame splits the body: 4.0x to all curses, 50% stun.', type='stun', chance=50),
     [P('Fastest Sorcerer', 'Speed +20%.', type='speed', pct=20), P('Clan Head', 'Attack +8%.', type='atk', pct=8)],
     S('Frame Rule', 'Team speed +12%.', type='speed', pct=12), 'Zenin Clan'),
    ('hanami_508', 'Hanami', 'Disaster Plants', 'Heart', 5, '花御', 'tank', ('horns', '#d5dcb4', 'leaf'),
     'Root Lash', T('Cursed Buds', 6, 1.9, 'all', desc='Buds that drain cursed energy: 1.9x to all and lowers attack 15%.', type='weaken', pct=15, turns=2),
     U('Flower Field', 'domain', 10, 3.6, 'all', desc='A calming field: 3.6x to every curse and heals the team 15%.', type='heal', pct=15),
     [P('Bark Skin', 'Health +20%.', type='hp', pct=20), P('Photosynthesis', 'Recovers 3% health each turn.', type='regen', pct=3)],
     S('Spirit of the Forest', 'Team health +12%.', type='hp', pct=12), 'Disaster Curses'),
    # ---------------- 6 stars ----------------
    ('yuta_601', 'Yuta Okkotsu', "Rika's Beloved", 'Heart', 6, '乙骨', 'balanced', ('short', '#1d1d26', 'ring'),
     'Katana Slash', T('Rika Manifest', 7, 2.4, 'all', desc='Queen of Curses descends: 2.4x to every curse.'),
     U('Domain Expansion: Authentic Mutual Love', 'domain', 12, 5.0, 'all', desc='Copied techniques rain down: 5.0x to all curses, team healed 20%.', type='heal', pct=20),
     [P('Reverse Cursed Technique', 'Recovers 6% health each turn.', type='regen', pct=6), P('Bottomless Energy', 'Start battle with +3 cursed energy.', type='ceStart', amount=3)],
     S('Special Grade Reserve', 'Team attack +15%.', type='atk', pct=15), 'Tokyo Jujutsu High'),
    ('toji_602', 'Toji Fushiguro', 'Sorcerer Killer', 'Body', 6, '甚爾', 'speed', ('short', '#151519', 'chain'),
     'Playful Cloud', T('Inverted Spear of Heaven', 6, 4.2, desc='Nullifies techniques on hit: 4.2x attack to one curse.'),
     U('Heavenly Restriction: Unleashed', 'ultimate', 11, 7.5, 'single', desc='Zero cursed energy, all body: 7.5x attack to one curse.'),
     [P('Heavenly Restriction', 'Speed +25%.', type='speed', pct=25), P('Killer Instinct', 'Critical chance +20%.', type='crit', pct=20)],
     S('Hired Gun', 'Team speed +15%.', type='speed', pct=15), 'Mercenary'),
    ('kenjaku_603', 'Kenjaku', "Geto's Vessel", 'Wisdom', 6, '羂索', 'balanced', ('stitch', '#1e1b19', 'brain'),
     'Cursed Spirit Swarm', T('Maximum: Uzumaki', 8, 2.6, 'all', desc='Condensed curses spiral out: 2.6x to every curse.'),
     U('Domain Expansion: Womb Profusion', 'domain', 12, 5.0, 'all', desc='A thousand-year scheme: 5.0x to all, lowers their attack 25%.', type='weaken', pct=25, turns=2),
     [P('Ancient Sorcerer', 'Start battle with +3 cursed energy.', type='ceStart', amount=3), P('Body Thief', 'Attack +15%.', type='atk', pct=15)],
     S('Grand Plan', 'Start battle with +2 cursed energy.', type='ce', amount=2), 'Culling Game'),
    ('geto_604', 'Suguru Geto', 'Curse Manipulator', 'Body', 6, '夏油', 'tank', ('bun', '#19171b', 'spiral'),
     'Playful Cloud', T('Curse Manipulation', 7, 1.9, 'random3', desc='Releases three absorbed curses at random targets: 1.9x each.'),
     U('Maximum: Uzumaki', 'ultimate', 12, 5.0, 'all', desc='Every stored curse at once: 5.0x to all curses.'),
     [P('Curse Reservoir', 'Health +15%.', type='hp', pct=15), P('Absorption', 'Recovers 3% health each turn.', type='regen', pct=3)],
     S('Monkey Business', 'Team attack +15%.', type='atk', pct=15), 'Curse User'),
    ('yuki_605', 'Yuki Tsukumo', 'Star Rage', 'Bravery', 6, '九十九', 'striker', ('long', '#ebc95e', 'star'),
     'Garuda Whip', T('Garuda Strike', 7, 4.0, desc='Imaginary mass hits one curse: 4.0x attack.'),
     U('Star Rage: Black Hole', 'ultimate', 12, 5.4, 'all', desc='Mass beyond measure: 5.4x to every curse.'),
     [P('Imaginary Mass', 'Attack +20%.', type='atk', pct=20), P('Special Grade Frame', 'Health +10%.', type='hp', pct=10)],
     S('What Type of Man?', 'Team attack +15%.', type='atk', pct=15), 'Special Grade Sorcerer'),
    ('hakari_606', 'Kinji Hakari', 'Idle Death Gamble', 'Skill', 6, '秤', 'balanced', ('pompadour', '#cbb27c', 'dice'),
     'Rough Energy Jab', T('Rough Energy', 6, 3.6, desc='Rough cursed energy barrage: 3.6x and +2 cursed energy.', type='ceGain', amount=2),
     U('Domain Expansion: Idle Death Gamble', 'domain', 12, 4.5, 'all', desc='Jackpot! 4.5x to all curses and the team heals 30%.', type='heal', pct=30),
     [P('Jackpot', 'Recovers 6% health each turn.', type='regen', pct=6), P('Hot-Blooded', 'Critical chance +15%.', type='crit', pct=15)],
     S('Fever Time', 'Team critical chance +10%.', type='crit', pct=10), 'Tokyo Jujutsu High'),
    ('kashimo_607', 'Hajime Kashimo', 'Mythical Beast Amber', 'Bravery', 6, '鹿紫雲', 'speed', ('spiky', '#76d4e2', 'bolt'),
     'Nyoi Staff', T('Lightning Discharge', 7, 2.5, 'all', desc='Cursed energy as electricity: 2.5x to all, 25% stun.', type='stun', chance=25),
     U('Mythical Beast Amber', 'ultimate', 12, 8.0, 'single', desc='A body made of lightning: 8.0x attack to one curse.'),
     [P('Thunder God', 'Speed +20%.', type='speed', pct=20), P('400-Year Hunger', 'Attack +15%.', type='atk', pct=15)],
     S('Strongest of the Edo', 'Team speed +15%.', type='speed', pct=15), 'Culling Game'),
    ('higuruma_608', 'Hiromi Higuruma', 'Deadly Sentencing', 'Wisdom', 6, '日車', 'balanced', ('short', '#2a2a2c', 'scales'),
     'Gavel Strike', T("Judgeman's Gavel", 6, 3.8, desc='Gavel grows to full size: 3.8x and lowers attack 30%.', type='weaken', pct=30, turns=2),
     U("Domain Expansion: Deadly Sentencing", 'domain', 12, 9.0, 'single', desc="Guilty. Executioner's Sword: 9.0x to one curse and stuns it.", type='stun', chance=100),
     [P('Attorney', 'Damage taken -15%.', type='guard', pct=15), P('Confiscation', 'Attack +10%.', type='atk', pct=10)],
     S('Due Process', 'Team health +15%.', type='hp', pct=15), 'Culling Game'),
    ('mahito_609', 'Mahito', 'Idle Transfiguration', 'Skill', 6, '真人', 'striker', ('stitchlong', '#93a7bc', 'hand'),
     'Shape Shift', T('Idle Transfiguration', 7, 4.0, desc='Reshapes the soul: 4.0x and soul rot (8% per turn).', type='burn', pct=8, turns=2),
     U('Domain Expansion: Self-Embodiment of Perfection', 'domain', 12, 5.2, 'all', desc='A guaranteed-hit soul touch: 5.2x to all curses.'),
     [P('Soul Reshape', 'Recovers 8% health each turn.', type='regen', pct=8), P('Curse of Humanity', 'Attack +10%.', type='atk', pct=10)],
     S('Polymorphic Soul', 'Team attack +12%.', type='atk', pct=12), 'Disaster Curses'),
    ('jogo_610', 'Jogo', 'Disaster Flames', 'Heart', 6, '漏瑚', 'striker', ('volcano', '#8c6c4b', 'flame'),
     'Ember Punch', T('Ember Insects', 7, 2.4, 'all', desc='Burning insects swarm: 2.4x to all and sets them ablaze.', type='burn', pct=6, turns=2),
     U('Domain Expansion: Coffin of the Iron Mountain', 'domain', 12, 5.4, 'all', desc='Inside a volcano: 5.4x to all curses and heavy burn.', type='burn', pct=10, turns=3),
     [P('Disaster Flames', 'Attack +20%.', type='atk', pct=20)],
     S('Volcanic Fury', 'Team attack +15%.', type='atk', pct=15), 'Disaster Curses'),
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

def build_characters():
    out_list = []
    for (cid, name, title, el, rar, kanji, prof, art, basic, tech, ult, passives, support, aff) in CHARS:
        if cid in REAL:
            sb, sm = REAL[cid]
            portrait = f'assets/characters/{cid}/portrait_7S.webp'
            full = f'assets/characters/{cid}/full_7S.webp'
        else:
            r = rnd_for(cid)
            lo, hi = RANGES[rar]
            pf = PROFILES[prof]
            jitter = lambda: 0.96 + r.random() * 0.08
            sb = {k: int(round(lo[k] * pf[k] * jitter() / (10 if k != 'speed' else 1))) * (10 if k != 'speed' else 1) for k in lo}
            sm = {k: int(round(hi[k] * pf[k] * jitter() / (10 if k != 'speed' else 1))) * (10 if k != 'speed' else 1) for k in hi}
            portrait = full = f'assets/portraits/{cid}.svg'
        out_list.append({
            'id': cid, 'name': name, 'title': title, 'element': el, 'rarity': rar,
            'maxLevel': MAX_LEVEL[rar], 'kanji': kanji, 'affiliation': aff,
            'statsBase': sb, 'statsMax': sm,
            'art': {'portrait': portrait, 'full': full, 'generated': cid not in REAL},
            'basic': {'name': basic, 'mult': 1.0},
            'technique': tech,
            'ultimate': ult,
            'passives': passives,
            'support': support,
        })
    return out_list

# ---------------------------------------------------------------------------
# SVG portraits
SIGILS = {
    'fist': '<path d="M-9,-4 h18 v10 a4,4 0 0 1 -4,4 h-10 a4,4 0 0 1 -4,-4z M-9,-4 v-5 h4 v5 M-4,-4 v-7 h4 v7 M1,-4 v-7 h4 v7 M5,-4 v-5 h4 v5"/>',
    'blade': '<path d="M-12,10 L8,-10 L11,-11 L10,-8 L-10,12z M-12,6 L-6,12"/>',
    'bullet': '<path d="M-4,10 v-12 a4,7 0 0 1 8,0 v12z M-6,10 h12"/>',
    'wind': '<path d="M-11,-4 h14 a4,4 0 1 0 -4,-4 M-11,2 h18 a4,4 0 1 1 -4,4 M-11,8 h8"/>',
    'gear': '<circle r="6"/><path d="M0,-12 v4 M0,8 v4 M-12,0 h4 M8,0 h4 M-8.5,-8.5 l3,3 M5.5,5.5 l3,3 M-8.5,8.5 l3,-3 M5.5,-5.5 l3,-3"/>',
    'dog': '<path d="M-10,8 L-8,-4 L-10,-12 L-3,-6 L3,-6 L10,-12 L8,-4 L10,8 L0,12z M-4,0 h1 M3,0 h1"/>',
    'nail': '<path d="M0,-12 v20 l-2,4 M-6,-12 h12 M-9,-6 l-3,-3 M9,-6 l3,-3"/>',
    'mouth': '<path d="M-11,0 q11,-10 22,0 q-11,10 -22,0z M-6,-3 v6 M-2,-4 v8 M2,-4 v8 M6,-3 v6"/>',
    'paw': '<circle cy="4" r="6"/><circle cx="-8" cy="-5" r="3"/><circle cx="-3" cy="-10" r="3"/><circle cx="3" cy="-10" r="3"/><circle cx="8" cy="-5" r="3"/>',
    'drop': '<path d="M0,-12 C6,-2 9,2 9,6 a9,9 0 0 1 -18,0 C-9,2 -6,-2 0,-12z"/>',
    'flash': '<path d="M-10,-10 l20,20 M10,-10 l-20,20 M0,-13 v26 M-13,0 h26"/>',
    'ratio': '<path d="M-10,10 L10,-10 M-12,-4 h10 M2,4 h10 M-4,-12 v10 M4,2 v10"/>',
    'spear': '<path d="M-11,11 L9,-9 M9,-9 l-1,-4 l5,-1 l-1,5z M-6,10 l-4,-4"/>',
    'clap': '<path d="M-2,10 L-8,-6 a2,2 0 0 1 4,-1 L0,4 M2,10 L8,-6 a2,2 0 0 0 -4,-1 L0,4 M-10,-10 l3,3 M10,-10 l-3,3 M0,-13 v4"/>',
    'bird': '<path d="M-12,-2 q6,-6 12,2 q6,-8 12,-2 q-6,0 -9,6 l-3,6 l-3,-6 q-3,-6 -9,-6z"/>',
    'film': '<rect x="-10" y="-8" width="20" height="16"/><path d="M-3,-8 v16 M3,-8 v16 M-10,0 h20"/>',
    'leaf': '<path d="M-10,10 C-10,-6 2,-12 12,-12 C12,0 6,10 -10,10z M-10,10 L6,-6"/>',
    'ring': '<circle r="8"/><path d="M-3,-8 l3,-5 l3,5"/>',
    'chain': '<rect x="-12" y="-4" width="10" height="8" rx="4"/><rect x="2" y="-4" width="10" height="8" rx="4"/><path d="M-4,0 h8"/>',
    'brain': '<path d="M-10,2 a6,6 0 0 1 4,-10 a6,6 0 0 1 12,0 a6,6 0 0 1 4,10 a6,6 0 0 1 -10,6 a6,6 0 0 1 -10,-6z M-11,-1 h22 M-7,-4 v2 M-2,-4 v2 M3,-4 v2 M8,-4 v2"/>',
    'spiral': '<path d="M0,0 a2,2 0 0 1 4,0 a4,4 0 0 1 -8,0 a6,6 0 0 1 12,0 a8,8 0 0 1 -16,0 a10,10 0 0 1 20,0"/>',
    'star': '<path d="M0,-12 L3.5,-4 L12,-4 L5,1.5 L7.5,10 L0,5 L-7.5,10 L-5,1.5 L-12,-4 L-3.5,-4z"/>',
    'dice': '<rect x="-9" y="-9" width="18" height="18" rx="3"/><circle cx="-4" cy="-4" r="1.6"/><circle r="1.6"/><circle cx="4" cy="4" r="1.6"/>',
    'bolt': '<path d="M3,-13 L-7,2 h6 L-3,13 L7,-2 h-6z"/>',
    'scales': '<path d="M0,-12 v22 M-8,10 h16 M-11,-8 h22 M-11,-8 l-3,8 h6z M11,-8 l-3,8 h6z"/>',
    'hand': '<path d="M-6,12 v-12 l-3,-5 a1.5,1.5 0 0 1 3,-1 l2,3 v-9 a1.5,1.5 0 0 1 3,0 v8 v-10 a1.5,1.5 0 0 1 3,0 v10 v-8 a1.5,1.5 0 0 1 3,0 v14 l-3,10z"/>',
    'flame': '<path d="M0,12 C-9,12 -10,4 -6,-2 C-5,2 -3,3 -2,1 C-4,-5 0,-10 3,-13 C3,-7 10,-3 8,5 C7,10 4,12 0,12z"/>',
    'eye': '<path d="M-12,0 q12,-12 24,0 q-12,12 -24,0z"/><circle r="4"/>',
}

HAIR = {}
def hair_paths(style, color, dark):
    """Return (behind, front) SVG fragments for a hair style around a head at (150,190)."""
    if style == 'spiky':
        pts = [(86, 200), (78, 150), (98, 160), (92, 112), (118, 132), (124, 92), (146, 122), (160, 84), (172, 122), (196, 96), (196, 134), (220, 116), (210, 160), (226, 156), (214, 200), (200, 160), (150, 140), (104, 162)]
        return '', f'<path d="M{" L".join(f"{x},{y}" for x, y in pts)}z" fill="{color}"/>'
    if style == 'short':
        return '', f'<path d="M90,196 C84,120 216,120 210,196 C206,166 190,150 150,148 C112,150 96,166 90,196z" fill="{color}"/>'
    if style == 'pompadour':
        return '', f'<path d="M90,196 C80,120 120,96 190,104 C224,110 220,150 210,196 C204,164 186,152 150,150 C114,152 96,166 90,196z" fill="{color}"/>'
    if style == 'long':
        return (f'<path d="M84,190 C70,260 74,320 64,360 L236,360 C226,320 230,260 216,190z" fill="{color}"/>',
                f'<path d="M88,206 C80,124 220,124 212,206 C204,170 186,154 150,152 C114,154 96,170 88,206z" fill="{color}"/>')
    if style == 'bob':
        return (f'<path d="M86,196 C80,250 92,268 110,268 L190,268 C208,268 220,250 214,196z" fill="{color}"/>',
                f'<path d="M86,214 C78,122 222,122 214,214 C206,176 186,158 150,156 C114,158 94,176 86,214z" fill="{color}"/>')
    if style == 'braid':
        return (f'<path d="M190,220 C220,260 206,300 214,350 L236,350 C230,300 244,250 212,210z" fill="{color}"/>',
                f'<path d="M86,214 C78,122 222,122 214,214 C200,170 168,152 130,160 C108,168 94,186 86,214z" fill="{color}"/>')
    if style == 'ponytail':
        return (f'<path d="M180,130 C250,140 250,240 226,300 C236,240 226,180 176,150z" fill="{color}"/>',
                f'<path d="M90,196 C84,120 216,120 210,196 C206,166 190,150 150,148 C112,150 96,166 90,196z" fill="{color}"/>')
    if style == 'bun':
        return (f'<circle cx="150" cy="118" r="24" fill="{color}"/>',
                f'<path d="M90,206 C84,124 216,124 210,206 C206,170 190,152 150,150 C112,152 96,170 90,206z" fill="{color}"/>')
    if style == 'stitch':
        return (f'<circle cx="150" cy="118" r="24" fill="{color}"/>',
                f'<path d="M90,206 C84,124 216,124 210,206 C206,170 190,152 150,150 C112,152 96,170 90,206z" fill="{color}"/>'
                f'<path d="M100,168 C130,160 170,160 200,168" stroke="#c9a24e" stroke-width="2.4" fill="none" stroke-dasharray="5 4"/>')
    if style == 'buns':
        return (f'<circle cx="104" cy="140" r="16" fill="{color}"/><circle cx="196" cy="140" r="16" fill="{color}"/>',
                f'<path d="M90,200 C84,124 216,124 210,200 C206,166 190,150 150,148 C112,150 96,166 90,200z" fill="{color}"/>')
    if style == 'topknot':
        return (f'<path d="M140,128 L150,96 L160,128z" fill="{color}"/>',
                f'<path d="M92,186 C90,128 210,128 208,186 C200,160 184,152 150,152 C116,152 100,160 92,186z" fill="{color}"/>')
    if style == 'stitchlong':
        return (f'<path d="M84,190 C74,240 80,290 70,330 L230,330 C220,290 226,240 216,190z" fill="{color}"/>',
                f'<path d="M88,206 C80,124 220,124 212,206 C204,170 186,154 150,152 C114,154 96,170 88,206z" fill="{color}"/>'
                f'<path d="M118,190 l30,40 M126,196 l-6,6 M136,208 l-6,6 M146,222 l-6,6" stroke="#2a3340" stroke-width="2" fill="none"/>')
    if style == 'panda':
        return (f'<circle cx="98" cy="134" r="20" fill="#14141a"/><circle cx="202" cy="134" r="20" fill="#14141a"/>',
                '<ellipse cx="126" cy="196" rx="16" ry="12" fill="#14141a" transform="rotate(-20 126 196)"/>'
                '<ellipse cx="174" cy="196" rx="16" ry="12" fill="#14141a" transform="rotate(20 174 196)"/>'
                '<ellipse cx="150" cy="224" rx="8" ry="6" fill="#14141a"/>')
    if style == 'volcano':
        return ('', f'<path d="M96,176 L118,104 L182,104 L204,176z" fill="{color}"/>'
                    '<path d="M118,104 q32,-20 64,0" fill="#ff7a2e"/><path d="M126,96 q8,-22 18,-30 q-2,18 8,26 q8,-14 6,-30 q14,14 12,34z" fill="#ffb347" opacity=".9"/>')
    if style == 'horns':
        return ('', f'<path d="M108,150 C96,120 84,100 70,92 C92,96 106,112 116,138z M192,150 C204,120 216,100 230,92 C208,96 194,112 184,138z" fill="{color}"/>'
                    '<path d="M110,190 h80" stroke="#f6f0d6" stroke-width="10" stroke-linecap="round" opacity=".85"/>')
    if style == 'robot':
        return ('', '<rect x="100" y="140" width="100" height="100" rx="14" fill="#5b6672"/>'
                    '<rect x="112" y="178" width="76" height="20" rx="6" fill="#111"/>'
                    f'<rect x="120" y="183" width="60" height="10" rx="4" fill="{color}" opacity=".9"/>'
                    '<path d="M150,140 v-24 M150,116 l10,-6" stroke="#5b6672" stroke-width="6" stroke-linecap="round"/>')
    return '', ''

def portrait_svg(c, art):
    hair, hcol, sigil = art
    el = ELEMENTS[c['element']]
    r = rnd_for(c['id'] + 'art')
    pid = c['id']
    head_fill = '#f3f3ee' if hair == 'panda' else 'url(#skin-' + pid + ')'
    strokes = []
    for i in range(5):
        x1 = r.randint(-40, 200); y1 = r.randint(20, 380)
        w = r.randint(140, 320); a = r.uniform(-0.5, 0.2)
        x2 = x1 + w; y2 = y1 + w * a
        strokes.append(f'<path d="M{x1},{y1} Q{(x1+x2)/2+r.randint(-30,30)},{(y1+y2)/2+r.randint(-40,40)} {x2},{y2:.0f}" stroke="{el["glow"]}" stroke-opacity="{r.uniform(0.05,0.14):.2f}" stroke-width="{r.randint(10,34)}" stroke-linecap="round" fill="none"/>')
    behind, front = hair_paths(hair, hcol, el['c2'])
    kanji = c['kanji']
    vert = ''.join(f'<tspan x="262" dy="{0 if i == 0 else 46}">{ch}</tspan>' for i, ch in enumerate(kanji[:3]))
    initials = ''.join(w[0] for w in c['name'].split()[:2]).upper()
    eyes = '' if hair in ('robot', 'volcano', 'panda') else (
        f'<path d="M118,190 l26,6 M182,190 l-26,6" stroke="#15151b" stroke-width="4.5" stroke-linecap="round" fill="none"/>'
        f'<path d="M122,204 q10,-7 20,0 q-10,5 -20,0z M158,204 q10,-7 20,0 q-10,5 -20,0z" fill="#15151b"/>'
        f'<circle cx="133" cy="203" r="2.4" fill="{el["glow"]}"/><circle cx="167" cy="203" r="2.4" fill="{el["glow"]}"/>'
        f'<path d="M140,238 q10,4 20,0" stroke="#7a5446" stroke-width="2.5" fill="none" stroke-linecap="round"/>')
    if hair == 'volcano':
        eyes = f'<circle cx="150" cy="190" r="12" fill="#fff8e0"/><circle cx="150" cy="190" r="5" fill="#2a1408"/>'
    if hair == 'panda':
        eyes = '<circle cx="128" cy="194" r="3" fill="#fff"/><circle cx="172" cy="194" r="3" fill="#fff"/>'
    head = '' if hair == 'robot' else f'<ellipse cx="150" cy="196" rx="58" ry="66" fill="{head_fill}"/>'
    sig = SIGILS.get(sigil, SIGILS['star'])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
<defs>
<linearGradient id="bg-{pid}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="{el['c1']}"/><stop offset="0.55" stop-color="{el['c2']}"/><stop offset="1" stop-color="#05080a"/></linearGradient>
<radialGradient id="glow-{pid}" cx="0.5" cy="0.45" r="0.55"><stop offset="0" stop-color="{el['glow']}" stop-opacity="0.55"/><stop offset="1" stop-color="{el['glow']}" stop-opacity="0"/></radialGradient>
<linearGradient id="skin-{pid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9cdb4"/><stop offset="1" stop-color="#b88f74"/></linearGradient>
<linearGradient id="coat-{pid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2027"/><stop offset="1" stop-color="#07090c"/></linearGradient>
</defs>
<rect width="300" height="400" fill="url(#bg-{pid})"/>
{''.join(strokes)}
<circle cx="150" cy="190" r="150" fill="url(#glow-{pid})"/>
<text x="262" y="66" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP','IPAMincho',serif" font-size="44" font-weight="700" fill="#ffffff" fill-opacity="0.16" text-anchor="middle">{vert}</text>
{behind}
<path d="M20,400 C30,320 90,290 150,290 C210,290 270,320 280,400z" fill="url(#coat-{pid})" stroke="{el['glow']}" stroke-opacity="0.55" stroke-width="3"/>
<path d="M118,292 L150,340 L182,292" fill="none" stroke="#c9a24e" stroke-width="3" stroke-opacity="0.8"/>
<circle cx="150" cy="318" r="5" fill="#c9a24e"/>
<rect x="130" y="240" width="40" height="56" fill="url(#skin-{pid})"/>
{head}
{front}
{eyes}
<g transform="translate(44,352)" fill="none" stroke="#f1d98a" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><circle r="24" fill="#071418" fill-opacity="0.75" stroke="#c9a24e"/>{sig}</g>
<g transform="translate(252,352)"><rect x="-22" y="-22" width="44" height="44" rx="4" fill="#8e1c1c" stroke="#f1d98a" stroke-opacity="0.6"/><text y="8" text-anchor="middle" font-family="Georgia,serif" font-size="22" font-weight="700" fill="#f6ead0">{initials}</text></g>
<rect x="4" y="4" width="292" height="392" fill="none" stroke="#c9a24e" stroke-opacity="0.7" stroke-width="2"/>
</svg>
'''

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
    {'id': 'strongest', 'name': 'The Strongest', 'kanji': '最強', 'subtitle': 'Featured: Gojo Satoru ★7 rate up',
     'featured': ['gojo_9005', 'toji_602'], 'element': 'Skill', 'pityAt': 60, 'hero': 'gojo_9005'},
    {'id': 'king', 'name': 'King of Curses', 'kanji': '呪いの王', 'subtitle': 'Featured: Ryomen Sukuna ★7 ×2 rate up',
     'featured': ['sukuna_9006', 'sukuna_9007', 'jogo_610'], 'element': 'Body', 'pityAt': 60, 'hero': 'sukuna_9006'},
], 'rates': {'3': 46.0, '4': 32.0, '5': 15.0, '6': 6.0, '7': 1.0}, 'featuredShare': 50,
   'cost': {'single': {'cubes': 5, 'tickets': 1}, 'multi': {'cubes': 45, 'tickets': 10}}, 'multiGuarantee': 5}


def main():
    chars = build_characters()
    for (cid, *_rest), c in zip(CHARS, chars):
        art = _rest[6]
        if c['art']['generated']:
            out(f'assets/portraits/{cid}.svg', portrait_svg(c, art))
    out('data/characters.json', chars)
    out('data/enemies.json', build_enemies())
    out('data/missions.json', MISSIONS)
    out('data/items.json', {'items': ITEMS, 'shop': SHOP})
    out('data/banners.json', BANNERS)
    print(len(chars), 'characters,', len(ENEMIES), 'enemies,', sum(len(c['stages']) for c in MISSIONS['chapters']), 'stages')

if __name__ == '__main__':
    main()
