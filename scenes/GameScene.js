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

const DAMAGE_TYPES = new Set(['fire', 'frost', 'nature', 'holy', 'shadow', 'arcane', 'physical']);

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

    // Active debuffs per character: { characterId: { debuffId: { ticksLeft, dispellable, ...params } } }
    // Written by _applyDebuffToCharacter(), decremented by _tickDebuffs().
    this.charDebuffs = { player: {}, tank: {}, healer: {} };

    // Active shields per character: ordered array of { absorbAmount, damageType, dispellable, dispelType }
    // Consumed FIFO by _applyDamageToCharacter before health is reduced.
    this.charShields = { player: [], tank: [], healer: [] };

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

    // Second actor state - populated if levelData.secondActor is present.
    // secondActorDamageTaken tracks total damage dealt to the primary boss
    // for damage_taken_percent spawn triggers.
    this.secondActorSpawned      = false;
    this.secondActorDamageTaken  = 0;
    this.secondActorAbilityCooldowns = {};
    this.secondActorAbilityLockoutUntil = 0;
    this.secondActorResummonCooldownUntil = 0;

    // Boss cast state. Set when an ability with castTimeTicks > 0 begins.
    // Cleared on completion or interrupt.
    this.bossIsCasting       = false;
    this.bossCurrentCast     = null;
    this.bossCurrentCastTimer = null;

    // When set, _tickBossAbilities fires this ability immediately on the next
    // tick before resuming normal rotation. Used for Garrote after Vanish.
    this.bossQueuedAbilityId = null;

    // HP snapshot from the previous tick, used by _tickHealerAI to detect
    // spike damage. { player: 0.0-1.0, tank: 0.0-1.0, healer: 0.0-1.0 }
    this.prevHpPct = { player: 1, tank: 1, healer: 1 };

    // Active summoned add slots: array of { addDef, currentHealth, hpBar, nameText,
    // lifespanTimer, index }. Built dynamically as adds are spawned.
    this.summonedAddSlots = [];

    // Active boss buffs: { buffId: { ...params } }
    // Includes vanished, auto_attack_bonus, extra_auto_chance, enrage.
    this.bossBuffs = {};

    // Stacking auras per character: { characterId: { auraId: { stacks, stackTimer } } }
    // Written by _applyAura(), read in damage, heal, and mana calculations.
    this.charAuras = { player: {}, tank: {}, healer: {} };

    // Phase tracking state.
    // currentPhaseId: the id of the phase currently active.
    // enteredPhaseIds: Set of phase ids whose onEnter events have already fired.
    // timeCycleStartTick: tick count when the most recent time_cycle phase began.
    // timeCycleActivePhaseId: which phase of a time_cycle pair is currently on.
    this.currentPhaseId          = null;
    this.enteredPhaseIds         = new Set();
    this.timeCycleStartTick      = 0;
    this.timeCycleActivePhaseId  = null;

    // Sequential encounter actor tracking.
    // Used when levelData.encounterActors is present (e.g. Sir Trotsalot).
    // currentEncounterActorIndex points to the active actor in that array.
    // firedEncounterSwapIndices prevents the swap trigger from re-firing.
    this.currentEncounterActorIndex  = 0;
    this.firedEncounterSwapIndices   = new Set();
    this.encounterSwapInProgress     = false;

    // Dialogue queue -- entries are played one at a time in arrival order.
    // Each entry: { type: 'sequence'|'popup', ...args }
    this.dialogueQueue = [];
    this.dialogueBusy  = false;

    // Combat log -- append-only array of damage events from boss to characters.
    // Each entry: { tick, sourceName, abilityName, targetId, damage, damageType, targetHpAfter }
    this.combatLog = [];
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
    this._buildSecondActorSlot(ZONES.BOSS);
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

    // Show the pull countdown overlay immediately. It dims the scene, blocks
    // all interaction, shows boss intro dialogue, then counts down 5 to 1
    // before starting the ticker and enabling combat.
    this._buildPullCountdownOverlay();
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
    // These are driven entirely by levelData.boss.animations.
    // Key naming: boss.id + '_' + animationName (e.g. 'ragnaros_idle')
    // Skipped when encounterActors is present -- that block handles registration instead.
    const bossData = this.levelData?.boss;
    if (bossData?.animations && !this.levelData?.encounterActors) {
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

    // =====================
    // ENCOUNTER ACTOR ANIMATIONS
    // =====================
    // When an encounter uses sequential actors, all actor animations are registered
    // up front so they are ready when a swap occurs mid-fight.
    const encounterActors = this.levelData?.encounterActors;
    if (encounterActors?.length) {
      encounterActors.forEach(actorData => {
        if (!actorData.animations) return;
        Object.entries(actorData.animations).forEach(([animName, def]) => {
          const animKey = actorData.id + '_' + animName;
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
      });
    }

    // =====================
    // SECOND ACTOR ANIMATIONS
    // =====================
    // Driven by levelData.secondActor.animations if present.
    // Key naming: secondActor.id + '_' + animationName (e.g. 'dinner_guests_idle')
    const secondActorData = this.levelData?.secondActor;
    if (secondActorData?.animations) {
      Object.entries(secondActorData.animations).forEach(([animName, def]) => {
        const animKey = secondActorData.id + '_' + animName;
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
    const encounterActors = this.levelData?.encounterActors;
    const bossData        = encounterActors?.[0] ?? this.levelData?.boss;
    const spriteKey       = bossData?.spriteKey;
    const idleAnimKey     = bossData ? bossData.id + '_idle' : 'default_idle';
    const hasSecondActor = !!this.levelData?.secondActor;

    // When sharing the screen with a second actor, Mortimer moves to the left
    // half at a smaller scale. When solo he stays centered at full scale.
    const cx          = hasSecondActor ? 270  : ((zone.x + zone.w / 2) + 160);
    const cy          = (zone.y + zone.h / 2) + 200;
    const spriteScale = hasSecondActor ? 2.0  : (bossData?.spriteScale || 3);
    const barW        = hasSecondActor ? 460  : 600;
    const fontSize    = hasSecondActor ? '38px' : '46px';

    // Nameplate sits just above the HP bar which sits just above the sprite
    const nameY = hasSecondActor ? (zone.y + 80) : (zone.y + zone.h - 550);

    const nameText = this.add.text(cx, nameY, bossData?.name || '???', {
      fontFamily: 'monospace', fontSize, color: '#ff6644',
    }).setOrigin(0.5, 1);

    nameText.updateText();

    const padding  = 16;
    const textW    = nameText.width + padding * 2;
    const textH    = nameText.height + padding;
    const panelY   = nameText.y - nameText.height / 2 - padding / 4;

    const titlePanel = this.add.rectangle(cx, panelY, textW, textH, 0x000000)
      .setAlpha(0.65)
      .setStrokeStyle(3, 0x6622a6, 1.0)
      .setOrigin(0.5, 0.5);
    nameText.setDepth(1);

    const hpBar = this._buildBossHealthBar(cx, nameText.y + 36, barW, 42, 0xff3300);

    const bossSprite = this.add.sprite(cx, cy, spriteKey, 0)
      .setScale(spriteScale)
      .setOrigin(0.5, 0.5)
      .setDepth(3);

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

    this.entitySlots.boss = { sprite: bossSprite, nameText, titlePanel, hpBar };
  }

  // =================
  // Second actor slot
  // =================
  // Placed on the right half of the screen (cx=810) at a smaller scale.
  // The second actor has no HP bar and is not a damage target -- they are
  // a persistent nuisance for the duration of the encounter.
  // Sprite renders at depth 2 so it always appears in front of the primary boss.
  _buildSecondActorSlot(zone) {
    const actorData = this.levelData?.secondActor;
    if (!actorData) return;

    const cx          = 810;
    const cy          = (zone.y + zone.h / 2) + 200;
    const spriteKey   = actorData.spriteKey ?? null;
    const spriteScale = actorData.spriteScale ?? 2.0;
    const idleAnimKey = actorData.id + '_idle';

    let sprite = null;
    if (spriteKey && this.textures.exists(spriteKey)) {
      sprite = this.add.sprite(cx, cy, spriteKey, 0)
        .setScale(spriteScale)
        .setOrigin(0.5, 0.5)
        .setDepth(1);

      if (this.anims.exists(idleAnimKey)) {
        sprite.play(idleAnimKey);
      }
    }

    this.entitySlots.secondActor = {
      sprite,
      nameText:    null,
      titlePanel:  null,
      hpBar:       null,
      currentHealth: actorData.stats?.maxHealth ?? 0,
      nuisance:    !!actorData.nuisance,
      _data: actorData,
    };
  }

  // Show or hide all display elements of the second actor.
  // Called when the spawn trigger fires, and on death.
  _setSecondActorVisible(visible) {
    const slot = this.entitySlots.secondActor;
    if (!slot) return;

    const alpha = visible ? 1 : 0;

    if (slot.sprite) {
      if (visible) {
        slot.sprite.setAlpha(0).setY(slot.sprite.y - 80);
        this.tweens.add({
          targets:  slot.sprite,
          alpha:    1,
          y:        slot.sprite.y + 80,
          duration: 900,
          ease:     'Back.easeOut',
        });
      } else {
        slot.sprite.setAlpha(0);
      }
    }

    if (slot.nameText)  slot.nameText.setAlpha(alpha);
    if (slot.titlePanel) slot.titlePanel.setAlpha(alpha);
    if (slot.hpBar) {
      slot.hpBar.track?.setAlpha(alpha);
      slot.hpBar.fill?.setAlpha(alpha);
      slot.hpBar.valueText?.setAlpha(alpha);
    }
  }
  _buildPlayerSlot(zone) {
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h - 60;

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
    const cy = ((zone.y + zone.h - 80) + 115);

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
      const initialActor = data.encounterActors?.[0] ?? data.boss;
      const slot = this.entitySlots.boss;
      slot.nameText.setText(initialActor.name || '???');

      if (slot.hpBar) slot.hpBar.maxValue = initialActor.stats?.maxHealth ?? 0;
      slot.currentHealth = initialActor.stats?.maxHealth ?? 0;
      this._setBossHealthBar(slot.hpBar, 1.0);
      slot._data = initialActor;
    }

    if (data.secondActor && this.entitySlots.secondActor) {
      const slot      = this.entitySlots.secondActor;
      const actorData = data.secondActor;
      if (slot.nameText) slot.nameText.setText(actorData.name || '???');
      if (slot.hpBar) slot.hpBar.maxValue = actorData.stats?.maxHealth ?? 0;
      slot.currentHealth = actorData.stats?.maxHealth ?? 0;
      if (slot.hpBar) this._setBossHealthBar(slot.hpBar, 1.0);
      slot._data = actorData;

      // Hide the slot until the spawn trigger fires, unless there is no trigger.
      // If there is no trigger the actor is present from the start of the fight
      // and secondActorSpawned must be set true now so the tick methods run.
      const hasSpawnTrigger = !!actorData.spawnTrigger;
      if (hasSpawnTrigger) {
        this._setSecondActorVisible(false);
      } else {
        this.secondActorSpawned = true;
      }
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
      bar.valueText.setText(Math.round(c * 100) + '%');
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
    const encounterActors = this.levelData?.encounterActors;
    const activeActorId   = encounterActors
      ? encounterActors[this.currentEncounterActorIndex]?.id
      : this.levelData?.boss?.id;

    if (!activeActorId) return null;
    const key = activeActorId + '_' + animName;
    return this.anims.exists(key) ? key : null;
  }

  // Returns the data object for whichever actor is currently fighting.
  // When encounterActors is present, this is the current indexed actor.
  // Otherwise it falls back to levelData.boss.
  _getActiveActorData() {
    const encounterActors = this.levelData?.encounterActors;
    if (encounterActors?.length) {
      return encounterActors[this.currentEncounterActorIndex] ?? null;
    }
    return this.levelData?.boss ?? null;
  }

  playBossAttack() {
    const slot    = this.entitySlots.boss;
    const animKey = this._getBossAnimKey('attacking');
    if (!slot?.sprite || !animKey) return;

    const current = slot.sprite.anims.currentAnim;
    if (current && current.key === animKey && slot.sprite.anims.isPlaying) return;

    const targetId        = this.getHighestThreatTarget();
    const targetName      = this.entitySlots[targetId]?._data?.name ?? targetId;
    const activeActorData = this._getActiveActorData();
    const bossName        = activeActorData?.name ?? 'Boss';
    console.log('[Boss]', bossName, 'attacks', targetName + '!');

    this._playSound(activeActorData?.attackSound);

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

    // enrage multiplier applied to base damage
    const enrageMultiplier = this.bossBuffs?.enrage?.damageMultiplier ?? 1;
    const autoBonus        = this.bossBuffs?.auto_attack_bonus?.bonusDamage ?? 0;
    const autoBonus2       = this.bossBuffs?.enrage?.extraAutoAttackDamage ?? 0;

    const damage = Math.round((baseDamage + autoBonus + autoBonus2) * (this.bossDamageMultiplier ?? 1) * enrageMultiplier);
    this._applyDamageToCharacter(targetId, damage, 'icon_autoAttack', 'physical');

    // Tank generates passive threat just by being the target
    this.addThreat('tank', 50);
    this._updateThreatMeters();

    // extra_auto_chance buff -- proc a free second auto-attack
    const extraAutoChance = this.bossBuffs?.extra_auto_chance?.chance ?? 0;
    if (extraAutoChance > 0 && Phaser.Math.Between(1, 100) <= extraAutoChance) {
      console.log('[Boss] Extra auto-attack proc!');
      const extraTarget = this.getHighestThreatTarget();
      const extraDamage = Math.round((baseDamage + autoBonus + autoBonus2) * (this.bossDamageMultiplier ?? 1) * enrageMultiplier);
      this._applyDamageToCharacter(extraTarget, extraDamage, 'icon_autoAttack', 'physical');
    }
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
  //     generate 200% threat, consume one charge.
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
      const blockDmg    = hs.blockDamage ?? 590;
      const iconKey     = this.textures.exists('icon_holy_shield') ? 'icon_holy_shield' : null;
      this._applyDamageToBoss(blockDmg, iconKey);

      // Generate threat from block
      const blockThreat = Math.round(blockDmg * (hs.blockThreatMultiplier ?? 2));
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

  // ==========================
  // PULL COUNTDOWN OVERLAY
  // ==========================
  // Shown immediately when the scene loads. Dims the scene, blocks all
  // interaction, shows boss intro dialogue, then counts down 5 to 1.
  // Combat starts as soon as "1" fades out.
  _buildPullCountdownOverlay() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    // Full-screen dim that blocks all pointer events reaching the scene below
    const blocker = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.55)
      .setDepth(90)
      .setInteractive();

    const startCombat = () => {
      this.tweens.add({
        targets:  blocker,
        alpha:    0,
        duration: 300,
        onComplete: () => {
          blocker.destroy();
          this.bossDialoguePlaying = false;
          this._startTicker(window.GAME_CONFIG.TICK_MS);
        },
      });
    };

    const runCountdown = () => {
      const cx      = WIDTH / 2;
      const cy      = HEIGHT * 0.50;
      const steps   = ['Pulling in 5', '4', '3', '2', '1'];
      const STEP_MS = 1000;
      const FADE_MS = 150;
      let   index   = 0;

      const showStep = () => {
        const label = steps[index];
        index++;

        const text = this.add.text(cx, cy, label, {
          fontFamily:      'monospace',
          fontSize:        index === 1 ? '52px' : '96px',
          color:           '#a82020',
          stroke:          '#000000',
          strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setDepth(91);

        this.tweens.add({
          targets:  text,
          alpha:    1,
          duration: FADE_MS,
          onComplete: () => {
            this.time.delayedCall(STEP_MS - FADE_MS * 2, () => {
              this.tweens.add({
                targets:  text,
                alpha:    0,
                duration: FADE_MS,
                onComplete: () => {
                  text.destroy();
                  if (index < steps.length) {
                    showStep();
                  } else {
                    startCombat();
                  }
                },
              });
            });
          },
        });
      };

      showStep();
    };

    // Show boss intro dialogue first if any lines exist, then run the countdown.
    // If there are no intro lines, go straight to the countdown.
    this._showBossDialogue(runCountdown);
  }

  // ================
  // DIALOGUE / POPUP
  // ================

  // Show the boss opening dialogue sequence on level load.
  // openingDialogue in the JSON can be a string or an array of strings.
  _showBossDialogue(onComplete = null) {
    const raw   = this.levelData?.boss?.dialog?.intro
                  || this.levelData?.boss?.openingDialogue
                  || '';
    const lines = Array.isArray(raw) ? raw.filter(l => l.length > 0) : (raw ? [raw] : []);

    this._playSound(this.levelData?.boss?.openingSound);

    if (!lines.length) {
      if (onComplete) onComplete();
      return;
    }

    const fadeMs      = 350;
    const holdMs      = this.levelData?.boss?.audioDuration ?? 6000;
    const holdPerLine = Math.max(500, (holdMs / lines.length) - (fadeMs * 2));

    this.showDialogueSequence(lines, '#ff9944', holdPerLine, fadeMs, onComplete);
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
    if (!lines || lines.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    this.dialogueQueue.push({ type: 'sequence', lines, color, holdMs, fadeMs, onComplete });
    this._drainDialogueQueue();
  }

  showPopup(message, color = '#ffffff', duration = 2500) {
    this.dialogueQueue.push({ type: 'popup', message, color, duration });
    this._drainDialogueQueue();
  }

  _drainDialogueQueue() {
    if (this.dialogueBusy || this.dialogueQueue.length === 0) return;

    const entry = this.dialogueQueue.shift();
    this.dialogueBusy = true;

    const done = () => {
      this.dialogueBusy = false;
      this._drainDialogueQueue();
    };

    if (entry.type === 'sequence') {
      this._showDialogueSequenceNow(
        entry.lines, entry.color, entry.holdMs, entry.fadeMs,
        () => { if (entry.onComplete) entry.onComplete(); done(); }
      );
    } else {
      this._showPopupNow(entry.message, entry.color, entry.duration, done);
    }
  }

  // =======================
  // Internal display methods -- call showDialogueSequence / showPopup instead.
  // =======================
  _showDialogueSequenceNow(lines, color = '#ffffff', holdMs = 2200, fadeMs = 350, onComplete = null) {
    if (!lines || lines.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    this.bossDialoguePlaying = true;

    const zone = window.GAME_CONFIG.ZONES.POPUP;
    const cx   = zone.x + zone.w / 2;
    const cy   = zone.y + zone.h / 2;

    const panel = this.add.rectangle(cx, cy - 250, zone.w, zone.h, 0x000000, 0.78)
      .setStrokeStyle(2, 0xff4400, 0.85)
      .setAlpha(0)
      .setDepth(80);

    this.tweens.add({ targets: panel, alpha: 1, duration: fadeMs });

    let lineIndex = 0;

    const showNext = () => {
      if (lineIndex >= lines.length) {
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
                this.time.delayedCall(150, showNext);
              },
            });
          });
        },
      });
    };

    showNext();
  }

  _showPopupNow(message, color = '#ffffff', duration = 2500, onComplete = null) {
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
      onComplete: () => {
        panel.destroy();
        text.destroy();
        if (onComplete) onComplete();
      },
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
    const encounterActors = this.levelData?.encounterActors;
    const activeActor     = encounterActors
      ? encounterActors[this.currentEncounterActorIndex]
      : null;
    const bossData = activeActor ?? this.levelData?.boss;

    this._playSound(bossData?.deathSound);

    const raw   = bossData?.dialog?.defeat
                  || bossData?.deathDialogue
                  || 'I AM... DEFEATED.';
    const lines = Array.isArray(raw) ? raw : [raw];
    this.showDialogueSequence(lines, '#aaaaaa');

    const slot = this.entitySlots.boss;
    if (slot?.sprite) {
      const defeatedKey = activeActor?.animations?.defeated?.key
                          ?? this.levelData?.boss?.animations?.defeated?.key
                          ?? this._getBossAnimKey('death');

      if (defeatedKey && this.anims.exists(defeatedKey)) {
        slot.sprite.play(defeatedKey);
        slot.sprite.once('animationcomplete', () => {
          this.tweens.add({ targets: slot.sprite, alpha: 0, duration: 800 });
        });
      } else {
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
    this.events.emit('combat-start');
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
    this._tickEncounterActorSwap();
    this._tickSecondActorAutoAttack();
    this._tickSecondActorAbilities();
    this._tickSpawnTrigger();
    this._tickPhase();
    this._tickDebuffs();
    this._tickSummonedAdds();
    this._tickAuras();
    this._tickEnrage();
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
    if (this.bossIsCasting) return;
    if (this.bossBuffs?.vanished) return;
    if (this.encounterSwapInProgress) return;
    if (Date.now() < this.bossAbilityLockoutUntil) return;

    const bossData = this.entitySlots.boss?._data;
    if (!bossData) return;

    const baseAttackSpeed   = Math.round(bossData.stats?.attackSpeed ?? 3);
    const enrageSpeedMult   = this.bossBuffs?.enrage?.attackSpeedMultiplier ?? 1;
    const effectiveInterval = Math.max(1, Math.round(baseAttackSpeed * enrageSpeedMult));
    if (this.tickCount % effectiveInterval === 0) {
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
    if (this.bossIsCasting) return;
    if (this.bossDebuffs?.silenced) return;
    if (this.bossBuffs?.vanished) return;
    if (this.encounterSwapInProgress) return;

    // Grace period - no special abilities for the first 20 seconds of the fight
    const GRACE_PERIOD_MS = 1000;
    if (!this.tickerStartedAt || Date.now() - this.tickerStartedAt < GRACE_PERIOD_MS) return;

    // Block if we are within the post-ability lockout window
    const POST_ABILITY_LOCKOUT_MS = 5000;
    if (Date.now() < this.bossAbilityLockoutUntil) return;

    const bossData = this.entitySlots.boss?._data;
    if (!bossData) return;

    if (!this.bossAbilityCooldowns) {
      this.bossAbilityCooldowns = {};
    }

    // If a queued ability is waiting (e.g. Garrote after Vanish), fire it first
    if (this.bossQueuedAbilityId) {
      const queuedId  = this.bossQueuedAbilityId;
      const abilities = this.levelData?.abilities ?? {};
      const ability   = abilities[queuedId];
      this.bossQueuedAbilityId = null;
      if (ability) {
        this.bossAbilityCooldowns[queuedId] = Date.now();
        this.bossAbilityLockoutUntil = Date.now() + POST_ABILITY_LOCKOUT_MS;
        this._fireBossAbility(queuedId, ability);
        return;
      }
    }

    const currentPhase = this._resolveCurrentPhase();
    const abilityIds   = currentPhase?.abilityIds ?? [];
    const abilities    = this.levelData?.abilities ?? {};

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

  // =====================================
  // Second actor auto-attack
  // =====================================
  // Mirrors _tickBossAutoAttack for the second actor.
  // Only runs when the second actor has been spawned and is alive.
  _tickSecondActorAutoAttack() {
    if (!this.secondActorSpawned) return;
    if (this.bossDialoguePlaying) return;
    if ((this.entitySlots.boss?.currentHealth ?? 0) <= 0) return;

    const slot = this.entitySlots.secondActor;
    if (!slot?._data) return;
    if ((slot.currentHealth ?? 0) <= 0) return;

    if (slot.nuisance) return;

    const attackSpeed = Math.round(slot._data.stats?.attackSpeed ?? 3);
    if (this.tickCount % attackSpeed !== 0) return;

    const damageRange = slot._data.stats?.damageRange ?? [100, 200];
    const baseDamage  = Phaser.Math.Between(damageRange[0], damageRange[1]);
    const damage      = Math.round(baseDamage * (this.bossDamageMultiplier ?? 1));
    const targetId    = this.getHighestThreatTarget();

    this._applyDamageToCharacter(targetId, damage, 'icon_autoAttack', 'physical');
    this.addThreat('tank', 50);
    this._updateThreatMeters();

    const actorName = slot._data.name ?? 'Second Actor';
    const targetName = this.entitySlots[targetId]?._data?.name ?? targetId;
    console.log('[SecondActor]', actorName, 'attacks', targetName, 'for', damage);

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnAbilityBadge) {
      const secondActorZone = { x: 610, y: 325, w: 400, h: 384 };
      uiScene.spawnAbilityBadge(secondActorZone, 'autoAttack', actorName + ' attacks!');
    }
  }

  // =====================================
  // Second actor ability rotation
  // =====================================
  // Mirrors _tickBossAbilities. Uses the secondActor.abilityIds list directly
  // since the second actor has no phase system -- it uses the same ability set
  // for its entire existence. Phase changes on the encounter are driven by the
  // primary boss's phases array.
  _tickSecondActorAbilities() {
    if (!this.secondActorSpawned) return;
    if (this.bossDialoguePlaying) return;
    if ((this.entitySlots.boss?.currentHealth ?? 0) <= 0) return;

    const slot = this.entitySlots.secondActor;
    if (!slot?._data) return;
    if ((slot.currentHealth ?? 0) <= 0) return;

    const GRACE_PERIOD_MS       = 1000;
    const POST_ABILITY_LOCKOUT_MS = 2000;

    if (!this.tickerStartedAt || Date.now() - this.tickerStartedAt < GRACE_PERIOD_MS) return;
    if (Date.now() < this.secondActorAbilityLockoutUntil) return;

    const abilityIds = slot._data.abilityIds ?? [];
    const abilities  = this.levelData?.abilities ?? {};
    const now        = Date.now();

    for (const abilityId of abilityIds) {
      const ability = abilities[abilityId];
      if (!ability) continue;
      if (!ability.recastTimer || ability.recastTimer <= 0) continue;

      const lastUsed = this.secondActorAbilityCooldowns[abilityId] ?? 0;
      const recastMs = ability.recastTimer * 1000;

      if (now - lastUsed >= recastMs) {
        this.secondActorAbilityCooldowns[abilityId] = now;
        this.secondActorAbilityLockoutUntil = now + POST_ABILITY_LOCKOUT_MS;
        console.log('[SecondActor]', slot._data.name, 'uses', ability.name ?? abilityId);

        const uiScene = this.scene.get('UIScene');
        if (uiScene?.spawnAbilityBadge) {
          const secondActorZone = { x: 610, y: 325, w: 400, h: 384 };
          uiScene.spawnAbilityBadge(secondActorZone, abilityId, ability.name ?? abilityId);
        }

        this._fireBossAbility(abilityId, ability);
        break;
      }
    }
  }

  // =====================================
  // Spawn trigger checker
  // =====================================
  // Runs every tick. Checks whether the secondActor's spawnTrigger condition
  // has been met. Once it fires it sets secondActorSpawned and never re-checks
  // the initial spawn (re-summon logic for resummoned actors is separate).
  _tickSpawnTrigger() {
    if (!this.levelData?.secondActor) return;
    if (this.secondActorSpawned) {
      this._tickResummonTrigger();
      return;
    }

    const actorData    = this.levelData.secondActor;
    const spawnTrigger = actorData.spawnTrigger;
    if (!spawnTrigger) return;

    let shouldSpawn = false;

    if (spawnTrigger.type === 'damage_taken_percent') {
      const maxHealth    = this.levelData.boss?.stats?.maxHealth ?? 1;
      const triggerPct   = (spawnTrigger.value ?? 5) / 100;
      shouldSpawn = this.secondActorDamageTaken >= maxHealth * triggerPct;
    }

    if (spawnTrigger.type === 'health_percent') {
      const slot    = this.entitySlots.boss;
      const maxHp   = slot?.hpBar?.maxValue ?? 1;
      const current = slot?.currentHealth ?? maxHp;
      const pct     = current / maxHp;
      shouldSpawn = pct <= (spawnTrigger.value ?? 100) / 100;
    }

    if (shouldSpawn) {
      this._spawnSecondActor();
    }
  }

  // =====================================
  // Re-summon trigger checker
  // =====================================
  // For actors with resummoned: true (e.g. Kil'wretch), checks whether the
  // resummon cooldown has elapsed and re-shows the actor at full health.
  _tickResummonTrigger() {
    const actorData = this.levelData?.secondActor;
    if (!actorData?.resummoned) return;

    const slot = this.entitySlots.secondActor;
    if (!slot) return;
    if ((slot.currentHealth ?? 0) > 0) return;

    if (Date.now() < this.secondActorResummonCooldownUntil) return;

    console.log('[SecondActor] Re-summoning', actorData.name);
    slot.currentHealth = actorData.stats?.maxHealth ?? 0;
    if (slot.hpBar) slot.hpBar.maxValue = slot.currentHealth;
    this._setBossHealthBar(slot.hpBar, 1.0);
    this._setSecondActorVisible(true);

    this.showPopup(actorData.name + ' returns!', '#ff9966', 3000);
  }

  // Shows the second actor and begins their tick routines.
  _spawnSecondActor() {
    this.secondActorSpawned = true;

    const actorData = this.levelData.secondActor;
    const slot      = this.entitySlots.secondActor;
    if (!slot) return;

    slot.currentHealth = actorData.stats?.maxHealth ?? 0;
    if (slot.hpBar) slot.hpBar.maxValue = slot.currentHealth;
    this._setBossHealthBar(slot.hpBar, 1.0);

    this._setSecondActorVisible(true);

    const introLine = actorData.dialogue?.intro ?? (actorData.name + ' joins the fight!');
    const lines     = Array.isArray(introLine) ? introLine : [introLine];
    this.showDialogueSequence(lines, '#ff9966');

    console.log('[SecondActor] Spawned:', actorData.name);
  }

  // =====================================
  // Second actor damage application
  // =====================================
  // Reduces second actor health, updates their HP bar, spawns floating
  // damage text, and handles death (including re-summon cooldown setup).
  _applyDamageToSecondActor(damage, iconKey = null, damageType = 'physical') {
    const slot = this.entitySlots.secondActor;
    if (!slot) return;
    if ((slot.currentHealth ?? 0) <= 0) return;

    if (!DAMAGE_TYPES.has(damageType)) {
      damageType = 'physical';
    }

    const resistList  = slot._data?.stats?.resistList ?? {};
    const finalDamage = this._applyResistReduction(damage, damageType, resistList);

    const maxHealth    = slot.hpBar?.maxValue ?? 1;
    slot.currentHealth = Math.max(0, (slot.currentHealth ?? maxHealth) - finalDamage);

    const pct = slot.currentHealth / maxHealth;
    this._setBossHealthBar(slot.hpBar, pct);

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      uiScene.spawnFloatingText(window.GAME_CONFIG.ZONES.BOSS, finalDamage, 'damage', iconKey);
    }

    if (slot.currentHealth <= 0) {
      this._onSecondActorDeath();
    }
  }

  // Called when the second actor reaches 0 HP.
  _onSecondActorDeath() {
    const actorData = this.levelData?.secondActor;
    const slot      = this.entitySlots.secondActor;
    if (!slot) return;

    slot.currentHealth = 0;
    this._setSecondActorVisible(false);

    console.log('[SecondActor] Died:', actorData?.name);

    if (actorData?.resummoned) {
      const cooldownTicks = actorData.resummonCooldownTicks ?? 30;
      const cooldownMs    = cooldownTicks * window.GAME_CONFIG.TICK_MS;
      this.secondActorResummonCooldownUntil = Date.now() + cooldownMs;
      console.log('[SecondActor] Re-summon cooldown:', cooldownTicks, 'ticks');
    }
  }

  // =====================================
  // Summoned adds
  // =====================================
  // Spawns a temporary add defined in levelData.summonedAdds[].
  // Each add gets its own mini HP bar and a lifespan countdown timer.
  // Adds are tracked in this.summonedAddSlots so they can be targeted
  // and damaged independently of the boss.
  _spawnAdd(addDef) {
    const TICK_MS = window.GAME_CONFIG.TICK_MS;
    const index   = this.summonedAddSlots.length;

    const addSlot = this._buildAddSlot(addDef, index);
    if (!addSlot) return;

    addSlot.currentHealth = addDef.health ?? 1;
    addSlot.addDef        = addDef;
    addSlot.index         = index;

    const lifespanTicks = addDef.lifespanTicks ?? 9;
    let   ticksElapsed  = 0;

    addSlot.lifespanTimer = this.time.addEvent({
      delay: TICK_MS,
      loop:  true,
      callback: () => {
        ticksElapsed++;

        // Update countdown text
        const remaining = lifespanTicks - ticksElapsed;
        if (addSlot.countdownText) {
          addSlot.countdownText.setText(remaining > 0 ? String(remaining) : '!');
        }

        if (ticksElapsed >= lifespanTicks || (addSlot.currentHealth ?? 0) <= 0) {
          addSlot.lifespanTimer.remove();
          if ((addSlot.currentHealth ?? 0) > 0) {
            this._onAddExpire(addSlot);
          }
        }
      },
    });

    this.summonedAddSlots.push(addSlot);
    console.log('[Add] Spawned:', addDef.name, '(index', index + ')');
  }

  // Builds the display elements for a summoned add.
  // Adds are shown in a horizontal row inside the BOSS zone.
  // Each add is 160px wide with a small HP bar and countdown timer.
  _buildAddSlot(addDef, index) {
    const zone    = window.GAME_CONFIG.ZONES.BOSS;
    const slotW   = 160;
    const startX  = zone.x + 20;
    const cx      = startX + index * (slotW + 12) + slotW / 2;
    const cy      = zone.y + zone.h - 80;

    const barW    = slotW - 8;
    const barH    = 18;

    const bg = this.add.rectangle(cx, cy - 10, slotW, 60, 0x000000, 0.7)
      .setStrokeStyle(1, 0xaa3300, 0.8)
      .setDepth(10);

    const nameText = this.add.text(cx, cy - 30, addDef.name || '???', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffaa44',
    }).setOrigin(0.5, 0.5).setDepth(11);

    const hpBar = this._buildBossHealthBar(cx, cy - 10, barW, barH, 0xcc2200);
    if (hpBar.track)     hpBar.track.setDepth(11);
    if (hpBar.fill)      hpBar.fill.setDepth(12);
    if (hpBar.valueText) hpBar.valueText.setVisible(false);
    hpBar.maxValue = addDef.health ?? 1;

    const countdownText = this.add.text(cx, cy + 14, String(addDef.lifespanTicks ?? 9), {
      fontFamily: 'monospace', fontSize: '16px', color: '#ff4422',
    }).setOrigin(0.5, 0.5).setDepth(11);

    return { bg, nameText, hpBar, countdownText, currentHealth: addDef.health ?? 1 };
  }

  // Hides and destroys all display elements for an add slot.
  _destroyAddSlot(addSlot) {
    if (!addSlot) return;
    if (addSlot.lifespanTimer) { try { addSlot.lifespanTimer.remove(); } catch(e) {} }
    addSlot.bg?.destroy();
    addSlot.nameText?.destroy();
    addSlot.hpBar?.track?.destroy();
    addSlot.hpBar?.fill?.destroy();
    addSlot.hpBar?.valueText?.destroy();
    addSlot.countdownText?.destroy();
  }

  // Applies damage to a summoned add by index.
  // Used by character attacks when targeting the add.
  _applyDamageToAdd(addIndex, damage, iconKey = null, damageType = 'physical') {
    const addSlot = this.summonedAddSlots[addIndex];
    if (!addSlot) return;
    if ((addSlot.currentHealth ?? 0) <= 0) return;

    if (!DAMAGE_TYPES.has(damageType)) damageType = 'physical';

    const resistList  = addSlot.addDef?.resistList ?? {};
    const finalDamage = this._applyResistReduction(damage, damageType, resistList);

    const maxHealth = addSlot.hpBar?.maxValue ?? 1;
    addSlot.currentHealth = Math.max(0, (addSlot.currentHealth ?? maxHealth) - finalDamage);

    const pct = addSlot.currentHealth / maxHealth;
    this._setBossHealthBar(addSlot.hpBar, pct);

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      uiScene.spawnFloatingText(window.GAME_CONFIG.ZONES.BOSS, finalDamage, 'damage', iconKey);
    }

    if (addSlot.currentHealth <= 0) {
      this._onAddDeath(addSlot);
    }
  }

  // Called when an add is killed before its lifespan expires.
  _onAddDeath(addSlot) {
    if (addSlot.lifespanTimer) { try { addSlot.lifespanTimer.remove(); } catch(e) {} }
    addSlot.currentHealth = 0;
    console.log('[Add] Killed:', addSlot.addDef?.name);
    this._destroyAddSlot(addSlot);
    this.summonedAddSlots = this.summonedAddSlots.filter(s => s !== addSlot);
  }

  // Called when an add's lifespan timer runs out without being killed.
  // Fires the onExpireEffect defined in the add's definition.
  _onAddExpire(addSlot) {
    const addDef      = addSlot.addDef;
    const expireEffect = addDef?.onExpireEffect;

    console.log('[Add] Expired:', addDef?.name);

    if (expireEffect?.type === 'damage') {
      const damage     = Phaser.Math.Between(addDef.onExpireMin ?? 0, addDef.onExpireMax ?? addDef.onExpireMin ?? 0);
      const damageType = addDef.damageType ?? 'arcane';
      const targets    = addDef.onExpireTargets === 'all_allies'
        ? ['player', 'tank', 'healer']
        : [this.getHighestThreatTarget()];

      targets.forEach(targetId => {
        if ((this.entitySlots[targetId]?.currentHealth ?? 0) > 0) {
          this._applyDamageToCharacter(targetId, damage, null, damageType);
        }
      });

      this.showPopup(addDef.name + ' explodes!', '#ff4422', 2000);
      console.log('[Add] Expire damage:', damage, damageType, 'to', addDef.onExpireTargets ?? 'highest_threat');
    }

    this._destroyAddSlot(addSlot);
    this.summonedAddSlots = this.summonedAddSlots.filter(s => s !== addSlot);
  }

  // Called every tick. Cleans up any add slots that have lost their
  // display objects (destroyed externally or from a previous frame).
  _tickSummonedAdds() {
    this.summonedAddSlots = this.summonedAddSlots.filter(slot => {
      if (!slot || (slot.currentHealth ?? 0) <= 0) return false;
      if (!slot.bg?.scene) return false;
      return true;
    });
  }

  // Fire a specific boss ability - plays animation if one is defined,
  // shows dialogue, plays sound.
  _fireBossAbility(abilityId, ability) {
    const bossName    = this._getActiveActorData()?.name ?? 'Boss';
    const abilityName = ability.name ?? abilityId;
    const targetType  = ability.targetType;
    const isAoE       = targetType === 'all_allies';
    const TICK_MS     = window.GAME_CONFIG.TICK_MS;
    const damageType  = ability.damageType ?? 'physical';

    if (!DAMAGE_TYPES.has(damageType)) {
      console.warn('[GameScene] Ability', abilityId, 'has unknown damageType:', damageType);
    }

    // If this ability has a cast time, begin the cast and defer the effect.
    if (ability.castTimeTicks > 0) {
      this._beginBossCast(abilityId, ability);
      return;
    }

    this._resolveBossAbilityEffect(abilityId, ability);
  }

  // =====================================
  // Boss ability effect resolution
  // =====================================
  // Executes the actual damage, healing, and DoT for a boss ability.
  // Called directly for instant abilities, or deferred by _beginBossCast
  // for cast-time abilities once the cast completes.
  _resolveBossAbilityEffect(abilityId, ability) {
    const bossName    = this._getActiveActorData()?.name ?? 'Boss';
    const abilityName = ability.name ?? abilityId;
    const targetType  = ability.targetType;
    const isAoE       = targetType === 'all_allies';
    const TICK_MS     = window.GAME_CONFIG.TICK_MS;
    const damageType  = ability.damageType ?? 'physical';

    const singleTargetId   = isAoE ? null : this.getHighestThreatTarget();
    const singleTargetName = singleTargetId
      ? (this.entitySlots[singleTargetId]?._data?.name ?? singleTargetId)
      : null;

    if (isAoE) {
      console.log('[Boss]', bossName, 'uses', abilityName, 'on the party!');
    } else {
      console.log('[Boss]', bossName, 'uses', abilityName, 'on', singleTargetName + '!');
    }

    const resolveTargets = () => {
      if (targetType === 'all_allies') return ['player', 'tank', 'healer'];
      if (targetType === 'random_ally') {
        const alive = ['player', 'tank', 'healer'].filter(id => (this.entitySlots[id]?.currentHealth ?? 0) > 0);
        return alive.length ? [Phaser.Utils.Array.GetRandom(alive)] : [];
      }
      if (targetType === 'random_ignore_threat') {
        const alive = ['player', 'tank', 'healer'].filter(id => (this.entitySlots[id]?.currentHealth ?? 0) > 0);
        return alive.length ? [Phaser.Utils.Array.GetRandom(alive)] : [];
      }
      if (targetType === 'second_highest_threat') {
        return [this.getSecondHighestThreatTarget()];
      }
      if (targetType === 'lowest_threat') {
        if (!this.threatTable) this._initThreatTable();
        const alive = ['player', 'tank', 'healer'].filter(id => (this.entitySlots[id]?.currentHealth ?? 0) > 0);
        if (!alive.length) return [];
        let lowestId = alive[0], lowestAmt = Infinity;
        for (const id of alive) {
          const amt = this.threatTable[id] ?? 0;
          if (amt < lowestAmt) { lowestAmt = amt; lowestId = id; }
        }
        return [lowestId];
      }
      if (targetType === 'highest_mana') {
        const alive = ['player', 'tank', 'healer'].filter(id => (this.entitySlots[id]?.currentHealth ?? 0) > 0);
        if (!alive.length) return [];
        let highestId = alive[0], highestMana = -1;
        for (const id of alive) {
          const mana = this.entitySlots[id]?.currentMana ?? 0;
          if (mana > highestMana) { highestMana = mana; highestId = id; }
        }
        return [highestId];
      }
      if (targetType === 'casting_character') {
        const casting = ['player', 'tank', 'healer'].find(id => this.entitySlots[id]?.isCasting === true);
        return casting ? [casting] : [];
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
        this.time.delayedCall(buffDurationTicks * window.GAME_CONFIG.TICK_MS, () => {
          this.bossDamageMultiplier = 1;
        });
      }
    }

    // applyBuff -- applies a named boss buff for a duration (or permanently if 0)
    if (ability.applyBuff) {
      const buffDef = ability.applyBuff;
      const buffId  = buffDef.id;
      const buffDuration = buffDef.durationTicks ?? 0;
      const buffParams   = { ...buffDef };
      delete buffParams.id;
      delete buffParams.durationTicks;
      this._applyBossBuff(buffId, buffParams, buffDuration);

      // vanished: hide boss sprite and show re-appear after duration
      if (buffId === 'vanished') {
        const bossSlot = this.entitySlots.boss;
        if (bossSlot?.sprite) bossSlot.sprite.setAlpha(0);
        if (buffDuration > 0) {
          this.time.delayedCall(buffDuration * window.GAME_CONFIG.TICK_MS, () => {
            if (bossSlot?.sprite) {
              this.tweens.add({ targets: bossSlot.sprite, alpha: 1, duration: 400 });
            }
            // Queue Garrote as the first ability after reappearing
            if (this.levelData?.abilities?.mortimer_garrote) {
              this.bossQueuedAbilityId = 'mortimer_garrote';
              console.log('[Boss] Vanish ended -- Garrote queued');
            }
          });
        }
      }
    }

    if (ability.immediateEffect?.type === 'heal_boss') {
      const bossSlot = this.entitySlots.boss;
      if (bossSlot) {
        const maxHealth  = bossSlot.hpBar?.maxValue ?? bossSlot._data?.stats?.maxHealth ?? 1;
        const healAmount = Phaser.Math.Between(ability.immediateMin ?? 0, ability.immediateMax ?? ability.immediateMin ?? 0);
        bossSlot.currentHealth = Math.min(maxHealth, (bossSlot.currentHealth ?? maxHealth) + healAmount);
        const pct = bossSlot.currentHealth / maxHealth;
        this._setBossHealthBar(bossSlot.hpBar, pct);
        const uiScene = this.scene.get('UIScene');
        if (uiScene?.spawnFloatingText) {
          uiScene.spawnFloatingText(window.GAME_CONFIG.ZONES.BOSS, healAmount, 'heal', iconKey);
        }
      }
    } else if (ability.immediateEffect?.type === 'summon_add') {
      const addId  = ability.immediateEffect.addId;
      const addDef = this.levelData?.summonedAdds?.find(a => a.id === addId);
      if (addDef) {
        this._spawnAdd(addDef);
      } else {
        console.warn('[GameScene] summon_add: no summonedAdd definition found for id:', addId);
      }
    } else if (ability.immediateFlag && (ability.immediateMin || ability.immediateMax)) {
      const immediateDamage = Phaser.Math.Between(ability.immediateMin ?? 0, ability.immediateMax ?? ability.immediateMin ?? 0);
      targets.forEach((targetId) => {
        if (!targetId) return;
        this._applyDamageToCharacter(targetId, Math.round(immediateDamage * (this.bossDamageMultiplier ?? 1)), iconKey, damageType);
      });
    }

    if (ability.duration > 0 && ability.tickMin) {
      let ticks = 0;
      const dotTimer = this.time.addEvent({
        delay: TICK_MS,
        loop:  true,
        callback: () => {
          ticks++;
          const tickDamage = Phaser.Math.Between(ability.tickMin ?? 0, ability.tickMax ?? ability.tickMin ?? 0);
          targets.forEach((targetId) => {
            if (!targetId) return;
            this._applyDamageToCharacter(targetId, Math.round(tickDamage * (this.bossDamageMultiplier ?? 1)), iconKey, damageType);
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

    // applyDebuff block -- applied after damage so the debuff doesn't affect
    // the damage dealt in the same ability fire.
    if (ability.applyDebuff) {
      const debuffDef    = ability.applyDebuff;
      const debuffId     = debuffDef.id;
      const debuffTicks  = debuffDef.durationTicks ?? 4;
      const debuffParams = { ...debuffDef };
      delete debuffParams.id;
      delete debuffParams.durationTicks;

      if (debuffId === 'bleed') {
        targets.forEach((targetId) => {
          if (targetId) this._applyBleed(targetId, debuffDef.totalDamage ?? 0, debuffTicks, iconKey);
        });
      } else if (debuffId === 'mana_burn') {
        targets.forEach((targetId) => {
          if (targetId) this._applyManaBurn(targetId, debuffDef.manaBurnPercent ?? 0, debuffDef.manaBurnDamageMultiplier ?? 1, iconKey);
        });
      } else if (debuffId === 'gouge') {
        targets.forEach((targetId) => {
          if (targetId) {
            this._applyDebuffToCharacter(targetId, 'gouge', debuffTicks, { dispellable: false });
            this._onGougeApplied(targetId);
          }
        });
      } else {
        targets.forEach((targetId) => {
          if (targetId) this._applyDebuffToCharacter(targetId, debuffId, debuffTicks, debuffParams);
        });
      }
    }

    this.playBossAttack();
    this.showAbilityDialogue(abilityId);
  }

  // =====================================
  // Boss cast time system
  // =====================================
  // Starts a cast for an ability with castTimeTicks > 0.
  // Locks the boss out of all other actions for the duration.
  // Emits boss-cast-start so UIScene can show the cast bar.
  _beginBossCast(abilityId, ability) {
    const TICK_MS       = window.GAME_CONFIG.TICK_MS;
    const castDurationMs = ability.castTimeTicks * TICK_MS;

    this.bossIsCasting   = true;
    this.bossCurrentCast = { abilityId, ability };

    console.log('[Boss] Casting', ability.name ?? abilityId, 'for', ability.castTimeTicks, 'ticks');

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.showBossCastBar) {
      uiScene.showBossCastBar(ability.name ?? abilityId, castDurationMs);
    }

    this.bossCurrentCastTimer = this.time.delayedCall(castDurationMs, () => {
      if (!this.bossIsCasting) return;

      this.bossIsCasting       = false;
      this.bossCurrentCast     = null;
      this.bossCurrentCastTimer = null;

      if (uiScene?.hideBossCastBar) uiScene.hideBossCastBar();

      this._resolveBossAbilityEffect(abilityId, ability);
    });
  }

  // Cancels an in-progress boss cast.
  // interruptible defaults true -- uninterruptible casts (ability.interruptible === false)
  // are silently ignored by any interrupt attempt.
  _interruptBossCast() {
    if (!this.bossIsCasting) return false;

    const ability = this.bossCurrentCast?.ability;
    if (ability?.interruptible === false) {
      console.log('[Boss] Cast is uninterruptible -- interrupt has no effect');
      return false;
    }

    if (this.bossCurrentCastTimer) {
      this.bossCurrentCastTimer.remove();
      this.bossCurrentCastTimer = null;
    }

    const abilityName = ability?.name ?? this.bossCurrentCast?.abilityId ?? 'ability';
    console.log('[Boss] Cast interrupted:', abilityName);

    this.bossIsCasting   = false;
    this.bossCurrentCast = null;

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.hideBossCastBar) uiScene.hideBossCastBar(true);

    return true;
  }
  // Reduces a character's current health, updates their health bar,
  // spawns floating damage text, and checks for death.
  // characterId: 'player' | 'tank' | 'healer'
  _applyDamageToCharacter(characterId, damage, iconKey = null, damageType = 'physical') {
    const slot = this.entitySlots[characterId];
    if (!slot) return;
    if ((slot.currentHealth ?? 0) <= 0) return;

    if (!DAMAGE_TYPES.has(damageType)) {
      console.warn('[GameScene] Unknown damageType:', damageType, '-- defaulting to physical');
      damageType = 'physical';
    }

    // Blind reduces hit chance to 0 -- treat as a full miss
    if (this._hasDebuff(characterId, 'blind')) {
      const uiMiss = this.scene.get('UIScene');
      if (uiMiss?.spawnFloatingText) {
        const zone = window.GAME_CONFIG.ZONES[characterId.toUpperCase()] ?? window.GAME_CONFIG.ZONES.PLAYER;
        uiMiss.spawnFloatingText(zone, 'MISS', 'miss');
      }
      return;
    }

    let finalDamage = damage;

    // hit_chance_reduction debuff -- roll against reduced hit chance
    const hitReduction = this.charDebuffs[characterId]?.hit_chance_reduction;
    if (hitReduction) {
      const reducedChance = Math.max(0, 100 - (hitReduction.reductionPercent ?? 0));
      if (Phaser.Math.Between(1, 100) > reducedChance) {
        const uiMiss = this.scene.get('UIScene');
        if (uiMiss?.spawnFloatingText) {
          const zone = window.GAME_CONFIG.ZONES[characterId.toUpperCase()] ?? window.GAME_CONFIG.ZONES.PLAYER;
          uiMiss.spawnFloatingText(zone, 'MISS', 'miss');
        }
        return;
      }
    }

    // damage_taken_increase debuff -- multiply all incoming damage
    const damageTakenIncrease = this.charDebuffs[characterId]?.damage_taken_increase;
    if (damageTakenIncrease) {
      finalDamage = Math.round(finalDamage * (1 + (damageTakenIncrease.increasePercent ?? 0) / 100));
    }

    // damage_type_increase debuff -- extra multiplier for a specific damage type
    const typeIncreaseKey = damageType + '_damage_increase';
    const typeIncrease = this.charDebuffs[characterId]?.[typeIncreaseKey];
    if (typeIncrease) {
      finalDamage = Math.round(finalDamage * (1 + (typeIncrease.increasePercent ?? 0) / 100));
    }

    // Shield absorption -- consume shields FIFO before dealing health damage
    finalDamage = this._absorbThroughShields(characterId, finalDamage, damageType);

    const maxHealth = slot.hpBar?.maxValue ?? 1;

    slot.currentHealth = Math.max(0, (slot.currentHealth ?? maxHealth) - finalDamage);

    this._logBossDamage(iconKey, characterId, finalDamage, damageType, slot.currentHealth);

    const pct = slot.currentHealth / maxHealth;
    this._setHealthBar(slot.hpBar, pct);

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      const zone = window.GAME_CONFIG.ZONES[characterId.toUpperCase()]
                   ?? window.GAME_CONFIG.ZONES.PLAYER;
      uiScene.spawnFloatingText(zone, finalDamage, 'damage', iconKey);
    }

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

    if (characterId === 'player') {
      this.events.emit('player-dead');
    }

    const allDead = ['player', 'tank', 'healer'].every(
      id => (this.entitySlots[id]?.currentHealth ?? 0) <= 0
    );

    if (allDead) {
      this.time.delayedCall(2000, () => {
        this.showPopup('DEFEAT', '#ff2222', 3000);
        this._onPartyWiped();
      });
    }
  }

  // =====================================
  // Combat log
  // =====================================
  // Appends one entry per boss-to-character damage event.
  // abilityName is derived from iconKey (strips 'icon_' prefix), then looked
  // up in levelData.abilities for a human-readable name. Falls back to
  // 'Auto Attack' for autoAttack and the raw id for anything unrecognised.
  _logBossDamage(iconKey, targetId, damage, damageType, targetHpAfter) {
    if (damage <= 0) return;

    const rawId      = iconKey ? iconKey.replace(/^icon_/, '') : 'autoAttack';
    const isAutoAtk  = rawId === 'autoAttack';
    const abilityDef = this.levelData?.abilities?.[rawId];
    const abilityName = isAutoAtk
      ? 'Auto Attack'
      : (abilityDef?.name ?? rawId);

    const sourceName = this._getActiveActorData()?.name ?? 'Boss';
    const targetName = this.entitySlots[targetId]?._data?.name ?? targetId;

    const entry = {
      tick:          this.tickCount,
      sourceName,
      abilityName,
      damageType,
      targetId,
      targetName,
      damage,
      targetHpAfter: Math.round(targetHpAfter),
    };

    this.combatLog.push(entry);
    this.events.emit('combat-log-entry', entry);

    console.log(
      '[CombatLog] T' + entry.tick +
      ' | ' + sourceName +
      ' -> ' + targetName +
      ' | ' + abilityName +
      ' | ' + damage + ' ' + damageType +
      ' | HP left: ' + entry.targetHpAfter
    );
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
    if (this.charHoTs?.[characterId]) this.charHoTs[characterId] = {};

    // Clear all active debuffs on this character
    if (this.charDebuffs?.[characterId]) this.charDebuffs[characterId] = {};

    // Clear all active shields on this character
    if (this.charShields?.[characterId]) this.charShields[characterId] = [];

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

        case 'interrupt': {
          const interrupted = this._interruptBossCast();
          if (interrupted) {
            console.log('[' + casterId + '] Interrupted boss cast');
          }
          break;
        }

        case 'dispel': {
          // Removes one magic debuff from an ally target
          for (const tid of targets.filter(t => t !== 'boss')) {
            this._dispelCharacter(tid, ['magic'], false);
          }
          break;
        }

        case 'purge': {
          // Removes one magic buff from an enemy (boss)
          for (const tid of targets) {
            if (tid === 'boss') this._purgeBoss(['magic']);
          }
          break;
        }

        case 'cleanse': {
          // Removes one magic, poison, or disease debuff from an ally
          for (const tid of targets.filter(t => t !== 'boss')) {
            this._dispelCharacter(tid, ['magic', 'poison', 'disease'], false);
          }
          break;
        }

        case 'purification': {
          // Removes one poison or disease debuff from an ally
          for (const tid of targets.filter(t => t !== 'boss')) {
            this._dispelCharacter(tid, ['poison', 'disease'], false);
          }
          break;
        }

        case 'apply_shield': {
          for (const tid of targets.filter(t => t !== 'boss')) {
            this._applyShieldToCharacter(tid, {
              absorbAmount:  eff.absorbAmount  ?? 5000,
              damageType:    eff.damageType    ?? 'all',
              dispellable:   eff.dispellable   ?? true,
              dispelType:    eff.dispelType    ?? 'magic',
              durationTicks: eff.durationTicks ?? 0,
            });
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
  // Priority flowchart (evaluated top to bottom, first match fires and returns):
  //
  //  1. Awaken         -- any dead ally, always
  //  2. Spike response -- anyone dropped >30% HP since last tick OR is below 20%:
  //                       cast Spirit Surge first if a HoT is running on them,
  //                       then Renew on the most critical target
  //  3. Critical       -- anyone below 25%: Spirit Surge if HoT active, else Renew
  //  4. OOM guard      -- healer mana <15%: skip all mana-costing spells
  //  5. Quicken        -- any ally mana <20%
  //  6. Moderate       -- anyone below 55%: Renew on lowest-HP ally
  //  7. Burgeon upkeep -- any ally below 80% with fewer than 3 Burgeon stacks
  //  8. Sustain        -- any ally below 90% and no sustain HoT running
  _tickHealerAI() {
    const healerSlot = this.entitySlots.healer;
    if (!healerSlot?._data) return;
    if ((healerSlot.currentHealth ?? 0) <= 0) return;
    if (this._hasDebuff('healer', 'stun')) return;
    if (this._hasDebuff('healer', 'silence')) return;

    const actionInterval = healerSlot._data.stats?.actionInterval ?? 1;
    if (this.tickCount % actionInterval !== 0) return;

    const current = healerSlot.sprite?.anims?.currentAnim;
    if (current && current.key === 'healer_casting' && healerSlot.sprite.anims.isPlaying) return;

    const healerMaxMana = healerSlot.manaBar?.maxValue ?? 1;
    const healerManaPct = (healerSlot.currentMana ?? healerMaxMana) / healerMaxMana;

    const hpPct = id => {
      const s = this.entitySlots[id];
      return (s?.currentHealth ?? 0) / (s?.hpBar?.maxValue ?? 1);
    };

    const aliveIds   = ['player', 'tank', 'healer'].filter(id => (this.entitySlots[id]?.currentHealth ?? 0) > 0);
    const lowestHpId = aliveIds.reduce((best, id) => hpPct(id) < hpPct(best) ? id : best, aliveIds[0] ?? 'tank');

    // Snapshot current HP percentages for spike detection next tick
    const currentSnapshot = {};
    for (const id of ['player', 'tank', 'healer']) {
      currentSnapshot[id] = hpPct(id);
    }

    // Detect spike: anyone who lost >30% HP since last tick
    const spikedIds = aliveIds.filter(id => {
      const delta = (this.prevHpPct[id] ?? 1) - currentSnapshot[id];
      return delta >= 0.30 || currentSnapshot[id] < 0.20;
    });

    // Update snapshot after detection so next tick compares against this tick
    this.prevHpPct = currentSnapshot;

    // ==================
    // 1. Awaken
    // ==================
    if (this._castCharacterAbility('healer', 'awaken')) return;

    // ==================
    // 2. Spike response
    // ==================
    if (spikedIds.length > 0) {
      // Most critical spiked target first
      const mostCritical = spikedIds.reduce((worst, id) =>
        hpPct(id) < hpPct(worst) ? id : worst, spikedIds[0]
      );
      const hasHoT = Object.keys(this.charHoTs?.[mostCritical] ?? {}).length > 0;
      if (hasHoT) {
        if (this._castCharacterAbility('healer', 'spirit_surge')) return;
      }
      if (this._castCharacterAbility('healer', 'renew')) return;
    }

    // ==================
    // 3. Critical (<25%)
    // ==================
    if (hpPct(lowestHpId) <= 0.25) {
      const hasHoT = Object.keys(this.charHoTs?.[lowestHpId] ?? {}).length > 0;
      if (hasHoT) {
        if (this._castCharacterAbility('healer', 'spirit_surge')) return;
      }
      if (this._castCharacterAbility('healer', 'renew')) return;
    }

    // ==================
    // 4. OOM guard
    // ==================
    if (healerManaPct < 0.15) return;

    // ==================
    // 5. Quicken
    // ==================
    {
      const mnTarget = aliveIds.find(id => {
        const s = this.entitySlots[id];
        return ((s?.currentMana ?? 1) / (s?.manaBar?.maxValue ?? 1)) < 0.20;
      });
      if (mnTarget) {
        if (this._castCharacterAbility('healer', 'quicken')) return;
      }
    }

    // ==================
    // 6. Moderate (<55%)
    // ==================
    if (hpPct(lowestHpId) <= 0.55) {
      if (this._castCharacterAbility('healer', 'renew')) return;
    }

    // ==================
    // 7. Burgeon upkeep
    // ==================
    // Find the alive ally below 80% with the fewest current Burgeon stacks
    {
      let burgeonTarget = null;
      let fewestStacks  = 3;
      for (const id of aliveIds) {
        if (hpPct(id) > 0.80) continue;
        const stacks = this.charHoTs?.[id]?.['burgeon_hot']?.stacks ?? 0;
        if (stacks < fewestStacks) {
          fewestStacks  = stacks;
          burgeonTarget = id;
        }
      }
      if (burgeonTarget !== null) {
        if (this._castCharacterAbility('healer', 'burgeon')) return;
      }
    }

    // ==================
    // 8. Sustain rolling
    // ==================
    {
      const sustainTarget = aliveIds.find(id => {
        if (hpPct(id) > 0.90) return false;
        return !(this.charHoTs?.[id]?.['sustain_hot']);
      });
      if (sustainTarget) {
        if (this._castCharacterAbility('healer', 'sustain')) return;
      }
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
  _applyDamageToBoss(damage, iconKey = null, damageType = 'physical') {
    const slot = this.entitySlots.boss;
    if (!slot) return;

    // Vanished buff -- boss is immune to all damage
    if (this.bossBuffs?.vanished) return;

    if (!DAMAGE_TYPES.has(damageType)) {
      console.warn('[GameScene] Unknown damageType:', damageType, '-- defaulting to physical');
      damageType = 'physical';
    }

    const resistList   = this._getActiveActorData()?.stats?.resistList ?? {};
    let   finalDamage  = this._applyResistReduction(damage, damageType, resistList);

    // damage_increase_cast -- boss takes amplified damage while casting
    if (this.bossIsCasting && this.bossBuffs?.damage_increase_cast) {
      const mult = this.bossBuffs.damage_increase_cast.multiplier ?? 1;
      finalDamage = Math.round(finalDamage * mult);
    }

    const maxHealth    = slot.hpBar?.maxValue ?? 1;
    slot.currentHealth = Math.max(0, (slot.currentHealth ?? maxHealth) - finalDamage);

    this.secondActorDamageTaken += finalDamage;

    const pct = slot.currentHealth / maxHealth;
    this._setBossHealthBar(slot.hpBar, pct);

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      uiScene.spawnFloatingText(window.GAME_CONFIG.ZONES.BOSS, finalDamage, 'damage', iconKey);
    }

    if (slot.currentHealth <= 0) {
      const encounterActors  = this.levelData?.encounterActors;
      const nextActorIndex   = this.currentEncounterActorIndex + 1;
      const hasNextActor     = encounterActors && nextActorIndex < encounterActors.length;

      if (hasNextActor && !this.encounterSwapInProgress) {
        this._swapEncounterActor(nextActorIndex);
      } else if (!hasNextActor) {
        this.playBossDeath();
      }
    }
  }

  // =====================================
  // Resist reduction
  // =====================================
  // Returns damage reduced by the resist percent for damageType.
  // Physical damage bypasses the resist list entirely.
  // resistList is an object like { fire: 25, shadow: 10, ... }.
  _applyResistReduction(damage, damageType, resistList) {
    if (damageType === 'physical') return damage;
    const resistPercent = resistList?.[damageType] ?? 0;
    return Math.round(damage * (1 - resistPercent / 100));
  }

  // =====================================
  // Heal application
  // =====================================
  // Restores health to a character, respects the wounded debuff, updates
  // the health bar, and spawns a floating heal number via UIScene.
  _applyHealToCharacter(characterId, amount, abilityId = null) {
    const slot = this.entitySlots[characterId];
    if (!slot) return;
    if ((slot.currentHealth ?? 0) <= 0) return;

    let finalAmount = amount;

    const wounded = this.charDebuffs[characterId]?.wounded;
    if (wounded) {
      const reduction = wounded.healingReduction ?? 0;
      finalAmount = Math.round(finalAmount * (1 - reduction / 100));
    }

    // Stacking aura healing bonus/penalty
    const auraHealMult = this._getAuraHealingMultiplier(characterId);
    if (auraHealMult !== 1) {
      finalAmount = Math.round(finalAmount * auraHealMult);
    }

    const maxHealth = slot.hpBar?.maxValue ?? 1;
    slot.currentHealth = Math.min(maxHealth, (slot.currentHealth ?? 0) + finalAmount);

    const pct = slot.currentHealth / maxHealth;
    this._setHealthBar(slot.hpBar, pct);

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      const zone = window.GAME_CONFIG.ZONES[characterId.toUpperCase()]
                   ?? window.GAME_CONFIG.ZONES.PLAYER;
      const iconKey = abilityId ? 'icon_' + abilityId : null;
      uiScene.spawnFloatingText(zone, finalAmount, 'heal', iconKey);
    }
  }

  // =====================================
  // Debuff application
  // =====================================
  // Writes a debuff entry into charDebuffs for characterId.
  // durationTicks: how many game ticks the debuff lasts.
  // params: debuff-specific data (e.g. { healingReduction: 50 } for wounded).
  // dispellable defaults true unless explicitly set false in params.
  _applyDebuffToCharacter(characterId, debuffId, durationTicks, params = {}) {
    if (!this.charDebuffs[characterId]) this.charDebuffs[characterId] = {};

    const dispellable = params.dispellable ?? true;

    this.charDebuffs[characterId][debuffId] = {
      ticksLeft: durationTicks,
      dispellable,
      ...params,
    };

    console.log('[Debuff]', debuffId, '->', characterId, 'for', durationTicks, 'ticks');

    if (characterId === 'player') {
      this.events.emit('player-debuff-update', this.charDebuffs.player);
    }
  }

  // =====================================
  // Shield application
  // =====================================
  // Shield system
  // =====================================
  // Adds a shield to a character's shield queue.
  // Shields are consumed FIFO by _absorbThroughShields.
  // durationTicks 0 means no expiry timer.
  _applyShieldToCharacter(characterId, shieldDef) {
    if (!this.charShields[characterId]) this.charShields[characterId] = [];

    const shield = {
      absorbAmount:  shieldDef.absorbAmount  ?? 5000,
      damageType:    shieldDef.damageType    ?? 'all',
      dispellable:   shieldDef.dispellable   ?? true,
      dispelType:    shieldDef.dispelType    ?? 'magic',
      remaining:     shieldDef.absorbAmount  ?? 5000,
    };

    this.charShields[characterId].push(shield);

    if (shieldDef.durationTicks > 0) {
      const TICK_MS = window.GAME_CONFIG.TICK_MS;
      this.time.delayedCall(shieldDef.durationTicks * TICK_MS, () => {
        const shields = this.charShields[characterId];
        if (!shields) return;
        const idx = shields.indexOf(shield);
        if (idx !== -1) {
          shields.splice(idx, 1);
          console.log('[Shield] Expired on', characterId);
        }
      });
    }

    console.log('[Shield] Applied to', characterId, '-- absorbs', shield.absorbAmount,
      shield.damageType === 'all' ? '(all types)' : '(' + shield.damageType + ')');
  }

  // Runs incoming damage through the character's shield queue.
  // Returns the remaining damage after shields have absorbed what they can.
  // Shields are matched by damageType ('all' matches any type).
  // Consumed in FIFO order -- oldest shield applied absorbs first.
  _absorbThroughShields(characterId, damage, damageType) {
    const shields = this.charShields?.[characterId];
    if (!shields?.length) return damage;

    let remaining     = damage;
    const toRemove    = [];

    for (let i = 0; i < shields.length && remaining > 0; i++) {
      const shield = shields[i];

      const typeMatches = shield.damageType === 'all' || shield.damageType === damageType;
      if (!typeMatches) continue;

      if (shield.remaining >= remaining) {
        shield.remaining -= remaining;
        remaining = 0;
      } else {
        remaining -= shield.remaining;
        shield.remaining = 0;
      }

      if (shield.remaining <= 0) {
        toRemove.push(i);
        console.log('[Shield] Consumed on', characterId);
      }
    }

    // Remove exhausted shields in reverse index order so splices don't shift indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      shields.splice(toRemove[i], 1);
    }

    if (remaining < damage) {
      const absorbed = damage - remaining;
      const uiScene  = this.scene.get('UIScene');
      if (uiScene?.spawnFloatingText) {
        const zone = window.GAME_CONFIG.ZONES[characterId.toUpperCase()]
                     ?? window.GAME_CONFIG.ZONES.PLAYER;
        uiScene.spawnFloatingText(zone, absorbed, 'miss');
      }
    }

    return remaining;
  }

  // =====================================
  // Dispel system
  // =====================================
  // Removes the first dispellable debuff from a character whose dispelType
  // is in the allowedTypes array. Returns true if anything was removed.
  _dispelCharacter(characterId, allowedTypes, removeAll = false) {
    const debuffs = this.charDebuffs?.[characterId];
    if (!debuffs) return false;

    let removed = false;
    for (const debuffId of Object.keys(debuffs)) {
      const debuff = debuffs[debuffId];
      if (!debuff.dispellable) continue;

      const dispelType = debuff.dispelType ?? 'magic';
      if (!allowedTypes.includes(dispelType)) continue;

      delete debuffs[debuffId];
      console.log('[Dispel] Removed', debuffId, 'from', characterId);
      removed = true;
      if (!removeAll) break;
    }

    return removed;
  }

  // Removes the first dispellable buff from the boss whose dispelType is in
  // the allowedTypes array. Purge is a player-facing ability targeting the boss.
  _purgeBoss(allowedTypes) {
    if (!this.bossBuffs) return false;

    for (const buffId of Object.keys(this.bossBuffs)) {
      const buff = this.bossBuffs[buffId];
      if (buff.dispellable === false) continue;

      const dispelType = buff.dispelType ?? 'magic';
      if (!allowedTypes.includes(dispelType)) continue;

      delete this.bossBuffs[buffId];
      console.log('[Purge] Removed boss buff:', buffId);
      return true;
    }

    return false;
  }

  // =====================================
  // Bleed
  // =====================================
  // Physical DoT that bypasses armor entirely.
  // totalDamage is split evenly across durationTicks.
  _applyBleed(characterId, totalDamage, durationTicks, iconKey = null) {
    const TICK_MS    = window.GAME_CONFIG.TICK_MS;
    const tickDamage = Math.round(totalDamage / Math.max(1, durationTicks));
    let   ticks      = 0;

    console.log('[Bleed] ->', characterId, tickDamage + '/tick x' + durationTicks);

    const bleedTimer = this.time.addEvent({
      delay: TICK_MS,
      loop:  true,
      callback: () => {
        ticks++;
        if ((this.entitySlots[characterId]?.currentHealth ?? 0) <= 0) {
          bleedTimer.remove();
          return;
        }

        const slot      = this.entitySlots[characterId];
        const maxHealth = slot?.hpBar?.maxValue ?? 1;
        slot.currentHealth = Math.max(0, (slot.currentHealth ?? maxHealth) - tickDamage);
        this._setHealthBar(slot.hpBar, slot.currentHealth / maxHealth);

        const uiScene = this.scene.get('UIScene');
        if (uiScene?.spawnFloatingText) {
          const zone = window.GAME_CONFIG.ZONES[characterId.toUpperCase()] ?? window.GAME_CONFIG.ZONES.PLAYER;
          uiScene.spawnFloatingText(zone, tickDamage, 'damage', iconKey);
        }

        if (slot.currentHealth <= 0) this._onCharacterDeath(characterId);
        if (ticks >= durationTicks || !this.gameRunning) bleedTimer.remove();
      },
    });

    this._registerDot(characterId, bleedTimer);
  }

  // =====================================
  // Mana burn
  // =====================================
  // Drains manaBurnPercent of the target's current mana, then deals
  // shadow damage equal to the drained amount * damageMultiplier.
  _applyManaBurn(characterId, manaBurnPercent, damageMultiplier, iconKey = null) {
    const slot = this.entitySlots[characterId];
    if (!slot) return;

    const maxMana     = slot.manaBar?.maxValue ?? 0;
    const currentMana = slot.currentMana ?? maxMana;
    if (currentMana <= 0) return;

    const burnedMana = Math.round(currentMana * (manaBurnPercent / 100));
    if (burnedMana <= 0) return;

    slot.currentMana = Math.max(0, currentMana - burnedMana);
    this._setManaBar(slot.manaBar, slot.currentMana / maxMana);

    const shadowDamage = Math.round(burnedMana * damageMultiplier);

    console.log('[ManaBurn] ->', characterId, 'burned', burnedMana, 'mana, dealing', shadowDamage, 'shadow damage');

    const uiScene = this.scene.get('UIScene');
    if (uiScene?.spawnFloatingText) {
      const zone = window.GAME_CONFIG.ZONES[characterId.toUpperCase()] ?? window.GAME_CONFIG.ZONES.PLAYER;
      uiScene.spawnFloatingText(zone, burnedMana, 'mana', iconKey);
    }

    this._applyDamageToCharacter(characterId, shadowDamage, iconKey, 'shadow');
  }

  // =====================================
  // Gouge
  // =====================================
  // Applied when the boss uses gouge on a character.
  // Stuns the target and redirects the boss to attack the second-highest
  // threat character for the duration.
  _onGougeApplied(targetId) {
    this.gougedCharacterId = targetId;
    console.log('[Gouge] Applied to', targetId, '-- boss redirecting to second-highest threat');
  }

  // Called by _tickDebuffs when gouge expires on a character.
  // Restores normal targeting behavior.
  _onGougeExpired(targetId) {
    if (this.gougedCharacterId === targetId) {
      this.gougedCharacterId = null;
      console.log('[Gouge] Expired on', targetId, '-- boss returning to highest threat');
    }
  }
  _hasDebuff(characterId, debuffId) {
    const debuff = this.charDebuffs?.[characterId]?.[debuffId];
    return debuff !== undefined && debuff.ticksLeft > 0;
  }

  // =====================================
  // Debuff tick
  // =====================================
  // Called every game tick. Decrements ticksLeft on all active debuffs
  // and removes any that have expired.
  _tickDebuffs() {
    for (const characterId of ['player', 'tank', 'healer']) {
      const debuffs = this.charDebuffs?.[characterId];
      if (!debuffs) continue;

      for (const debuffId of Object.keys(debuffs)) {
        debuffs[debuffId].ticksLeft--;
        if (debuffs[debuffId].ticksLeft <= 0) {
          if (debuffId === 'gouge') this._onGougeExpired(characterId);
          delete debuffs[debuffId];
          console.log('[Debuff]', debuffId, 'expired on', characterId);
          if (characterId === 'player') {
            this.events.emit('player-debuff-update', this.charDebuffs.player);
          }
        }
      }
    }
  }

  // =====================================
  // Boss buff application
  // =====================================
  // Writes a buff entry into this.bossBuffs.
  // For timed buffs pass durationTicks > 0; pass 0 for permanent buffs (enrage).
  _applyBossBuff(buffId, params = {}, durationTicks = 0) {
    if (!this.bossBuffs) this.bossBuffs = {};
    this.bossBuffs[buffId] = { ...params };

    console.log('[BossBuff]', buffId, 'applied', durationTicks > 0 ? 'for ' + durationTicks + ' ticks' : 'permanently');

    if (durationTicks > 0) {
      const TICK_MS = window.GAME_CONFIG.TICK_MS;
      this.time.delayedCall(durationTicks * TICK_MS, () => {
        if (this.bossBuffs?.[buffId]) {
          delete this.bossBuffs[buffId];
          console.log('[BossBuff]', buffId, 'expired');
        }
      });
    }
  }

  // =====================================
  // Enrage tick checker
  // =====================================
  // Checks each tick whether the enrage threshold has been crossed.
  // Once triggered it permanently applies the enrage buff and stops checking.
  _tickEnrage() {
    if (this.bossBuffs?.enrage) return;

    const activeActorData = this._getActiveActorData();
    const enrageDef       = activeActorData?.enrage ?? this.levelData?.boss?.enrage;
    if (!enrageDef) return;

    const slot = this.entitySlots.boss;
    if (!slot) return;

    const maxHp      = slot.hpBar?.maxValue ?? 1;
    const current    = slot.currentHealth ?? maxHp;
    const hpPct      = current / maxHp;
    const triggerPct = (enrageDef.trigger?.value ?? 30) / 100;

    if (hpPct <= triggerPct) {
      this._applyBossBuff('enrage', {
        damageMultiplier:      enrageDef.damageMultiplier      ?? 1,
        attackSpeedMultiplier: enrageDef.attackSpeedMultiplier ?? 1,
        extraAutoAttackDamage: enrageDef.extraAutoAttackDamage ?? 0,
      }, 0);

      this.showPopup(
        (activeActorData?.name ?? 'Boss') + ' ENRAGES!',
        '#ff2200',
        3000
      );

      console.log('[Enrage] Triggered at', Math.round(hpPct * 100) + '% HP');
    }
  }

  // =====================================
  // Stacking aura system
  // =====================================
  // Assigns the three Aether Drake auras to characters by threat position,
  // then starts a stack interval timer. Called once when the aura phase begins.
  // Each aura gains one stack every stackIntervalTicks.
  _applyAura(characterId, auraId, stackIntervalTicks) {
    if (!this.charAuras[characterId]) this.charAuras[characterId] = {};

    const TICK_MS = window.GAME_CONFIG.TICK_MS;

    if (this.charAuras[characterId][auraId]) {
      try { this.charAuras[characterId][auraId].stackTimer.remove(); } catch(e) {}
    }

    this.charAuras[characterId][auraId] = { stacks: 0, stackTimer: null };

    const auraEntry = this.charAuras[characterId][auraId];

    auraEntry.stackTimer = this.time.addEvent({
      delay: stackIntervalTicks * TICK_MS,
      loop:  true,
      callback: () => {
        if (!this.gameRunning) return;
        auraEntry.stacks++;
        console.log('[Aura]', auraId, 'on', characterId, '-- stacks:', auraEntry.stacks);
      },
    });

    console.log('[Aura]', auraId, 'applied to', characterId, '-- stacks every', stackIntervalTicks, 'ticks');
  }

  // Removes an aura from a character. Stops the stack timer.
  _removeAura(characterId, auraId) {
    const entry = this.charAuras?.[characterId]?.[auraId];
    if (!entry) return;
    try { entry.stackTimer.remove(); } catch(e) {}
    delete this.charAuras[characterId][auraId];
    console.log('[Aura]', auraId, 'removed from', characterId);
  }

  // Returns the current stack count for an aura on a character (0 if not present).
  _getAuraStacks(characterId, auraId) {
    return this.charAuras?.[characterId]?.[auraId]?.stacks ?? 0;
  }

  // Called every tick. Applies per-stack passive drain effects for active auras.
  // Persevering Aura: loses 25 HP per stack per tick.
  // Serene Aura: loses 25 mana per stack per tick.
  // Dominant Aura: no per-tick drain.
  _tickAuras() {
    for (const characterId of ['player', 'tank', 'healer']) {
      const auras = this.charAuras?.[characterId];
      if (!auras) continue;

      for (const [auraId, entry] of Object.entries(auras)) {
        const stacks = entry.stacks ?? 0;
        if (stacks <= 0) continue;

        if (auraId === 'persevering_aura') {
          const drain = 25 * stacks;
          const slot  = this.entitySlots[characterId];
          if (slot && (slot.currentHealth ?? 0) > 0) {
            const maxHp = slot.hpBar?.maxValue ?? 1;
            slot.currentHealth = Math.max(0, (slot.currentHealth ?? maxHp) - drain);
            this._setHealthBar(slot.hpBar, slot.currentHealth / maxHp);
            if (slot.currentHealth <= 0) this._onCharacterDeath(characterId);
          }
        }

        if (auraId === 'serene_aura') {
          const drain = 25 * stacks;
          const slot  = this.entitySlots[characterId];
          if (slot) {
            const maxMana = slot.manaBar?.maxValue ?? 0;
            slot.currentMana = Math.max(0, (slot.currentMana ?? maxMana) - drain);
            this._setManaBar(slot.manaBar, slot.currentMana / maxMana);
          }
        }
      }
    }
  }

  // Returns the healing multiplier for a character from active auras.
  // Persevering Aura and Serene Aura each add +1% per stack.
  // Dominant Aura subtracts 1% per stack.
  _getAuraHealingMultiplier(characterId) {
    let multiplier = 1;
    const auras = this.charAuras?.[characterId] ?? {};

    const perseveringStacks = auras.persevering_aura?.stacks ?? 0;
    const sereneStacks      = auras.serene_aura?.stacks      ?? 0;
    const dominantStacks    = auras.dominant_aura?.stacks    ?? 0;

    multiplier += (perseveringStacks * 0.01);
    multiplier += (sereneStacks      * 0.01);
    multiplier -= (dominantStacks    * 0.01);

    return Math.max(0, multiplier);
  }

  // Returns the mana cost multiplier for a character from active auras.
  // Serene Aura reduces mana cost by 2% per stack, floored at 0.
  _getAuraManaCostMultiplier(characterId) {
    const sereneStacks = this.charAuras?.[characterId]?.serene_aura?.stacks ?? 0;
    return Math.max(0, 1 - (sereneStacks * 0.02));
  }

  // Returns the outgoing damage multiplier for a character from active auras.
  // Dominant Aura adds +1% per stack.
  _getAuraDamageMultiplier(characterId) {
    const dominantStacks = this.charAuras?.[characterId]?.dominant_aura?.stacks ?? 0;
    return 1 + (dominantStacks * 0.01);
  }

  // Returns the incoming damage multiplier FROM Aether Drake for a character.
  // Dominant Aura adds +1% per stack.
  _getAuraDamageTakenFromBossMultiplier(characterId) {
    const dominantStacks = this.charAuras?.[characterId]?.dominant_aura?.stacks ?? 0;
    return 1 + (dominantStacks * 0.01);
  }
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
      if (characterId == "tank") {
        this.threatTable[characterId] += (amount * 3);
      }
      else {
        this.threatTable[characterId] += amount;
      }
    }
  }

  // Returns the character id with the highest current threat,
  // or a random character if all threat is zero.
  // If gougedCharacterId is set (Gouge is active), that character is excluded
  // and the second-highest threat target is returned instead.
  getHighestThreatTarget() {
    if (!this.threatTable) this._initThreatTable();
    const alive = ['tank', 'player', 'healer'].filter(
      id => (this.entitySlots[id]?.currentHealth ?? 0) > 0
    );
    if (!alive.length) return 'tank';

    const candidates = this.gougedCharacterId
      ? alive.filter(id => id !== this.gougedCharacterId)
      : alive;

    const pool = candidates.length ? candidates : alive;

    const total = pool.reduce((sum, id) => sum + (this.threatTable[id] ?? 0), 0);
    if (total === 0) return pool[Phaser.Math.Between(0, pool.length - 1)];

    let highestId = pool[0];
    let highestAmount = -1;
    for (const id of pool) {
      const amount = this.threatTable[id] ?? 0;
      if (amount > highestAmount) {
        highestAmount = amount;
        highestId = id;
      }
    }
    return highestId;
  }

  // Returns the character id with the second-highest current threat.
  // Falls back to highest-threat if only one character is alive.
  getSecondHighestThreatTarget() {
    if (!this.threatTable) this._initThreatTable();
    const alive = ['tank', 'player', 'healer'].filter(
      id => (this.entitySlots[id]?.currentHealth ?? 0) > 0
    );
    if (alive.length <= 1) return this.getHighestThreatTarget();

    let firstId  = alive[0], firstAmt  = -1;
    let secondId = alive[0], secondAmt = -1;

    for (const id of alive) {
      const amount = this.threatTable[id] ?? 0;
      if (amount > firstAmt) {
        secondAmt = firstAmt; secondId = firstId;
        firstAmt  = amount;   firstId  = id;
      } else if (amount > secondAmt) {
        secondAmt = amount; secondId = id;
      }
    }
    return secondId;
  }
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
    if (this._hasDebuff('player', 'stun')) return;

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
    if (this._hasDebuff('tank', 'stun')) return;

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
    if (this._hasDebuff('tank', 'stun')) return;
    if (this._hasDebuff('tank', 'silence')) return;

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
      'sacred_bulwark',        // defensive, use when available
      'sanctify',              // AoE holy damage
      'verdict_of_prejudice',  // highest damage
      'verdict_of_wisdom',     // Spammable ability to restore tank mana
      'verdict_of_righteousness', // Damage filler
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
    if (this._hasDebuff('player', 'stun')) {
      console.log('[Player] Stunned -- ability blocked:', abilityId);
      return;
    }

    const ability = this.levelData?.abilities?.[abilityId];

    // Silence blocks spells and abilities but not auto-attacks
    if (this._hasDebuff('player', 'silence') && ability?.effects) {
      console.log('[Player] Silenced -- ability blocked:', abilityId);
      return;
    }

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

  // =====================================
  // Phase resolution
  // =====================================
  // Returns the phase object that should currently be active.
  // Supports three trigger types:
  //   health_percent  -- active when boss HP <= trigger.value%
  //   time_cycle      -- alternates between two phases on a tick timer
  //   second_actor_alive -- active while the named second actor is alive
  _resolveCurrentPhase() {
    const encounterActors = this.levelData?.encounterActors;
    if (encounterActors?.length) {
      const activeActor = encounterActors[this.currentEncounterActorIndex];
      if (!activeActor) return null;

      // Return a synthetic phase-like object so _tickBossAbilities works unchanged.
      return {
        id:         activeActor.id + '_active',
        abilityIds: activeActor.abilityIds ?? [],
      };
    }

    const phases = this.levelData?.boss?.phases ?? [];
    if (!phases.length) return null;

    const bossSlot = this.entitySlots.boss;
    const maxHp    = bossSlot?.hpBar?.maxValue ?? 1;
    const currentHp = bossSlot?.currentHealth ?? maxHp;
    const hpPct    = currentHp / maxHp;

    // time_cycle phases are handled separately via timeCycleActivePhaseId
    const timeCyclePhase = phases.find(p => p.trigger?.type === 'time_cycle');
    if (timeCyclePhase && this.timeCycleActivePhaseId) {
      const activeCyclePhase = phases.find(p => p.id === this.timeCycleActivePhaseId);
      if (activeCyclePhase) return activeCyclePhase;
    }

    // Walk phases in order, keep the last one whose condition is met
    let resolved = phases[0];
    for (const phase of phases) {
      const triggerType = phase.trigger?.type ?? 'health_percent';

      if (triggerType === 'health_percent') {
        const triggerPct = (phase.trigger?.value ?? 100) / 100;
        if (hpPct <= triggerPct) resolved = phase;
      }

      if (triggerType === 'second_actor_alive') {
        const actorId = phase.trigger?.actorId ?? 'secondActor';
        const slot    = this.entitySlots[actorId];
        if ((slot?.currentHealth ?? 0) > 0) resolved = phase;
      }
    }

    return resolved;
  }

  // =====================================
  // Phase transition ticker
  // =====================================
  // Called every tick. Detects phase changes, fires onEnter events once,
  // and manages time_cycle phase switching.
  _tickPhase() {
    if (this.levelData?.encounterActors?.length) return;

    const phases = this.levelData?.boss?.phases ?? [];
    if (!phases.length) return;

    // Handle time_cycle phases
    const timeCyclePhase = phases.find(p => p.trigger?.type === 'time_cycle');
    if (timeCyclePhase) {
      this._tickTimeCyclePhase(timeCyclePhase, phases);
    }

    // Detect and announce health_percent / second_actor_alive phase changes
    const activePhase = this._resolveCurrentPhase();
    if (!activePhase) return;

    if (activePhase.id !== this.currentPhaseId) {
      const previousId    = this.currentPhaseId;
      this.currentPhaseId = activePhase.id;

      console.log('[Phase] Transition:', previousId, '->', activePhase.id);
      this.onPhaseChange(activePhase.id);

      if (!this.enteredPhaseIds.has(activePhase.id)) {
        this.enteredPhaseIds.add(activePhase.id);
        if (activePhase.onEnter?.length) {
          this._executeOnEnterEvents(activePhase.onEnter, activePhase);
        }
      }
    }
  }

  // =====================================
  // Time cycle phase management
  // =====================================
  // Handles the Aether Drake-style alternating phase pair.
  // Expects the phases array to contain exactly two phases:
  //   one with trigger.type === 'time_cycle' (the primary/aura phase)
  //   one with a normal trigger (the battle phase)
  // The time_cycle phase specifies durationTicks (how long it is active)
  // and cooldownTicks (how long the other phase is active before it returns).
  _tickTimeCyclePhase(timeCyclePhase, phases) {
    const durationTicks  = timeCyclePhase.trigger?.durationTicks  ?? 90;
    const cooldownTicks  = timeCyclePhase.trigger?.cooldownTicks  ?? 30;
    const cycleLength    = durationTicks + cooldownTicks;

    // On first tick, initialise to the time_cycle phase
    if (!this.timeCycleActivePhaseId) {
      this.timeCycleStartTick    = this.tickCount;
      this.timeCycleActivePhaseId = timeCyclePhase.id;
      return;
    }

    const elapsed       = this.tickCount - this.timeCycleStartTick;
    const posInCycle    = elapsed % cycleLength;
    const shouldBeInCycle = posInCycle < durationTicks;
    const currentlyInCycle = this.timeCycleActivePhaseId === timeCyclePhase.id;

    if (shouldBeInCycle && !currentlyInCycle) {
      // Switch back to the time_cycle (aura) phase
      this.timeCycleActivePhaseId = timeCyclePhase.id;
      console.log('[Phase] Time cycle: returning to', timeCyclePhase.id);
      this.onPhaseChange(timeCyclePhase.id);

      // Re-apply auras at start of each aura phase
      this._onAuraPhaseEnter();

    } else if (!shouldBeInCycle && currentlyInCycle) {
      // Switch to the other phase (battle phase)
      const battlePhase = phases.find(p => p.id !== timeCyclePhase.id && p.trigger?.type !== 'time_cycle');
      if (battlePhase) {
        this.timeCycleActivePhaseId = battlePhase.id;
        console.log('[Phase] Time cycle: switching to', battlePhase.id);
        this.onPhaseChange(battlePhase.id);

        // Clear auras when leaving aura phase
        this._onAuraPhaseExit();
      }
    }
  }

  // Called when the aura phase begins. Assigns stacking auras by threat position.
  _onAuraPhaseEnter() {
    const auraMap = [
      { position: 0, auraId: 'persevering_aura' },
      { position: 1, auraId: 'serene_aura' },
      { position: 2, auraId: 'dominant_aura' },
    ];

    const alive = ['tank', 'player', 'healer'].filter(
      id => (this.entitySlots[id]?.currentHealth ?? 0) > 0
    );

    // Sort alive characters by threat descending
    const sorted = [...alive].sort((a, b) => (this.threatTable?.[b] ?? 0) - (this.threatTable?.[a] ?? 0));

    for (const { position, auraId } of auraMap) {
      const characterId = sorted[position];
      if (characterId) {
        this._applyAura(characterId, auraId, 5);
      }
    }

    console.log('[Phase] Aura phase entered -- auras assigned to:', sorted.join(', '));
  }

  // Called when the aura phase ends. Removes all stacking auras and resets stacks.
  _onAuraPhaseExit() {
    for (const characterId of ['player', 'tank', 'healer']) {
      for (const auraId of ['persevering_aura', 'serene_aura', 'dominant_aura']) {
        this._removeAura(characterId, auraId);
      }
    }
    console.log('[Phase] Aura phase exited -- all auras removed');
  }

  // =====================================
  // onEnter event execution
  // =====================================
  // Fires a list of scripted events exactly once when a phase is first entered.
  _executeOnEnterEvents(events, phase) {
    console.log('[Phase] Executing onEnter events for phase:', phase.id);

    for (const event of events) {
      switch (event.type) {

        case 'dialogue': {
          const lines = Array.isArray(event.lines) ? event.lines : [event.lines];
          this.showDialogueSequence(lines, '#ff9944');
          break;
        }

        case 'apply_buff': {
          const actorId    = event.actorId ?? 'boss';
          const buffId     = event.buffId;
          const duration   = event.duration ?? 0;
          const buffParams = event.params ?? {};
          if (actorId === 'boss') {
            this._applyBossBuff(buffId, buffParams, duration);
          }
          console.log('[onEnter] apply_buff:', buffId, 'to', actorId);
          break;
        }

        case 'apply_debuff': {
          const targetType = event.targetType ?? 'all_allies';
          const debuffId   = event.debuffId;
          const duration   = event.duration ?? 4;
          const params     = event.params ?? {};
          const targets = targetType === 'all_allies'
            ? ['player', 'tank', 'healer']
            : [this.getHighestThreatTarget()];
          targets.forEach(id => this._applyDebuffToCharacter(id, debuffId, duration, params));
          console.log('[onEnter] apply_debuff:', debuffId, 'to', targetType);
          break;
        }

        case 'dismiss_second_actor': {
          this._dismissSecondActor();
          break;
        }

        case 'reposition_boss': {
          this._repositionBossToCenter();
          break;
        }

        case 'set_vanished': {
          const actorId = event.actorId ?? 'boss';
          const visible = !event.value;
          if (actorId === 'boss') {
            const bossSlot = this.entitySlots.boss;
            if (bossSlot?.sprite) bossSlot.sprite.setAlpha(visible ? 1 : 0);
            if (event.value) {
              this._applyBossBuff('vanished', {}, 0);
            } else {
              if (this.bossBuffs?.vanished) delete this.bossBuffs.vanished;
            }
          }
          console.log('[onEnter] set_vanished:', actorId, event.value);
          break;
        }

        case 'modify_stats': {
          const actorId    = event.actorId ?? 'boss';
          const statKey    = event.statKey;
          const multiplier = event.multiplier ?? 1;
          const slot       = this.entitySlots[actorId];
          if (slot?._data?.stats?.[statKey] !== undefined) {
            slot._data.stats[statKey] = Math.round(slot._data.stats[statKey] * multiplier);
            console.log('[onEnter] modify_stats:', actorId, statKey, 'x' + multiplier, '=', slot._data.stats[statKey]);
          }
          break;
        }

        default:
          console.warn('[onEnter] Unknown event type:', event.type);
      }
    }
  }

  // =====================================
  // Encounter actor swap trigger
  // =====================================
  // Called every tick. Checks whether the current encounter actor's swapTrigger
  // has been met and advances to the next actor in encounterActors if so.
  // Only runs when levelData.encounterActors is present.
  _tickEncounterActorSwap() {
    const encounterActors = this.levelData?.encounterActors;
    if (!encounterActors?.length) return;
    if (this.encounterSwapInProgress) return;

    const activeActor = encounterActors[this.currentEncounterActorIndex];
    if (!activeActor?.swapTrigger) return;

    if (this.firedEncounterSwapIndices.has(this.currentEncounterActorIndex)) return;

    const nextIndex = this.currentEncounterActorIndex + 1;
    if (nextIndex >= encounterActors.length) return;

    const slot       = this.entitySlots.boss;
    const maxHp      = slot?.hpBar?.maxValue ?? 1;
    const currentHp  = slot?.currentHealth ?? maxHp;
    const hpPct      = currentHp / maxHp;
    const triggerPct = (activeActor.swapTrigger.value ?? 50) / 100;

    if (hpPct <= triggerPct) {
      this.firedEncounterSwapIndices.add(this.currentEncounterActorIndex);
      this._swapEncounterActor(nextIndex);
    }
  }

  _swapEncounterActor(nextIndex) {
    const encounterActors = this.levelData?.encounterActors;
    if (!encounterActors) return;

    const outgoingActor = encounterActors[this.currentEncounterActorIndex];
    const incomingActor = encounterActors[nextIndex];
    if (!incomingActor) return;

    const slot = this.entitySlots.boss;
    if (!slot) return;

    const FADE_OUT_MS = 600;
    const FADE_IN_MS  = 900;

    this.encounterSwapInProgress = true;

    console.log('[EncounterActor] Swapping from', outgoingActor?.id, 'to', incomingActor.id);

    if (outgoingActor?.onSwap?.length) {
      this._executeOnEnterEvents(outgoingActor.onSwap, { id: outgoingActor.id + '_swap' });
    }

    this.tweens.add({
      targets:  slot.sprite,
      alpha:    0,
      duration: FADE_OUT_MS,
      ease:     'Sine.easeIn',
      onComplete: () => {
        this.currentEncounterActorIndex = nextIndex;

        // Clear combat state from the outgoing actor so it does not carry
        // into the incoming one. Cooldowns, buffs, cast state, and queued
        // abilities are all actor-specific and must start fresh.
        this.bossAbilityCooldowns       = {};
        this.bossAbilityLockoutUntil    = 0;
        this.bossBuffs                  = {};
        this.bossIsCasting              = false;
        this.bossCurrentCast            = null;
        this.bossQueuedAbilityId        = null;

        if (this.bossCurrentCastTimer) {
          try { this.bossCurrentCastTimer.remove(); } catch (e) {}
          this.bossCurrentCastTimer = null;
        }

        slot._data         = incomingActor;
        slot.currentHealth = incomingActor.stats?.maxHealth ?? 0;

        if (slot.hpBar) {
          slot.hpBar.maxValue = slot.currentHealth;
          this._setBossHealthBar(slot.hpBar, 1.0);
        }

        if (slot.nameText) {
          slot.nameText.setText(incomingActor.name ?? '???');
          slot.nameText.updateText();

          if (slot.titlePanel) {
            const swapPadding = 16;
            slot.titlePanel.setSize(
              slot.nameText.width + swapPadding * 2,
              slot.nameText.height + swapPadding
            );
          }
        }

        const newSpriteKey   = incomingActor.spriteKey;
        const newSpriteScale = incomingActor.spriteScale ?? 3;

        if (newSpriteKey && this.textures.exists(newSpriteKey)) {
          slot.sprite.setTexture(newSpriteKey, 0);
        }

        slot.sprite.setScale(newSpriteScale);

        const idleKey = incomingActor.id + '_idle';
        if (this.anims.exists(idleKey)) {
          slot.sprite.play(idleKey);
        }

        this.tweens.add({
          targets:  slot.sprite,
          alpha:    1,
          duration: FADE_IN_MS,
          ease:     'Back.easeOut',
          onComplete: () => {
            this.encounterSwapInProgress = false;
          },
        });

        console.log('[EncounterActor] Now active:', incomingActor.id);
      },
    });
  }

  // =====================================
  // Dismiss second actor
  // =====================================
  // Fades out the second actor sprite and stops their ability routine.
  // Used when a phase transition ends the second actor's presence.
  _dismissSecondActor() {
    const slot = this.entitySlots.secondActor;
    if (!slot) return;

    if (slot.sprite) {
      this.tweens.add({
        targets:  slot.sprite,
        alpha:    0,
        duration: 800,
        ease:     'Sine.easeIn',
      });
    }

    slot.currentHealth  = 0;
    this.secondActorSpawned = false;

    console.log('[SecondActor] Dismissed by onEnter event');
  }

  // =====================================
  // Reposition boss to center
  // =====================================
  // Slides the primary boss sprite to the horizontal center of the BOSS zone.
  // Used when the second actor leaves and the boss should fill the full zone.
  _repositionBossToCenter() {
    const slot = this.entitySlots.boss;
    if (!slot?.sprite) return;

    const { WIDTH } = window.GAME_CONFIG;
    const targetX   = WIDTH / 2;

    this.tweens.add({
      targets:  slot.sprite,
      x:        targetX,
      duration: 600,
      ease:     'Sine.easeInOut',
    });

    if (slot.hpBar) {
      const fillTargetX = targetX - slot.hpBar.maxWidth / 2;

      if (slot.hpBar.track) {
        this.tweens.add({ targets: slot.hpBar.track, x: targetX, duration: 600, ease: 'Sine.easeInOut' });
      }
      if (slot.hpBar.fill) {
        this.tweens.add({ targets: slot.hpBar.fill, x: fillTargetX, duration: 600, ease: 'Sine.easeInOut' });
      }
      if (slot.hpBar.valueText) {
        this.tweens.add({ targets: slot.hpBar.valueText, x: targetX, duration: 600, ease: 'Sine.easeInOut' });
      }
    }

    if (slot.nameText) {
      this.tweens.add({
        targets:  slot.nameText,
        x:        targetX,
        duration: 600,
        ease:     'Sine.easeInOut',
      });
    }

    if (slot.titlePanel) {
      this.tweens.add({
        targets:  slot.titlePanel,
        x:        targetX,
        duration: 600,
        ease:     'Sine.easeInOut',
      });
    }

    console.log('[Boss] Repositioned to center:', targetX);
  }
}
