window.DraftBanEffects = (() => {
  const queues = { blue: [], red: [] };
  const busy = { blue: false, red: false };
  let previous = null, generation = 0, layer = null;
  function host() {
    if (!layer) {
      layer = document.createElement('aside');
      layer.className = 'draft-ban-effects';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    return layer;
  }
  function reset() {
    generation++;
    queues.blue.length = queues.red.length = 0;
    busy.blue = busy.red = false;
    if (layer) { layer.replaceChildren(); layer.classList.remove('dual'); }
  }
  function loadArt(id) {
    const source = '/api/champion-portrait?id=' + id;
    return new Promise(resolve => {
      const image = new Image();
      const timeout = setTimeout(() => resolve(HUD.icon(id)), 3500);
      const done = url => { clearTimeout(timeout); resolve(url); };
      image.onload = () => done(source);
      image.onerror = () => done(HUD.icon(id));
      image.src = source;
    });
  }
  async function play(side) {
    if (busy[side] || !queues[side].length) return;
    busy[side] = true;
    if (busy.blue && busy.red) host().classList.add('dual');
    const token = generation, ban = queues[side].shift();
    const source = await loadArt(ban.id);
    if (token !== generation) return;
    const card = document.createElement('div');
    card.className = 'draft-ban-effect ' + side;
    card.style.setProperty('--ban-team', ban.color);
    for (const half of ['left', 'right']) {
      const image = document.createElement('img');
      image.className = 'ban-art ban-art-' + half;
      image.src = source;
      image.alt = '';
      card.appendChild(image);
    }
    host().appendChild(card);
    setTimeout(() => {
      card.remove();
      if (token !== generation) return;
      busy[side] = false;
      play(side);
      if (!busy.blue && !busy.red) host().classList.remove('dual');
    }, 1400);
  }
  function sync(state) {
    const current = {
      blue: (state.draft.blueBans || []).map(Number),
      red: (state.draft.redBans || []).map(Number)
    };
    if (previous) {
      if (!current.blue.some(Boolean) && !current.red.some(Boolean)) reset();
      for (const side of ['blue', 'red']) {
        for (const id of current[side]) {
          if (id && !previous[side].includes(id)) queues[side].push({ id, color: state[side].color });
        }
        play(side);
      }
    }
    previous = current;
  }
  return { sync };
})();
