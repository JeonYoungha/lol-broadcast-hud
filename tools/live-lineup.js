const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const POSITION_NAMES = {
  top: 'top', toplane: 'top', 탑: 'top',
  jungle: 'jungle', jungler: 'jungle', 정글: 'jungle',
  middle: 'mid', mid: 'mid', midlane: 'mid', 미드: 'mid',
  bottom: 'bot', bot: 'bot', botlane: 'bot', bottomlane: 'bot', adc: 'bot', 바텀: 'bot', 원딜: 'bot',
  utility: 'support', support: 'support', 서포터: 'support', 서폿: 'support'
};
// Role Quest items and rewards in Riot's Data Dragon item data.
const QUEST_ITEMS = new Map([
  [1200, ['top', false]], [1222, ['top', false]], [1220, ['top', true]], [1221, ['top', true]],
  [1201, ['mid', false]], [1206, ['mid', true]],
  [1202, ['bot', false]], [1207, ['bot', true]],
  [1203, ['support', false]], [1208, ['support', true]],
  [1204, ['jungle', false]], [1205, ['jungle', true]], [1209, ['jungle', true]],
  [1210, ['jungle', true]], [1211, ['jungle', true]]
]);
const JUNGLE_PETS = new Set([1101, 1102, 1103, 1105, 1106, 1107]);
const SUPPORT_ITEMS = new Set([3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877]);

function positionName(value) {
  if (typeof value !== 'string') return null;
  return POSITION_NAMES[value.toLowerCase().replace(/role|quest|reward|[^a-z가-힣]/g, '')] || null;
}

function roleEvidence(player) {
  const quest = player.roleQuest ?? player.rolequest ?? player.positionQuest ?? player.quest;
  const questItem = QUEST_ITEMS.get(Number(quest?.itemID ?? quest?.itemId ?? quest?.id ?? quest));
  const explicitRole = [quest?.role, quest?.position, quest?.lane, quest?.type, quest?.name, quest]
    .map(positionName).find(Boolean);
  const items = (player.items || []).map(item => Number(item.itemID ?? item.itemId));
  const itemEvidence = items.map(id => QUEST_ITEMS.get(id)).filter(Boolean);
  const role = explicitRole || questItem?.[0] || itemEvidence[0]?.[0];
  if (role) {
    const evidence = [questItem, ...itemEvidence].filter(item => item?.[0] === role);
    const completed = evidence.some(item => item[1]) ? true : evidence.length ? false : null;
    return {role, rank: 4, completed};
  }
  const assigned = [player.position, player.assignedPosition, player.role].map(positionName).find(Boolean);
  if (assigned) return {role: assigned, rank: 3, completed: null};
  if (items.some(id => SUPPORT_ITEMS.has(id))) return {role: 'support', rank: 2, completed: null};
  if (items.some(id => JUNGLE_PETS.has(id))) return {role: 'jungle', rank: 2, completed: null};
  if (Object.values(player.summonerSpells || {}).some(spell =>
    /smite/i.test(spell.rawDisplayName || spell.displayName || '') || spell.displayName === '강타')) {
    return {role: 'jungle', rank: 1, completed: null};
  }
  return null;
}

function assignLineup(players, previousRoles) {
  const lineup = ROLES.map(() => null);
  const entries = players.map(entry => {
    const current = roleEvidence(entry.player);
    const previous = previousRoles.get(entry.id);
    const chosen = current && (!previous || current.rank >= previous.rank) ? current : previous;
    if (entry.id && chosen) previousRoles.set(entry.id, {role: chosen.role, rank: chosen.rank});
    return {...entry, evidence: chosen, questCompleted: current?.completed ?? null};
  });
  // A direct quest ID takes priority over an assigned position or an inventory clue.
  const claimed = new Set();
  for (const entry of [...entries].sort((a, b) => (b.evidence?.rank || 0) - (a.evidence?.rank || 0))) {
    const slot = ROLES.indexOf(entry.evidence?.role);
    if (slot < 0 || lineup[slot]) continue;
    lineup[slot] = entry;
    claimed.add(entry);
  }
  // Players without a role signal keep the game's order within the still empty rows.
  for (const entry of entries) {
    if (claimed.has(entry)) continue;
    const slot = lineup.indexOf(null);
    if (slot < 0) break;
    lineup[slot] = entry;
  }
  return lineup.map((entry, index) => entry && {...entry, role: ROLES[index]});
}

function scoreKey(player) {
  const {kills = 0, deaths = 0, assists = 0} = player.scores || {};
  return `${kills}/${deaths}/${assists}`;
}

function matchScoreboardRows(players, kdas = [], observedCs = []) {
  const rows = Array(5).fill(null);
  const used = new Set();
  for (let index = 0; index < rows.length; index++) {
    const kda = kdas?.[index];
    if (!kda || kdas.indexOf(kda) !== kdas.lastIndexOf(kda)) continue;
    const matches = players.filter(entry => entry.id && scoreKey(entry.player) === kda);
    if (matches.length !== 1) continue;
    rows[index] = matches[0];
    used.add(matches[0].id);
  }

  // Tied KDA and missing rows are common. Never assume the API order is the on-screen order.
  // For unresolved rows, use corroborated OCR against a unique nearby reference.
  const unresolved = [];
  for (let index = 0; index < rows.length; index++) {
    if (rows[index]) continue;
    const cs = observedCs[index], kda = kdas?.[index];
    if (!kda && !Number.isInteger(cs)) continue;
    const matches = players.filter(entry =>
      entry.id && !used.has(entry.id) && (!kda || scoreKey(entry.player) === kda));
    if (matches.length === 1 && kda) {
      unresolved.push({index, entry: matches[0]});
      continue;
    }
    if (!Number.isInteger(cs)) continue;
    const ranked = matches.map(entry => {
      const known = [entry.player.scores?.creepScore, entry.lastCs].filter(Number.isInteger);
      return {entry, distance: Math.min(...known.map(value => Math.abs(cs - value)))};
    }).sort((a, b) => a.distance - b.distance);
    const [first, second] = ranked;
    if (first?.distance <= 8 && (!second || second.distance - first.distance >= 5)) {
      unresolved.push({index, entry: first.entry});
    }
  }
  for (const {index, entry} of unresolved) {
    if (unresolved.filter(candidate => candidate.entry.id === entry.id).length === 1) rows[index] = entry;
  }
  return rows;
}

function selectScreenCs(zoom, raw, previous, apiSample, pending, elapsedSeconds = 0) {
  const valid = n => Number.isInteger(n) && n >= (previous ?? 0) && n <= 2000;
  const candidates = [...new Set([zoom, raw].filter(valid))];
  if (!candidates.length) return {value: null, pending: null};
  const reference = previous ?? apiSample;
  if (Number.isFinite(reference)) candidates.sort((a, b) => Math.abs(a-reference) - Math.abs(b-reference));
  const [value] = candidates;
  const agrees = zoom === raw && raw === value;
  const hasApi = Number.isInteger(apiSample) && apiSample >= 0;
  const nearApi = hasApi && Math.abs(value-apiSample) <= 15;
  const advance = previous == null ? value : value - previous;
  const elapsed = Math.max(0, elapsedSeconds);
  // Even two agreeing OCR crops come from one frame and can share the same bad digit.
  if (advance > 12 + Math.floor(elapsed * 2) ||
      (advance > 12 && hasApi && value > apiSample + 25)) return {value: null, pending: null};
  if (advance <= 12 && (previous != null || nearApi || agrees)) return {value, pending: null};

  const seen = pending?.value === value ? pending.seen + 1 : 1;
  const needed = nearApi ? 2 : 3;
  if (seen >= needed) return {value, pending: null};
  return {value: null, pending:{value,seen}};
}

module.exports = {ROLES, assignLineup, matchScoreboardRows, selectScreenCs};
