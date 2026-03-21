/**
 * BossLoadingScene.js
 *
 * Loads the selected boss level JSON and its boss-specific assets,
 * then starts GameScene and UIScene for the encounter.
 */
const Phaser = window.Phaser;

import { RAID_CATALOG } from '../data/raidCatalog.js';

export default class BossLoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BossLoadingScene' });
  }

  // init - resolve which boss we're loading
  init() {
    const selectedRaidId = this.registry.get('selectedRaidId') || 'spookspire_keep';
    const selectedBossId = this.registry.get('selectedBossId') || 'sir_trotsalot_and_nighttime';

    const raid = RAID_CATALOG[selectedRaidId] || RAID_CATALOG.spookspire_keep;
    this.raidMeta        = raid;
    this.bossMeta        = raid.bosses.find(b => b.id === selectedBossId) || raid.bosses[0];
    this.loadedLevelData = null;
  }

  // preload - load level JSON, then queue boss-specific assets
  preload() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;
    const cx = WIDTH / 2;

    // Dark background
    this.add.rectangle(cx, HEIGHT / 2, WIDTH, HEIGHT, 0x0a0a0a);

    // Boss idle sprite just above center
    const idleKey  = this.bossMeta?.idleKey;
    const bossName = this.bossMeta?.name || 'Unknown Boss';
    const bossY    = HEIGHT * 0.42;

    let bossSprite = null;
    if (idleKey && this.textures.exists(idleKey)) {
      bossSprite = this.add.sprite(cx, bossY, idleKey).setOrigin(0.5).setScale(2);

      const animKey = 'bossloading_idle_' + idleKey;
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key:       animKey,
          frames:    this.anims.generateFrameNumbers(idleKey, { start: 0, end: 11 }),
          frameRate: 6,
          repeat:    -1,
        });
      }
      bossSprite.play(animKey);
    }

    // Boss name above the sprite
    const nameY = bossSprite ? bossY - (bossSprite.height / 2) - 100 : HEIGHT * 0.20;

    this.add.text(cx, nameY, bossName, {
      fontFamily: 'monospace',
      fontSize:   '64px',
      color:      '#fff1c7',
      stroke:     '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    // Loading bar (mirroring PreloadScene style)
    const barW  = 500;
    const barH  = 16;
    const barY  = HEIGHT * 0.75;
    const barX  = cx - barW / 2;
    console.log('cx: ', cx, 'barW: ',barW, 'barX: ', barX);

    this.add.text(cx, barY - 44, 'Preparing encounter...', {
      fontFamily: 'monospace', fontSize: '28px',
      color: '#c8a96e', align: 'center',
    }).setOrigin(0.5);

    this.add.rectangle(cx, barY + barH / 2, barW + 8, barH + 8, 0x222222).setOrigin(0.5);

    this._barFill    = this.add.rectangle(barX, barY, 0, barH, 0xc8a96e).setOrigin(0, 0);
    this._barShimmer = this.add.rectangle(barX, barY, 0, 3,  0xffd700).setOrigin(0, 0).setAlpha(0.6);

    this._statusText = this.add.text(cx, barY + 44, 'Loading...', {
      fontFamily: 'monospace', fontSize: '22px', color: '#555555', align: 'center',
    }).setOrigin(0.5);

    // - Wire up loader events -------------------------------
    this.load.on('progress', (value) => {
      if (this._barFill) {
        this._barFill.width    = barW * value;
        this._barShimmer.width = barW * value;
      }
    });

    this.load.on('fileprogress', (file) => {
      if (this._statusText) this._statusText.setText('Loading: ' + file.key);
    });

    this.load.on('complete', () => {
      if (this._barFill)    this._barFill.width    = barW;
      if (this._barShimmer) this._barShimmer.width = barW;
      if (this._statusText) this._statusText.setText('Ready!');
    });

    // - Queue the level JSON -------------------------------─
    const { levelKey, levelPath } = this.bossMeta;
    if (!levelKey || !levelPath) return;

    this.load.on('filecomplete-json-' + levelKey, (key, type, levelData) => {
      this.loadedLevelData = this._injectBossAssets(levelData);
      this._loadLevelAssets(this.loadedLevelData);
    });

    this.load.json(levelKey, levelPath);

    // Load default party data (later: coalesce with save data in create)
    if (!this.cache.json.exists('party')) {
      this.load.json('party', 'data/party/party.json');
    }
  }

  // ============================================================
  // create - assets ready; fade in then launch after 2000ms
  // ============================================================
  create() {
    const levelData = this.loadedLevelData
      || this._injectBossAssets(this.cache.json.get(this.bossMeta?.levelKey));

    if (!levelData) {
      console.warn('[BossLoadingScene] No level data found for boss:', this.bossMeta?.id);
    }

    // TODO: coalesce with save data once save system exists
    const partyData = this.cache.json.get('party');
    if (levelData && partyData) levelData.characters = partyData;

    this.registry.set('levelData', levelData || this.cache.json.get('level01'));

    this.time.delayedCall(2000, () => {
      this.cameras.main.fadeOut(2000, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        if (this.scene.isActive('UIScene')) this.scene.stop('UIScene');
        this.scene.start('GameScene');
        this.scene.launch('UIScene');
      });
    });
  }

  // ============================================================
  // _injectBossAssets
  // ============================================================
  _injectBossAssets(levelData) {
    if (!levelData || !this.bossMeta) return levelData;

    const result = structuredClone(levelData);
    const boss   = result.boss || {};
    const assets = result.assets || {};

    assets.background = {
      key:  this.bossMeta.encounterBackgroundKey,
      path: this.bossMeta.encounterBackgroundPath,
    };

    result.assets = assets;

    result.boss = {
      ...boss,
      spriteKey: this.bossMeta.idleKey,
      animations: {
        ...boss.animations,
        idle: {
          ...(boss.animations?.idle || {}),
          key:        this.bossMeta.idleKey,
          startFrame: 0,
          endFrame:   10,
          frameRate:  6,
          repeat:     -1,
        },
        attacking: {
          ...(boss.animations?.attacking || {}),
          key:        this.bossMeta.attackingKey,
          startFrame: 0,
          endFrame:   11,
          frameRate:  12,
          repeat:     0,
        },
        defeated: {
          ...(boss.animations?.defeated || {}),
          key:        this.bossMeta.defeatedKey,
          startFrame: 0,
          endFrame:   11,
          frameRate:  10,
          repeat:     0,
        },
      },
    };

    return result;
  }

  // ============================================================
  // _loadLevelAssets
  // ============================================================
  _loadLevelAssets(levelData) {
    if (!levelData?.assets) return;

    const { background } = levelData.assets;

    if (background?.key && background?.path && !this.textures.exists(background.key)) {
      this.load.image(background.key, background.path);
    }

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

    const boss = levelData?.boss;
    if (boss) {
      queueIfNew(boss.openingSound);
      queueIfNew(boss.attackSound);
      queueIfNew(boss.deathSound);
      Object.values(boss.sounds || {}).forEach(queueIfNew);
    }

    Object.values(levelData?.abilities || {}).forEach(ability => {
      queueIfNew(ability.sound);
    });
  }
}
