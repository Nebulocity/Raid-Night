/**
 * GameScene.js
 *
 * The main game scene.
 *
 * All boss sprite keys, scale, blend mode, and animation definitions
 * are read from levelData (the JSON). No boss-specific strings are
 * hardcoded here. Adding a new boss means writing a new JSON file only.
 */
import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // ====
  // init
  // ====
  init() {
    this.levelData          = this.registry.get('levelData');
    this.entitySlots        = {};
    this.tickCount          = 0;
    this.gameRunning        = false;
    // Tracks last cast timestamp per character for mana regen idle window
    this.lastCastTime = { player: 0, tank: 0, healer: 0 };

    // True while Ragnaros is submerged - blocks auto-attacks and abilities
    this.bossSubmerged = false;

    // Tracks active boss DoT timers per character so they can be cancelled
    // on death or Rebirth: { player: [timer,...], tank: [...], healer: [...] }
    this.activeDots = { player: [], tank: [], healer: [] };
    this.bossDamageMultiplier = 1;

    // Prevents boss abilities from overlapping while dialogue/audio is playing.
    // Set to true at the start of any boss dialogue sequence.
    // Set back to false when the last line finishes.
    // Start as true so no abilities fire before the intro dialogue plays.
    // The dialogue sequence will set this back to false when it completes.
    this.bossDialoguePlaying = true;

    // Timestamp (ms) until which no new boss ability can fire.
    // Set to Date.now() + POST_ABILITY_LOCKOUT_MS after any ability fires.
    // This prevents abilities from stacking on top of each other even
    // when the dialogue finishes quickly.
    this.bossAbilityLockoutUntil = 0;
  }

  // ======
  // create
  // ======
  create() {
    const { WIDTH, HEIGHT, ZONES, DEBUG_ZONES, TICK_MS } = window.GAME_CONFIG;

    this._buildBackground(WIDTH, HEIGHT);
    this._createAnimations();

    if (DEBUG_ZONES) {
      this._drawDebugZones(ZONES);
    }

    this._buildBossSlot(ZONES.BOSS);
    this._buildPlayerSlot(ZONES.PLAYER);
    this._buildCharacterSlot('tank',   ZONES.TANK, 0xff88cc, 'Tank', 'tank_idle', 'tank_idle');
    this._buildCharacterSlot('healer', ZONES.HEALER, 0xa0ff69, 'Healer', 'druid_idle', 'druid_idle');
    this._buildTotemSlots(ZONES.TOTEMS);

    if (this.levelData) {
      this._populateFromData(this.levelData);
    }

    // Opening dialogue fires from the audio unlock overlay on first tap.
    // Ticker is started by _showBossDialogue() after the intro finishes,
    // so no abilities can fire before the player sees the opening lines.

    // Audio uses HTML5 Audio (see main.js) -- no Web Audio unlock needed.
    
    this.events.on('player-ability', this._onPlayerAbility, this);
    this.scene.get('UIScene').events.emit('game-ready', this.levelData);

    // Signal that UIScene is ready so buff bars can be built
    this.time.delayedCall(100, () => {
      this.events.emit('buff-bars-ready');
      this.events.emit('buff-bars-ready-tank');
      this.events.emit('buff-bars-ready-healer');
    });

    // Initialize threat table - tank starts with high threat so
    // boss targets it by default before any combat actions occur.
    this._initThreatTable();
    this.addThreat('tank', 5000);
    // Defer threat meter update until after slots are built
    this.time.delayedCall(100, () => this._updateThreatMeters());

    // Show a click-to-start overlay to satisfy browser autoplay policy.
    // Audio will not play until the user has interacted with the page.
    // The overlay is invisible but covers the full canvas so any click counts.
    this._buildAudioUnlockOverlay();
  }

  // ======
  // update
  // ======
  update() {
    // Per-frame updates go here. Heavy logic stays in _tick().
  }

  // =====================
  // ANIMATION DEFINITIONS
  // =====================
  // Helper used throughout _createAnimations.
  // Creates an animation only if the source texture is actually loaded.
  // This prevents the "Cannot read properties of undefined (reading 'duration')"
  // crash that occurs when generateFrameNumbers returns an empty array.
  _safeCreateAnim(config, textureKey) {
    if (!this.textures.exists(textureKey)) {
      console.warn('[GameScene] Skipping animation "' + config.key + '" -- texture not loaded:', textureKey);
      return;
    }
    this.anims.create(config);
  }

  _createAnimations() {
    const anims = this.anims;

    // =====================
    // PLAYER ANIMATIONS
    // =====================
    // Sheet: 4x3 grid, 12 frames each 256x256 - all idle
    this._safeCreateAnim({
      key:       'shaman_idle',
      frames:    anims.generateFrameNumbers('shaman_idle', { start: 0, end: 5 }),
      frameRate: 10,
      repeat:    -1,
    }, 'shaman_idle');

    this._safeCreateAnim({
      key:       'shaman_cast_lightning',
      frames:    anims.generateFrameNumbers('shaman_lightning', { start: 0, end: 2 }),
      frameRate: 10,
      repeat:    0,
    }, 'shaman_lightning');

    this._safeCreateAnim({
      key:       'shaman_cast_chain',
      frames:    anims.generateFrameNumbers('shaman_chain', { start: 0, end: 3 }),
      frameRate: 10,
      repeat:    0,
    }, 'shaman_chain');

    // Auto-attack: 1024x768, 4x3 = 11 frames (last row has 3), plays once
    this._safeCreateAnim({
      key:       'shaman_attack',
      frames:    anims.generateFrameNumbers('shaman_attack', { start: 0, end: 10 }),
      frameRate: 10,
      repeat:    0,
    }, 'shaman_attack');

    // Casting: 1024x1024, 4x4 = 16 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'shaman_casting',
      frames:    anims.generateFrameNumbers('shaman_casting', { start: 0, end: 15 }),
      frameRate: 12,
      repeat:    0,
    }, 'shaman_casting');

    // Hit: 1024x768, 4x3 = 12 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'shaman_hit',
      frames:    anims.generateFrameNumbers('shaman_hit', { start: 0, end: 11 }),
      frameRate: 12,
      repeat:    0,
    }, 'shaman_hit');

    // Totem placement: 1024x768, 4x3 = 12 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'shaman_totem',
      frames:    anims.generateFrameNumbers('shaman_totem', { start: 0, end: 11 }),
      frameRate: 12,
      repeat:    0,
    }, 'shaman_totem');

    // =====================
    // TANK ANIMATIONS
    // =====================
    // Idle: 1536x1024 sheet, 4 cols x 3 rows = 12 frames at 256x256
    this._safeCreateAnim({
      key:       'tank_idle',
      frames:    anims.generateFrameNumbers('tank_idle', { start: 0, end: 11 }),
      frameRate: 10,
      repeat:    -1,
    }, 'tank_idle');
    
    // Attack: 1024x1024, 4x4 = 16 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'tank_attack',
      frames:    anims.generateFrameNumbers('tank_attack', { start: 0, end: 15 }),
      frameRate: 12,
      repeat:    0,
    }, 'tank_attack');

    // Hit: 1024x768, 4x3 = 12 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'tank_hit',
      frames:    anims.generateFrameNumbers('tank_hit', { start: 0, end: 11 }),
      frameRate: 12,
      repeat:    0,
    }, 'tank_hit');

    // Judgement spell - uncomment when tank_judge.png is finalized
    // this._safeCreateAnim({
    //   key:       'tank_judge',
    //   frames:    anims.generateFrameNumbers('tank_judge', { start: 0, end: 15 }),
    //   frameRate: 12,
    //   repeat:    0,
    // }, 'tank_judge');

    // Consecration spell - uncomment when tank_consecrate.png is finalized
    // this._safeCreateAnim({
    //   key:       'tank_consecrate',
    //   frames:    anims.generateFrameNumbers('tank_consecrate', { start: 0, end: 15 }),
    //   frameRate: 8,
    //   repeat:    0,
    // }, 'tank_consecrate');

    // =====================
    // HEALER ANIMATIONS
    // =====================
    // Idle: 1024x768, 4x3 = 12 frames at 256x256
    this._safeCreateAnim({
      key:       'druid_idle',
      frames:    anims.generateFrameNumbers('druid_idle', { start: 0, end: 11 }),
      frameRate: 10,
      repeat:    -1,
    }, 'druid_idle');

    // Casting: 1024x768, 4x3 = 12 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'druid_casting',
      frames:    anims.generateFrameNumbers('druid_casting', { start: 0, end: 11 }),
      frameRate: 12,
      repeat:    0,
    }, 'druid_casting');

    // Hit: 1024x1024, 4x4 = 16 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'druid_hit',
      frames:    anims.generateFrameNumbers('druid_hit', { start: 0, end: 15 }),
      frameRate: 12,
      repeat:    0,
    }, 'druid_hit');

    // =====================
    // TOTEM ANIMATIONS
    // =====================
    // Totems - shared, not level-specific
    // totem_earth: 512x384, 4x3 = 12 frames at 128x128
    // Other totems uncommented as their sheets become available
    this._safeCreateAnim({
      key:       'totem_earth_pulse',
      frames:    anims.generateFrameNumbers('totem_earth', { start: 0, end: 11 }),
      frameRate: 8,
      repeat:    -1,
      yoyo:      true,
    }, 'totem_earth');
    // this._safeCreateAnim({ key: 'totem_fire_pulse',  frames: anims.generateFrameNumbers('totem_fire',  { start: 0, end: 11 }), frameRate: 8, repeat: -1, yoyo: true }, 'totem_fire');
    // this._safeCreateAnim({ key: 'totem_air_pulse',   frames: anims.generateFrameNumbers('totem_air',   { start: 0, end: 11 }), frameRate: 8, repeat: -1, yoyo: true }, 'totem_air');
    // this._safeCreateAnim({ key: 'totem_water_pulse', frames: anims.generateFrameNumbers('totem_water', { start: 0, end: 11 }), frameRate: 8, repeat: -1, yoyo: true }, 'totem_water');

    // =====================
    // DEFEAT ANIMATIONS
    // =====================
    // All defeat sheets: 4x4 = 16 frames at 256x256, plays once
    ['shaman_defeated', 'druid_defeated', 'tank_defeated', 'ragnaros_defeated'].forEach(key => {
      this._safeCreateAnim({
        key:       key,
        frames:    anims.generateFrameNumbers(key, { start: 0, end: 15 }),
        frameRate: 10,
        repeat:    0,
      }, key);
    });

    // =====================
    // BOSS ANIMATIONS
    // =====================
    // These are driven entirely by levelData.boss.animations
    // Key naming: boss.id + '_' + animationName (e.g. 'ragnaros_idle')
    const bossData = this.levelData?.boss;
    if (bossData?.animations) {
      Object.entries(bossData.animations).forEach(([animName, def]) => {
        const animKey = bossData.id + '_' + animName;
        this._safeCreateAnim({
          key:       animKey,
          frames:    anims.generateFrameNumbers(def.key, {
            start: def.startFrame,
            end:   def.endFrame,
          }),
          frameRate: def.frameRate,
          repeat:    def.repeat,
          yoyo:      def.yoyo || false,
        }, def.key);
      });
    }
  }

  // ======================
  // ZONE / LAYOUT BUILDERS
  // ======================
  _buildBackground(W, H) {
    // Background key comes from levelData.assets.background.key
    const bgKey = this.levelData?.assets?.background?.key;
    if (bgKey && this.textures.exists(bgKey)) {
      this.add.image(W / 2, H / 2, bgKey)
        .setDisplaySize(W, H)
        .setDepth(-10);
    } else {
      // Fallback gradient if no background asset is defined
      const bg = this.add.graphics().setDepth(-10);
      bg.fillGradientStyle(0x0a0604, 0x0a0604, 0x2a1505, 0x1e1008, 1);
      bg.fillRect(0, 0, W, H);
    }

    // Dark overlay to keep sprites readable over bright backgrounds
    const overlay = this.add.graphics().setDepth(-9);
    overlay.fillStyle(0x000000, 0.30);
    overlay.fillRect(0, 0, W, H);
  }

  _drawDebugZones(ZONES) {
    const zoneStyles = {
      BOSS:       { color: 0xff4444, label: 'BOSS ZONE',   labelColor: '#ff6666' },
      TANK:       { color: 0xff88cc, label: 'TANK ZONE',   labelColor: '#FF88CC' },
      HEALER:     { color: 0xa0ff69, label: 'HEALER ZONE', labelColor: '#A0FF69' },
      PLAYER:     { color: 0x44ddbb, label: 'PLAYER ZONE', labelColor: '#66ffdd' },
      TOTEMS:     { color: 0x88cc44, label: 'TOTEM ZONE',  labelColor: '#aabb66' },
      POPUP:      { color: 0x888888, label: 'POPUP ZONE',  labelColor: '#aaaaaa' },
      ACTION_BAR: { color: 0x888888, label: 'ACTION BAR',  labelColor: '#aaaaaa' },
    };

    Object.entries(ZONES).forEach(([key, zone]) => {
      if (key === 'BACKGROUND') return;
      const s = zoneStyles[key] || { color: 0xffffff, label: key, labelColor: '#ffffff' };
      const g = this.add.graphics();
      g.fillStyle(s.color, 0.06);
      g.fillRect(zone.x, zone.y, zone.w, zone.h);
      g.lineStyle(3, s.color, 0.55);
      g.strokeRect(zone.x, zone.y, zone.w, zone.h);
    });
  }

  // =========
  // Boss slot
  // =========
  _buildBossSlot(zone) {
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h / 2;

    const glow = this.add.graphics();
    glow.fillStyle(0xff2200, 0.15);
    glow.fillEllipse(cx, cy + zone.h * 0.35, zone.w * 0.9, zone.h * 0.35);

    // All boss sprite config comes from the JSON
    const bossData   = this.levelData?.boss;
    const requestedSpriteKey = bossData?.spriteKey;
    const spriteKey  = (requestedSpriteKey && this.textures.exists(requestedSpriteKey))
      ? requestedSpriteKey
      : (this.textures.exists('ragnaros_idle') ? 'ragnaros_idle' : (requestedSpriteKey || 'ragnaros'));
    const spriteScale = bossData?.spriteScale || 2.2;
    const idleAnimKey = bossData ? bossData.id + '_idle' : 'ragnaros_idle';

    const panelW = 600;
    const panelH = 80;
    const panelY = zone.y + 10;

    const titlePanel = this.add.graphics();
    titlePanel.fillStyle(0x000000, 0.65);
    titlePanel.fillRect(cx - panelW / 2, panelY - 200, panelW, panelH);
    titlePanel.lineStyle(3, 0x88cc44, 1.0);
    titlePanel.strokeRect(cx - panelW / 2, panelY - 200, panelW, panelH);

    const nameText = this.add.text(cx, zone.y + zone.h - 900, '???', {
      fontFamily: 'monospace', fontSize: '56px', color: '#ff6644',
    }).setOrigin(0.5, 1);

    const bossSprite = this.add.sprite(cx, cy, spriteKey, 0)
      .setScale(spriteScale)
      .setOrigin(0.5, 0.5);

    // Only play the idle anim if it was successfully registered
    if (this.anims.exists(idleAnimKey)) {
      bossSprite.play(idleAnimKey);
    }

    bossSprite.setAlpha(0).setY(cy - 120);
    this.tweens.add({
      targets:  bossSprite,
      alpha:    1,
      y:        cy,
      duration: 1400,
      ease:     'Back.easeOut',
      delay:    500,
    });

    const hpBar = this._buildBossHealthBar(cx, zone.y + zone.h - 875, panelW, 48, 0xff3300);

    this.entitySlots.boss = { sprite: bossSprite, nameText, hpBar, glow };
  }

  // ===========
  // Player slot
  // ===========
  _buildPlayerSlot(zone) {
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h - 80;

    const sprite = this.add.sprite(cx, cy, 'shaman_idle', 0)
      .setScale(1.5)
      .setOrigin(0.5, 1);

    if (this.anims.exists('shaman_idle')) sprite.play('shaman_idle');
    sprite.setAlpha(0);
    this.tweens.add({
      targets: sprite, alpha: 1,
      duration: 800, ease: 'Sine.easeOut', delay: 400,
    });

    // Name panel + text
    const namePanelW = 430;
    const namePanelH = 60;

    const namePanel = this.add.graphics();
    namePanel.fillStyle(0x000000, 0.65);
    namePanel.fillRect(zone.x - 10, zone.y + 480, namePanelW, namePanelH);
    namePanel.lineStyle(3, 0x44DDBB, 0.8);
    namePanel.strokeRect(zone.x - 10, zone.y + 480, namePanelW, namePanelH);

    // const nameText = this.add.text(cx, zone.y + 80, "Earth Mother's Favorite", {
    //   fontFamily: 'monospace', fontSize: '32px', color: '#44ddbb',
    // }).setOrigin(0.5, 0.5).setAlpha(0.9).setVisible(true);

    const nameText = this.add.text(cx, zone.y + 492, 'Earth Mother\'s Favorite', {
      fontFamily: 'monospace', fontSize: '32px',
      color: '#44ddbb',
    }).setOrigin(0.5, 0).setAlpha(0.9);

    const hpBar      = this._buildHealthBar(cx + 5, zone.y + 565, zone.w + 31, 40, 0x44ddbb);
    const manaBar    = this._buildManaBar(cx + 5, zone.y + 605, zone.w + 31, 25, 14);
    const threatBar  = this._buildThreatBar(cx + 5, zone.y + 640, zone.w + 31, 18);

    // Threat label
    this.add.text(cx - (zone.w + 31) / 2 + 5, zone.y + 640, 'THREAT', {
      fontFamily: 'monospace', fontSize: '14px', color: '#884400',
    }).setOrigin(0, 0.5);

    this.entitySlots.player = { sprite, nameText, hpBar, manaBar, threatBar };

    // Build buff bar above the nameplate - populated once UIScene is ready
    this.events.once('buff-bars-ready', () => {
      const ui = this.scene.get('UIScene');
      if (ui?.buildBuffBar) ui.buildBuffBar('player', zone);
    });
  }

  // ================
  // Generic NPC slot
  // ================
  // spriteKey and idleAnim are optional. If provided a real sprite is used,
  // otherwise falls back to a placeholder rectangle (used for healer until
  // its sheet is ready).
  _buildCharacterSlot(id, zone, tintColor, label, spriteKey = null, idleAnim = null) {
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h - 80;

    let sprite;

    sprite = this.add.sprite(cx, cy, spriteKey, 0)
      .setScale(1.5)
      .setOrigin(0.5, 1);

    if (idleAnim && this.anims.exists(idleAnim)) {
      sprite.play(idleAnim);
    }

    // Name panel + text
    const namePanelW = 430;
    const namePanelH = 60;

    const namePanel = this.add.graphics();
    namePanel.fillStyle(0x000000, 0.65);
    namePanel.fillRect(zone.x - 10, zone.y + 480, namePanelW, namePanelH);
    namePanel.lineStyle(3, tintColor, 0.8);
    namePanel.strokeRect(zone.x - 10, zone.y + 480, namePanelW, namePanelH);

    const nameText = this.add.text(cx, zone.y + 492, label, {
      fontFamily: 'monospace', fontSize: '32px',
      color: '#' + tintColor.toString(16).padStart(6, '0'),
    }).setOrigin(0.5, 0).setAlpha(0.9);

    const hpBar     = this._buildHealthBar(cx + 5, zone.y + 565, zone.w + 31, 40, tintColor);
    const manaBar   = this._buildManaBar(cx + 5, zone.y + 605, zone.w + 31, 25, 14);
    const threatBar = this._buildThreatBar(cx + 5, zone.y + 640, zone.w + 31, 18);

    // Threat label
    this.add.text(cx - (zone.w + 31) / 2 + 5, zone.y + 640, 'THREAT', {
      fontFamily: 'monospace', fontSize: '14px', color: '#884400',
    }).setOrigin(0, 0.5);

    sprite.setAlpha(0);
    this.tweens.add({
      targets: sprite, alpha: 1, duration: 800,
      ease: 'Sine.easeOut', delay: id === 'healer' ? 200 : 0,
    });

    this.entitySlots[id] = { sprite, nameText, hpBar, manaBar, threatBar };

    // Build buff bar above the nameplate
    this.events.once('buff-bars-ready-' + id, () => {
      const ui = this.scene.get('UIScene');
      if (ui?.buildBuffBar) ui.buildBuffBar(id, zone);
    });
  }

  // ===========
  // Totem slots
  // ===========
  _buildTotemSlots(zone) {
    
    // "TOTEMS" title panel at the top of the zone
    const panelW = 430;
    const panelH = 60;
    const cx     = zone.x + zone.w / 2;
    const panelY = zone.y + 10;

    const titlePanel = this.add.graphics();
    titlePanel.fillStyle(0x000000, 0.65);
    titlePanel.fillRect(cx - panelW / 2, panelY + 470, panelW, panelH);
    titlePanel.lineStyle(3, 0xBBC985, 1.0);
    titlePanel.strokeRect(cx - panelW / 2, panelY + 470, panelW, panelH);

    this.add.text(cx - (panelW / 2) + 210, panelY + 500, 'TOTEMS', {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#BBC985',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    const elements  = ['earth', 'fire', 'water', 'air'];
    const totemKeys = ['totem_earth', 'totem_fire', 'totem_water', 'totem_air'];
    const slotW     = zone.w / 4;
    const totemScale = (slotW * 0.85) / 512;

    this.entitySlots.totems = {};

    elements.forEach((element, i) => {
      const sx = zone.x + slotW * i + slotW / 2;
      const sy = zone.y + zone.h;

      // const socket = this.add.rectangle(sx, zone.y + zone.h / 2, slotW - 14, zone.h * 0.7, 0x000000, 0.3);
      //   .setStrokeStyle(1, 0x554422, 0.6);

      const slotLabel = this.add.text(sx, zone.y + zone.h - 125, element.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
      }).setOrigin(0.5, 1).setAlpha(0.6);

      const totemSprite = this.add.sprite(sx, sy, totemKeys[i], 0)
        .setScale(totemScale)
        .setOrigin(0.5, 1)
        .setVisible(false);

      this.entitySlots.totems[element] = { /*socket,*/ slotLabel, totemSprite, key: totemKeys[i] };
    });
  }

  // ==============================
  // Public: place / remove a totem
  // ==============================
  placeTotem(element) {
    const slot = this.entitySlots.totems?.[element];
    if (!slot) return;
    slot.totemSprite.setVisible(true).setAlpha(0);
    slot.totemSprite.play(slot.key + '_pulse');
    this.tweens.add({ targets: slot.totemSprite, alpha: 1, duration: 300 });
  }

  removeTotem(element) {
    const slot = this.entitySlots.totems?.[element];
    if (!slot) return;
    this.tweens.add({
      targets: slot.totemSprite, alpha: 0, duration: 200,
      onComplete: () => slot.totemSprite.stop().setVisible(false),
    });
  }

  // ================================
  // Totem placement with animation
  // ================================
  // Plays the shaman_totem animation on the player sprite,
  // then places the totem after the animation completes.
  playTotemPlacement(element) {
    const playerSlot = this.entitySlots.player;
    if (!playerSlot?.sprite) return;

    // Do not interrupt a cast already in progress
    const current = playerSlot.sprite.anims.currentAnim;
    if (current && current.key !== 'shaman_idle' && current.key !== 'shaman_attack'
        && playerSlot.sprite.anims.isPlaying) return;

    if (this.anims.exists('shaman_totem')) {
      playerSlot.sprite.play('shaman_totem');
      playerSlot.sprite.once('animationcomplete', () => {
        if (this.anims.exists('shaman_idle')) playerSlot.sprite.play('shaman_idle');
        this.placeTotem(element);
      });
    } else {
      // Fallback if sheet not loaded - place totem immediately
      this.placeTotem(element);
    }
  }

  // ===============
  // DATA -> DISPLAY
  // ===============
  _populateFromData(data) {
    if (data.boss && this.entitySlots.boss) {
      const slot = this.entitySlots.boss;
      slot.nameText.setText(data.boss.name || '???');

      // Stamp maxValue onto bar so _setBossHealthBar can display current / max
      if (slot.hpBar) slot.hpBar.maxValue = data.boss.stats?.maxHealth ?? 0;
      slot.currentHealth = data.boss.stats?.maxHealth ?? 0;
      this._setBossHealthBar(slot.hpBar, 1.0);
      slot._data = data.boss;
    }

    ['tank', 'healer', 'player'].forEach(id => {
      const charData = data.characters?.[id];
      const slot     = this.entitySlots[id];
      if (!charData || !slot) return;
      slot.nameText.setText(charData.name || id.toUpperCase());
      // Stamp maxValue onto bars from JSON stats
      if (slot.hpBar)   slot.hpBar.maxValue   = charData.stats?.maxHealth ?? 0;
      if (slot.manaBar) slot.manaBar.maxValue  = charData.stats?.maxMana   ?? 0;
      // Track live health/mana values on the slot itself
      slot.currentHealth = charData.stats?.maxHealth ?? 0;
      slot.currentMana   = charData.stats?.maxMana   ?? 0;
      this._setHealthBar(slot.hpBar, 1.0);
      if (slot.manaBar) this._setManaBar(slot.manaBar, 1.0);
      slot._data = charData;
    });

    console.log('[GameScene] Level loaded:', data.level?.name);
  }

  // ====================
  // HEALTH AND MANA BARS
  // ====================
  _buildHealthBar(cx, cy, width, height, color) {

    const track = this.add.rectangle(cx, cy, width, height, 0x111111)
      .setStrokeStyle(1, 0x333333, 0.8);

    const fill  = this.add.rectangle(cx - width / 2, cy, width, height, color)
      .setOrigin(0, 0.5);

    const valueText = this.add.text(cx, cy, '', {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#ffffff',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    return { track, fill, maxWidth: width, color, valueText };
  }

  _buildManaBar(cx, cy, width, height) {
    const track = this.add.rectangle(cx, cy, width, height, 0x080818)
      .setStrokeStyle(1, 0x222244, 0.8);

    const fill  = this.add.rectangle(cx - width / 2, cy, width, height, 0x2244cc)
      .setOrigin(0, 0.5);

    const valueText = this.add.text(cx, cy, '', {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#ffffff',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    return { track, fill, maxWidth: width, valueText };
  }

  _buildBossHealthBar(cx, cy, width, height, color) {

    const track = this.add.rectangle(cx, cy, width + 2, height, 0x111111)
      .setStrokeStyle(1, 0x333333, 0.8);

    const fill  = this.add.rectangle(cx - width / 2, cy, width + 2, height, color)
      .setOrigin(0, 0.5);

    const valueText = this.add.text(cx, cy, '', {
      fontFamily: 'monospace',
      fontSize:   '48px',
      color:      '#ffffff',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    return { track, fill, maxWidth: width, color, valueText };
  }

  _buildBossManaBar(cx, cy, width, height) {
    const track = this.add.rectangle(cx, cy, width, height, 0x080818)
      .setStrokeStyle(1, 0x222244, 0.8);

    const fill  = this.add.rectangle(cx - width / 2, cy, width, height, 0x2244cc)
      .setOrigin(0, 0.5);

    const valueText = this.add.text(cx, cy, '', {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#ffffff',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    return { track, fill, maxWidth: width, valueText };
  }

  _setBossHealthBar(bar, pct) {
    if (!bar) return;
    const c = Phaser.Math.Clamp(pct, 0, 1);
    this.tweens.add({ targets: bar.fill, width: bar.maxWidth * c, duration: 300, ease: 'Sine.easeOut' });
    bar.fill.setFillStyle(Phaser.Display.Color.GetColor(191, 76, 51));

    if (bar.valueText && bar.maxValue) {
      const current = Math.round(c * bar.maxValue);
      bar.valueText.setText(current.toLocaleString() + ' / ' + bar.maxValue.toLocaleString());
    }
  }

  _setHealthBar(bar, pct) {
    if (!bar) return;
    const c = Phaser.Math.Clamp(pct, 0, 1);
    this.tweens.add({ targets: bar.fill, width: bar.maxWidth * c, duration: 300, ease: 'Sine.easeOut' });
    const col = c > 0.5
      ? Phaser.Display.Color.Interpolate.RGBWithRGB(255, 200, 0, 0, 200, 0, 1, c * 2 - 1)
      : Phaser.Display.Color.Interpolate.RGBWithRGB(200, 0, 0, 255, 200, 0, 1, c * 2);
    bar.fill.setFillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b));

    if (bar.valueText && bar.maxValue) {
      const current = Math.round(c * bar.maxValue);
      bar.valueText.setText(current.toLocaleString() + ' / ' + bar.maxValue.toLocaleString());
    }
  }

  _setManaBar(bar, pct) {
    if (!bar) return;
    const c = Phaser.Math.Clamp(pct, 0, 1);
    this.tweens.add({ targets: bar.fill, width: bar.maxWidth * c, duration: 300, ease: 'Sine.easeOut' });

    if (bar.valueText && bar.maxValue) {
      const current = Math.round(c * bar.maxValue);
      bar.valueText.setText(current.toLocaleString() + ' / ' + bar.maxValue.toLocaleString());
    }
  }

  // ==============
  // Threat bar
  // ==============
  _buildThreatBar(cx, cy, width, height) {
    const track = this.add.rectangle(cx, cy, width, height, 0x1a0a00)
      .setStrokeStyle(1, 0x442200, 0.8);
    const fill  = this.add.rectangle(cx - width / 2, cy, 0, height, 0xff6600)
      .setOrigin(0, 0.5);
    const valueText = this.add.text(cx, cy, '0%', {
      fontFamily: 'monospace',
      fontSize:   '18px',
      color:      '#ffaa44',
      stroke:     '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5);
    return { track, fill, maxWidth: width, valueText };
  }

  // ==============
  // CAST ANIMATION
  // ==============
  playPlayerCast(animKey) {
    const slot = this.entitySlots.player;
    if (!slot?.sprite) return;
    slot.sprite.play(animKey);
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('shaman_idle')) slot.sprite.play('shaman_idle');
    });
  }

  // ===================
  // BOSS ANIM PLAYBACK
  // ===================
  // All methods below resolve animation key names from the JSON so they
  // work with any boss without modification.

  _getBossAnimKey(animName) {
    const bossId = this.levelData?.boss?.id;
    if (!bossId) return null;
    const key = bossId + '_' + animName;
    return this.anims.exists(key) ? key : null;
  }

  playBossAttack() {
    const slot    = this.entitySlots.boss;
    const animKey = this._getBossAnimKey('attack');
    if (!slot?.sprite || !animKey) return;

    const current = slot.sprite.anims.currentAnim;
    if (current && current.key === animKey && slot.sprite.anims.isPlaying) return;

    // Determine target from threat table
    const targetId   = this.getHighestThreatTarget();
    const targetName = this.entitySlots[targetId]?._data?.name ?? targetId;
    const bossName   = this.levelData?.boss?.name ?? 'Boss';
    console.log('[Boss]', bossName, 'attacks', targetName + '!');

    this._playSound(this.levelData?.boss?.attackSound);

    const idleKey = this._getBossAnimKey('idle');
    
    slot.sprite.play(animKey);
    slot.sprite.once('animationcomplete', () => {
      if (idleKey && this.anims.exists(idleKey)) slot.sprite.play(idleKey);
    });

    // ========================
    // Miss roll
    // ========================
    const bossData2  = this.entitySlots.boss?._data;
    const missChance = bossData2?.stats?.missChance ?? 0;
    if (missChance > 0 && Phaser.Math.Between(1, 100) <= missChance) {
      console.log('[Boss] Attack MISSED', targetName + '!');
      const uiMiss = this.scene.get('UIScene');
      if (uiMiss?.spawnFloatingText) {
        uiMiss.spawnFloatingText(window.GAME_CONFIG.ZONES[targetId.toUpperCase()], 'MISS', 'miss');
      }
      return;
    }

    // Play hit animation on the targeted character
    this._playHitOnTarget(targetId);

    // Roll block for any character that has a blockChance stat
    if (this._rollBlock(targetId)) return;

    // Generate threat from the auto-attack so tanking threat matters
    const bossData    = this.entitySlots.boss?._data;
    const damageRange = bossData?.stats?.damageRange ?? [100, 200];
    const baseDamage  = Phaser.Math.Between(damageRange[0], damageRange[1]);
    const damage      = Math.round(baseDamage * (this.bossDamageMultiplier ?? 1));
    this._applyDamageToCharacter(targetId, damage, 'icon_autoAttack');

    // Tank generates passive threat just by being the target
    this.addThreat('tank', 50);
    this._updateThreatMeters();
  }

  // ==========================
  // Block roll (any character)
  // ==========================
  // Rolls block chance for characterId against an incoming attack.
  //
  // Block chance sources:
  //   - stats.blockChance (base, always active if > 0)
  //   - Holy Shield (tank only): adds 30% while active and has charges
  //
  // On a block:
  //   - Attack is fully negated (caller returns early)
  //   - BLOCK floating text shown on character zone
  //   - If Holy Shield is active (tank): deal blockDamage to boss,
  //     generate 135% threat, consume one charge.
  //     If that was the last charge, deactivate Holy Shield.
  //
  // Returns true if the attack was blocked.
  _rollBlock(characterId) {
    const slot = this.entitySlots[characterId];
    if (!slot) return false;

    const baseBlock = slot._data?.stats?.blockChance ?? 0;
    if (baseBlock <= 0 && characterId !== 'tank') return false;

    // Holy Shield bonus (tank only, only while active with charges)
    let hsBonus  = 0;
    let hsActive = false;
    if (characterId === 'tank') {
      const hs = slot.holyShield;
      if (hs?.active && hs.charges > 0 && Date.now() < hs.expiresAt) {
        hsBonus  = hs.blockChance ?? 30;
        hsActive = true;
      }
    }

    const totalBlock = baseBlock + hsBonus;
    if (totalBlock <= 0) return false;

    const roll = Phaser.Math.Between(1, 100);
    if (roll > totalBlock) return false;

    // ---- BLOCKED ----
    const zoneName = characterId.toUpperCase();
    const zone     = window.GAME_CONFIG.ZONES[zoneName];
    const uiScene  = this.scene.get('UIScene');

    // BLOCK floating text
    if (uiScene?.spawnFloatingText && zone) {
      uiScene.spawnFloatingText(zone, 'BLOCK', 'miss');
    }

    // Holy Shield reaction (tank only)
    if (characterId === 'tank' && hsActive) {
      const hs = slot.holyShield;

      // Deal block damage back to the boss
      const blockDmg    = hs.blockDamage ?? 59;
      const iconKey     = this.textures.exists('icon_holy_shield') ? 'icon_holy_shield' : null;
      this._applyDamageToBoss(blockDmg, iconKey);

      // Generate threat from block
      const blockThreat = Math.round(blockDmg * (hs.blockThreatMultiplier ?? 1.35));
      this.addThreat('tank', blockThreat);
      this._updateThreatMeters();

      // Consume one charge
      hs.charges--;
      console.log('[Tank] Holy Shield BLOCK - charges left:', hs.charges,
        'dealt', blockDmg, 'to boss, threat', blockThreat);

      if (hs.charges <= 0) {
        hs.active = false;
        console.log('[Tank] Holy Shield - all charges consumed');
      }

      this._emitBuffUpdate('tank');
    } else {
      console.log('[' + characterId + '] BLOCK (base ' + baseBlock + '%)');
    }

    return true;
  }

  // Play the appropriate hit reaction on a character when struck.
  _playHitOnTarget(targetId) {
    if (targetId === 'player') this.playPlayerHit();
    if (targetId === 'tank')   this.playTankHit();
    if (targetId === 'healer') this.playHealerHit();
  }

  playBossSubmerge(onComplete) {
    const slot        = this.entitySlots.boss;
    const submergeKey = this._getBossAnimKey('submerge');
    const lavaKey     = this._getBossAnimKey('lavapool');
    if (!slot?.sprite) return;

    if (submergeKey) {
      slot.sprite.play(submergeKey);
      slot.sprite.once('animationcomplete', () => {
        if (lavaKey) slot.sprite.play(lavaKey);
        if (onComplete) onComplete();
      });
    } else {
      // Fallback fade-out if no submerge anim defined
      this.tweens.add({
        targets: slot.sprite, alpha: 0, duration: 800,
        onComplete: () => { if (onComplete) onComplete(); },
      });
    }
  }

  playBossEmerge(onComplete) {
    const slot      = this.entitySlots.boss;
    const emergeKey = this._getBossAnimKey('emerge');
    const idleKey   = this._getBossAnimKey('idle');
    if (!slot?.sprite) return;

    if (emergeKey) {
      slot.sprite.play(emergeKey);
      slot.sprite.once('animationcomplete', () => {
        if (idleKey) slot.sprite.play(idleKey);
        if (onComplete) onComplete();
      });
    } else {
      // Fallback fade-in if no emerge anim defined
      this.tweens.add({
        targets: slot.sprite, alpha: 1, duration: 800,
        onComplete: () => { if (onComplete) onComplete(); },
      });
    }
  }

  // ====================
  // AUDIO UNLOCK OVERLAY
  // ====================
  // Browsers block audio until the user interacts with the page.
  // This overlay intercepts the first click/tap anywhere on screen,
  // plays a silent sound to unlock the audio context, then removes itself.
  // After this fires, all subsequent sounds play immediately.
  _buildAudioUnlockOverlay() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    // Semi-transparent overlay covering the full canvas
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.0)
      .setDepth(999)
      .setInteractive();

    // Small prompt at the bottom so the player knows to tap
    const prompt = this.add.text(WIDTH / 2, HEIGHT - 160, 'TAP TO BEGIN', {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#c8a96e',
      stroke:     '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(1000).setAlpha(0);

    // Pulse the prompt in and out
    this.tweens.add({
      targets:  prompt,
      alpha:    1,
      duration: 600,
      yoyo:     true,
      repeat:   -1,
    });

    overlay.once('pointerdown', () => {
      overlay.destroy();
      prompt.destroy();

      // Play a silent sound to unlock the audio context
      try {
        const silentCtx = new AudioContext();
        const buf = silentCtx.createBuffer(1, 1, 22050);
        const src = silentCtx.createBufferSource();
        src.buffer = buf;
        src.connect(silentCtx.destination);
        src.start(0);
        silentCtx.close();
      } catch (e) {
        // Not all browsers need this - safe to ignore
      }

      if (window.GAME_CONFIG.DEBUG_SKIP_INTRO) {
        // Clear the dialogue flag that init() set to true, then start immediately
        this.bossDialoguePlaying = false;
        this._startTicker(window.GAME_CONFIG.TICK_MS);
      } else {
        // Full intro - dialogue sequence will clear the flag and start the ticker
        this._showBossDialogue();
      }      
    });
  }

  // ================
  // DIALOGUE / POPUP
  // ================

  // Show the boss opening dialogue sequence on level load.
  // openingDialogue in the JSON can be a string or an array of strings.
  _showBossDialogue() {
    const raw   = this.levelData?.boss?.openingDialogue || 'YOU DARE CHALLENGE ME?!';
    const fadeMs = 350;
    const lines = Array.isArray(raw) ? raw : [raw];
    const holdMs = this.levelData?.boss?.audioDuration ?? 6000;
    const holdPerLine = Math.max(500, (holdMs / lines.length) - (fadeMs * 2));

    // TODO: Uncomment this
    this._playSound(this.levelData?.boss?.openingSound);

    // Pass an onComplete callback so the ticker starts only after
    // the last intro line finishes - guaranteeing no overlap.
    this.showDialogueSequence(lines, '#ff9944', holdPerLine, 350, () => {
      const delay = window.GAME_CONFIG.TICK_MS;
      console.log('[GameScene] Intro finished - starting ticker, delay:', delay, 'ms');
      this._startTicker(delay);
    });

  }

  // Show dialogue triggered by a phase change.
  // Reads phase.dialogue from the JSON (string or array).
  showPhaseDialogue(phase) {
    if (!phase?.dialogue) return;
    const lines = Array.isArray(phase.dialogue) ? phase.dialogue : [phase.dialogue];
    this.showDialogueSequence(lines, '#ff6622');
  }

  // Show dialogue triggered by an ability being used.
  // Reads ability.dialogue from the JSON (string or array).
  showAbilityDialogue(abilityId) {
    const ability = this.levelData?.abilities?.[abilityId];
    if (!ability?.dialogue && !ability?.sound) return;

    this._playSound(ability.sound);

    if (ability.dialogue) {
      const lines      = Array.isArray(ability.dialogue) ? ability.dialogue : [ability.dialogue];
      const fadeMs     = 350;
      // Use the ability's own audioDuration, not the boss intro duration
      const holdMs     = ability.audioDuration ?? 3000;
      const holdPerLine = Math.max(500, (holdMs / lines.length) - (fadeMs * 2));
      this.showDialogueSequence(lines, '#ffaa44', holdPerLine, fadeMs);
    }
  }

  // ==============================================
  // showDialogueSequence
  // Plays an array of dialogue lines one at a time.
  // Each line fades in, holds, then fades out before
  // the next line begins. All lines share one panel.
  //
  // lines    - array of strings to display in order
  // color    - hex color string for the text
  // holdMs   - how long each line stays fully visible
  // fadeMs   - fade in / fade out duration per line

  // ==============================================
  showDialogueSequence(lines, color = '#ffffff', holdMs = 2200, fadeMs = 350, onComplete = null) {
    if (!lines || lines.length === 0) return;

    // Block boss abilities from firing while this sequence plays
    this.bossDialoguePlaying = true;

    const zone = window.GAME_CONFIG.ZONES.POPUP;
    const cx   = zone.x + zone.w / 2;
    const cy   = zone.y + zone.h / 2;

    // One persistent panel for the whole sequence
    const panel = this.add.rectangle(cx, cy - 250, zone.w, zone.h, 0x000000, 0.78)
      .setStrokeStyle(2, 0xff4400, 0.85)
      .setAlpha(0)
      .setDepth(80);

    // Fade panel in once, it stays until all lines are done
    this.tweens.add({ targets: panel, alpha: 1, duration: fadeMs });

    // Play each line sequentially
    let lineIndex = 0;

    const showNext = () => {
      if (lineIndex >= lines.length) {
        // All lines done - fade panel out, destroy, unblock boss abilities,
        // and call onComplete if provided (used to start the ticker).
        this.tweens.add({
          targets: panel, alpha: 0, duration: fadeMs,
          onComplete: () => {
            panel.destroy();
            this.bossDialoguePlaying = false;
            if (onComplete) onComplete();
          },
        });
        return;
      }

      const line = lines[lineIndex];
      lineIndex++;

      const text = this.add.text(cx, cy - 250, line, {
        fontFamily: 'monospace',
        fontSize:   '32px',
        color:      color,
        align:      'center',
        wordWrap:   { width: zone.w - 48 },
        stroke:     '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0).setDepth(81);

      // Fade this line in, hold, fade out, then trigger next
      this.tweens.add({
        targets:  text,
        alpha:    1,
        duration: fadeMs,
        onComplete: () => {
          this.time.delayedCall(holdMs, () => {
            this.tweens.add({
              targets:  text,
              alpha:    0,
              duration: fadeMs,
              onComplete: () => {
                text.destroy();
                // Small gap between lines
                this.time.delayedCall(150, showNext);
              },
            });
          });
        },
      });
    };

    showNext();
  }

  // Simple single-message popup for system events (not boss dialogue).
  showPopup(message, color = '#ffffff', duration = 2500) {
    const zone = window.GAME_CONFIG.ZONES.POPUP;
    const cx   = zone.x + zone.w / 2;
    const cy   = zone.y + zone.h / 2;

    const panel = this.add.rectangle(cx, cy, zone.w, zone.h * 0.6, 0x000000, 0.7)
      .setStrokeStyle(1, 0x444444, 0.8).setAlpha(0).setDepth(80);
    const text  = this.add.text(cx, cy, message, {
      fontFamily: 'monospace', fontSize: '28px', color,
      align: 'center', wordWrap: { width: zone.w - 32 },
    }).setOrigin(0.5).setAlpha(0).setDepth(81);

    this.tweens.add({ targets: [panel, text], alpha: 1, duration: 250 });
    this.tweens.add({
      targets: [panel, text], alpha: 0, duration: 400, delay: duration,
      onComplete: () => { panel.destroy(); text.destroy(); },
    });
  }

  // ===========
  // SOUND
  // ===========
  // Safe sound player. Silently skips if:
  //   - no key provided
  //   - audio file was not loaded (missing file or not in assets manifest)
  //   - Web Audio context is locked (browser autoplay policy)
  // Volume is 0-1. Add more named params here as needed.
  _playSound(key, volume = 1.0) {
    if (!key) return;
    // Strip path prefix and file extension to get the Phaser cache key
    const cacheKey = key.replace(/^.*[/]/, '').replace(/[.][^.]+$/, '');
    if (!this.cache.audio.exists(cacheKey)) {
      console.warn('[GameScene] Audio not loaded:', cacheKey, '-- add it to assets.audio in the level JSON.');
      return;
    }
    try {
      this.sound.play(cacheKey, { volume });
    } catch (e) {
      console.warn('[GameScene] Could not play sound:', cacheKey, e.message);
    }
  }

  // ================
  // BOSS DEATH
  // ================

  // Call this when the boss reaches 0 health.
  // Plays the death sound, shows death dialogue, then stops the ticker.
  playBossDeath() {
    const bossData = this.levelData?.boss;

    this._playSound(bossData?.deathSound);

    const raw   = bossData?.deathDialogue || 'I AM... DEFEATED.';
    const lines = Array.isArray(raw) ? raw : [raw];
    this.showDialogueSequence(lines, '#aaaaaa');

    const slot = this.entitySlots.boss;
    if (slot?.sprite) {
      const deathKey = this._getBossAnimKey('death');
      if (deathKey && this.anims.exists(deathKey)) {
        // JSON-defined death animation (future bosses)
        slot.sprite.play(deathKey);
        slot.sprite.once('animationcomplete', () => {
          this.tweens.add({ targets: slot.sprite, alpha: 0, duration: 800 });
        });
      } else if (this.anims.exists('ragnaros_defeated')) {
        // Ragnaros-specific defeat sheet
        slot.sprite.play('ragnaros_defeated');
        slot.sprite.once('animationcomplete', () => {
          this.tweens.add({ targets: slot.sprite, alpha: 0, duration: 800 });
        });
      } else {
        // Fallback fade if no sheet loaded
        this.tweens.add({ targets: slot.sprite, alpha: 0, duration: 1500 });
      }
    }

    this.stopGame();
  }

  // ================
  // GAME TICK ENGINE
  // ================
  _startTicker(tickMs) {
    const delay = (tickMs && tickMs > 0) ? tickMs : window.GAME_CONFIG.TICK_MS;
    if (!delay || delay <= 0) {
      console.error('[GameScene] Invalid tick delay:', delay, '-- check TICK_MS in main.js');
      return;
    }
    this.gameRunning = true;
    this.tickerStartedAt = Date.now();
    console.log('[GameScene] Tick started, delay:', delay, 'ms');
    this.tickTimer = this.time.addEvent({
      delay: delay, loop: true,
      callback: this._tick, callbackScope: this,
    });
  }

  _tick() {
    if (!this.gameRunning) return;
    this.tickCount++;

    this._tickBossAutoAttack();
    this._tickBossAbilities();
    this._tickPlayerAutoAttack();
    this._tickTankAutoAttack();
    this._tickTankAbilities();
    this._tickHealerAI();
    this._tickManaRegen();

    // Combat systems plug in here next:
    // this.systems.combat.tick(this.tickCount);
    this.events.emit('tick', this.tickCount);
    // Combat log hook goes here when combat system is built
  }

  // ================
  // Boss auto-attack
  // ================
  // Fires playBossAttack() every <attackSpeed> ticks as defined in the JSON.
  // attackSpeed: 1 = every tick, 2 = every 2 ticks, 3 = every 3 ticks, etc.
  _tickBossAutoAttack() {
    if (this.bossDialoguePlaying) return;
    if (this.bossSubmerged) return;
    if (Date.now() < this.bossAbilityLockoutUntil) return;

    const bossData = this.entitySlots.boss?._data;
    if (!bossData) return;

    const attackSpeed = Math.round(bossData.stats?.attackSpeed ?? 3);
    if (this.tickCount % attackSpeed === 0) {
      this.playBossAttack();
    }
  }

  // ====================
  // Player auto-attack
  // =====================================
  // Boss ability rotation
  // =====================================
  // Each tick, check if any boss ability is off cooldown and fire it.
  // Ability recastTimers are tracked in this.bossAbilityCooldowns.
  // The boss uses abilities from the current phase abilityIds list.
  _tickBossAbilities() {
    if (this.bossDialoguePlaying) return;
    if (this.bossSubmerged) return;

    // Grace period - no special abilities for the first 20 seconds of the fight
    const GRACE_PERIOD_MS = 20000;
    if (!this.tickerStartedAt || Date.now() - this.tickerStartedAt < GRACE_PERIOD_MS) return;

    // Block if we are within the post-ability lockout window
    const POST_ABILITY_LOCKOUT_MS = 5000;
    if (Date.now() < this.bossAbilityLockoutUntil) return;

    const bossData = this.entitySlots.boss?._data;
    if (!bossData) return;

    // Initialize cooldown tracker on first tick
    if (!this.bossAbilityCooldowns) {
      this.bossAbilityCooldowns = {};
    }

    // Find current phase based on boss health
    const hpPct    = bossData.stats.health / bossData.stats.maxHealth;
    const phases   = bossData.phases ?? [];
    let currentPhase = phases[0];
    for (const phase of phases) {
      const triggerPct = (phase.trigger?.value ?? 100) / 100;
      if (hpPct <= triggerPct) currentPhase = phase;
    }

    const abilityIds = currentPhase?.abilityIds ?? [];
    const abilities  = this.levelData?.abilities ?? {};

    for (const abilityId of abilityIds) {
      const ability = abilities[abilityId];
      if (!ability) continue;

      // Skip auto-attack abilities (those are handled by _tickBossAutoAttack)
      // Only fire special abilities (non-zero recastTimer means it's special)
      if (!ability.recastTimer || ability.recastTimer <= 0) continue;

      const lastUsed  = this.bossAbilityCooldowns[abilityId] ?? 0;
      const recastMs  = ability.recastTimer * 1000;
      const now       = Date.now();

      if (now - lastUsed >= recastMs) {
        this.bossAbilityCooldowns[abilityId] = now;
        // Lock out all other abilities for POST_ABILITY_LOCKOUT_MS after this one
        this.bossAbilityLockoutUntil = now + POST_ABILITY_LOCKOUT_MS;
        this._fireBossAbility(abilityId, ability);
        // Only fire one ability per tick
        break;
      }
    }
  }

  // Fire a specific boss ability - plays animation if one is defined,
  // shows dialogue, plays sound.
  _fireBossAbility(abilityId, ability) {
    const bossName   = this.levelData?.boss?.name ?? 'Boss';
    const abilityName = ability.name ?? abilityId;
    const targetType  = ability.targetType;
    const isAoE       = targetType === 'all_allies';
    const TICK_MS     = window.GAME_CONFIG.TICK_MS;

    // Determine target(s) for logging and single-target damage
    const singleTargetId   = isAoE ? null : this.getHighestThreatTarget();
    const singleTargetName = singleTargetId
      ? (this.entitySlots[singleTargetId]?._data?.name ?? singleTargetId)
      : null;

    if (isAoE) {
      console.log('[Boss]', bossName, 'uses', abilityName, 'on the party!');
    } else {
      console.log('[Boss]', bossName, 'uses', abilityName, 'on', singleTargetName + '!');
    }

    // ========================
    // Submerge - special case
    // ========================
    if (abilityId === 'submerge') {
      this.showAbilityDialogue(abilityId);
      this.bossSubmerged = true;
      this.playBossSubmerge();

      // AoE tick damage while submerged
      const ticks    = ability.duration ?? 20;
      let   ticksFired = 0;
      const subTimer = this.time.addEvent({
        delay:    TICK_MS,
        loop:     true,
        callback: () => {
          ticksFired++;
          const dmg = Phaser.Math.Between(ability.tickMin ?? 300, ability.tickMax ?? 600);
          ['player', 'tank', 'healer'].forEach(id => this._applyDamageToCharacter(id, dmg, 'icon_submerge'));
          console.log('[Boss] Submerge tick', ticksFired, '- AoE', dmg);
          if (ticksFired >= ticks || !this.gameRunning) {
            subTimer.remove();
            this.bossSubmerged = false;
            this.playBossEmerge();
            console.log('[Boss] Ragnaros emerges!');
          }
        },
      });
      // Register for all targets so death/rebirth clears it
      ['player', 'tank', 'healer'].forEach(id => this._registerDot(id, subTimer));
      return;
    }

    // ========================
    // Wrath of Ragnaros
    // ========================
    if (abilityId === 'wrath_of_ragnaros') {
      this.playBossWrath();
      // Immediate AoE damage
      const immDmg = Phaser.Math.Between(
        this.levelData?.abilities?.wrath_of_ragnaros?.immediateMin ?? 2500,
        this.levelData?.abilities?.wrath_of_ragnaros?.immediateMax ?? 4500
      );
      ['player', 'tank', 'healer'].forEach(id => this._applyDamageToCharacter(id, immDmg, 'icon_wrath_of_ragnaros'));
      console.log('[Boss] Wrath of Ragnaros AoE immediate:', immDmg);
      // No tick DoT for wrath - it's handled by wrath_of_fire below
      return;
    }

    // ========================
    // Wrath of Fire - AoE immediate + DoT
    // ========================
    if (abilityId === 'wrath_of_fire') {
      this.showAbilityDialogue(abilityId);
      // Immediate AoE
      const immDmg = Phaser.Math.Between(ability.immediateMin ?? 2500, ability.immediateMax ?? 4500);
      ['player', 'tank', 'healer'].forEach(id => this._applyDamageToCharacter(id, immDmg, 'icon_wrath_of_ragnaros'));
      console.log('[Boss] Wrath of Fire AoE immediate:', immDmg);
      // DoT ticks
      if (ability.duration > 0 && ability.tickMin) {
        const tickDmg = Phaser.Math.Between(ability.tickMin, ability.tickMax);
        let ticks = 0;
        const dotTimer = this.time.addEvent({
          delay:    TICK_MS,
          loop:     true,
          callback: () => {
            ticks++;
            ['player', 'tank', 'healer'].forEach(id => this._applyDamageToCharacter(id, tickDmg, 'icon_wrath_of_ragnaros'));
            if (ticks >= ability.duration || !this.gameRunning) dotTimer.remove();
          },
        });
        // Register for all targets so Rebirth clears it properly
        ['player', 'tank', 'healer'].forEach(id => this._registerDot(id, dotTimer));
      }
      return;
    }

    // ========================
    // Magma Blast - single target immediate + DoT
    // ========================
    if (abilityId === 'magma_blast') {
      this.showAbilityDialogue(abilityId);
      const targetId = this.getHighestThreatTarget();
      // Immediate hit
      const immDmg = Phaser.Math.Between(ability.immediateMin ?? 3000, ability.immediateMax ?? 5000);
      this._applyDamageToCharacter(targetId, immDmg, 'icon_magma_blast');
      console.log('[Boss] Magma Blast hits', targetId, 'for', immDmg);
      // DoT ticks - same target, roll once
      if (ability.duration > 0 && ability.tickMin) {
        const tickDmg = Phaser.Math.Between(ability.tickMin, ability.tickMax);
        let ticks = 0;
        const dotTimer = this.time.addEvent({
          delay:    TICK_MS,
          loop:     true,
          callback: () => {
            ticks++;
            this._applyDamageToCharacter(targetId, tickDmg, 'icon_magma_blast');
            if (ticks >= ability.duration || !this.gameRunning) dotTimer.remove();
          },
        });
        this._registerDot(targetId, dotTimer);
      }
      return;
    }


    // ========================
    // Generic boss ability handling
    // ========================
    const resolveTargets = () => {
      if (targetType === 'all_allies') return ['player', 'tank', 'healer'];
      if (targetType === 'random_ally') {
        const alive = ['player', 'tank', 'healer'].filter(id => (this.entitySlots[id]?.currentHealth ?? 0) > 0);
        return alive.length ? [Phaser.Utils.Array.GetRandom(alive)] : [];
      }
      if (targetType === 'boss_self') return [];
      return [this.getHighestThreatTarget()];
    };

    const targets = resolveTargets();
    const iconKey = this.textures.exists('icon_' + (ability.iconId || abilityId))
      ? 'icon_' + (ability.iconId || abilityId)
      : 'icon_autoAttack';

    if (ability.selfBuff?.damageMultiplier) {
      this.bossDamageMultiplier = ability.selfBuff.damageMultiplier;
      const buffDurationTicks = ability.selfBuff.duration ?? 0;
      if (buffDurationTicks > 0) {
        this.time.delayedCall(buffDurationTicks * TICK_MS, () => {
          this.bossDamageMultiplier = 1;
        });
      }
    }

    if (ability.immediateEffect?.type === 'heal_boss') {
      const bossSlot = this.entitySlots.boss;
      if (bossSlot) {
        const maxHealth = bossSlot.hpBar?.maxValue ?? bossSlot._data?.stats?.maxHealth ?? 1;
        const healAmount = Phaser.Math.Between(ability.immediateMin ?? 0, ability.immediateMax ?? ability.immediateMin ?? 0);
        bossSlot.currentHealth = Math.min(maxHealth, (bossSlot.currentHealth ?? maxHealth) + healAmount);
        const pct = bossSlot.currentHealth / maxHealth;
        this._setBossHealthBar(bossSlot.hpBar, pct);
        const uiScene = this.scene.get('UIScene');
        if (uiScene?.spawnFloatingText) {
          uiScene.spawnFloatingText(window.GAME_CONFIG.ZONES.BOSS, healAmount, 'heal', iconKey);
        }
      }
    } else if (ability.immediateFlag && (ability.immediateMin || ability.immediateMax)) {
      const immediateDamage = Phaser.Math.Between(ability.immediateMin ?? 0, ability.immediateMax ?? ability.immediateMin ?? 0);
      targets.forEach((targetId) => {
        if (!targetId) return;
        this._applyDamageToCharacter(targetId, Math.round(immediateDamage * (this.bossDamageMultiplier ?? 1)), iconKey);
      });
    }

    if (ability.duration > 0 && ability.tickMin) {
      let ticks = 0;
      const dotTimer = this.time.addEvent({
        delay: TICK_MS,
        loop: true,
        callback: () => {
          ticks++;
          const tickDamage = Phaser.Math.Between(ability.tickMin ?? 0, ability.tickMax ?? ability.tickMin ?? 0);
          targets.forEach((targetId) => {
            if (!targetId) return;
            this._applyDamageToCharacter(targetId, Math.round(tickDamage * (this.bossDamageMultiplier ?? 1)), iconKey);
          });
          if (ticks >= ability.duration || !this.gameRunning) {
            dotTimer.remove();
          }
        },
      });
      targets.forEach((targetId) => {
        if (targetId) this._registerDot(targetId, dotTimer);
      });
    }

    this.playBossAttack();
    this.showAbilityDialogue(abilityId);
  }

  // =====================================
  // Damage application
  // =====================================
  // Reduces a character's current health, updates their health bar,
  // spawns floating damage text, and checks for death.
  // characterId: 'player' | 'tank' | 'healer'
  _applyDamageToCharacter(characterId, damage, iconKey = null) {
    const slot = this.entitySlots[characterId];
    if (!slot) return;
    // Never damage a dead character
    if ((slot.currentHealth ?? 0) <= 0) return;

    const maxHealth = slot.hpBar?.maxValue ?? 1;

    // Reduce current health, floor at 0
    slot.currentHealth = Math.max(0, (slot.currentHealth ?? maxHealth) - damage);

    // Update the health bar
    const pct = slot.currentHealth / maxHealth;
    this._setHealthBar(slot.hpBar, pct);

    // Spawn floating damage number via UIScene
    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      const zone = window.GAME_CONFIG.ZONES[characterId.toUpperCase()]
                   ?? window.GAME_CONFIG.ZONES.PLAYER;
      uiScene.spawnFloatingText(zone, damage, 'damage', iconKey);
    }

    // Check for death
    if (slot.currentHealth <= 0) {
      this._onCharacterDeath(characterId);
    }
  }

  // Called when a character reaches 0 health.
  _onCharacterDeath(characterId) {
    const slot = this.entitySlots[characterId];
    if (!slot) return;

    // Hard-clamp health to 0 so HoT callbacks can't push it above 0
    slot.currentHealth = 0;

    // Cancel all active HoTs and Lifebloom on this character
    this._cancelEffectsOnCharacter(characterId);

    // Play defeat animation, then fade out once it finishes
    const defeatKeyMap = {
      player: 'shaman_defeated',
      healer: 'druid_defeated',
      tank:   'tank_defeated',
    };
    const defeatKey = defeatKeyMap[characterId];

    if (slot.sprite && defeatKey && this.anims.exists(defeatKey)) {
      // Play defeat animation and hold on last frame - no fade
      slot.sprite.play(defeatKey);
    } else if (slot.sprite) {
      // Fallback: sheet not loaded, leave sprite as-is
    }

    this.showPopup(
      (slot._data?.name ?? characterId.toUpperCase()) + ' has fallen!',
      '#ff4444',
      3000
    );

    // If the player dies, end the game
    if (characterId === 'player') {
      this.time.delayedCall(2000, () => {
        this.showPopup('DEFEAT', '#ff2222', 4000);
        this.stopGame();
      });
    }
  }

  // =====================================
  // Buff bar state emitter
  // =====================================
  // Reads current healerState for a character and emits a 'buff-update'
  // event to UIScene with the current list of active effects.
  // Call this whenever healerState changes.
  _emitBuffUpdate(characterId) {
    if (!this.healerState) return;

    const effects = [];

    // Active HoTs (Regrowth, Rejuvenation)
    const hots = this.healerState.activeHoTs[characterId] ?? {};
    for (const [abilityId, hot] of Object.entries(hots)) {
      effects.push({ abilityId, stacks: 1, ticksLeft: hot.ticksLeft ?? 0 });
    }

    // Lifebloom
    const lb = this.healerState.lifeblooms[characterId];
    if (lb) {
      effects.push({ abilityId: 'lifebloom', stacks: lb.stacks ?? 1, ticksLeft: lb.ticksLeft ?? null });
    }

    // Holy Shield (tank only)
    if (characterId === 'tank') {
      const hs = this.entitySlots.tank?.holyShield;
      if (hs?.active && hs.charges > 0 && Date.now() < hs.expiresAt) {
        effects.push({ abilityId: 'holy_shield', stacks: hs.charges, ticksLeft: null });
      }
    }

    this.events.emit('buff-update', { characterId, effects });
  }

  // Cancel all active healer effects (HoTs, Lifebloom) on a character.
  // Called on death so ticking effects can't heal a dead character.
  // Register a DoT timer against a character so it can be cancelled on death/rebirth
  _registerDot(characterId, timer) {
    if (!this.activeDots) this.activeDots = { player: [], tank: [], healer: [] };
    if (this.activeDots[characterId]) {
      this.activeDots[characterId].push(timer);
    }
  }

  // Cancel and clear all active DoT timers on a character
  _cancelDotsOnCharacter(characterId) {
    if (!this.activeDots?.[characterId]) return;
    this.activeDots[characterId].forEach(t => { try { t.remove(); } catch(e) {} });
    this.activeDots[characterId] = [];
  }

  _cancelEffectsOnCharacter(characterId) {
    if (!this.healerState) return;

    // Cancel active HoTs (Regrowth, Rejuvenation)
    const hots = this.healerState.activeHoTs[characterId];
    if (hots) {
      // The hotTimer references aren't stored - we clear the tracking object
      // so the timer callbacks check activeHoTs and find nothing to heal.
      delete this.healerState.activeHoTs[characterId];
    }

    // Cancel Lifebloom timer
    const lb = this.healerState.lifeblooms[characterId];
    if (lb) {
      if (lb.timer) lb.timer.remove();
      delete this.healerState.lifeblooms[characterId];
    }

    // Cancel active boss DoT timers (Magma Blast, Wrath of Fire, Submerge)
    this._cancelDotsOnCharacter(characterId);

    // Clear buff bar display
    this._emitBuffUpdate(characterId);
  }

  // =====================================
  // Healer AI
  // =====================================
  // Fires every tick but only acts every <actionInterval> ticks.
  //
  // Decision logic:
  //   tank HP > 80%  -> do nothing (conserve mana)
  //   tank HP 50-80% -> cast Rejuvenation (cheap HoT)
  //   tank HP < 50%  -> cast Regrowth (immediate heal + HoT)
  //   healer mana < 20% -> skip regardless (oom protection)
  // =====================================
  // Healer AI
  // =====================================
  // Fires every tick but only acts every actionInterval ticks.
  //
  // Priority order (tank-focused):
  //   1. Lifebloom on tank if taking damage and stacks < 3
  //   2. Regrowth on tank if tank < 80% (immediate burst + HoT)
  //   3. Swiftmend on tank if tank < 60% (consumes Rejuv or Regrowth HoT)
  //   4. Lifebloom again once previous stack blooms
  //   5. Rejuvenation if any ally needs healing
  //   6. Do nothing if no ally is below 80%
  _tickHealerAI() {
    const healerSlot = this.entitySlots.healer;
    const tankSlot   = this.entitySlots.tank;
    if (!healerSlot?._data || !tankSlot?._data) return;
    if ((healerSlot.currentHealth ?? 0) <= 0) return;

    const actionInterval = healerSlot._data.stats?.actionInterval ?? 3;
    if (this.tickCount % actionInterval !== 0) return;

    // Do not interrupt a cast already playing
    const current = healerSlot.sprite?.anims?.currentAnim;
    if (current && current.key === 'druid_casting' && healerSlot.sprite.anims.isPlaying) return;

    const abilities     = this.levelData?.abilities ?? {};
    const healerMaxMana = healerSlot.manaBar?.maxValue ?? 1;
    const healerMana    = healerSlot.currentMana ?? healerMaxMana;
    const healerManaPct = healerMana / healerMaxMana;

    // Shared state init
    if (!this.healerState) {
      this.healerState = {
        lifeblooms:  {},
        activeHoTs:  {},
        rebirthUsed: false,
        swiftmendCd: 0,
      };
    }

    const tankMaxHp        = tankSlot.hpBar?.maxValue ?? 1;
    const tankHp           = tankSlot.currentHealth ?? tankMaxHp;
    const tankHpPct        = tankHp / tankMaxHp;
    const tankTakingDamage = tankHp < tankMaxHp;

    const lb      = abilities['lifebloom'];
    const lbCost  = lb ? Math.round(healerMaxMana * (lb.manaCostPct ?? 0.06)) : 999999;
    const rg      = abilities['regrowth'];
    const rgCost  = rg?.manaCost ?? 999999;
    const rj      = abilities['rejuvenation'];
    const rjCost  = rj?.manaCost ?? 999999;
    const sm      = abilities['swiftmend'];
    const smCost  = sm ? Math.round(healerMaxMana * (sm.manaCostPct ?? 0.16)) : 999999;

    // ============================
    // Priority 1: Rebirth
    // ============================
    // Revive dead tank or player immediately - before anything else.
    if (!this.healerState.rebirthUsed) {
      const rb     = abilities['rebirth'];
      const rbCost = rb?.manaCost ?? 999999;
      if (rb && healerMana >= rbCost) {
        for (const id of ['tank', 'player']) {
          const s = this.entitySlots[id];
          if (s && (s.currentHealth ?? 1) <= 0) {
            this.time.delayedCall(500, () => { this._castRebirth(id, rb); });
            return;
          }
        }
      }
    }

    // ============================
    // Priority 2: Innervate
    // ============================
    // Costs 0 mana - fires even when healer is low. Targets any character
    // at or below 15% mana, prioritising whoever is lowest.
    const innervate = abilities['innervate'];
    if (innervate) {
      if (!this.innervateLastUsed) this.innervateLastUsed = 0;
      const ivReady = Date.now() - this.innervateLastUsed >= (innervate.recastTimer ?? 360) * 1000;
      if (ivReady) {
        let ivTarget = null;
        let ivLowest = 0.15;
        for (const id of ['tank', 'player', 'healer']) {
          const s = this.entitySlots[id];
          if (!s || (s.currentHealth ?? 0) <= 0) continue;
          const maxMana = s.manaBar?.maxValue ?? 1;
          const pct     = (s.currentMana ?? maxMana) / maxMana;
          if (pct <= ivLowest) { ivLowest = pct; ivTarget = id; }
        }
        if (ivTarget) {
          this.time.delayedCall(500, () => { this._castInnervate(ivTarget, innervate); });
          return;
        }
      }
    }

    // OOM protection - below here all spells cost mana
    if (healerManaPct < 0.15) return;

    // ============================
    // Priority 3: Lifebloom on tank if taking damage and stacks < 3
    // ============================
    const lbStacksTank = this.healerState.lifeblooms['tank']?.stacks ?? 0;
    if (lb && healerMana >= lbCost && tankTakingDamage && lbStacksTank < 3) {
      this.time.delayedCall(500, () => { this._castLifebloom('tank', lb, lbCost); });
      return;
    }

    // ============================
    // Priority 4: Swiftmend on any character < 50% who has a consumable HoT
    // ============================
    const smCdOk = Date.now() >= (this.healerState.swiftmendCd ?? 0);
    if (sm && healerMana >= smCost && smCdOk) {
      let smTarget = null;
      let smLowest = 0.50;
      for (const id of ['tank', 'player', 'healer']) {
        const s = this.entitySlots[id];
        if (!s || (s.currentHealth ?? 0) <= 0) continue;
        const maxHp  = s.hpBar?.maxValue ?? 1;
        const pct    = (s.currentHealth ?? maxHp) / maxHp;
        const hots   = this.healerState.activeHoTs[id] ?? {};
        const hasHoT = hots.rejuvenation || hots.regrowth;
        if (pct < smLowest && hasHoT) { smLowest = pct; smTarget = id; }
      }
      if (smTarget) {
        this.time.delayedCall(500, () => { this._castSwiftmend(smTarget, sm, smCost); });
        return;
      }
    }

    // ============================
    // Priority 5: Regrowth on tank if tank < 60%
    // ============================
    if (rg && healerMana >= rgCost) {
      let bestTarget = null;
      let bestPct    = 0.60;
      for (const id of ['tank', 'player', 'healer']) {
        const s = this.entitySlots[id];
        if (!s || (s.currentHealth ?? 0) <= 0) continue;
        const maxHp = s.hpBar?.maxValue ?? 1;
        const pct   = (s.currentHealth ?? maxHp) / maxHp;
        if (pct < bestPct) { bestPct = pct; bestTarget = id; }
      }
      if (bestTarget) {
        this.time.delayedCall(500, () => { this._castHeal('regrowth', rg, bestTarget); });
        return;
      }
    }
  
    // ============================
    // Priority 6: Lifebloom on any character taking damage
    // 1 stack if < 90%, 2 stacks if < 80%, 3 stacks if < 70%
    // ============================
    if (lb && healerMana >= lbCost) {
      for (const id of ['tank', 'player', 'healer']) {
        const s = this.entitySlots[id];
        if (!s || (s.currentHealth ?? 0) <= 0) continue;
        const maxHp    = s.hpBar?.maxValue ?? 1;
        const hp       = s.currentHealth ?? maxHp;
        const pct      = hp / maxHp;
        const curStack = this.healerState.lifeblooms[id]?.stacks ?? 0;

        // Determine target stack count based on hp threshold
        let targetStacks = 0;
        if (pct < 0.70) targetStacks = 3;
        else if (pct < 0.80) targetStacks = 2;
        else if (pct < 0.90) targetStacks = 1;

        if (targetStacks > 0 && curStack < targetStacks) {
          this.time.delayedCall(500, () => { this._castLifebloom(id, lb, lbCost); });
          return;
        }
      }
    }
  

    // ============================
    // Priority 7: Rejuvenation on any character below 80% without active Rejuv
    // ============================
    if (rj && healerMana >= rjCost) {
      let bestTarget = null;
      let bestPct    = 0.80;
      for (const id of ['tank', 'player', 'healer']) {
        const s = this.entitySlots[id];
        if (!s || (s.currentHealth ?? 0) <= 0) continue;
        const maxHp    = s.hpBar?.maxValue ?? 1;
        const pct      = (s.currentHealth ?? maxHp) / maxHp;
        const hasRejuv = this.healerState.activeHoTs[id]?.rejuvenation;
        if (pct < bestPct && !hasRejuv) { bestPct = pct; bestTarget = id; }
      }
      if (bestTarget) {
        this.time.delayedCall(500, () => { this._castHeal('rejuvenation', rj, bestTarget); });
        return;
      }
    }
  }
    

  // ============================
  // Cast helpers
  // ============================

  // Generic heal cast - handles Regrowth (immediate + HoT) and Rejuvenation (HoT only)
  _castHeal(abilityId, ability, targetId) {
    const healerSlot    = this.entitySlots.healer;
    const healerMaxMana = healerSlot.manaBar?.maxValue ?? 1;
    const healerMana    = healerSlot.currentMana ?? healerMaxMana;

    // Deduct mana
    healerSlot.currentMana = Math.max(0, healerMana - ability.manaCost);
    this._setManaBar(healerSlot.manaBar, healerSlot.currentMana / healerMaxMana);
    this._recordCast('healer');

    const tankHpPct = (this.entitySlots.tank?.currentHealth ?? 1) /
                      (this.entitySlots.tank?.hpBar?.maxValue ?? 1);
    const danger = tankHpPct < 0.50 ? ' [CRITICAL]' : tankHpPct < 0.80 ? ' [LOW]' : '';
    console.log('[Healer]', abilityId, '->', targetId,
      '(' + Math.round(tankHpPct * 100) + '% tank hp)' + danger);

    // Badge on healer showing what was cast
    const uiForHeal = this.scene.get('UIScene');
    if (uiForHeal?.spawnAbilityBadge) {
      uiForHeal.spawnAbilityBadge(window.GAME_CONFIG.ZONES.HEALER, abilityId, ability.name ?? abilityId);
    }

    // Immediate heal with random roll in range
    if (ability.immediateFlag && ability.immediateEffect?.type === 'heal') {
      const min    = ability.immediateHealMin ?? ability.immediateEffect.value;
      const max    = ability.immediateHealMax ?? ability.immediateEffect.value;
      const amount = Phaser.Math.Between(min, max);
      this._applyHealToCharacter(targetId, amount, abilityId);
    }

    // HoT ticks - roll once at cast time, same amount each tick
    if (ability.tickEffect?.type === 'heal' && ability.duration > 0) {
      const min      = ability.tickHealMin ?? ability.tickEffect.value;
      const max      = ability.tickHealMax ?? ability.tickEffect.value;
      const tickHeal = Phaser.Math.Between(min, max);
      const duration = ability.duration;
      let   ticks    = 0;

      // Track active HoT so Swiftmend can consume it
      if (!this.healerState.activeHoTs[targetId]) this.healerState.activeHoTs[targetId] = {};
      this.healerState.activeHoTs[targetId][abilityId] = { ticksLeft: duration, tickHeal };
      this._emitBuffUpdate(targetId);

      const hotTimer = this.time.addEvent({
        delay:    window.GAME_CONFIG.TICK_MS,
        loop:     true,
        callback: () => {
          ticks++;
          this._applyHealToCharacter(targetId, tickHeal, abilityId);
          if (this.healerState.activeHoTs[targetId]?.[abilityId]) {
            this.healerState.activeHoTs[targetId][abilityId].ticksLeft--;
          }
          if (ticks >= duration || !this.gameRunning) {
            hotTimer.remove();
            if (this.healerState.activeHoTs[targetId]) {
              delete this.healerState.activeHoTs[targetId][abilityId];
            }
          }
          this._emitBuffUpdate(targetId);
        },
      });
    }

    // Threat - healing yourself generates no threat
    if (targetId !== 'healer') {
      const totalHeal = (ability.immediateHealMax ?? ability.immediateEffect?.value ?? 0)
                      + (ability.tickHealMax ?? ability.tickEffect?.value ?? 0) * (ability.duration ?? 0);
      this.addThreat('healer', Math.round(totalHeal * (ability.threatPerHealing ?? 0.1)));
      this._updateThreatMeters();
    }
    this.playHealerCast();
  }

  // Lifebloom - stacking HoT with bloom on expiry
  _castLifebloom(targetId, ability, manaCost) {
    const healerSlot    = this.entitySlots.healer;
    const healerMaxMana = healerSlot.manaBar?.maxValue ?? 1;
    const healerMana    = healerSlot.currentMana ?? healerMaxMana;

    healerSlot.currentMana = Math.max(0, healerMana - manaCost);
    this._setManaBar(healerSlot.manaBar, healerSlot.currentMana / healerMaxMana);
    this._recordCast('healer');

    // Roll tick and bloom values once per application
    const tickHeal  = Phaser.Math.Between(ability.tickHealMin ?? 273, ability.tickHealMax ?? 465);
    const bloomHeal = Phaser.Math.Between(ability.bloomHealMin ?? 600, ability.bloomHealMax ?? 975);
    const duration  = ability.duration ?? 7;

    // Cancel any existing Lifebloom timer on this target (reset duration)
    const existing = this.healerState.lifeblooms[targetId];
    if (existing?.timer) existing.timer.remove();

    const newStacks = Math.min((existing?.stacks ?? 0) + 1, ability.maxStacks ?? 3);
    console.log('[Healer] Lifebloom ->', targetId, 'stack', newStacks,
      'tick', tickHeal, 'bloom', bloomHeal);

    // Badge on healer
    const uiForLb = this.scene.get('UIScene');
    if (uiForLb?.spawnAbilityBadge) {
      uiForLb.spawnAbilityBadge(window.GAME_CONFIG.ZONES.HEALER, 'lifebloom', 'Lifebloom');
    }

    let ticks = 0;
    const lbTimer = this.time.addEvent({
      delay:    window.GAME_CONFIG.TICK_MS,
      loop:     true,
      callback: () => {
        ticks++;
        // Each tick heals (tickHeal * stacks)
        const stacks      = this.healerState.lifeblooms[targetId]?.stacks ?? 1;
        const tickTotal   = tickHeal * stacks;
        this._applyHealToCharacter(targetId, tickTotal, 'lifebloom');

        // Decrement ticksLeft for buff bar display
        if (this.healerState.lifeblooms[targetId]) {
          this.healerState.lifeblooms[targetId].ticksLeft = Math.max(0, duration - ticks);
          this._emitBuffUpdate(targetId);
        }

        if (ticks >= duration || !this.gameRunning) {
          lbTimer.remove();
          // Bloom: instant heal on duration end
          const currentStacks = this.healerState.lifeblooms[targetId]?.stacks ?? 1;
          const bloomTotal    = bloomHeal * currentStacks;
          this._applyHealToCharacter(targetId, bloomTotal, 'lifebloom');
          console.log('[Healer] Lifebloom BLOOM on', targetId, 'for', bloomTotal);
          delete this.healerState.lifeblooms[targetId];
          this._emitBuffUpdate(targetId);
        }
      },
    });

    this.healerState.lifeblooms[targetId] = {
      stacks:    newStacks,
      tickHeal,
      bloomHeal,
      timer:     lbTimer,
      ticksLeft: duration,
      duration,
    };
    this._emitBuffUpdate(targetId);

    this.addThreat('healer', Math.round((tickHeal * duration + bloomHeal) * (ability.threatPerHealing ?? 0.1)));
    this._updateThreatMeters();
    this.playHealerCast();
  }

  // Swiftmend - consume Rejuv or Regrowth HoT for an instant heal
  _castSwiftmend(targetId, ability, manaCost) {
    const healerSlot    = this.entitySlots.healer;
    const healerMaxMana = healerSlot.manaBar?.maxValue ?? 1;
    const healerMana    = healerSlot.currentMana ?? healerMaxMana;

    healerSlot.currentMana = Math.max(0, healerMana - manaCost);
    this._setManaBar(healerSlot.manaBar, healerSlot.currentMana / healerMaxMana);
    this._recordCast('healer');

    // Set cooldown
    this.healerState.swiftmendCd = Date.now() + (ability.recastTimer ?? 15) * 1000;

    // Find which HoT to consume (prefer Rejuvenation, fall back to Regrowth)
    const hotState = this.healerState.activeHoTs[targetId] ?? {};
    let   consumed = null;
    let   consumedId = null;

    if (hotState.rejuvenation) {
      consumed   = hotState.rejuvenation;
      consumedId = 'rejuvenation';
    } else if (hotState.regrowth) {
      consumed   = hotState.regrowth;
      consumedId = 'regrowth';
    }

    if (!consumed) return;

    // Heal = tickHeal x remaining ticks
    const healAmount = consumed.tickHeal * consumed.ticksLeft;
    delete this.healerState.activeHoTs[targetId][consumedId];
    this._emitBuffUpdate(targetId);

    this._applyHealToCharacter(targetId, healAmount, 'swiftmend');
    console.log('[Healer] Swiftmend consumed', consumedId, 'on', targetId, 'for', healAmount);

    // Badge on healer
    const uiForSm = this.scene.get('UIScene');
    if (uiForSm?.spawnAbilityBadge) {
      uiForSm.spawnAbilityBadge(window.GAME_CONFIG.ZONES.HEALER, 'swiftmend', 'Swiftmend');
    }

    this.addThreat('healer', Math.round(healAmount * (ability.threatPerHealing ?? 0.1)));
    this._updateThreatMeters();
    this.playHealerCast();
  }

  // Rebirth - revive a dead ally with partial health/mana (once per level)
  _castRebirth(targetId, ability) {
    const healerSlot    = this.entitySlots.healer;
    const healerMaxMana = healerSlot.manaBar?.maxValue ?? 1;
    const healerMana    = healerSlot.currentMana ?? healerMaxMana;

    healerSlot.currentMana = Math.max(0, healerMana - ability.manaCost);
    this._setManaBar(healerSlot.manaBar, healerSlot.currentMana / healerMaxMana);
    this._recordCast('healer');

    this.healerState.rebirthUsed = true;

    const slot      = this.entitySlots[targetId];
    const restoreHp = ability.immediateEffect?.restoreHealth ?? 1100;
    const restoreMp = ability.immediateEffect?.restoreMana   ?? 1700;

    // Restore health and mana
    slot.currentHealth = restoreHp;
    slot.currentMana   = restoreMp;
    this._setHealthBar(slot.hpBar, restoreHp / (slot.hpBar?.maxValue ?? 1));
    if (slot.manaBar) this._setManaBar(slot.manaBar, restoreMp / (slot.manaBar?.maxValue ?? 1));

    // Fade the sprite back in
    if (slot.sprite) {
      slot.sprite.setAlpha(0);
      this.tweens.add({ targets: slot.sprite, alpha: 1, duration: 800 });
      if (targetId === 'tank' && this.anims.exists('tank_idle')) slot.sprite.play('tank_idle');
      if (targetId === 'player' && this.anims.exists('shaman_idle')) slot.sprite.play('shaman_idle');
    }

    this.showPopup((slot._data?.name ?? targetId) + ' returns to life!', '#aaffaa', 3000);
    console.log('[Healer] Rebirth on', targetId, '- restored', restoreHp, 'hp,', restoreMp, 'mana');

    // Badge on healer
    const uiForRb = this.scene.get('UIScene');
    if (uiForRb?.spawnAbilityBadge) {
      uiForRb.spawnAbilityBadge(window.GAME_CONFIG.ZONES.HEALER, 'rebirth', 'Rebirth');
    }
    this.playHealerCast();
  }

  // Apply healing to a character, capped at their max health.
  // iconKey is optional - pass ability id like 'regrowth' to show icon on the number
  _applyHealToCharacter(characterId, amount, abilityId = null) {
    const slot = this.entitySlots[characterId];
    if (!slot) return;
    // Never heal a dead character - Rebirth is the only way back
    if ((slot.currentHealth ?? 0) <= 0) return;

    const maxHealth    = slot.hpBar?.maxValue ?? 1;
    const prevHealth   = slot.currentHealth ?? maxHealth;
    slot.currentHealth = Math.min(maxHealth, prevHealth + amount);

    const pct = slot.currentHealth / maxHealth;
    this._setHealthBar(slot.hpBar, pct);

    // Spawn floating heal number with optional ability icon
    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      const zone    = window.GAME_CONFIG.ZONES[characterId.toUpperCase()]
                      ?? window.GAME_CONFIG.ZONES.TANK;
      const iconKey = abilityId ? 'icon_' + abilityId : null;
      uiScene.spawnFloatingText(zone, amount, 'heal', iconKey);
    }
  }

  // Innervate - restore 4x target's max mana over 20 ticks (0 mana cost)
  _castInnervate(targetId, ability) {
    this.innervateLastUsed = Date.now();
    this._recordCast('healer');

    const targetSlot  = this.entitySlots[targetId];
    if (!targetSlot) return;

    const targetMaxMana = targetSlot.manaBar?.maxValue ?? 1;
    // Total restore = maxMana * 4, spread over duration ticks
    const duration      = ability.duration ?? 20;
    const totalRestore  = targetMaxMana * (ability.tickEffect?.valuePct ?? 4.0);
    const tickRestore   = Math.round(totalRestore / duration);

    console.log('[Healer] Innervate ->', targetId,
      'restoring', tickRestore, '/tick for', duration, 'ticks');

    // Badge on healer
    const uiForIv = this.scene.get('UIScene');
    if (uiForIv?.spawnAbilityBadge) {
      uiForIv.spawnAbilityBadge(window.GAME_CONFIG.ZONES.HEALER, 'innervate', 'Innervate');
    }

    let ticks = 0;
    const ivTimer = this.time.addEvent({
      delay:    window.GAME_CONFIG.TICK_MS,
      loop:     true,
      callback: () => {
        ticks++;
        const currentMana = targetSlot.currentMana ?? targetMaxMana;
        targetSlot.currentMana = Math.min(targetMaxMana, currentMana + tickRestore);
        this._setManaBar(targetSlot.manaBar, targetSlot.currentMana / targetMaxMana);

        // Floating mana text on target
        const ui = this.scene.get('UIScene');
        if (ui?.spawnFloatingText) {
          const zone = window.GAME_CONFIG.ZONES[targetId.toUpperCase()];
          if (zone) ui.spawnFloatingText(zone, tickRestore, 'mana', 'icon_innervate');
        }

        if (ticks >= duration || !this.gameRunning) ivTimer.remove();
      },
    });

    this.playHealerCast();
  }

  // =====================================
  // Mana regeneration
  // =====================================
  // If a character hasn't cast anything for 5 seconds, they regen
  // 3% of their max mana every 2 ticks. Resets on any cast.
  _tickManaRegen() {
    const IDLE_WINDOW_MS  = 5000;
    const REGEN_PCT       = 0.06;
    const REGEN_INTERVAL  = 2;  // ticks between each regen tick

    if (this.tickCount % REGEN_INTERVAL !== 0) return;

    const now = Date.now();

    for (const id of ['player', 'tank', 'healer']) {
      const slot = this.entitySlots[id];
      if (!slot || (slot.currentHealth ?? 0) <= 0) continue;

      const maxMana     = slot.manaBar?.maxValue ?? 0;
      if (maxMana <= 0) continue;

      const currentMana = slot.currentMana ?? maxMana;
      if (currentMana >= maxMana) continue;  // already full

      const lastCast    = this.lastCastTime[id] ?? 0;
      if (now - lastCast < IDLE_WINDOW_MS) continue;  // still in combat window

      const regenAmount = Math.round(maxMana * REGEN_PCT);
      slot.currentMana  = Math.min(maxMana, currentMana + regenAmount);
      this._setManaBar(slot.manaBar, slot.currentMana / maxMana);

      // Floating mana text
      const uiScene = this.scene.get('UIScene');
      if (uiScene?.spawnFloatingText) {
        const zone = window.GAME_CONFIG.ZONES[id.toUpperCase()];
        if (zone) uiScene.spawnFloatingText(zone, regenAmount, 'mana');
      }
    }
  }

  // Call this whenever a character spends mana to reset their regen window.
  _recordCast(characterId) {
    if (this.lastCastTime) this.lastCastTime[characterId] = Date.now();
  }

  // =====================================
  // Boss damage application
  // =====================================
  _applyDamageToBoss(damage, iconKey = null) {
    const slot = this.entitySlots.boss;
    if (!slot) return;

    const maxHealth    = slot.hpBar?.maxValue ?? 1;
    slot.currentHealth = Math.max(0, (slot.currentHealth ?? maxHealth) - damage);

    const pct = slot.currentHealth / maxHealth;
    this._setBossHealthBar(slot.hpBar, pct);

    // Floating damage number above boss zone
    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      uiScene.spawnFloatingText(window.GAME_CONFIG.ZONES.BOSS, damage, 'damage', iconKey);
    }

    if (slot.currentHealth <= 0) {
      this.playBossDeath();
    }
  }

  // =====================================
  // Threat table
  // =====================================
  // Tracks how much threat each character has generated.
  // The boss attacks whichever character has the highest threat.
  // Reset at the start of each level.
  _initThreatTable() {
    this.threatTable = {
      player: 0,
      tank:   0,
      healer: 0,
    };
  }

  // Add threat for a character. Called by combat system when damage
  // or healing is done.
  addThreat(characterId, amount) {
    if (!this.threatTable) this._initThreatTable();
    if (this.threatTable[characterId] !== undefined) {
      this.threatTable[characterId] += amount;
    }
  }

  // Returns the character id with the highest current threat.
  getHighestThreatTarget() {
    if (!this.threatTable) this._initThreatTable();
    let highestId     = 'tank';
    let highestAmount = -1;
    for (const [id, amount] of Object.entries(this.threatTable)) {
      if (amount > highestAmount) {
        highestAmount = amount;
        highestId     = id;
      }
    }
    return highestId;
  }

  // Update all threat meter bars to reflect current threat values.
  // Called after any threat change.
  _updateThreatMeters() {
    if (!this.threatTable) return;

    // Total threat across all characters - used to compute each bar's share
    const total = Object.values(this.threatTable).reduce((sum, v) => sum + v, 0);
    if (total <= 0) return;

    for (const [id, amount] of Object.entries(this.threatTable)) {
      const slot = this.entitySlots[id];
      if (!slot?.threatBar) continue;
      const pct = amount / total;
      this.tweens.add({
        targets:  slot.threatBar.fill,
        width:    slot.threatBar.maxWidth * pct,
        duration: 300,
        ease:     'Sine.easeOut',
      });
      if (slot.threatBar.valueText) {
        slot.threatBar.valueText.setText(Math.round(pct * 100) + '%');
      }
    }
  }

  // ====================
  // Fires playPlayerAutoAttack() every <attackSpeed> ticks as defined
  // in the player JSON data. attackSpeed: 2 = every 2 ticks, etc.
  _tickPlayerAutoAttack() {
    const playerData = this.entitySlots.player?._data;
    if (!playerData) return;
    if ((this.entitySlots.player?.currentHealth ?? 0) <= 0) return;

    const attackSpeed = Math.round(playerData.stats?.attackSpeed ?? 2);
    if (this.tickCount % attackSpeed === 0) {
      // console.log('[Player] Auto-attack tick', this.tickCount, 'speed', attackSpeed);
      this.playPlayerAutoAttack();
    }
  }

  playPlayerAutoAttack() {
    const slot = this.entitySlots.player;
    if (!slot?.sprite) return;

    // Do not interrupt a cast or attack already in progress
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key !== 'shaman_idle' && slot.sprite.anims.isPlaying) return;

    if (!this.anims.exists('shaman_attack')) return;

    slot.sprite.play('shaman_attack');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('shaman_idle')) slot.sprite.play('shaman_idle');
    });

    // Deal damage to boss and generate threat
    const playerData  = slot._data;
    const damageRange = playerData?.stats?.damageRange ?? [50, 100];
    const damage      = Phaser.Math.Between(damageRange[0], damageRange[1]);
    this._applyDamageToBoss(damage, 'icon_autoAttack');
    this.addThreat('player', damage);
    this._updateThreatMeters();
    // console.log('[Player] Auto-attack for', damage, '-> threat', damage);
  }

  // ================================
  // Hit reaction animations
  // ================================
  // Called by combat system when a character takes a successful hit.
  // Plays the hit animation once then returns to idle.

  playPlayerHit() {
    const slot = this.entitySlots.player;
    if (!slot?.sprite || !this.anims.exists('shaman_hit')) return;
    slot.sprite.play('shaman_hit');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('shaman_idle')) slot.sprite.play('shaman_idle');
    });
  }

  playTankHit() {
    const slot = this.entitySlots.tank;
    if (!slot?.sprite || !this.anims.exists('tank_hit')) return;
    // Do not interrupt attack already in progress
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key === 'tank_attack' && slot.sprite.anims.isPlaying) return;
    slot.sprite.play('tank_hit');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('tank_idle')) slot.sprite.play('tank_idle');
    });
  }

  playHealerHit() {
    const slot = this.entitySlots.healer;
    if (!slot?.sprite || !this.anims.exists('druid_hit')) return;
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key === 'druid_casting' && slot.sprite.anims.isPlaying) return;
    slot.sprite.play('druid_hit');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('druid_idle')) slot.sprite.play('druid_idle');
    });
  }

  // ================================
  // Healer cast animation
  // ================================
  // Called by combat system when the healer casts a spell.
  playHealerCast() {
    const slot = this.entitySlots.healer;
    if (!slot?.sprite || !this.anims.exists('druid_casting')) return;
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key === 'druid_casting' && slot.sprite.anims.isPlaying) return;
    slot.sprite.play('druid_casting');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('druid_idle')) slot.sprite.play('druid_idle');
    });
  }

  // ================================
  // Boss special ability: Wrath of Ragnaros
  // ================================
  // Called by combat system when Ragnaros uses Wrath of Ragnaros.
  // Plays the wrath animation, shows dialogue, plays sound,
  // then returns to idle.
  playBossWrath() {
    const slot    = this.entitySlots.boss;
    const animKey = this._getBossAnimKey('wrath');
    if (!slot?.sprite || !animKey) return;

    // Do not interrupt wrath already in progress
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key === animKey && slot.sprite.anims.isPlaying) return;

    const idleKey = this._getBossAnimKey('idle');
    slot.sprite.play(animKey);
    slot.sprite.once('animationcomplete', () => {
      if (idleKey && this.anims.exists(idleKey)) slot.sprite.play(idleKey);
    });

    // Dialogue and sound from JSON
    this.showAbilityDialogue('wrath_of_ragnaros');

    // Badge on boss
    const uiForWrath = this.scene.get('UIScene');
    if (uiForWrath?.spawnAbilityBadge) {
      const name = this.levelData?.abilities?.['wrath_of_ragnaros']?.name ?? 'Wrath of Ragnaros';
      uiForWrath.spawnAbilityBadge(window.GAME_CONFIG.ZONES.BOSS, 'wrath_of_ragnaros', name);
    }
  }

  // ====================
  // Tank auto-attack
  // ====================
  // Fires playTankAutoAttack() every <attackSpeed> ticks as defined
  // in the player JSON data. attackSpeed: 2 = every 2 ticks, etc.
  _tickTankAutoAttack() {
    const tankData = this.entitySlots.tank?._data;
    if (!tankData) return;
    if ((this.entitySlots.tank?.currentHealth ?? 0) <= 0) return;

    const attackSpeed = Math.round(tankData.stats?.attackSpeed ?? 2);
    if (this.tickCount % attackSpeed === 0) {
      // console.log('[Tank] Auto-attack tick', this.tickCount, 'speed', attackSpeed);
      this.playTankAutoAttack();
    }
  }

  playTankAutoAttack() {
    const slot = this.entitySlots.tank;
    if (!slot?.sprite) return;

    // Do not interrupt a cast or attack already in progress
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key !== 'tank_idle' && slot.sprite.anims.isPlaying) return;

    if (!this.anims.exists('tank_attack')) return;

    slot.sprite.play('tank_attack');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('tank_idle')) slot.sprite.play('tank_idle');
    });

    // Deal damage to boss and generate threat
    // Tanks generate 1.5x threat from physical attacks (WoW taunt mechanic)
    const tankData    = slot._data;
    const damageRange = tankData?.stats?.damageRange ?? [100, 200];
    const damage      = Phaser.Math.Between(damageRange[0], damageRange[1]);
    const TANK_THREAT_MULTIPLIER = 3.0;
    this._applyDamageToBoss(damage, 'icon_autoAttack');
    this.addThreat('tank', Math.round(damage * TANK_THREAT_MULTIPLIER));
    this._updateThreatMeters();
    // console.log('[Tank] Auto-attack for', damage, '-> threat', Math.round(damage * TANK_THREAT_MULTIPLIER));
  }

  // ====================
  // Tank AI
  // ====================
  // Fires tank abilities on actionInterval ticks.
  // Generates threat based on each ability's threatPerDamage from the JSON.
  // Priority: Consecration > Holy Shield > Judgement of Righteousness > Judgement of Wisdom
  _tickTankAbilities() {
    const tankSlot = this.entitySlots.tank;
    if (!tankSlot?._data) return;
    if ((tankSlot.currentHealth ?? 0) <= 0) return;

    const actionInterval = tankSlot._data.stats?.actionInterval ?? 4;
    if (this.tickCount % actionInterval !== 0) return;

    // Do not cast while attack animation is playing
    const current = tankSlot.sprite?.anims?.currentAnim;
    if (current && current.key === 'tank_attack' && tankSlot.sprite.anims.isPlaying) return;

    const abilities = this.levelData?.abilities ?? {};

    // Initialize per-ability cooldown tracker
    if (!this.tankAbilityCooldowns) this.tankAbilityCooldowns = {};

    const now = Date.now();

    // Ordered priority list - first one off cooldown with enough mana fires
    const priorityList = [
      'holy_shield',
      'consecration',
      'judgement_of_wisdom',
      'judgement_of_righteousness',
    ];

    const tankMana    = tankSlot.currentMana ?? (tankSlot.manaBar?.maxValue ?? 0);
    const tankMaxMana = tankSlot.manaBar?.maxValue ?? 1;

    for (const abilityId of priorityList) {
      const ability = abilities[abilityId];
      if (!ability) continue;

      // Check mana
      if (ability.manaCost > tankMana) continue;

      // Check cooldown
      const lastUsed  = this.tankAbilityCooldowns[abilityId] ?? 0;
      const recastMs  = (ability.recastTimer ?? 0) * 1000;
      if (now - lastUsed < recastMs) continue;

      // Fire this ability
      this.tankAbilityCooldowns[abilityId] = now;

      // Deduct mana
      tankSlot.currentMana = Math.max(0, tankMana - ability.manaCost);
      this._setManaBar(tankSlot.manaBar, tankSlot.currentMana / tankMaxMana);
      this._recordCast('tank');

      // Calculate and add threat
      let threat = 0;

      if (ability.immediateFlag && ability.immediateEffect?.type === 'damage') {
        // Direct damage ability - deal damage and generate threat
        const dmg     = ability.immediateEffect.value;
        const iconKey = this.textures.exists('icon_' + abilityId) ? 'icon_' + abilityId : 'icon_autoAttack';
        this._applyDamageToBoss(dmg, iconKey);
        threat = dmg * (ability.threatPerDamage ?? 1.0);
      } else if (ability.tickEffect?.type === 'damage' && ability.duration > 0) {
        // DoT ability (Consecration) - deal damage each tick and generate threat
        const tickDmg    = ability.tickEffect.value;
        const totalTicks = ability.duration;
        const iconKey    = this.textures.exists('icon_' + abilityId) ? 'icon_' + abilityId : 'icon_autoAttack';
        let   ticksFired = 0;
        const dotTimer   = this.time.addEvent({
          delay:    window.GAME_CONFIG.TICK_MS,
          loop:     true,
          callback: () => {
            ticksFired++;
            this._applyDamageToBoss(tickDmg, iconKey);
            if (ticksFired >= totalTicks || !this.gameRunning) dotTimer.remove();
          },
        });
        threat = tickDmg * totalTicks * (ability.threatPerDamage ?? 1.0);
      } else if (ability.immediateEffect?.type === 'apply_buff' && abilityId === 'holy_shield') {
        // Holy Shield - activate the reactive block buff on the tank
        const eff      = ability.immediateEffect;
        const durationMs = (eff.duration ?? 10) * 1000;
        this.entitySlots.tank.holyShield = {
          active:     true,
          charges:    eff.charges     ?? 4,
          blockChance: eff.blockChance ?? 30,
          blockDamage: eff.blockDamage ?? 59,
          blockThreatMultiplier: eff.blockThreatMultiplier ?? 1.35,
          expiresAt:  Date.now() + durationMs,
        };
        // Schedule deactivation
        this.time.delayedCall(durationMs, () => {
          if (this.entitySlots.tank?.holyShield) {
            this.entitySlots.tank.holyShield.active = false;
          }
        });
        // Small activation threat
        threat = 50 * (ability.threatPerDamage ?? 1.3);
        console.log('[Tank] Holy Shield active - charges:', eff.charges ?? 4);
        this._emitBuffUpdate('tank');
      } else {
        // Other buff/utility abilities - flat threat only
        threat = 200 * (ability.threatPerDamage ?? 0.5);
      }

      this.addThreat('tank', Math.round(threat));
      this._updateThreatMeters();

      // Play attack animation for damage abilities
      if (ability.immediateFlag && ability.immediateEffect?.type === 'damage') {
        this.playTankAutoAttack();
      }

      console.log('[Tank] Ability:', abilityId, '-> threat', Math.round(threat),
        '| mana remaining:', tankSlot.currentMana);

      // Badge on tank showing the ability used
      const uiForTank = this.scene.get('UIScene');
      if (uiForTank?.spawnAbilityBadge) {
        const abilityName = this.levelData?.abilities?.[abilityId]?.name ?? abilityId;
        uiForTank.spawnAbilityBadge(window.GAME_CONFIG.ZONES.TANK, abilityId, abilityName);
      }

      // Only one ability per action interval
      break;
    }
  }

  // ============
  // STOPS GAME
  // ============
  stopGame() {
    this.gameRunning = false;
    if (this.tickTimer) this.tickTimer.remove();
  }

  // ============
  // PLAYER INPUT
  // ============
  // ============================
  // Player spell casting
  // ============================
  // Handles mana cost, damage, threat, and animation for player spells.
  // Chain Lightning fires hitCount separate hits each rolling independently.
  _castPlayerSpell(abilityId, animKey) {
    const playerSlot = this.entitySlots.player;
    if (!playerSlot) return;

    const ability    = this.levelData?.abilities?.[abilityId];
    if (!ability) return;

    // Block if casting animation already playing
    const current = playerSlot.sprite?.anims?.currentAnim;
    if (current && current.key !== 'shaman_idle' && current.key !== 'shaman_attack'
        && playerSlot.sprite.anims.isPlaying) return;

    // Check mana
    const maxMana = playerSlot.manaBar?.maxValue ?? 1;
    const mana    = playerSlot.currentMana ?? maxMana;
    if (mana < ability.manaCost) {
      console.log('[Player] Not enough mana for', abilityId, '-', mana, '/', ability.manaCost);
      return;
    }

    // Deduct mana
    playerSlot.currentMana = Math.max(0, mana - ability.manaCost);
    this._setManaBar(playerSlot.manaBar, playerSlot.currentMana / maxMana);
    this._recordCast('player');

    // Play cast animation
    this.playPlayerCast(animKey);

    // Deal damage after a short cast delay so it lands with the animation
    const hitCount = ability.hitCount ?? 1;
    const minDmg   = ability.immediateMin ?? ability.immediateEffect?.value ?? 0;
    const maxDmg   = ability.immediateMax ?? ability.immediateEffect?.value ?? 0;

    for (let hit = 0; hit < hitCount; hit++) {
      // Stagger Chain Lightning hits slightly so numbers don't stack
      this.time.delayedCall(hit * 200, () => {
        if ((this.entitySlots.boss?.currentHealth ?? 0) <= 0) return;
        const damage = Phaser.Math.Between(minDmg, maxDmg);
        this._applyDamageToBoss(damage, 'icon_' + abilityId);
        this.addThreat('player', Math.round(damage * (ability.threatPerDamage ?? 1.0)));
        this._updateThreatMeters();
        console.log('[Player]', abilityId, 'hit', hit + 1, 'of', hitCount, 'for', damage);
      });
    }
  }

  _onPlayerAbility(abilityId) {
    console.log('[GameScene] Ability:', abilityId);
    this._recordCast('player');

    if (abilityId === 'lightning_bolt')  this._castPlayerSpell('lightning_bolt',  'shaman_cast_lightning');
    if (abilityId === 'chain_lightning') this._castPlayerSpell('chain_lightning', 'shaman_cast_chain');

    // Badge on player showing the ability used
    const uiForPlayer = this.scene.get('UIScene');
    if (uiForPlayer?.spawnAbilityBadge) {
      const abilityName = this.levelData?.abilities?.[abilityId]?.name ?? abilityId;
      uiForPlayer.spawnAbilityBadge(window.GAME_CONFIG.ZONES.PLAYER, abilityId, abilityName);
    }

    const totemSlots = {
      'strength_of_earth_totem': 'earth',
      'grounding_totem':         'earth',
      'totem_of_wrath':          'fire',
      'windfury_totem':          'air',
      'wrath_of_air_totem':      'air',
    };
    if (totemSlots[abilityId]) {
      this.playTotemPlacement(totemSlots[abilityId]);
    }

    // Show any dialogue defined for this ability in the JSON
    this.showAbilityDialogue(abilityId);
  }

  // Called by the combat system when the boss uses an ability.
  // Triggers the ability's dialogue if defined.
  onBossAbilityUsed(abilityId) {
    this.showAbilityDialogue(abilityId);
  }

  // Called by the combat system when a phase transition occurs.
  // Triggers the phase's dialogue sequence if defined.
  onPhaseChange(phaseId) {
    const phase = this.levelData?.boss?.phases?.find(p => p.id === phaseId);
    if (phase) {
      this.showPhaseDialogue(phase);
      this.scene.get('UIScene').events.emit('phase-change', phase.label || phaseId);
    }
  }
}
