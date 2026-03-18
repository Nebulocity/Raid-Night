/**
 * saveData.js
 *
 * Manages player save data stored in localStorage.
 *
 * Save data tracks:
 *   - Which raids are accessible
 *   - Which bosses have been defeated (used to derive unlock state)
 *   - The last raid and boss the player visited
 *   - How many raid wipe tokens remain
 *
 * Unlock logic:
 *   A boss is unlocked if every boss listed in its "unlockedBy" array
 *   has been defeated. If "unlockedBy" is empty the boss is always unlocked.
 *   This is checked dynamically from the RAID_CATALOG at runtime, so
 *   adding a new boss never requires editing this file.
 */

import { RAID_CATALOG } from '../data/raidCatalog.js';

const SAVE_KEY = 'raidnight_save_v1';

// How many wipe tokens a new player starts with
const STARTING_WIPE_TOKENS = 3;

// These raids are accessible from the start
const DEFAULT_UNLOCKED_RAID_IDS = [
  'the_churning_core',
  'the_demon_basement',
  'the_cracked_mountain',
  'spookspire_keep',
];

// ============================================================
// Public API
// ============================================================

export function createDefaultSaveData() {
  return {
    raidWipeTokensLeft:  STARTING_WIPE_TOKENS,
    unlockedRaidIds:     [...DEFAULT_UNLOCKED_RAID_IDS],
    // Tracks which bosses the player has defeated, keyed by raid id
    defeatedBossIds:     {
      the_churning_core:     [],
      the_demon_basement:    [],
      the_cracked_mountain:  [],
      spookspire_keep:       [],
    },
    lastSelectedRaidId:  'the_churning_core',
    lastSelectedBossId:  'ragnaros',
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
  const freshSave = createDefaultSaveData();
  saveSaveData(freshSave);
  return freshSave;
}

/**
 * Record that the player defeated a boss and save.
 * Returns the updated save data.
 */
export function recordBossDefeat(saveData, raidId, bossId) {
  const updatedSave = sanitizeSaveData(saveData);
  const defeatedInRaid = updatedSave.defeatedBossIds[raidId] || [];

  if (!defeatedInRaid.includes(bossId)) {
    updatedSave.defeatedBossIds[raidId] = [...defeatedInRaid, bossId];
  }

  saveSaveData(updatedSave);
  return updatedSave;
}

/**
 * Returns true if the given boss is unlocked for the player.
 * A boss is unlocked if all bosses in its "unlockedBy" list have been defeated.
 */
export function isBossUnlocked(saveData, raidId, bossId) {
  const raid = RAID_CATALOG[raidId];
  if (!raid) return false;

  const boss = raid.bosses.find(b => b.id === bossId);
  if (!boss) return false;

  // No prerequisites = always unlocked
  if (!boss.unlockedBy || boss.unlockedBy.length === 0) {
    return true;
  }

  // All prerequisites must be defeated (anywhere in this raid's defeated list)
  const defeatedInRaid = saveData.defeatedBossIds?.[raidId] || [];
  return boss.unlockedBy.every(requiredBossId => defeatedInRaid.includes(requiredBossId));
}

// ============================================================
// Sanitize / migrate
// Ensures saved data from older versions stays valid.
// ============================================================

export function sanitizeSaveData(saveData) {
  const defaults = createDefaultSaveData();

  const sanitized = {
    ...defaults,
    ...(saveData || {}),
  };

  // Ensure raid id list is an array and includes all default raids
  if (!Array.isArray(sanitized.unlockedRaidIds)) {
    sanitized.unlockedRaidIds = [...DEFAULT_UNLOCKED_RAID_IDS];
  }
  DEFAULT_UNLOCKED_RAID_IDS.forEach(raidId => {
    if (!sanitized.unlockedRaidIds.includes(raidId)) {
      sanitized.unlockedRaidIds.push(raidId);
    }
  });

  // Ensure defeatedBossIds exists and has an entry for every raid
  if (!sanitized.defeatedBossIds || typeof sanitized.defeatedBossIds !== 'object') {
    sanitized.defeatedBossIds = { ...defaults.defeatedBossIds };
  }
  Object.keys(defaults.defeatedBossIds).forEach(raidId => {
    if (!Array.isArray(sanitized.defeatedBossIds[raidId])) {
      sanitized.defeatedBossIds[raidId] = [];
    }
  });

  // Ensure wipe tokens is a valid number
  if (typeof sanitized.raidWipeTokensLeft !== 'number' || sanitized.raidWipeTokensLeft < 0) {
    sanitized.raidWipeTokensLeft = STARTING_WIPE_TOKENS;
  }

  // Ensure last selected IDs are strings
  if (typeof sanitized.lastSelectedRaidId !== 'string') {
    sanitized.lastSelectedRaidId = defaults.lastSelectedRaidId;
  }
  if (typeof sanitized.lastSelectedBossId !== 'string') {
    sanitized.lastSelectedBossId = defaults.lastSelectedBossId;
  }

  return sanitized;
}
