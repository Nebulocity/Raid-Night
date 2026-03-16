/**
 * UIScene.js
 *
 * Runs in parallel ON TOP of GameScene (launched via scene.launch).
 * Owns:
 *   - Player action bar (spell buttons + totem buttons)
 *   - Cooldown overlays on spell buttons
 *   - Phase banner
 *   - Floating damage/heal numbers
 *   - Tick counter
 *
 * Communication:
 *   - Listens for 'tick', 'phase-change' events from GameScene
 *   - Emits 'player-ability' events to GameScene when player taps a button
 *
 * Action bar layout (left to right):
 *   [Lightning Bolt] [Chain Lightning] | [Earth] [Fire] [Water] [Air]
 *
 * Cooldowns:
 *   - Lightning Bolt: no cooldown, disabled only while casting animation plays
 *   - Chain Lightning: 6-second cooldown after use (reads recastTimer from JSON)
 *   - Totems: no cooldown on the button itself (one totem per element at a time)
 */
export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  // ====
  // init
  // ====
  init() {
    this.abilityButtons  = [];
    this.totemButtons    = [];
    this.tickCount       = 0;
    this.levelData       = null;
    // Tracks active cooldowns: { abilityId -> { endsAt, durationMs, overlay, text } }
    this.cooldowns       = {};
    // Tracks Y stagger offset per zone key to prevent floating text overlap
    this.floatOffsets    = {};
    // Per-tick lock for Lightning Bolt (disabled after cast until next tick)
    this.lbLocked        = false;
    // Buff bar slot objects per character: { player, tank, healer }
    this.buffBars        = {};
  }

  // ======
  // create
  // ======
  create() {
    const { WIDTH, ZONES } = window.GAME_CONFIG;

    // Action bar background
    const ab   = ZONES.ACTION_BAR;
    const abBg = this.add.graphics();
    abBg.fillStyle(0x000000, 0.85);
    abBg.fillRect(ab.x, ab.y, ab.w, ab.h);
    abBg.lineStyle(2, 0x554422, 0.8);
    abBg.lineBetween(ab.x, ab.y, ab.x + ab.w, ab.y);

    // Tick counter label
    this._tickLabel = this.add.text(WIDTH - 20, ab.y + 10, 'TICK 0', {
      fontFamily: 'monospace',
      fontSize:   '20px',
      color:      '#445544',
      align:      'right',
    }).setOrigin(1, 0);

    // Try to grab level data immediately from registry (already set by GameScene)
    // Fall back to the game-ready event in case of unusual timing
    const cachedLevel = this.registry.get('levelData');
    if (cachedLevel) {
      this.levelData = cachedLevel;
      this._buildActionBar(cachedLevel);
      console.log('[UIScene] Built action bar from registry');
    } else {
      // Fallback: wait for game-ready event
      this.events.on('game-ready', (levelData) => {
        this.levelData = levelData;
        this._buildActionBar(levelData);
        console.log('[UIScene] Built action bar from game-ready event');
      });
    }

    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.events.on('tick', (count) => {
        this.tickCount = count;
        if (this._tickLabel) this._tickLabel.setText('TICK ' + count);
        this._updateCooldowns();
      });
      gameScene.events.on('phase-change', (phase) => {
        this._showPhaseBanner(phase);
      });
      // Buff/debuff bar updates from GameScene
      gameScene.events.on('buff-update', ({ characterId, effects }) => {
        this.updateBuffBar(characterId, effects);
      });
    }
  }

  // ===================================
  // ACTION BAR
  // ===================================

  _buildActionBar(levelData) {
    const { ZONES } = window.GAME_CONFIG;
    const ab        = ZONES.ACTION_BAR;
    // Button sizing - all 6 buttons (2 spells + 4 totems) laid out left to right
    // with a divider gap between them, anchored from the left edge
    const btnSize   = 110;
    const btnPad    = 8;
    const btnY      = ab.y + ab.h / 2;
    const startX    = ab.x + 16;   // left margin

    // ========================
    // Left side: spell buttons
    // ========================
    const spellAbilityIds = ['lightning_bolt', 'chain_lightning'];

    spellAbilityIds.forEach((abilityId, i) => {
      const ability = levelData?.abilities?.[abilityId];
      const btnX    = startX + i * (btnSize + btnPad) + btnSize / 2;
      const btn     = this._buildSpellButton(btnX, btnY, btnSize, abilityId, ability);
      this.abilityButtons.push(btn);
    });

    // Divider
    const dividerX = startX + spellAbilityIds.length * (btnSize + btnPad) + 8;
    const divider  = this.add.graphics();
    divider.lineStyle(2, 0x554422, 0.6);
    divider.lineBetween(dividerX, ab.y + 16, dividerX, ab.y + ab.h - 16);

    // ========================
    // Right side: totem buttons
    // ========================
    const totemElements = ['earth', 'fire', 'water', 'air'];
    const totemColors   = {
      earth: 0x88cc44,
      fire:  0xff6622,
      water: 0x44aaff,
      air:   0xaaccff,
    };
    const totemStartX = dividerX + 16;

    totemElements.forEach((element, i) => {
      const btnX = totemStartX + i * (btnSize + btnPad) + btnSize / 2;
      const btn  = this._buildTotemButton(btnX, btnY, btnSize, element, totemColors[element]);
      this.totemButtons.push(btn);
    });
  }

  // ========================
  // Spell button
  // ========================
  _buildSpellButton(x, y, size, abilityId, ability) {
    const iconKey = 'icon_' + abilityId;
    const hasIcon = this.textures.exists(iconKey);

    // Button frame - visible dark blue with bright border
    const bg = this.add.rectangle(x, y, size, size, 0x0d1a2e)
      .setStrokeStyle(3, 0x3399ff, 1.0)
      .setInteractive()
      .setDepth(10);

    // Ability icon - defer check to after scene is fully up
    let icon;
    const iconKeyResolved = this.textures.exists(iconKey) ? iconKey : null;
    if (iconKeyResolved) {
      icon = this.add.image(x, y - 14, iconKeyResolved)
        .setDisplaySize(size - 12, size - 44)
        .setOrigin(0.5)
        .setDepth(11);
    } else {
      // Fallback: bright coloured rectangle so button is visible
      const iconColor = this._abilityColor(ability?.type) || 0x336699;
      icon = this.add.rectangle(x, y - 14, size - 12, size - 44, iconColor, 1.0)
        .setDepth(11);
    }

    // Ability name label below icon
    const name      = ability?.name || abilityId;
    const shortName = name.length > 14 ? name.substring(0, 13) + '...' : name;
    const label     = this.add.text(x, y + size / 2 - 4, shortName, {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2, align: 'center',
    }).setOrigin(0.5, 1).setDepth(12);

    // Mana cost - top-left corner
    const manaLabel = this.add.text(x - size / 2 + 4, y - size / 2 + 4,
      ability?.manaCost ? ability.manaCost + 'm' : '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#66aaff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(12);

    console.log('[UIScene] Built spell button:', abilityId, 'at', x, y);

    // Cooldown overlay - shrinks from top as CD expires
    const cdOverlay = this.add.rectangle(x, y - size / 2, size, size, 0x000000, 0.75)
      .setOrigin(0.5, 0)
      .setDepth(13)
      .setVisible(false);

    // Cooldown countdown text - large and centred
    const cdText = this.add.text(x, y, '', {
      fontFamily: 'monospace', fontSize: '48px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(14);

    bg.on('pointerdown', () => this._pressSpellButton(abilityId, ability, bg, cdOverlay));
    bg.on('pointerover', () => {
      if (!this.cooldowns[abilityId] && !this.lbLocked) bg.setStrokeStyle(3, 0xffd700, 1);
    });
    bg.on('pointerout', () => {
      if (!this.cooldowns[abilityId]) bg.setStrokeStyle(3, 0x4466aa, 1.0);
    });

    return { bg, icon, label, manaLabel, cdOverlay, cdText, abilityId, size };
  }

  _pressSpellButton(abilityId, ability, bg, cdOverlay) {
    // Block if on cooldown (Chain Lightning recast) or per-tick lock (Lightning Bolt)
    if (this.cooldowns[abilityId]) return;
    if (abilityId === 'lightning_bolt' && this.lbLocked) return;

    // Brief press flash
    this.tweens.add({ targets: bg, alpha: 0.4, duration: 80, yoyo: true });

    // Lightning Bolt: disable until next tick fires
    if (abilityId === 'lightning_bolt') {
      this.lbLocked = true;
      bg.setStrokeStyle(3, 0x555555, 0.5);
      cdOverlay.setVisible(true).setDisplaySize(150, 150);
      // Unlock on next tick event
      const gameScene = this.scene.get('GameScene');
      if (gameScene) {
        gameScene.events.once('tick', () => {
          this.lbLocked = false;
          cdOverlay.setVisible(false);
          bg.setStrokeStyle(3, 0x4466aa, 1.0);
        });
      }
    }

    // Chain Lightning: start recast cooldown
    const recastMs = (ability?.recastTimer ?? 0) * 1000;
    if (recastMs > 0) {
      this._startCooldown(abilityId, recastMs, ability, cdOverlay);
    }

    // Emit to GameScene
    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.events.emit('player-ability', abilityId);
    }
  }

  // ========================
  // Totem button
  // ========================
  _buildTotemButton(x, y, size, element, color) {
    const bg = this.add.rectangle(x, y, size, size, 0x111111)
      .setStrokeStyle(2, color, 0.9)
      .setInteractive()
      .setDepth(10);

    // Element icon - colored rectangle
    this.add.rectangle(x, y - 12, size - 20, size - 36, color, 0.5)
      .setDepth(11);

    this.add.text(x, y + size / 2 - 22, element.toUpperCase(), {
      fontFamily: 'monospace', fontSize: '18px',
      color: '#' + color.toString(16).padStart(6, '0'), align: 'center',
    }).setOrigin(0.5, 1).setDepth(12);

    bg.on('pointerdown', () => this._pressTotemButton(element, bg));
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffd700, 1));
    bg.on('pointerout',  () => bg.setStrokeStyle(2, color, 0.9));

    return { bg, element };
  }

  _pressTotemButton(element, bg) {
    this.tweens.add({ targets: bg, alpha: 0.4, duration: 80, yoyo: true });

    // Map element to the first matching ability for that slot
    const elementAbilityMap = {
      earth: 'strength_of_earth_totem',
      fire:  'totem_of_wrath',
      water: 'windfury_totem',
      air:   'wrath_of_air_totem',
    };

    const abilityId = elementAbilityMap[element];
    if (!abilityId) return;

    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.events.emit('player-ability', abilityId);
    }
  }

  // ===================================
  // COOLDOWN SYSTEM
  // ===================================

  _startCooldown(abilityId, durationMs, ability, cdOverlay) {
    const now    = Date.now();
    const endsAt = now + durationMs;

    // Find the button entry to update its cdText
    const btnEntry = this.abilityButtons.find(b => b.abilityId === abilityId);

    this.cooldowns[abilityId] = {
      endsAt,
      durationMs,
      cdOverlay,
      cdText:   btnEntry?.cdText,
      btn:      btnEntry,
    };

    // Show overlay at full height immediately
    cdOverlay.setVisible(true).setDisplaySize(btnEntry?.size ?? 150, btnEntry?.size ?? 150);

    // Dim the button stroke to show it's on cooldown
    if (btnEntry?.bg) btnEntry.bg.setStrokeStyle(2, 0x555555, 0.5);
  }

  // Called every tick to update all active cooldown visuals
  _updateCooldowns() {
    const now = Date.now();

    Object.keys(this.cooldowns).forEach(abilityId => {
      const cd = this.cooldowns[abilityId];
      if (!cd) return;

      const remaining = cd.endsAt - now;

      if (remaining <= 0) {
        // Cooldown expired
        if (cd.cdOverlay) cd.cdOverlay.setVisible(false);
        if (cd.cdText)    cd.cdText.setText('');
        if (cd.btn?.bg)   cd.btn.bg.setStrokeStyle(2, 0x334466, 0.9);
        delete this.cooldowns[abilityId];
        return;
      }

      // Shrink the overlay height proportionally to time remaining
      const pct     = remaining / cd.durationMs;
      const btnSize = cd.btn?.size ?? 110;
      if (cd.cdOverlay) {
        cd.cdOverlay.setDisplaySize(btnSize, Math.ceil(btnSize * pct));
      }

      // Show remaining seconds
      if (cd.cdText) {
        cd.cdText.setText(Math.ceil(remaining / 1000).toString());
      }
    });
  }

  // ===================================
  // FLOATING COMBAT TEXT
  // ===================================

  // spawnFloatingText
  // Shows a floating number over a zone.
  // Optionally pass an iconKey to show a small ability icon left of the number.
  // type: 'damage' | 'heal' | 'miss' | 'crit' | 'mana'
  spawnFloatingText(zone, value, type = 'damage', iconKey = null) {
    const colors = {
      damage: '#ff4422',
      heal:   '#44ff88',
      miss:   '#888888',
      crit:   '#ffdd00',
      mana:   '#4488ff',
    };

    const cx = zone.x + Phaser.Math.Between(20, zone.w - 20);
    // Stagger Y so simultaneous floats don't overlap
    const zoneKey = zone.x + '_' + zone.y;
    const offset  = (this.floatOffsets[zoneKey] ?? 0);
    this.floatOffsets[zoneKey] = (offset + 52) % 156;  // 3 rows of 52px then reset
    const cy = zone.y + zone.h * 0.4 + offset;

    const prefix = type === 'heal' ? '+' : type === 'miss' ? '' : '-';
    const label  = type === 'miss' ? 'MISS' : prefix + value.toLocaleString();
    const isBossZone = zone === window.GAME_CONFIG.ZONES.BOSS;
    const fSize = type === 'crit' ? '64px' : isBossZone ? '64px' : '42px';
    // const fSize  = type === 'crit' ? '52px' : '42px';
    const color  = colors[type] || '#ffffff';

    const objects = [];

    // Optional icon - 40px wide, positioned left of the text
    let iconOffsetX = 0;
    if (iconKey && this.textures.exists(iconKey)) {
      const ICON_SIZE = 56;
      iconOffsetX     = (ICON_SIZE / 2) + 4;
      const icon      = this.add.image(cx - iconOffsetX, cy, iconKey)
        .setDisplaySize(ICON_SIZE, ICON_SIZE)
        .setOrigin(1, 0.5)
        .setDepth(50)
        .setAlpha(0.9);
      objects.push(icon);
    }

    const text = this.add.text(cx + (iconOffsetX > 0 ? 4 : 0), cy, label, {
      fontFamily:      'monospace',
      fontSize:        fSize,
      color:           color,
      stroke:          '#000000',
      strokeThickness: 5,
    }).setOrigin(iconOffsetX > 0 ? 0 : 0.5, 0.5).setDepth(50);
    objects.push(text);

    this.tweens.add({
      targets:  objects,
      y:        '-=140',
      alpha:    0,
      duration: 1400,
      ease:     'Sine.easeOut',
      onComplete: () => objects.forEach(o => o.destroy()),
    });
  }

  // spawnAbilityBadge
  // Shows a floating "[icon] Spell Name" badge on the caster for 2 seconds.
  // zone     - GAME_CONFIG zone of the caster
  // abilityId - e.g. 'regrowth', used to derive icon key and label
  // label    - display name of the ability
  spawnAbilityBadge(zone, abilityId, label) {
    const iconKey  = 'icon_' + abilityId;
    const hasIcon  = this.textures.exists(iconKey);
    const ICON_SIZE = 56;

    const cx = zone.x + zone.w / 2;
    // Stagger badges the same way as floating text
    const badgeKey = 'badge_' + zone.x + '_' + zone.y;
    const bOffset  = (this.floatOffsets[badgeKey] ?? 0);
    this.floatOffsets[badgeKey] = (bOffset + 58) % 116;
    const cy = zone.y + 60 + bOffset;

    const objects = [];

    // Dark pill background
    const bgW   = hasIcon ? ICON_SIZE + 12 + (label.length * 14) + 20 : (label.length * 14) + 20;
    const bgH   = 52;
    const panel = this.add.graphics().setDepth(48);
    panel.fillStyle(0x000000, 0.72);
    panel.fillRoundedRect(cx - bgW / 2, cy - bgH / 2, bgW, bgH, 10);
    objects.push(panel);

    let textX = cx;

    if (hasIcon) {
      const iconX = cx - bgW / 2 + ICON_SIZE / 2 + 8;
      const icon  = this.add.image(iconX, cy, iconKey)
        .setDisplaySize(ICON_SIZE, ICON_SIZE)
        .setOrigin(0.5)
        .setDepth(49)
        .setAlpha(0);
      objects.push(icon);
      textX = iconX + ICON_SIZE / 2 + 8;
    }

    const nameText = this.add.text(textX, cy, label, {
      fontFamily: 'monospace',
      fontSize:   '26px',
      color:      '#ffffff',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(hasIcon ? 0 : 0.5, 0.5).setDepth(49).setAlpha(0);
    objects.push(nameText);

    // Fade in
    this.tweens.add({
      targets:  objects.slice(1),  // fade icon and text (not graphics panel)
      alpha:    1,
      duration: 180,
    });

    // Hold then fade out
    this.time.delayedCall(1800, () => {
      this.tweens.add({
        targets:  objects,
        alpha:    0,
        duration: 300,
        onComplete: () => objects.forEach(o => o.destroy()),
      });
    });
  }

  // ===================================
  // BUFF / DEBUFF BARS
  // ===================================
  // Called once per character slot when the scene is built.
  // Creates MAX_SLOTS invisible icon slots just above the nameplate.
  // zone - the GAME_CONFIG zone for this character
  buildBuffBar(characterId, zone) {
    // Prevent duplicate build if called twice
    if (this.buffBars[characterId]) return;

    const MAX_SLOTS  = 6;
    const ICON_SIZE  = 48;   // icon image size
    const SLOT_SIZE  = 52;   // total slot footprint including border
    const SLOT_PAD   = 8;
    const ROW_W      = MAX_SLOTS * (SLOT_SIZE + SLOT_PAD) - SLOT_PAD;
    // Align left edge of buff row to nameplate left edge (nameplate starts at zone.x - 10)
    const startX     = zone.x - 10;
    // Row of icons sits just above the nameplate (nameplate at zone.y + 480)
    // Icons centered at rowY, ticks label sits 6px below the icon bottom
    const rowY       = zone.y + 435;
    const DEPTH      = 45;

    const slots = [];

    for (let i = 0; i < MAX_SLOTS; i++) {
      const sx = startX + i * (SLOT_SIZE + SLOT_PAD) + SLOT_SIZE / 2;
      const sy = rowY;

      // Dark square background - use a rectangle so setVisible works cleanly
      const frame = this.add.rectangle(sx, sy, SLOT_SIZE, SLOT_SIZE, 0x000000, 0.82)
        .setStrokeStyle(2, 0x888888, 0.9)
        .setOrigin(0.5)
        .setDepth(DEPTH)
        .setVisible(false);

      // Icon image
      const icon = this.add.image(sx, sy, '__DEFAULT')
        .setDisplaySize(ICON_SIZE, ICON_SIZE)
        .setOrigin(0.5)
        .setDepth(DEPTH + 1)
        .setVisible(false);

      // Ticks remaining - small label BELOW the slot, not overlapping icon
      const durationText = this.add.text(sx, sy - SLOT_SIZE / 2 - 4, '', {
        fontFamily: 'monospace', fontSize: '32px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(DEPTH + 2).setVisible(false);

      // Stack badge (x2, x3) - bottom-right corner INSIDE the slot
      const stackText = this.add.text(sx + SLOT_SIZE / 2 - 3, sy + SLOT_SIZE / 2 - 3, '', {
        fontFamily: 'monospace', fontSize: '36px', color: '#ffdd00',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 1).setDepth(DEPTH + 2).setVisible(false);

      slots.push({ frame, icon, durationText, stackText });
    }

    this.buffBars[characterId] = { slots, zone };
  }

  // Called by GameScene whenever buff state changes for a character.
  // effects: array of { abilityId, stacks, ticksLeft }
  // Empty effects array clears all slots.
  updateBuffBar(characterId, effects) {
    const bar = this.buffBars[characterId];
    if (!bar) return;

    const { slots } = bar;

    slots.forEach((slot, i) => {
      const effect = effects[i];

      if (!effect) {
        // Hide unused slots
        slot.frame.setVisible(false);
        slot.icon.setVisible(false);
        slot.durationText.setVisible(false);
        slot.stackText.setVisible(false);
        return;
      }

      const iconKey = 'icon_' + effect.abilityId;
      const hasIcon = this.textures.exists(iconKey);

      slot.frame.setVisible(true);
      slot.icon.setTexture(hasIcon ? iconKey : '__DEFAULT')
        .setVisible(hasIcon);

      // Duration label
      if (effect.ticksLeft != null && effect.ticksLeft > 0) {
        slot.durationText.setText(effect.ticksLeft.toString()).setVisible(true);
      } else {
        slot.durationText.setVisible(false);
      }

      // Stack badge (only show if > 1)
      if (effect.stacks != null && effect.stacks > 1) {
        slot.stackText.setText('x' + effect.stacks).setVisible(true);
      } else {
        slot.stackText.setVisible(false);
      }
    });
  }

  // ===================================
  // PHASE BANNER
  // ===================================

  _showPhaseBanner(phase) {
    const { WIDTH } = window.GAME_CONFIG;
    const cx = WIDTH / 2;
    const cy = 900;

    const panel = this.add.rectangle(cx, cy, WIDTH * 0.7, 90, 0x000000, 0.85)
      .setStrokeStyle(3, 0xff4400, 1)
      .setDepth(60)
      .setAlpha(0);

    const text = this.add.text(cx, cy, '- ' + phase.toUpperCase() + ' -', {
      fontFamily: 'monospace', fontSize: '40px', color: '#ff6633', align: 'center',
    }).setOrigin(0.5).setDepth(61).setAlpha(0);

    this.tweens.add({ targets: [panel, text], alpha: 1, duration: 400 });
    this.tweens.add({
      targets:  [panel, text],
      alpha:    0,
      duration: 500,
      delay:    2000,
      onComplete: () => { panel.destroy(); text.destroy(); },
    });
  }

  // ===================================
  // HELPERS
  // ===================================

  _abilityColor(type) {
    const map = {
      'damage_direct':  0x993322,
      'damage_aoe':     0xcc4422,
      'heal':           0x228844,
      'heal_over_time': 0x22aa55,
      'debuff':         0x553388,
      'totem_buff':     0x885522,
      'totem_absorb':   0x445566,
    };
    return map[type] || 0x334455;
  }
}
