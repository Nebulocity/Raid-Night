/**
 * PreloadScene.js
 *
 * Loads shared game assets and menu assets used before entering a fight.
 * Boss-specific gameplay JSON and art are loaded later by BossLoadingScene.
 */
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  // =======
  // preload
  // =======
  preload() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    this._buildLoadingBar(WIDTH, HEIGHT);

    this.load.on('progress', (value) => {
      this._updateBar(value);
      this._updateOverlay(20 + Math.floor(value * 75), 'Loading assets...');
    });

    this.load.on('fileprogress', (file) => {
      if (this._statusText) {
        this._statusText.setText('Loading: ' + file.key);
      }
    });

    this.load.on('complete', () => {
      this._updateOverlay(100, 'Ready!');
    });

    // Fallback boss level data kept available in cache for safety.
    this.load.json('level01', 'data/level01.json');

    this._loadSharedAssets();
    this._loadMenuArt();
  }

  // ======
  // create
  // ======
  create() {
    this._buildFallbackMenuTextures();

    this.time.delayedCall(400, () => {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.classList.add('hidden');

      this.time.delayedCall(600, () => {
        if (overlay) overlay.remove();
      });

      this.scene.start('TitleScene');
    });
  }

  // ===============
  // private helpers
  // ===============

  _loadMenuArt() {
    this.load.image('bg_karazhan', 'assets/bg_karazhan.png');
    this.load.image('bg_kharazan', 'assets/bg_kharazan.png');
    this.load.image('button_karazhan', 'assets/button_karazhan.png');
    this.load.image('button_kharazan', 'assets/button_kharazan.png');

    [
      'attumen',
      'moroes',
      'maiden_of_virtue',
      'opera_event',
      'the_curator',
      'terestian_illhoof',
      'shade_of_aran',
      'netherspite',
      'chess_event',
      'prince_malchezaar',
      'nightbane',
      'servants_quarters',
    ].forEach((bossId) => {
      this.load.image('button_' + bossId, 'assets/button_' + bossId + '.png');
      this.load.image('loading_' + bossId, 'assets/loading_' + bossId + '.png');
    });
  }

  _loadSharedAssets() {
    // ====================
    // Shaman (player)
    // ====================
    this.load.spritesheet('shaman_idle',
      'sprites/shaman_idle.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('shaman_attack',
      'sprites/shaman_attack.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('shaman_casting',
      'sprites/shaman_casting.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('shaman_hit',
      'sprites/shaman_hit.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('shaman_totem',
      'sprites/shaman_totem.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    // Temporary safe fallbacks until dedicated lightning sheets are added.
    this.load.spritesheet('shaman_lightning',
      'sprites/shaman_casting.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('shaman_chain',
      'sprites/shaman_casting.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    // ====================
    // Tank (Yalb)
    // ====================
    this.load.spritesheet('tank_idle',
      'sprites/tank_idle.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('tank_attack',
      'sprites/tank_attack.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('tank_hit',
      'sprites/tank_hit.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    // ====================
    // Healer (Beefwalker)
    // ====================
    this.load.spritesheet('druid_idle',
      'sprites/druid_idle.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('druid_casting',
      'sprites/druid_casting.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    this.load.spritesheet('druid_hit',
      'sprites/druid_hit.png',
      { frameWidth: 256, frameHeight: 256 }
    );

    // ====================
    // Totems
    // ====================
    this.load.spritesheet('totem_earth',
      'sprites/totem_earth.png',
      { frameWidth: 128, frameHeight: 128 }
    );

    // ====================
    // Defeat animations
    // ====================
    this.load.spritesheet('shaman_defeated', 'sprites/shaman_defeated.png', { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('druid_defeated',  'sprites/druid_defeated.png',  { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('tank_defeated',   'sprites/tank_defeated.png',   { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('ragnaros_defeated', 'sprites/ragnaros_defeated.png', { frameWidth: 256, frameHeight: 256 });

    // ====================
    // Ability icons (64x64)
    // ====================
    [
      'innervate', 'regrowth', 'rejuvenation', 'lifebloom', 'swiftmend', 'rebirth',
    ].forEach(id => this.load.image('icon_' + id, 'sprites/icons/icon_' + id + '.jpg'));

    [
      'judgement_of_righteousness', 'consecration', 'holy_shield', 'judgement_of_wisdom',
    ].forEach(id => this.load.image('icon_' + id, 'sprites/icons/icon_' + id + '.jpg'));

    [
      'lightning_bolt', 'chain_lightning',
      'strength_of_earth_totem', 'windfury_totem', 'grounding_totem',
      'totem_of_wrath', 'wrath_of_air_totem',
    ].forEach(id => this.load.image('icon_' + id, 'sprites/icons/icon_' + id + '.jpg'));

    [
      'wrath_of_ragnaros', 'magma_blast', 'submerge',
    ].forEach(id => this.load.image('icon_' + id, 'sprites/icons/icon_' + id + '.jpg'));

    this.load.image('icon_autoAttack', 'sprites/icons/icon_autoAttack.jpg');
  }

  _buildFallbackMenuTextures() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    this._buildFallbackScreenTexture('screen_title', WIDTH, HEIGHT, 0x140b07, 0x3b1708, 'TITLE');
    this._buildFallbackScreenTexture('screen_raid_select', WIDTH, HEIGHT, 0x120d0b, 0x22160d, 'RAID');
    this._buildFallbackScreenTexture('bg_molten_core', WIDTH, HEIGHT, 0x180804, 0x5a1b09, 'MC');
    this._buildFallbackScreenTexture('bg_karazhan', WIDTH, HEIGHT, 0x100c18, 0x28153a, 'KZ');
    this._buildFallbackScreenTexture('bg_gruul', WIDTH, HEIGHT, 0x1a120a, 0x4d3115, 'GL');
    this._buildFallbackScreenTexture('bg_magtheridon', WIDTH, HEIGHT, 0x12070b, 0x4c0f1f, 'ML');
    this._buildFallbackScreenTexture('loading_ragnaros', WIDTH, HEIGHT, 0x180804, 0x7a2208, 'RAG');

    this._buildFallbackButtonTexture('button_molten_core', 256, 256, 0x7a250d, 'MC');
    this._buildFallbackButtonTexture('button_karazhan', 256, 256, 0x4b2d78, 'KZ');
    this._buildFallbackButtonTexture('button_gruul', 256, 256, 0x6d4a18, 'GL');
    this._buildFallbackButtonTexture('button_magtheridon', 256, 256, 0x7a1f38, 'ML');
    this._buildFallbackButtonTexture('button_ragnaros', 256, 256, 0xaf3b10, 'R');
  }

  _buildFallbackScreenTexture(key, width, height, topColor, bottomColor, stampText) {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    for (let i = 0; i < 20; i += 1) {
      const t = i / 19;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(topColor),
        Phaser.Display.Color.IntegerToColor(bottomColor),
        19,
        i,
      );
      graphics.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      graphics.fillRect(0, Math.floor(height * t), width, Math.ceil(height / 20) + 2);
    }

    graphics.fillStyle(0xffa53a, 0.08);
    for (let i = 0; i < 18; i += 1) {
      const radius = 20 + (i % 4) * 18;
      graphics.fillCircle(80 + i * 56, 220 + (i % 5) * 70, radius);
      graphics.fillCircle(width - (120 + i * 48), 1500 + (i % 4) * 90, radius + 10);
    }

    graphics.fillStyle(0xffffff, 0.05);
    graphics.fillRoundedRect(width / 2 - 220, height / 2 - 120, 440, 240, 36);
    graphics.lineStyle(6, 0xffd37a, 0.22);
    graphics.strokeRect(16, 16, width - 32, height - 32);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  _buildFallbackButtonTexture(key, width, height, fillColor, label) {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0x120d0b, 1);
    graphics.fillRoundedRect(0, 0, width, height, 28);
    graphics.fillStyle(fillColor, 0.95);
    graphics.fillRoundedRect(14, 14, width - 28, height - 28, 24);
    graphics.lineStyle(6, 0xffd37a, 0.85);
    graphics.strokeRoundedRect(14, 14, width - 28, height - 28, 24);
    graphics.fillStyle(0xffffff, 0.18);
    graphics.fillCircle(width / 2, height / 2 - 16, 54);
    graphics.fillStyle(0x000000, 0.15);
    graphics.fillRoundedRect(42, height - 76, width - 84, 34, 12);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  _buildLoadingBar(W, H) {
    const cx = W / 2;
    const cy = H / 2;

    this.add.rectangle(cx, cy, W, H, 0x0a0a0a);

    this.add.text(cx, cy - 180, 'STORMCALLER', {
      fontFamily: 'monospace',
      fontSize: '52px',
      color: '#c8a96e',
      align: 'center',
      letterSpacing: 12,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 100, 'TBC Classic - Shaman Edition', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#666666',
      align: 'center',
    }).setOrigin(0.5);

    const barW = 500;
    const barH = 16;
    const barX = cx - barW / 2;
    const barY = cy - 20;

    this.add.rectangle(cx, barY + barH / 2, barW + 8, barH + 8, 0x222222)
      .setOrigin(0.5);

    this._barFill = this.add.rectangle(barX, barY, 0, barH, 0xc8a96e)
      .setOrigin(0, 0);

    this._barShimmer = this.add.rectangle(barX, barY, 0, 3, 0xffd700)
      .setOrigin(0, 0)
      .setAlpha(0.6);

    this._statusText = this.add.text(cx, barY + 44, 'Loading...', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#555555',
      align: 'center',
    }).setOrigin(0.5);
  }

  _updateBar(value) {
    const barW = 500;
    if (this._barFill) {
      this._barFill.width = barW * value;
      this._barShimmer.width = barW * value;
    }
  }

  _updateOverlay(pct, msg) {
    const bar = document.getElementById('loading-bar-inner');
    const status = document.getElementById('loading-status');
    if (bar) bar.style.width = pct + '%';
    if (status) status.textContent = msg;
  }
}
