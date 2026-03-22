/**
 * GameScene.js
 *
 * The main game scene.
 *
 * All boss sprite keys, scale, blend mode, and animation definitions
 * are read from levelData (the JSON). No boss-specific strings are
 * hardcoded here. Adding a new boss means writing a new JSON file only.
 */
const Phaser = window.Phaser; // Phaser is loaded via <script> in index.html;

import { loadSaveData, saveSaveData, recordBossDefeat } from '../utils/saveData.js';

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

    // Tracks active boss DoT timers per character so they can be cancelled
    // on death or Rebirth: { player: [timer,...], tank: [...], healer: [...] }
    this.activeDots = { player: [], tank: [], healer: [] };
    this.bossDamageMultiplier = 1;

    // Per-caster ability cooldown tracker: { casterId: { abilityId: lastUsedTick } }
    // Character abilities use recastTicks so cooldowns are compared in tick units.
    this.charAbilityCooldowns = { player: {}, tank: {}, healer: {} };

    // Active HoTs per character: { characterId: { hotId: { stacks, tickHeal, ticksLeft, timer } } }
    // Written by _applyHoT(), read by _emitBuffUpdate(), consumed by spirit_surge.
    this.charHoTs = { player: {}, tank: {}, healer: {} };

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
    this._buildCharacterSlot('healer', ZONES.HEALER, 0xa0ff69, 'Healer', 'healer_idle', 'healer_idle');
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
    // Sheet: 3x4 grid, 12 frames each 256x256 - all idle
    this._safeCreateAnim({
      key:       'shaman_idle',
      frames:    anims.generateFrameNumbers('shaman_idle', { start: 0, end: 10 }),
      frameRate: 10,
      repeat:    -1,
    }, 'shaman_idle');

    // Auto-attack: 1024x768, 4x3 = 11 frames (last row has 3), plays once
    this._safeCreateAnim({
      key:       'shaman_attack',
      frames:    anims.generateFrameNumbers('shaman_attack', { start: 0, end: 11 }),
      frameRate: 10,
      repeat:    0,
    }, 'shaman_attack');

    // this._safeCreateAnim({
    //   key:       'shaman_cast_static_burst',
    //   frames:    anims.generateFrameNumbers('shaman_lightning', { start: 0, end: 2 }),
    //   frameRate: 10,
    //   repeat:    0,
    // }, 'shaman_lightning');

    // this._safeCreateAnim({
    //   key:       'shaman_cast_arc_lightning',
    //   frames:    anims.generateFrameNumbers('shaman_chain', { start: 0, end: 3 }),
    //   frameRate: 10,
    //   repeat:    0,
    // }, 'shaman_chain');  

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

    // // Totem placement: 1024x768, 4x3 = 12 frames, plays once then returns to idle
    // this._safeCreateAnim({
    //   key:       'shaman_totem',
    //   frames:    anims.generateFrameNumbers('shaman_totem', { start: 0, end: 11 }),
    //   frameRate: 12,
    //   repeat:    0,
    // }, 'shaman_totem');

    // =====================
    // TANK ANIMATIONS
    // =====================
    // Idle: 1536x1024 sheet, 4 cols x 3 rows = 12 frames at 384x384
    this._safeCreateAnim({
      key:       'tank_idle',
      frames:    anims.generateFrameNumbers('tank_idle', { start: 0, end: 7 }),
      frameRate: 8,
      repeat:    -1,
    }, 'tank_idle');
    
    // // Attack: 1024x1024, 4x4 = 16 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'tank_attack',
      frames:    anims.generateFrameNumbers('tank_attack', { start: 0, end: 15 }),
      frameRate: 12,
      repeat:    0,
    }, 'tank_attack');

    // // Hit: 1024x768, 4x3 = 12 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'tank_hit',
      frames:    anims.generateFrameNumbers('tank_hit', { start: 0, end: 11 }),
      frameRate: 12,
      repeat:    0,
    }, 'tank_hit');

    // Judgement spell - uncomment when tank_judge.png is finalized
    this._safeCreateAnim({
      key:       'tank_judge',
      frames:    anims.generateFrameNumbers('tank_judge', { start: 0, end: 15 }),
      frameRate: 12,
      repeat:    0,
    }, 'tank_judge');

    // Consecration spell - uncomment when tank_consecrate.png is finalized
    this._safeCreateAnim({
      key:       'tank_consecrate',
      frames:    anims.generateFrameNumbers('tank_consecrate', { start: 0, end: 15 }),
      frameRate: 8,
      repeat:    0,
    }, 'tank_consecrate');

    // =====================
    // HEALER ANIMATIONS
    // =====================
    // Idle: 1024x768, 4x3 = 12 frames at 256x256
    this._safeCreateAnim({
      key:       'healer_idle',
      frames:    anims.generateFrameNumbers('healer_idle', { start: 0, end: 11 }),
      frameRate: 10,
      repeat:    -1,
    }, 'healer_idle');

    // Healer attack
    this._safeCreateAnim({
      key:       'healer_attack',
      frames:    anims.generateFrameNumbers('healer_attack', { start: 0, end: 15 }),
      frameRate: 12,
      repeat:    0,
    }, 'healer_attack');

    // Casting: 1024x768, 4x3 = 12 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'healer_casting',
      frames:    anims.generateFrameNumbers('healer_casting', { start: 0, end: 11 }),
      frameRate: 12,
      repeat:    0,
    }, 'healer_casting');

    // // Hit: 1024x1024, 4x4 = 16 frames, plays once then returns to idle
    this._safeCreateAnim({
      key:       'healer_hit',
      frames:    anims.generateFrameNumbers('healer_hit', { start: 0, end: 15 }),
      frameRate: 12,
      repeat:    0,
    }, 'healer_hit');

    // =====================
    // TOTEM ANIMATIONS
    // =====================
    // Totems - shared, not level-specific
    // totem_earth: 512x384, 4x3 = 12 frames at 128x128
    // Other totems uncommented as their sheets become available
    // this._safeCreateAnim({
    //   key:       'totem_earth_pulse',
    //   frames:    anims.generateFrameNumbers('totem_earth', { start: 0, end: 11 }),
    //   frameRate: 8,
    //   repeat:    -1,
    //   yoyo:      true,
    // }, 'totem_earth');
    // this._safeCreateAnim({ key: 'totem_fire_pulse',  frames: anims.generateFrameNumbers('totem_fire',  { start: 0, end: 11 }), frameRate: 8, repeat: -1, yoyo: true }, 'totem_fire');
    // this._safeCreateAnim({ key: 'totem_air_pulse',   frames: anims.generateFrameNumbers('totem_air',   { start: 0, end: 11 }), frameRate: 8, repeat: -1, yoyo: true }, 'totem_air');
    // this._safeCreateAnim({ key: 'totem_water_pulse', frames: anims.generateFrameNumbers('totem_water', { start: 0, end: 11 }), frameRate: 8, repeat: -1, yoyo: true }, 'totem_water');

    // =====================
    // DEFEAT ANIMATIONS
    // =====================
    // Character defeat sheets - always preloaded by PreloadScene
    ['shaman_defeated', 'healer_defeated', 'tank_defeated'].forEach(key => {
      this._safeCreateAnim({
        key:       key,
        frames:    anims.generateFrameNumbers(key, { start: 0, end: 15 }),
        frameRate: 10,
        repeat:    0,
      }, key);
    });

    // Boss defeated animation - key is injected by BossLoadingScene from the catalog.
    // Each boss has its own defeated spritesheet so we register it here from levelData.
    const bossDefeatedAnim = this.levelData?.boss?.animations?.defeated;
    if (bossDefeatedAnim?.key && this.textures.exists(bossDefeatedAnim.key)) {
      this._safeCreateAnim({
        key:       bossDefeatedAnim.key,
        frames:    anims.generateFrameNumbers(bossDefeatedAnim.key, {
          start: bossDefeatedAnim.startFrame ?? 0,
          end:   bossDefeatedAnim.endFrame   ?? 15,
        }),
        frameRate: bossDefeatedAnim.frameRate ?? 10,
        repeat:    0,
      }, bossDefeatedAnim.key);
    }

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
    const cx = ((zone.x + zone.w / 2) + 160);
    const cy = ((zone.y + zone.h / 2) + 200);

    // All boss sprite config comes from the JSON
    const bossData   = this.levelData?.boss;
    const requestedSpriteKey = bossData?.spriteKey;
    const spriteKey  = requestedSpriteKey;
    const spriteScale = bossData?.spriteScale || 3;
    const idleAnimKey = bossData ? bossData.id + '_idle' : 'default_idle';

    const panelW = 600;
    const panelH = 80;
    const panelY = zone.y + 90;

    const nameText = this.add.text(cx, zone.y + zone.h - 550, bossData?.name || '???', {
      fontFamily: 'monospace', fontSize: '56px', color: '#ff6644',
    }).setOrigin(0.5, 1);

    nameText.updateText();  // force Phaser to measure the text immediately
    console.log(">>>> nameText:", nameText)
    console.log(">>>> nameText.width:", nameText.width)

    const padding = 24;
    const textW = nameText.width + padding * 2;
    const textH = nameText.height + padding;

    const titlePanel = this.add.graphics();
    titlePanel.fillStyle(0x000000, 0.65);
    titlePanel.fillRect(cx - textW / 2, nameText.y - nameText.height - padding / 2, textW, textH);
    titlePanel.lineStyle(3, 0x6622a6, 1.0);
    titlePanel.strokeRect(cx - textW / 2, nameText.y - nameText.height - padding / 2, textW, textH);

    nameText.setDepth(1);

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

    // const hpBar = this._buildBossHealthBar(cx, zone.y + zone.h - 875, panelW, 48, 0xff3300);
    const hpBar = this._buildBossHealthBar(cx, nameText.y + 40, panelW, 48, 0xff3300);


    this.entitySlots.boss = { sprite: bossSprite, nameText, hpBar };
  }

  // ===========
  // Player slot
  // ===========
  _buildPlayerSlot(zone) {
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h - 80;

    const sprite = this.add.sprite(cx, cy + 90, 'shaman_idle', 0)
      .setScale(1.25)
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
    const cy = ((zone.y + zone.h - 80) + 145);

    let sprite;

    sprite = this.add.sprite(cx, cy, spriteKey, 0)
      .setScale(1.25)
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
    const animKey = this._getBossAnimKey('attacking');
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
    const raw   = this.levelData?.boss?.dialog?.intro
                  || this.levelData?.boss?.openingDialogue
                  || 'YOU DARE CHALLENGE ME?!';
    const fadeMs = 350;
    const lines = Array.isArray(raw) ? raw : [raw];
    const holdMs = this.levelData?.boss?.audioDuration ?? 6000;
    const holdPerLine = Math.max(500, (holdMs / lines.length) - (fadeMs * 2));

    // TODO: Uncomment this
    this._playSound(this.levelData?.boss?.openingSound);

    // Pass an onComplete callback so the ticker starts only after
    // the last intro line finishes - guaranteeing no overlap.
    // this.showDialogueSequence(lines, '#ff9944', holdPerLine, 350, () => {
    //   const delay = window.GAME_CONFIG.TICK_MS;
    //   console.log('[GameScene] Intro finished - starting ticker, delay:', delay, 'ms');
    //   this._startTicker(delay);
    // });

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
        fontSize:   '42px',
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

    const raw   = bossData?.dialog?.defeat
                  || bossData?.deathDialogue
                  || 'I AM... DEFEATED.';
    const lines = Array.isArray(raw) ? raw : [raw];
    this.showDialogueSequence(lines, '#aaaaaa');

    const slot = this.entitySlots.boss;
    if (slot?.sprite) {
      // Try animations.defeated.key first (injected by BossLoadingScene from catalog),
      // then fall back to the legacy _getBossAnimKey('death') lookup
      const defeatedKey = this.levelData?.boss?.animations?.defeated?.key;
      const deathKey    = (defeatedKey && this.anims.exists(defeatedKey))
                          ? defeatedKey
                          : this._getBossAnimKey('death');

      if (deathKey && this.anims.exists(deathKey)) {
        slot.sprite.play(deathKey);
        slot.sprite.once('animationcomplete', () => {
          this.tweens.add({ targets: slot.sprite, alpha: 0, duration: 800 });
        });
      } else {
        // Fallback fade if no defeat sheet loaded yet for this boss
        this.tweens.add({ targets: slot.sprite, alpha: 0, duration: 1500 });
      }
    }

    this._onBossDefeated();
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
    console.log("[Boss] Attacking");
    if (this.bossDialoguePlaying) return;
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
    if (this.bossDebuffs?.silenced) return;   // ensnare / debuff

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
      healer: 'healer_defeated',
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
        this.showPopup('DEFEAT', '#ff2222', 3000);
        this._onPartyWiped();
      });
    }
  }

  // =====================================
  // Buff bar state emitter
  // =====================================
  // Reads charHoTs for a character and emits a 'buff-update' event to UIScene
  // with the current list of active effects. Call whenever charHoTs changes.
  _emitBuffUpdate(characterId) {
    const effects = [];

    // Active HoTs from the new charHoTs system
    const hots = this.charHoTs?.[characterId] ?? {};
    for (const [hotId, hot] of Object.entries(hots)) {
      // Map hotId (e.g. 'renew_hot') back to the ability name for icon lookup.
      // Convention: hotId is <abilityId>_hot, so strip the suffix for the icon key.
      const abilityId = hotId.replace(/_hot$/, '');
      effects.push({ abilityId, stacks: hot.stacks ?? 1, ticksLeft: hot.ticksLeft ?? 0 });
    }

    // Holy Shield -- legacy tank buff kept for back-compat until fully migrated
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
    // Cancel and clear all active HoT timers on this character
    const hots = this.charHoTs?.[characterId] ?? {};
    for (const hot of Object.values(hots)) {
      if (hot.timer) { try { hot.timer.remove(); } catch(e) {} }
    }
    if (this.charHoTs) this.charHoTs[characterId] = {};

    // Cancel active boss DoT timers (applied by _fireBossAbility)
    this._cancelDotsOnCharacter(characterId);

    // Clear buff bar display
    this._emitBuffUpdate(characterId);
  }

  // =====================================
  // CHARACTER ABILITY ENGINE  (new effects[] schema)
  // =====================================

  // Maps an ability's targetType to an array of slot IDs to apply effects to.
  _resolveAbilityTargets(casterId, ability) {
    const aliveIds = ['player', 'tank', 'healer'].filter(
      id => (this.entitySlots[id]?.currentHealth ?? 0) > 0
    );
    const deadIds = ['player', 'tank', 'healer'].filter(
      id => (this.entitySlots[id]?.currentHealth ?? 0) <= 0
    );

    switch (ability.targetType) {
      case 'self':
        return [casterId];
      case 'single_boss':
      case 'current_target':
        return ['boss'];
      case 'all_bosses':
        return ['boss'];
      case 'random_multi_boss':
        return ['boss'];
      case 'ally_lowest_hp': {
        let target = null, lowestPct = Infinity;
        for (const id of aliveIds) {
          const s   = this.entitySlots[id];
          const pct = (s?.currentHealth ?? 1) / (s?.hpBar?.maxValue ?? 1);
          if (pct < lowestPct) { lowestPct = pct; target = id; }
        }
        return target ? [target] : [];
      }
      case 'ally_lowest_mana': {
        let target = null, lowestPct = Infinity;
        for (const id of aliveIds) {
          const s   = this.entitySlots[id];
          const pct = (s?.currentMana ?? 1) / (s?.manaBar?.maxValue ?? 1);
          if (pct < lowestPct) { lowestPct = pct; target = id; }
        }
        return target ? [target] : [];
      }
      case 'ally_dead':
        return deadIds.length ? [deadIds[0]] : [];
      case 'ally_with_hot': {
        for (const id of aliveIds) {
          if (Object.keys(this.charHoTs?.[id] ?? {}).length > 0) return [id];
        }
        return [];
      }
      default:
        return [];
    }
  }

  // Loops effects[] and routes each entry to its handler.
  // effectResults[] lets later effects reference earlier resolved values.
  _dispatchEffects(casterId, ability, targets) {
    const TICK_MS      = window.GAME_CONFIG.TICK_MS;
    const casterSlot   = this.entitySlots[casterId];
    const casterData   = casterSlot?._data;
    const critChance   = casterData?.stats?.critChance    ?? 0;
    const critMult     = casterData?.stats?.critMultiplier ?? 2.0;
    const iconKey      = 'icon_' + (ability.iconId ?? ability.id);
    const effectResults = [];

    for (let i = 0; i < (ability.effects?.length ?? 0); i++) {
      const eff = ability.effects[i];

      switch (eff.type) {

        case 'damage': {
          let dmg = Phaser.Math.Between(eff.min, eff.max);
          if (ability.canCrit && Math.random() * 100 < critChance) {
            dmg = Math.round(dmg * critMult);
          }
          for (const tid of targets) {
            if (tid === 'boss') {
              this._applyDamageToBoss(dmg, iconKey);
              this.addThreat(casterId, Math.round(dmg));
              this._updateThreatMeters();
            }
          }
          effectResults[i] = dmg;
          break;
        }

        case 'self_damage': {
          const sourceVal = effectResults[eff.sourceEffect ?? 0] ?? 0;
          const selfDmg   = Math.round(sourceVal * (eff.amountPct ?? 0));
          if (selfDmg > 0) {
            this._applyDamageToCharacter(casterId, selfDmg, iconKey);
            console.log('[' + casterId + '] ' + ability.id + ' self-damage: ' + selfDmg);
          }
          effectResults[i] = selfDmg;
          break;
        }

        case 'heal': {
          for (const tid of targets.filter(t => t !== 'boss')) {
            let amount;
            if (eff.amountPct && eff.of === 'target_max_health') {
              amount = Math.round((this.entitySlots[tid]?.hpBar?.maxValue ?? 1) * eff.amountPct);
            } else {
              amount = Phaser.Math.Between(eff.min, eff.max);
            }
            if (ability.canCrit && Math.random() * 100 < critChance) {
              amount = Math.round(amount * critMult);
            }
            this._applyHealToCharacter(tid, amount, ability.id);
            this.addThreat(casterId, Math.round(amount * 0.1));
            this._updateThreatMeters();
          }
          break;
        }

        case 'heal_over_time': {
          for (const tid of targets.filter(t => t !== 'boss')) {
            this._applyHoT(casterId, ability, eff, tid);
          }
          break;
        }

        case 'mana_over_time': {
          for (const tid of targets.filter(t => t !== 'boss')) {
            this._applyMoT(casterId, ability, eff, tid);
          }
          break;
        }

        case 'resurrect': {
          for (const tid of targets) {
            const slot = this.entitySlots[tid];
            if (!slot) continue;
            const maxHp  = slot.hpBar?.maxValue  ?? 1;
            const maxMp  = slot.manaBar?.maxValue ?? 1;
            const restHp = Math.round(maxHp * (eff.healthPct ?? 0.75));
            const restMp = Math.round(maxMp * (eff.manaPct   ?? 0.75));
            slot.currentHealth = restHp;
            slot.currentMana   = restMp;
            this._setHealthBar(slot.hpBar, restHp / maxHp);
            if (slot.manaBar) this._setManaBar(slot.manaBar, restMp / maxMp);
            if (slot.sprite) {
              slot.sprite.setAlpha(0);
              this.tweens.add({ targets: slot.sprite, alpha: 1, duration: 800 });
              if (tid === 'tank'   && this.anims.exists('tank_idle'))   slot.sprite.play('tank_idle');
              if (tid === 'player' && this.anims.exists('shaman_idle')) slot.sprite.play('shaman_idle');
              if (tid === 'healer' && this.anims.exists('healer_idle')) slot.sprite.play('healer_idle');
            }
            this.showPopup((slot._data?.name ?? tid) + ' returns to life!', '#aaffaa', 3000);
            console.log('[' + casterId + '] Awaken -> ' + tid, restHp + 'hp', restMp + 'mana');
          }
          break;
        }

        case 'consume_hot': {
          for (const tid of targets.filter(t => t !== 'boss')) {
            const hots    = this.charHoTs?.[tid] ?? {};
            const hotKeys = Object.keys(hots);
            if (!hotKeys.length) continue;
            const hotId   = hotKeys[0];
            const hotData = hots[hotId];
            const stacks  = hotData.stacks  ?? 1;
            const remaining = (hotData.ticksLeft ?? 0) * (hotData.tickHeal ?? 0) * stacks;
            if (hotData.timer) { try { hotData.timer.remove(); } catch(e) {} }
            delete this.charHoTs[tid][hotId];
            this._emitBuffUpdate(tid);
            if (remaining > 0) this._applyHealToCharacter(tid, remaining, ability.id);
            console.log('[' + casterId + '] Spirit Surge consumed ' + hotId + ' on ' + tid + ' for ' + remaining);
          }
          break;
        }

        case 'threat_override': {
          if (eff.action === 'set_max') {
            const allThreat = Object.values(this.threatTable ?? {});
            const maxThreat = (allThreat.length ? Math.max(...allThreat) : 0) + 10000;
            if (!this.threatTable) this.threatTable = {};
            this.threatTable[casterId] = maxThreat;
            this._updateThreatMeters();
            console.log('[' + casterId + '] Provoke -- threat set to ' + maxThreat);
          }
          break;
        }

        case 'buff': {
          const buffTargets = (eff.target === 'self') ? [casterId] : targets;
          const durationMs  = (eff.durationTicks ?? 0) * TICK_MS;
          for (const tid of buffTargets) {
            const slot = this.entitySlots[tid];
            if (!slot) continue;
            for (const mod of (eff.modifiers ?? [])) {
              if (mod.stat === 'blockChance' && mod.addFlat) {
                slot._bonusBlockChance = (slot._bonusBlockChance ?? 0) + mod.addFlat;
                this.time.delayedCall(durationMs, () => {
                  slot._bonusBlockChance = Math.max(0, (slot._bonusBlockChance ?? 0) - mod.addFlat);
                });
              }
            }
            if (eff.onHitReaction) {
              slot._onHitReaction = { ...eff.onHitReaction, expiresAt: Date.now() + durationMs };
              this.time.delayedCall(durationMs, () => { delete slot._onHitReaction; });
            }
          }
          this._emitBuffUpdate(casterId);
          break;
        }

        case 'debuff': {
          const durationMs = (eff.durationTicks ?? 0) * TICK_MS;
          for (const tid of targets) {
            if (tid !== 'boss') continue;
            if (!this.bossDebuffs) this.bossDebuffs = {};
            for (const mod of (eff.modifiers ?? [])) {
              if (mod.stat === 'canCastAbilities' && mod.value === false) {
                this.bossDebuffs.silenced = true;
                this.time.delayedCall(durationMs, () => {
                  if (this.bossDebuffs) delete this.bossDebuffs.silenced;
                });
                console.log('[' + casterId + '] Boss silenced for ' + eff.durationTicks + ' ticks');
              }
            }
          }
          break;
        }

        default:
          console.warn('[GameScene] Unknown effect type:', eff.type, 'on', ability.id);
      }
    }
  }

  // Apply a heal-over-time. Handles stacking (burgeon), reset-on-recast, bloom-on-expire.
  _applyHoT(casterId, ability, eff, targetId) {
    const TICK_MS = window.GAME_CONFIG.TICK_MS;
    const hotId   = eff.hotId ?? (ability.id + '_hot');

    if (!this.charHoTs[targetId]) this.charHoTs[targetId] = {};
    const existing = this.charHoTs[targetId][hotId];

    let stacks = 1;
    if (eff.stackable && existing) {
      stacks = Math.min((existing.stacks ?? 1) + 1, eff.maxStacks ?? 1);
    }
    if (existing?.timer) { try { existing.timer.remove(); } catch(e) {} }

    const tickHeal  = Phaser.Math.Between(eff.min, eff.max);
    let   ticksLeft = eff.durationTicks;

    const hotTimer = this.time.addEvent({
      delay: TICK_MS,
      loop:  true,
      callback: () => {
        if ((this.entitySlots[targetId]?.currentHealth ?? 0) <= 0) {
          hotTimer.remove();
          if (this.charHoTs[targetId]) delete this.charHoTs[targetId][hotId];
          this._emitBuffUpdate(targetId);
          return;
        }
        const curStacks = this.charHoTs[targetId]?.[hotId]?.stacks ?? 1;
        let   heal      = tickHeal * curStacks;
        const crit      = this.entitySlots[casterId]?._data?.stats?.critChance ?? 0;
        if (ability.canCrit && Math.random() * 100 < crit) {
          heal = Math.round(heal * (this.entitySlots[casterId]?._data?.stats?.critMultiplier ?? 2.0));
        }
        this._applyHealToCharacter(targetId, heal, ability.id);
        this.addThreat(casterId, Math.round(heal * 0.1));
        this._updateThreatMeters();

        ticksLeft--;
        if (this.charHoTs[targetId]?.[hotId]) {
          this.charHoTs[targetId][hotId].ticksLeft = ticksLeft;
          this._emitBuffUpdate(targetId);
        }

        if (ticksLeft <= 0 || !this.gameRunning) {
          hotTimer.remove();
          if (eff.onExpire && this.charHoTs[targetId]?.[hotId]) {
            const bloomStacks = this.charHoTs[targetId][hotId].stacks ?? 1;
            const bloomBase   = Phaser.Math.Between(
              eff.onExpire.min ?? eff.min,
              eff.onExpire.max ?? eff.max
            );
            const bloomHeal = bloomBase * (eff.onExpire.multiplier === 'stack_count' ? bloomStacks : 1);
            this._applyHealToCharacter(targetId, bloomHeal, ability.id);
            console.log('[' + casterId + '] ' + ability.id + ' bloom: ' + bloomHeal + ' (' + bloomStacks + 'x)');
          }
          if (this.charHoTs[targetId]) delete this.charHoTs[targetId][hotId];
          this._emitBuffUpdate(targetId);
        }
      },
    });

    this.charHoTs[targetId][hotId] = { stacks, tickHeal, ticksLeft, timer: hotTimer };
    this.addThreat(casterId, Math.round(tickHeal * eff.durationTicks * stacks * 0.1));
    this._updateThreatMeters();
    this._emitBuffUpdate(targetId);
    console.log('[' + casterId + '] ' + ability.id + ' HoT -> ' + targetId + ' (' + stacks + ' stack(s), ' + tickHeal + '/tick)');
  }

  // Apply a mana-over-time (quicken).
  _applyMoT(casterId, ability, eff, targetId) {
    const TICK_MS    = window.GAME_CONFIG.TICK_MS;
    const targetSlot = this.entitySlots[targetId];
    if (!targetSlot) return;
    const maxMana  = targetSlot.manaBar?.maxValue ?? 1;
    const duration = eff.durationTicks ?? 8;
    // "target_max_mana * 0.10 / 20"
    const tickRestore = eff.amountPerTick?.formula
      ? Math.round(maxMana * 0.10 / 20)
      : Math.round(eff.amountPerTick ?? 0);

    console.log('[' + casterId + '] Quicken -> ' + targetId + ' ' + tickRestore + '/tick x' + duration);
    let ticks = 0;
    const timer = this.time.addEvent({
      delay: TICK_MS, loop: true,
      callback: () => {
        ticks++;
        const cur = targetSlot.currentMana ?? maxMana;
        targetSlot.currentMana = Math.min(maxMana, cur + tickRestore);
        this._setManaBar(targetSlot.manaBar, targetSlot.currentMana / maxMana);
        const ui = this.scene.get('UIScene');
        if (ui?.spawnFloatingText) {
          const zone = window.GAME_CONFIG.ZONES[targetId.toUpperCase()];
          if (zone) ui.spawnFloatingText(zone, tickRestore, 'mana', 'icon_' + ability.id);
        }
        if (ticks >= duration || !this.gameRunning) timer.remove();
      },
    });
  }

  // Unified cast dispatcher for all three player characters.
  // Handles mana check, tick-based cooldown, target resolution, and effect dispatch.
  // Returns true if the ability fired successfully.
  _castCharacterAbility(casterId, abilityId) {
    const slot = this.entitySlots[casterId];
    if (!slot?._data) return false;
    if ((slot.currentHealth ?? 0) <= 0) return false;

    const ability = this.levelData?.abilities?.[abilityId];
    if (!ability?.effects) return false;

    const maxMana = slot.manaBar?.maxValue ?? 1;
    const mana    = slot.currentMana ?? maxMana;
    if (mana < (ability.manaCost ?? 0)) return false;

    if (!this.charAbilityCooldowns[casterId]) this.charAbilityCooldowns[casterId] = {};
    const lastUsed = this.charAbilityCooldowns[casterId][abilityId] ?? -Infinity;
    if (this.tickCount - lastUsed < (ability.recastTicks ?? 0)) return false;

    const targets = this._resolveAbilityTargets(casterId, ability);
    if (!targets.length) return false;

    // Commit
    slot.currentMana = Math.max(0, mana - (ability.manaCost ?? 0));
    this._setManaBar(slot.manaBar, slot.currentMana / maxMana);
    this.charAbilityCooldowns[casterId][abilityId] = this.tickCount;
    this._recordCast(casterId);

    this._dispatchEffects(casterId, ability, targets);

    if (casterId === 'tank')   this.playTankAutoAttack();
    if (casterId === 'healer') this.playHealerCast();
    if (casterId === 'player') this.playPlayerCast('shaman_cast_lightning');

    const zone = window.GAME_CONFIG.ZONES[casterId.toUpperCase()];
    const ui   = this.scene.get('UIScene');
    if (ui?.spawnAbilityBadge && zone) {
      ui.spawnAbilityBadge(zone, abilityId, ability.name ?? abilityId);
    }
    this.showAbilityDialogue(abilityId);

    console.log('[' + casterId + '] ' + abilityId + ' | mana: ' + slot.currentMana + '/' + maxMana);
    return true;
  }

  // =====================================
  // Healer AI
  // =====================================
  // Priority order for the druid healer using the new abilityIds schema:
  //   1. awaken        -- resurrect a dead ally immediately (once)
  //   2. quicken       -- mana restore for lowest-mana ally if any at <=25%
  //   3. spirit_surge  -- burst-cash a HoT if any ally is <=40% hp
  //   4. renew         -- immediate heal + HoT on lowest-hp ally if <=70%
  //   5. burgeon       -- stackable HoT if any ally <=85% and < 3 burgeon stacks
  //   6. sustain       -- cheap HoT if lowest-hp ally <=90%
  // OOM guard: skip all mana-costing spells if healer mana <= 15%
  _tickHealerAI() {
    const healerSlot = this.entitySlots.healer;
    if (!healerSlot?._data) return;
    if ((healerSlot.currentHealth ?? 0) <= 0) return;

    const actionInterval = healerSlot._data.stats?.actionInterval ?? 1;
    if (this.tickCount % actionInterval !== 0) return;

    const current = healerSlot.sprite?.anims?.currentAnim;
    if (current && current.key === 'healer_casting' && healerSlot.sprite.anims.isPlaying) return;

    const healerMaxMana = healerSlot.manaBar?.maxValue ?? 1;
    const healerManaPct = (healerSlot.currentMana ?? healerMaxMana) / healerMaxMana;

    // Helper: hp% for a slot
    const hpPct = id => {
      const s = this.entitySlots[id];
      return (s?.currentHealth ?? 0) / (s?.hpBar?.maxValue ?? 1);
    };
    const aliveIds  = ['player', 'tank', 'healer'].filter(id => (this.entitySlots[id]?.currentHealth ?? 0) > 0);
    const lowestHpId = aliveIds.reduce((best, id) => hpPct(id) < hpPct(best) ? id : best, aliveIds[0] ?? 'tank');

    // 1. Awaken -- dead ally
    if (this._castCharacterAbility('healer', 'awaken')) return;

    // 2. Quicken -- mana restore for lowest-mana ally at <=25%
    {
      let mnTarget = null, mnLowest = 0.25;
      for (const id of aliveIds) {
        const s   = this.entitySlots[id];
        const pct = (s?.currentMana ?? 1) / (s?.manaBar?.maxValue ?? 1);
        if (pct <= mnLowest) { mnLowest = pct; mnTarget = id; }
      }
      if (mnTarget) {
        // Temporarily override target resolution by patching targetType context --
        // quicken targets ally_lowest_mana so _resolveAbilityTargets will find it.
        if (this._castCharacterAbility('healer', 'quicken')) return;
      }
    }

    // OOM guard below this line
    if (healerManaPct < 0.15) return;

    // 3. Spirit Surge -- cash HoT on any ally <=40%
    if (aliveIds.some(id => hpPct(id) <= 0.40)) {
      if (this._castCharacterAbility('healer', 'spirit_surge')) return;
    }

    // 4. Renew -- immediate heal + HoT on lowest-hp ally if <=70%
    if (hpPct(lowestHpId) <= 0.70) {
      if (this._castCharacterAbility('healer', 'renew')) return;
    }

    // 5. Burgeon -- stackable HoT, up to 3 stacks, on any ally <=85%
    for (const id of aliveIds) {
      if (hpPct(id) > 0.85) continue;
      const burgeonStacks = (this.charHoTs[id]?.['burgeon_hot']?.stacks ?? 0);
      if (burgeonStacks < 3) {
        if (this._castCharacterAbility('healer', 'burgeon')) return;
      }
    }

    // 6. Sustain -- cheap rolling HoT if any ally <=90%
    if (aliveIds.some(id => hpPct(id) <= 0.90)) {
      if (this._castCharacterAbility('healer', 'sustain')) return;
    }
  }

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

  // Returns the character id with the highest current threat,
  // or a random character if all threat is zero.
  getHighestThreatTarget() {
    if (!this.threatTable) this._initThreatTable();
    const alive = ['tank', 'player', 'healer'].filter(
      id => (this.entitySlots[id]?.currentHealth ?? 0) > 0
    );
    if (!alive.length) return 'tank';
  
    // If all threat is zero, pick a random alive target
    const total = alive.reduce((sum, id) => sum + (this.threatTable[id] ?? 0), 0);
    if (total === 0) return alive[Phaser.Math.Between(0, alive.length - 1)];
  
    let highestId = alive[0];
    let highestAmount = -1;
    for (const id of alive) {
      const amount = this.threatTable[id] ?? 0;
      if (amount > highestAmount) {
        highestAmount = amount;
        highestId = id;
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
    console.log("[Player] Attacking");
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

    slot.sprite.setScale(1.25).play('shaman_attack');
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
    if (!slot?.sprite || !this.anims.exists('healer_hit')) return;
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key === 'healer_casting' && slot.sprite.anims.isPlaying) return;
    slot.sprite.play('healer_hit');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('healer_idle')) slot.sprite.play('healer_idle');
    });
  }

  // ================================
  // Healer cast animation
  // ================================
  // Called by combat system when the healer casts a spell.
  playHealerCast() {
    const slot = this.entitySlots.healer;
    if (!slot?.sprite || !this.anims.exists('healer_casting')) return;
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key === 'healer_casting' && slot.sprite.anims.isPlaying) return;
    slot.sprite.play('healer_casting');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('healer_idle')) slot.sprite.play('healer_idle');
    });
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
  // Healer auto-attack
  // ====================
  // Fires playHealerAutoAttack() every <attackSpeed> ticks as defined
  // in the player JSON data. attackSpeed: 2 = every 2 ticks, etc.
  _tickHealerAutoAttack() {
    const healerData = this.entitySlots.healer?._data;
    if (!healerData) return;
    if ((this.entitySlots.healer?.currentHealth ?? 0) <= 0) return;

    const attackSpeed = Math.round(healerData.stats?.attackSpeed ?? 2);
    if (this.tickCount % attackSpeed === 0) {
      console.log('[Healer] Auto-attack tick', this.tickCount, 'speed', attackSpeed);
      this.playHealerAutoAttack();
    }
  }

  playHealerAutoAttack() {
    const slot = this.entitySlots.healer;
    if (!slot?.sprite) return;

    // Do not interrupt a cast or attack already in progress
    const current = slot.sprite.anims.currentAnim;
    if (current && current.key !== 'healer_idle' && slot.sprite.anims.isPlaying) return;

    if (!this.anims.exists('healer_attack')) return;

    slot.sprite.play('healer_attack');
    slot.sprite.once('animationcomplete', () => {
      if (this.anims.exists('healer_idle')) slot.sprite.play('healer_idle');
    });

    // Deal damage to boss and generate threat
    // Healers generate 1.5x threat from physical attacks (WoW taunt mechanic)
    const healerData    = slot._data;
    const damageRange = healerData?.stats?.damageRange ?? [100, 200];
    const damage      = Phaser.Math.Between(damageRange[0], damageRange[1]);
    
    this._applyDamageToBoss(damage, 'icon_autoAttack');
    this.addThreat('healer', damage);
    this._updateThreatMeters();
    console.log('[Healer] Auto-attack for', damage, '-> threat', Math.round(damage * TANK_THREAT_MULTIPLIER));
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

    const actionInterval = tankSlot._data.stats?.actionInterval ?? 2;
    if (this.tickCount % actionInterval !== 0) return;

    // Do not interrupt an attack animation already playing
    const current = tankSlot.sprite?.anims?.currentAnim;
    if (current && current.key === 'tank_attack' && tankSlot.sprite.anims.isPlaying) return;

    // Priority order drives which ability fires when multiple are available.
    // abilityIds on the character is the canonical list; we define priority
    // as a separate array so the designer can reorder without touching this code.
    const priorityOrder = [
      'provoke',               // set-max threat -- use whenever off cooldown
      'verdict_of_prejudice',  // highest damage
      'verdict_of_righteousness',
      'sanctify',              // AoE holy damage
      'verdict_of_wisdom',     // spammable filler
      'sacred_bulwark',        // defensive -- use when available
    ];

    // Filter to only abilities this character actually has
    const abilityIds = tankSlot._data?.abilityIds ?? [];
    const ordered = priorityOrder.filter(id => abilityIds.includes(id));

    for (const abilityId of ordered) {
      if (this._castCharacterAbility('tank', abilityId)) break;
    }
  }

  // ============
  // STOPS GAME
  // ============
  // ============================================================
  // Encounter outcome handlers
  // ============================================================

  // Called when the boss reaches 0 HP.
  // Records the boss defeat in save data and returns to boss select.
  _onBossDefeated() {
    this.stopGame();

    const saveData     = loadSaveData();
    const selectedRaidId = this.registry.get('selectedRaidId') || 'spookspire_keep';
    const selectedBossId = this.registry.get('selectedBossId') || 'sir_trotsalot_and_nighttime';

    const updatedSave = recordBossDefeat(saveData, selectedRaidId, selectedBossId);
    this.registry.set('saveData', updatedSave);

    console.log('[GameScene] Boss defeated:', selectedBossId, 'in', selectedRaidId);

    // Play victory sound if defined in level data
    const victorySound = this.levelData?.boss?.sounds?.victory;
    if (victorySound) this._playSound(victorySound);

    // Fade to boss select after a short pause so the defeat animation plays
    this.time.delayedCall(4000, () => {
      if (this.scene.isActive('UIScene')) this.scene.stop('UIScene');
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.time.delayedCall(650, () => {
        this.scene.start('RaidBossSelectScene');
      });
    });
  }

  // Called when the player character dies with no Rebirth available.
  // Decrements one wipe token and returns to boss select.
  _onPartyWiped() {
    this.stopGame();

    const saveData = loadSaveData();

    // Deduct one wipe token (floor at 0)
    const updatedSave = {
      ...saveData,
      raidWipeTokensLeft: Math.max(0, (saveData.raidWipeTokensLeft || 0) - 1),
    };
    saveSaveData(updatedSave);
    this.registry.set('saveData', updatedSave);

    console.log('[GameScene] Party wiped. Wipe tokens left:', updatedSave.raidWipeTokensLeft);

    // Return to boss select after the defeat popup fades
    this.time.delayedCall(3500, () => {
      if (this.scene.isActive('UIScene')) this.scene.stop('UIScene');
      this.cameras.main.fadeOut(600, 0, 0, 0);
      this.time.delayedCall(650, () => {
        this.scene.start('RaidBossSelectScene');
      });
    });
  }

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
    const ability = this.levelData?.abilities?.[abilityId];

    // Route to the new engine if this ability has an effects[] array
    if (ability?.effects) {
      this._castCharacterAbility('player', abilityId);
      return;
    }

    // Legacy fallback (totem abilities still go through old path)
    this._recordCast('player');
    console.log('[GameScene] Ability (legacy):', abilityId);

    const uiForPlayer = this.scene.get('UIScene');
    if (uiForPlayer?.spawnAbilityBadge) {
      const abilityName = ability?.name ?? abilityId;
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
