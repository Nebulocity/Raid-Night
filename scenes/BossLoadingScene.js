/**
 * BossLoadingScene.js
 *
 * Loads the selected boss level JSON and its boss-specific assets,
 * then hands off to the existing gameplay scenes.
 */
import { RAID_CATALOG } from '../data/raidCatalog.js';

export default class BossLoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BossLoadingScene' });
  }

  init() {
    this.selectedRaidId = this.registry.get('selectedRaidId') || 'molten_core';
    this.selectedBossId = this.registry.get('selectedBossId') || 'ragnaros';
    const raid = RAID_CATALOG[this.selectedRaidId] || RAID_CATALOG.molten_core;
    this.selectedBoss = raid.bosses.find(boss => boss.id === this.selectedBossId) || raid.bosses[0];
    this.loadedLevelData = null;
    this.hasPlayableEncounter = Boolean(this.selectedBoss?.levelKey && this.selectedBoss?.levelPath);
  }

  preload() {
    const levelKey = this.selectedBoss?.levelKey;
    const levelPath = this.selectedBoss?.levelPath;

    if (levelKey && levelPath) {
      this.load.on('filecomplete-json-' + levelKey, (key, type, levelData) => {
        this.loadedLevelData = levelData;
        this._loadLevelAssets(levelData);
      });

      this.load.json(levelKey, levelPath);
    }
  }

  create() {
    const { WIDTH, HEIGHT, TICK_MS } = window.GAME_CONFIG;
    const levelKey = this.selectedBoss?.levelKey;
    const cachedLevelData = this.loadedLevelData || (levelKey ? this.cache.json.get(levelKey) : null);

    this.add.image(WIDTH / 2, HEIGHT / 2, this.selectedBoss?.loadingKey || 'loading_ragnaros')
      .setDisplaySize(WIDTH, HEIGHT)
      .setOrigin(0.5);

    this.add.rectangle(WIDTH / 2, HEIGHT * 0.88, 820, 180, 0x000000, 0.55)
      .setStrokeStyle(3, 0xd7a44a, 1)
      .setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.845, this.hasPlayableEncounter ? 'Preparing encounter...' : 'Encounter coming soon', {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#fff1c7',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
    }).setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.895, this.selectedBoss?.name || 'Ragnaros', {
      fontFamily: 'monospace',
      fontSize: '30px',
      color: '#ffd37a',
      stroke: '#000000',
      strokeThickness: 5,
      align: 'center',
    }).setOrigin(0.5);

    if (!this.hasPlayableEncounter) {
      this.add.text(WIDTH / 2, HEIGHT * 0.94, 'Art is wired in. Gameplay data for this boss is not built yet.', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#f3e6c2',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: 740 },
      }).setOrigin(0.5);

      this.time.delayedCall(TICK_MS * 2, () => {
        this.cameras.main.fadeOut(350, 0, 0, 0);
        this.time.delayedCall(400, () => {
          this.scene.start('RaidBossSelectScene');
        });
      });
      return;
    }

    if (!cachedLevelData) {
      console.warn('[BossLoadingScene] Missing level data for selected boss. Falling back to level01.');
    }

    this.registry.set('levelData', cachedLevelData || this.cache.json.get('level01'));

    this.time.delayedCall(TICK_MS * 2, () => {
      if (this.scene.isActive('UIScene')) {
        this.scene.stop('UIScene');
      }

      this.scene.start('GameScene');
      this.scene.launch('UIScene');
    });
  }

  _loadLevelAssets(levelData) {
    const assets = levelData?.assets;
    if (!assets) {
      console.warn('[BossLoadingScene] No assets block found in level data.');
      return;
    }

    if (assets.background && !this.textures.exists(assets.background.key)) {
      this.load.image(assets.background.key, assets.background.path);
    }

    if (Array.isArray(assets.spritesheets)) {
      assets.spritesheets.forEach((sheet) => {
        if (!sheet.key || !sheet.path || !sheet.frameWidth || !sheet.frameHeight) {
          console.warn('[BossLoadingScene] Skipping malformed spritesheet entry:', sheet);
          return;
        }

        if (this.textures.exists(sheet.key)) {
          return;
        }

        this.load.spritesheet(sheet.key, sheet.path, {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
        });
      });
    }

    this._collectAndLoadSounds(levelData);
  }

  _collectAndLoadSounds(levelData) {
    const seen = new Set();

    const loadIfNew = (path) => {
      if (!path || seen.has(path)) return;
      seen.add(path);
      const key = path.replace(/^.*[/]/, '').replace(/[.][^.]+$/, '');
      if (this.cache.audio.exists(key)) return;
      this.load.audio(key, path);
    };

    const boss = levelData?.boss;
    if (boss) {
      loadIfNew(boss.openingSound);
      loadIfNew(boss.attackSound);
      loadIfNew(boss.deathSound);
    }

    const abilities = levelData?.abilities;
    if (abilities) {
      Object.values(abilities).forEach((ability) => {
        loadIfNew(ability.sound);
      });
    }
  }
}
