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
    this.selectedRaidId = this.registry.get('selectedRaidId') || 'the_churning_core';
    this.selectedBossId = this.registry.get('selectedBossId') || 'ragnaros';
    const raid = RAID_CATALOG[this.selectedRaidId] || RAID_CATALOG.the_churning_core;
    this.selectedBoss = raid.bosses.find(boss => boss.id === this.selectedBossId) || raid.bosses[0];
    this.loadedLevelData = null;
  }

  preload() {
    const levelKey = this.selectedBoss?.levelKey;
    const levelPath = this.selectedBoss?.levelPath;

    if (levelKey && levelPath) {
      this.load.on('filecomplete-json-' + levelKey, (key, type, levelData) => {
        this.loadedLevelData = this._applyBossAssetConventions(levelData);
        this._loadLevelAssets(this.loadedLevelData);
      });

      this.load.json(levelKey, levelPath);
    }
  }

  create() {
    const { WIDTH, HEIGHT, TICK_MS } = window.GAME_CONFIG;
    const raid = RAID_CATALOG[this.selectedRaidId] || RAID_CATALOG.the_churning_core;
    const levelKey = this.selectedBoss?.levelKey;
    const cachedLevelData = this.loadedLevelData || this._applyBossAssetConventions(this.cache.json.get(levelKey));

    this.add.image(WIDTH / 2, HEIGHT / 2, raid.backgroundKey || 'bg_the_churning_core')
      .setDisplaySize(WIDTH, HEIGHT)
      .setOrigin(0.5);

    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.28).setOrigin(0.5);

    this.add.image(WIDTH / 2, HEIGHT * 0.42, this.selectedBoss?.loadingKey || this.selectedBoss?.buttonKey || 'loading_ragnaros')
      .setDisplaySize(Math.min(WIDTH * 0.42, 820), Math.min(HEIGHT * 0.42, 820))
      .setOrigin(0.5);

    this.add.rectangle(WIDTH / 2, HEIGHT * 0.88, 780, 160, 0x000000, 0.55)
      .setStrokeStyle(3, 0xd7a44a, 1)
      .setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.86, 'Preparing encounter...', {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#fff1c7',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.91, this.selectedBoss?.name || 'Ragnaros', {
      fontFamily: 'monospace',
      fontSize: '30px',
      color: '#ffd37a',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    if (!cachedLevelData) {
      console.warn('[BossLoadingScene] Missing level data for selected boss. Falling back to level01.');
    }

    this.registry.set('levelData', cachedLevelData || this.cache.json.get('level01'));

    this.time.delayedCall(100, () => {
      if (this.scene.isActive('UIScene')) {
        this.scene.stop('UIScene');
      }

      this.scene.start('GameScene');
      this.scene.launch('UIScene');
    });
  }



  _applyBossAssetConventions(levelData) {
    if (!levelData || !this.selectedBoss) {
      return levelData;
    }

    const next = structuredClone(levelData);
    const boss = next.boss || {};
    const assets = next.assets || {};

    next.assets = assets;
    assets.background = {
      key: this.selectedBoss.encounterBackgroundKey,
      path: this.selectedBoss.encounterBackgroundPath,
    };

    const existingSheets = Array.isArray(assets.spritesheets) ? assets.spritesheets.slice() : [];
    const byKey = new Map(existingSheets.map((sheet) => [sheet.key, sheet]));

    [
      {
        key: this.selectedBoss.idleSheetKey,
        path: this.selectedBoss.idlePath,
        frameWidth: 256,
        frameHeight: 256,
      },
      {
        key: this.selectedBoss.attackSheetKey,
        path: this.selectedBoss.attackPath,
        frameWidth: 256,
        frameHeight: 256,
      },
      {
        key: this.selectedBoss.defeatedSheetKey,
        path: this.selectedBoss.defeatedPath,
        frameWidth: 256,
        frameHeight: 256,
      },
    ].forEach((sheet) => {
      byKey.set(sheet.key, { ...byKey.get(sheet.key), ...sheet });
    });

    assets.spritesheets = Array.from(byKey.values());

    next.level = {
      ...(next.level || {}),
      background: this.selectedBoss.encounterBackgroundKey,
    };

    next.boss = {
      ...boss,
      spriteKey: this.selectedBoss.idleSheetKey,
      animations: {
        ...(boss.animations || {}),
        idle: {
          key: this.selectedBoss.idleSheetKey,
          startFrame: 0,
          endFrame: 5,
          frameRate: 6,
          repeat: -1,
          yoyo: false,
          ...(boss.animations?.idle || {}),
        },
        attack: {
          key: this.selectedBoss.attackSheetKey,
          startFrame: 0,
          endFrame: 5,
          frameRate: 8,
          repeat: 0,
          yoyo: false,
          ...(boss.animations?.attack || {}),
        },
        wrath: {
          key: this.selectedBoss.attackSheetKey,
          startFrame: 0,
          endFrame: 5,
          frameRate: 8,
          repeat: 0,
          yoyo: false,
          ...(boss.animations?.wrath || {}),
        },
        death: {
          key: this.selectedBoss.defeatedSheetKey,
          startFrame: 0,
          endFrame: 5,
          frameRate: 8,
          repeat: 0,
          yoyo: false,
          ...(boss.animations?.death || {}),
        },
      },
    };

    return next;
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
