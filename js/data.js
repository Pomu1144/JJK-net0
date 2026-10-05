/* js/data.js — one shared loader for data/*.json.
 * Each file is fetched at most once per page; every caller gets the same
 * promise. Relative URLs so the game works under any GitHub Pages subpath.
 *
 *   await Data.load('characters')           -> parsed JSON
 *   await Data.all('characters', 'enemies') -> [chars, enemies]
 *   Data.char(id)  (after characters loaded) -> definition or null
 */
(function (global) {
  'use strict';

  const cache = new Map();
  const index = { characters: null, enemies: null };

  function load(name) {
    if (!/^[a-z]+$/.test(name)) return Promise.reject(new Error('bad data name ' + name));
    if (!cache.has(name)) {
      cache.set(name, fetch('data/' + name + '.json', { cache: 'no-cache' })
        .then((r) => {
          if (!r.ok) throw new Error('Could not load data/' + name + '.json (' + r.status + ')');
          return r.json();
        })
        .then((json) => {
          if (name === 'characters' || name === 'enemies') {
            index[name] = new Map(json.map((c) => [c.id, c]));
          }
          return json;
        })
        .catch((err) => { cache.delete(name); throw err; }));
    }
    return cache.get(name);
  }

  global.Data = {
    load,
    all: (...names) => Promise.all(names.map(load)),
    char: (id) => (index.characters && index.characters.get(id)) || null,
    enemy: (id) => (index.enemies && index.enemies.get(id)) || null,
    get characters() { return index.characters ? Array.from(index.characters.values()) : []; },
  };
})(window);
