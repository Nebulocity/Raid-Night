/**
 * PreloadScene.js
 *
 * Loads all shared game assets used across every encounter:
 * character sprites, ability icons, and menu/UI graphics.
 *
 * Boss-specific assets (idle/attack/defeated sheets, backgrounds)
 * are loaded later by BossLoadingScene once the player selects a boss.
 *
 * Asset paths follow this convention:
 *   characters  -> assets/characters/<role>/character_<role>_<state>.png
 *   ability icons -> assets/abilities/icon_<abilityId>.jpg
 *   raid menus  -> assets/raids/<raid_id>/...
 */
const Phaser = window.Phaser; // Phaser is loaded via <script> in index.html

import { RAID_CATALOG } from '../data/raidCatalog.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  // ============================================================
  // preload
  // ============================================================
  preload() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    this._buildLoadingBar(WIDTH, HEIGHT);

    this.load.on('progress', (value) => {
      this._updateBar(value);
      this._updateOverlay(20 + Math.floor(value * 75), 'Loading assets...');
    });

    this.load.on('fileprogress', (file) => {
      if (this._statusText) this._statusText.setText('Loading: ' + file.key);
    });

    this.load.on('complete', () => {
      this._updateOverlay(100, 'Ready!');
    });

    // Fallback level JSON - used if BossLoadingScene can't find a boss-specific one
    this.load.json('level01', 'data/level01.json');

    this._loadCharacterSprites();
    this._loadBossSprites();
    this._loadAbilityIcons();
    this._loadMenuAssets();
  }

  // ============================================================
  // create
  // ============================================================
  create() {
    this._buildFallbackTextures();

    this.time.delayedCall(400, () => {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.classList.add('hidden');
      this.time.delayedCall(600, () => { if (overlay) overlay.remove(); });
      this.scene.start('TitleScene');
    });
  }

  // ============================================================
  // Character sprites
  // All characters live under assets/characters/<role>/
  // ============================================================
  _loadCharacterSprites() {

    // ---- Shaman (player) ----
    // idle: 1024x512, 4x2 = 8 frames, 256x256 each
    this.load.spritesheet('shaman_idle',     'assets/characters/shaman/character_shaman_idle.webp',     { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('shaman_attack',   'assets/characters/shaman/character_shaman_attack.webp',   { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('shaman_casting',  'assets/characters/shaman/character_shaman_casting.webp',  { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('shaman_hit',      'assets/characters/shaman/character_shaman_hit.webp',      { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('shaman_might_of_earth_totem',    'assets/characters/shaman/character_shaman_might_of_earth_totem.webp',    { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('shaman_tempest_totem',    'assets/characters/shaman/character_shaman_tempest_totem.webp',    { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('shaman_totem_of_fury',    'assets/characters/shaman/character_shaman_totem_of_fury.webp',    { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('shaman_wrath_of_storms_totem',    'assets/characters/shaman/character_shaman_wrath_of_storms_totem.webp',    { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('shaman_defeated', 'assets/characters/shaman/character_shaman_defeated.webp', { frameWidth: 384, frameHeight: 384 });

    // Static burst / arc lightning cast sheets (fall back to casting if not yet produced)
    // this.load.spritesheet('shaman_static_burst', 'assets/characters/shaman/character_shaman_static_burst.webp', { frameWidth: 512, frameHeight: 512 });
    // this.load.spritesheet('shaman_arc_lightning',     'assets/characters/shaman/character_shaman_arc_lightning.webp',     { frameWidth: 384, frameHeight: 512 });

    // ---- Tank ----
    this.load.spritesheet('tank_idle',     'assets/characters/tank/character_tank_idle.webp',     { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('tank_attack',   'assets/characters/tank/character_tank_attack.webp',   { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('tank_hit',      'assets/characters/tank/character_tank_hit.webp',      { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('tank_defeated', 'assets/characters/tank/character_tank_defeated.webp', { frameWidth: 384, frameHeight: 384 });

    // ---- Healer ----
    this.load.spritesheet('healer_idle',     'assets/characters/healer/character_healer_idle.webp',     { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('healer_attack',   'assets/characters/tank/character_healer_attack.webp',   { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('healer_casting',  'assets/characters/healer/character_healer_casting.webp',  { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('healer_hit',      'assets/characters/healer/character_healer_hit.webp',      { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('healer_defeated', 'assets/characters/healer/character_healer_defeated.webp', { frameWidth: 384, frameHeight: 384 });

    // ---- Totems ----
    // Might of Earth: 512x384, 4x3 = 12 frames, 128x128 each
    // this.load.spritesheet('might_of_earth_totem', 'assets/characters/shaman/might_of_earth_totem.webp', { frameWidth: 128, frameHeight: 128 });

    // ---- Title screen background ----
    this.load.image('bg_raidnight', 'assets/bg_raid_night.webp');
  }

  // ============================================================
  // Boss spritesheets
  // All boss sheets use 384x384 frames by default.
  // Adjust frameWidth/frameHeight here if a specific boss sheet differs.
  // ============================================================
  _loadBossSprites() {

    // ---- The Basement Demon ----
    this.load.spritesheet('boss_magtheridax_idle',      'assets/raids/the_basement_demon/bosses/idle/boss_magtheridax_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_magtheridax_attacking', 'assets/raids/the_basement_demon/bosses/attacking/boss_magtheridax_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('boss_magtheridax_defeated',  'assets/raids/the_basement_demon/bosses/defeated/boss_magtheridax_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    // ---- The Cracked Mountain ----
    this.load.spritesheet('boss_high_chief_bonkgar_idle',      'assets/raids/the_cracked_mountain/bosses/idle/boss_high_chief_bonkgar_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_high_chief_bonkgar_attacking', 'assets/raids/the_cracked_mountain/bosses/attacking/boss_high_chief_bonkgar_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('boss_high_chief_bonkgar_defeated',  'assets/raids/the_cracked_mountain/bosses/defeated/boss_high_chief_bonkgar_defeated.webp',   { frameWidth: 384, frameHeight: 384 });
    
    this.load.spritesheet('boss_grull_idle',      'assets/raids/the_cracked_mountain/bosses/idle/boss_grull_the_wyrm_whacker_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_grull_attacking', 'assets/raids/the_cracked_mountain/bosses/attacking/boss_grull_the_wyrm_whacker_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    // this.load.spritesheet('boss_grull_defeated',  'assets/raids/the_cracked_mountain/bosses/defeated/boss_grull_the_wyrm_whacker_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    // ---- Spookspire Keep ----
    this.load.spritesheet('boss_sir_trotsalot_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_sir_trotsalot_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_sir_trotsalot_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_sir_trotsalot_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_sir_trotsalot_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_sir_trotsalot_defeated.webp',   { frameWidth: 384, frameHeight: 384 });
    
    this.load.spritesheet('boss_mortimer_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_mortimer_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_mortimer_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_mortimer_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_mortimer_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_mortimer_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_lady_proper_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_lady_proper_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_lady_proper_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_lady_proper_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_lady_proper_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_lady_proper_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    // The Movie Theater Start
    this.load.spritesheet('boss_big_bad_wolf_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_big_bad_wolf_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_big_bad_wolf_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_big_bad_wolf_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_big_bad_wolf_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_big_bad_wolf_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_juliette_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_juliette_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_juliette_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_juliette_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_juliette_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_juliette_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_romeo_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_romeo_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_romeo_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_romeo_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_romeo_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_romeo_defeated.webp',   { frameWidth: 384, frameHeight: 384 });
    
    this.load.spritesheet('boss_cowardly_lion_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_cowardly_lion_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_cowardly_lion_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_cowardly_lion_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_cowardly_lion_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_cowardly_lion_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_dorothy_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_dorothy_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_dorothy_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_dorothy_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_dorothy_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_dorothy_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_tin_man_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_tin_man_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_tin_man_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_tin_man_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_tin_man_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_tin_man_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_toto_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_toto_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_toto_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_toto_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_toto_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_toto_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_scarecrow_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_scarecrow_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_scarecrow_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_scarecrow_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_scarecrow_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_scarecrow_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_wicked_witch_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_wicked_witch_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_wicked_witch_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_wicked_witch_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_wicked_witch_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_wicked_witch_defeated.webp',   { frameWidth: 384, frameHeight: 384 });   
    
    // The Movie Theater End

    this.load.spritesheet('boss_the_archivist_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_the_archivist_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_the_archivist_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_the_archivist_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_the_archivist_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_the_archivist_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_aether_drake_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_aether_drake_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_aether_drake_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_aether_drake_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_aether_drake_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_aether_drake_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_phantom_magister_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_phatnom_magister_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_phantom_magister_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_phatnom_magister_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_phantom_magister_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_phatnom_magister_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_malvestian_doomhoof_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_malvestian_doomhoof_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_malvestian_doomhoof_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_malvestian_doomhoof_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_malvestian_doomhoof_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_malvestian_doomhoof_defeated.webp',   { frameWidth: 384, frameHeight: 384 });

    this.load.spritesheet('boss_prince_malarkey_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_prince_malarkey_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_prince_malarkey_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_prince_malarkey_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_prince_malarkey_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_prince_malarkey_defeated.webp',   { frameWidth: 384, frameHeight: 384 });
    
    this.load.spritesheet('boss_dreadwing_idle',      'assets/raids/spookspire_keep/bosses/idle/boss_dreadwing_idle.webp',           { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_dreadwing_attacking', 'assets/raids/spookspire_keep/bosses/attacking/boss_dreadwing_attacking.webp',  { frameWidth: 384, frameHeight: 384 });
    this.load.spritesheet('boss_dreadwing_defeated',  'assets/raids/spookspire_keep/bosses/defeated/boss_dreadwing_defeated.webp',   { frameWidth: 384, frameHeight: 384 });
  }

  // ============================================================
  // Ability icons
  // All icons live under assets/abilities/ as .jpg files
  // ============================================================
  _loadAbilityIcons() {
    const icons = [
      // Healer
      'spirit surge', 'renew', 'sustain', 'burgeon', 'quicken', 'awaken',
      
      // Tank
      'verdict_of_righteousness', 'verdict_of_wisdom', 'verdict_of_prejudice', 'sanctify', 'sacred_bulwark', 'verdict_of_wisdom',
      
      // Shaman
      'static_burst', 'arc_lightning', 'interject', 'ensnare', 'salve', 'earthfury',

      // Earth totems
      'might_totem', 'shield_totem', 'waking_totem',

      // Air totems
      'tempest_totem', 'warding_totem', 'flurry_totem',

      // Fire totems
      'blazing_totem', 'warmth_totem', 'wrath_totem',

      // Water totems
      'spring_totem', 'purify_totem', 'chill_totem',
      
      // Boss abilities (used by floating combat text)
      // 'wrath_of_ragnaros', 'magma_blast', 'submerge',
      
      // Generic auto-attack
      'autoAttack',
    ];

    icons.forEach(id => {
      this.load.image('icon_' + id, 'assets/abilities/icon_' + id + '.jpg');
    });
  }

  // ============================================================
  // Menu assets - raid buttons and backgrounds for the select screens
  // ============================================================
  _loadMenuAssets() {
    Object.values(RAID_CATALOG).forEach(raid => {
      // Raid selection screen: button and boss select background
      if (raid.buttonKey && raid.buttonPath) {
        this.load.image(raid.buttonKey, raid.buttonPath);
      }
      if (raid.backgroundKey && raid.backgroundPath) {
        this.load.image(raid.backgroundKey, raid.backgroundPath);
      }

      // Boss selection buttons and loading splash images
      (raid.bosses || []).forEach(boss => {
        if (boss.buttonKey && boss.buttonPath) {
          this.load.image(boss.buttonKey, boss.buttonPath);
        }
        if (boss.splashKey && boss.splashPath) {
          this.load.image(boss.splashKey, boss.splashPath);
        }
      });
    });
  }

  // ============================================================
  // Fallback textures
  // Generated procedurally so menus look reasonable even when
  // image files haven't been placed yet.
  // ============================================================
  _buildFallbackTextures() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    // Full-screen backgrounds
    this._makeFallbackScreen('screen_title',              WIDTH, HEIGHT, 0x140b07, 0x3b1708, 'RAID NIGHT');
    this._makeFallbackScreen('screen_raid_select',        WIDTH, HEIGHT, 0x120d0b, 0x22160d, 'SELECT RAID');
    this._makeFallbackScreen('bg_spookspire_keep',        WIDTH, HEIGHT, 0x100c18, 0x28153a, 'KZ');
    this._makeFallbackScreen('bg_the_cracked_mountain',   WIDTH, HEIGHT, 0x1a120a, 0x4d3115, 'CM');
    this._makeFallbackScreen('bg_the_basement_demon',     WIDTH, HEIGHT, 0x12070b, 0x4c0f1f, 'DB');

    // All raid + boss buttons / splash images
    Object.values(RAID_CATALOG).forEach(raid => {
      if (!this.textures.exists(raid.buttonKey)) {
        const label = (raid.name || raid.id).slice(0, 3).toUpperCase();
        this._makeFallbackButton(raid.buttonKey, 256, 256, 0x3a2208, label);
      }
      if (!this.textures.exists(raid.backgroundKey)) {
        this._makeFallbackScreen(raid.backgroundKey, WIDTH, HEIGHT, 0x160d10, 0x2d1822, raid.name?.slice(0, 3).toUpperCase() || '?');
      }

      (raid.bosses || []).forEach(boss => {
        if (!this.textures.exists(boss.buttonKey)) {
          const label = (boss.name || boss.id).replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'B';
          this._makeFallbackButton(boss.buttonKey, 256, 256, 0x5a2430, label);
        }
        if (!this.textures.exists(boss.splashKey)) {
          const label = (boss.name || boss.id).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'B';
          this._makeFallbackScreen(boss.splashKey, WIDTH, HEIGHT, 0x120d0b, 0x34161a, label);
        }
      });
    });
  }

  // Full-screen gradient fallback
  _makeFallbackScreen(key, width, height, topColor, bottomColor, stampText) {
    if (this.textures.exists(key)) return;

    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Gradient background
    for (let row = 0; row < 20; row++) {
      const t = row / 19;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(topColor),
        Phaser.Display.Color.IntegerToColor(bottomColor),
        19, row,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      g.fillRect(0, Math.floor(height * t), width, Math.ceil(height / 20) + 2);
    }

    // Subtle border
    g.lineStyle(6, 0xffd37a, 0.20);
    g.strokeRect(16, 16, width - 32, height - 32);

    g.generateTexture(key, width, height);
    g.destroy();
  }

  // Small button fallback
  _makeFallbackButton(key, width, height, fillColor, label) {
    if (this.textures.exists(key)) return;

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x120d0b, 1);
    g.fillRoundedRect(0, 0, width, height, 28);
    g.fillStyle(fillColor, 0.95);
    g.fillRoundedRect(14, 14, width - 28, height - 28, 24);
    g.lineStyle(6, 0xffd37a, 0.85);
    g.strokeRoundedRect(14, 14, width - 28, height - 28, 24);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  // ============================================================
  // Loading bar (canvas-drawn, no external assets needed)
  // ============================================================
  _buildLoadingBar(W, H) {
    const cx = W / 2;
    const cy = H / 2;

    this.add.rectangle(cx, cy, W, H, 0x0a0a0a);

    this.add.text(cx, cy - 180, 'RAID NIGHT', {
      fontFamily: 'monospace', fontSize: '52px',
      color: '#c8a96e', align: 'center', letterSpacing: 12,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 100, 'A game about raiding with imaginary friends', {
      fontFamily: 'monospace', fontSize: '28px',
      color: '#666666', align: 'center',
    }).setOrigin(0.5);

    const barW = 500;
    const barH = 16;
    const barX = cx - barW / 2;
    const barY = cy - 20;

    this.add.rectangle(cx, barY + barH / 2, barW + 8, barH + 8, 0x222222).setOrigin(0.5);

    this._barFill    = this.add.rectangle(barX, barY, 0, barH, 0xc8a96e).setOrigin(0, 0);
    this._barShimmer = this.add.rectangle(barX, barY, 0, 3, 0xffd700).setOrigin(0, 0).setAlpha(0.6);

    this._statusText = this.add.text(cx, barY + 44, 'Loading...', {
      fontFamily: 'monospace', fontSize: '22px', color: '#555555', align: 'center',
    }).setOrigin(0.5);
  }

  _updateBar(value) {
    if (this._barFill) {
      this._barFill.width    = 500 * value;
      this._barShimmer.width = 500 * value;
    }
  }

  _updateOverlay(pct, msg) {
    const bar    = document.getElementById('loading-bar-inner');
    const status = document.getElementById('loading-status');
    if (bar)    bar.style.width  = pct + '%';
    if (status) status.textContent = msg;
  }
}
