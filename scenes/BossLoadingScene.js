/**
 * BossLoadingScene.js
 *
 * Loads the selected boss level JSON and its boss-specific assets,
 * then starts GameScene and UIScene for the encounter.
 *
 * It also injects the correct asset paths into the level data using
 * the boss metadata from raidCatalog (so every boss JSON stays
 * generic and the catalog is the single source of asset paths).
 */
const Phaser = window.Phaser; // Phaser is loaded via <script> in index.html

import { RAID_CATALOG } from '../data/raidCatalog.js';

export default class BossLoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BossLoadingScene' });
  }

  // ============================================================
  // init - resolve which boss we're loading
  // ============================================================
  init() {
    const selectedRaidId = this.registry.get('selectedRaidId') || 'spookspire_keep';
    const selectedBossId = this.registry.get('selectedBossId') || 'sir_trotsalot_and_nighttime';

    const raid = RAID_CATALOG[selectedRaidId] || RAID_CATALOG.spookspire_keep;
    this.raidMeta       = raid;
    this.bossMeta       = raid.bosses.find(b => b.id === selectedBossId) || raid.bosses[0];
    this.loadedLevelData = null;
  }

  // ============================================================
  // preload - load level JSON, then queue boss-specific assets
  // ============================================================
  preload() {
    const { levelKey, levelPath } = this.bossMeta;
    if (!levelKey || !levelPath) return;

    // Once the JSON is in cache, inject asset paths and queue the sprites/audio
    this.load.on('filecomplete-json-' + levelKey, (key, type, levelData) => {
      this.loadedLevelData = this._injectBossAssets(levelData);
      this._loadLevelAssets(this.loadedLevelData);
    });

    this.load.json(levelKey, levelPath);
  }

  // ============================================================
  // create - show loading splash, then launch gameplay
  // ============================================================
  create() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    const levelData = this.loadedLevelData
      || this._injectBossAssets(this.cache.json.get(this.bossMeta?.levelKey));

    // Raid background with dark overlay
    this.add.image(WIDTH / 2, HEIGHT / 2, this.raidMeta.backgroundKey || 'bg_spookspire_keep')
      .setDisplaySize(WIDTH, HEIGHT)
      .setOrigin(0.5);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.30)
      .setOrigin(0.5);

    // Boss splash image
    // const splashKey = this.bossMeta?.splashKey || this.bossMeta?.buttonKey || 'splash_sir_trotsalot';
    // this.add.image(WIDTH / 2, HEIGHT * 0.40, splashKey)
    //   .setDisplaySize(Math.min(WIDTH * 0.55, 600), Math.min(HEIGHT * 0.45, 600))
    //   .setOrigin(0.5);

    // Loading panel
    this.add.rectangle(WIDTH / 2, HEIGHT * 0.87, 820, 160, 0x000000, 0.58)
      .setStrokeStyle(3, 0xd7a44a, 1)
      .setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.84, 'Preparing encounter...', {
      fontFamily: 'monospace', fontSize: '40px',
      color: '#fff1c7', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.90, this.bossMeta?.name || 'Unknown Boss', {
      fontFamily: 'monospace', fontSize: '30px',
      color: '#ffd37a', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    if (!levelData) {
      console.warn('[BossLoadingScene] No level data found for boss:', this.bossMeta?.id);
    }

    this.registry.set('levelData', levelData || this.cache.json.get('level01'));

    // Stop any running UIScene before relaunching for this encounter
    this.time.delayedCall(1500, () => {
      if (this.scene.isActive('UIScene')) {
        this.scene.stop('UIScene');
      }
      this.scene.start('GameScene');
      this.scene.launch('UIScene');
    });
  }

  // ============================================================
  // _injectBossAssets
  //
  // Merges the boss catalog metadata (asset paths, animation keys)
  // into the level JSON so GameScene always receives complete data.
  // The JSON files stay generic; the catalog is the single source
  // of asset paths.
  // ============================================================
  _injectBossAssets(levelData) {
    if (!levelData || !this.bossMeta) return levelData;

    const result = structuredClone(levelData);
    const boss   = result.boss || {};
    const assets = result.assets || {};

    // Background
    assets.background = {
      key:  this.bossMeta.encounterBackgroundKey,
      path: this.bossMeta.encounterBackgroundPath,
    };

    // Spritesheets are loaded upfront by PreloadScene - no injection needed here.
    result.assets = assets;

    // Inject catalog animation keys into boss data
    result.boss = {
      ...boss,
      spriteKey: this.bossMeta.idleKey,
      animations: {
        ...boss.animations,
        idle: {
          ...(boss.animations?.idle || {}),
          key:        this.bossMeta.idleKey,
          startFrame: 0,
          endFrame:   11,
          frameRate:  6,
          repeat:     -1,
        },
        attack: {
          ...(boss.animations?.attack || {}),
          key:        this.bossMeta.attackingKey,
          startFrame: 0,
          endFrame:   15,
          frameRate:  12,
          repeat:     0,
        },
        defeated: {
          ...(boss.animations?.defeated || {}),
          key:        this.bossMeta.defeatedKey,
          startFrame: 0,
          endFrame:   15,
          frameRate:  10,
          repeat:     0,
        },
      },
    };

    return result;
  }

  // ============================================================
  // _loadLevelAssets - queue everything the level JSON references
  // ============================================================
  _loadLevelAssets(levelData) {
    if (!levelData?.assets) return;

    const { background, spritesheets } = levelData.assets;

    if (background?.key && background?.path && !this.textures.exists(background.key)) {
      this.load.image(background.key, background.path);
    }

    // Boss spritesheets are already loaded by PreloadScene.
    this._loadSounds(levelData);
  }

  _loadSounds(levelData) {
    const seen = new Set();

    const queueIfNew = (path) => {
      if (!path || seen.has(path)) return;
      seen.add(path);
      const key = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
      if (this.cache.audio.exists(key)) return;
      this.load.audio(key, path);
    };

    // Boss-level sounds (legacy fields)
    const boss = levelData?.boss;
    if (boss) {
      queueIfNew(boss.openingSound);
      queueIfNew(boss.attackSound);
      queueIfNew(boss.deathSound);
      // New format sounds block
      Object.values(boss.sounds || {}).forEach(queueIfNew);
    }

    // Ability sounds
    Object.values(levelData?.abilities || {}).forEach(ability => {
      queueIfNew(ability.sound);
    });
  }
}
