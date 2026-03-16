/**
 * saveData.js
 *
 * Very small localStorage wrapper for title / raid / boss menu progress.
 */
const SAVE_KEY = 'stormcaller_save_v1';

export function createDefaultSaveData() {
  return {
    raidWipeTokensLeft: 3,
    unlockedRaidIds: ['karazhan', 'molten_core'],
    unlockedBossIds: {
      molten_core: ['ragnaros'],
      karazhan: ['attumen', 'moroes', 'maiden_of_virtue', 'opera_event', 'the_curator', 'terestian_illhoof', 'shade_of_aran', 'netherspite', 'chess_event', 'prince_malchezaar', 'nightbane', 'servants_quarters'],
      gruuls_lair: [],
      magtheridons_lair: [],
    },
    lastSelectedRaidId: 'molten_core',
    lastSelectedBossId: 'ragnaros',
  };
}

export function loadSaveData() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return createDefaultSaveData();
    }

    const parsed = JSON.parse(raw);
    return sanitizeSaveData(parsed);
  } catch (error) {
    console.warn('[saveData] Failed to load save data. Using defaults.', error);
    return createDefaultSaveData();
  }
}

export function saveSaveData(saveData) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(sanitizeSaveData(saveData)));
  } catch (error) {
    console.warn('[saveData] Failed to persist save data.', error);
  }
}

export function resetSaveData() {
  const defaults = createDefaultSaveData();
  saveSaveData(defaults);
  return defaults;
}

export function sanitizeSaveData(saveData) {
  const defaults = createDefaultSaveData();
  const safeData = {
    ...defaults,
    ...(saveData || {}),
  };

  safeData.unlockedRaidIds = Array.isArray(safeData.unlockedRaidIds)
    ? safeData.unlockedRaidIds
    : defaults.unlockedRaidIds;

  safeData.unlockedBossIds = {
    ...defaults.unlockedBossIds,
    ...(safeData.unlockedBossIds || {}),
  };

  if (!safeData.lastSelectedRaidId) {
    safeData.lastSelectedRaidId = defaults.lastSelectedRaidId;
  }

  if (!safeData.lastSelectedBossId) {
    safeData.lastSelectedBossId = defaults.lastSelectedBossId;
  }

  if (typeof safeData.raidWipeTokensLeft !== 'number') {
    safeData.raidWipeTokensLeft = defaults.raidWipeTokensLeft;
  }

  return safeData;
}
