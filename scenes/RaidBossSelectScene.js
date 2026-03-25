/**
 * RaidBossSelectScene.js
 *
 * Shows all bosses for the selected raid as a grid of buttons.
 * Bosses are locked or unlocked based on which prerequisites the
 * player has defeated (determined by isBossUnlocked from saveData).
 */
const Phaser = window.Phaser; // Phaser is loaded via <script> in index.html

import { RAID_CATALOG }                              from '../data/raidCatalog.js';
import { loadSaveData, saveSaveData, isBossUnlocked } from '../utils/saveData.js';

const BOSSES_PER_ROW = 3;
const BUTTON_SIZE    = 192;   // baseline art size for full raids

// Depth layers for the boss grid
const DEPTH_PIPES    = 1;
const DEPTH_PLATE    = 2;
const DEPTH_ICON     = 3;
const DEPTH_NAMETEXT = 4;

// Short display names for the boss select screen.
// Keeps the grid readable without long names wrapping badly.
const BOSS_SHORT_NAMES = {
  sir_trotsalot_and_nighttime:       'Sir Trotsalot',
  mortimer:                          'Mortimer',
  virtuous_lady:                       'Virtuous Lady',
  the_movie_theater:                 'The Theater',
  the_archivist:                     'The Archivist',
  aether_drake:                      'Aether Drake',
  phantom_magister:                  'Phantom Magister',
  malvestian_doomhoof_and_kilwretch: 'Doomhoof',
  prince_malarkey:                   'Prince Malarkey',
  dreadwing:                         'Dreadwing',
  magtheridax:                       'Magtheridax',
  grull_the_wyrm_whacker:            'Grull the Wyrm Whacker',
  high_king_bonkgar:                 'High King Bonkgar',
};

export default class RaidBossSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RaidBossSelectScene' });
  }

  create() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    const saveData       = loadSaveData();
    const selectedRaidId = this.registry.get('selectedRaidId') || saveData.lastSelectedRaidId || 'spookspire_keep';
    const raid           = RAID_CATALOG[selectedRaidId] || RAID_CATALOG.spookspire_keep;

    this.registry.set('saveData', saveData);
    this.registry.set('selectedRaidId', raid.id);

    // Black base
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000);

    // Raid background centered, natural size
    const bg    = this.add.image(WIDTH / 2, HEIGHT / 2, raid.backgroundKey).setOrigin(0.5);
    const bgTop = HEIGHT / 2 - bg.displayHeight / 2;

    // Raid name just above the background
    this.add.text(WIDTH / 2, bgTop - 48, raid.name, {
      fontFamily:      'monospace',
      fontSize:        '54px',
      color:           '#fff1c7',
      stroke:          '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    // Blinking wipe token line
    const tokenText = this.add.text(WIDTH / 2, bgTop - 104, 'Raid Wipe Tokens Left: ' + saveData.raidWipeTokensLeft, {
      fontFamily:      'monospace',
      fontSize:        '34px',
      color:           '#f3e6c2',
      stroke:          '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.tweens.add({
      targets:  tokenText,
      alpha:    { from: 1, to: 0.15 },
      duration: 750,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    this._drawBossGrid(raid, saveData);
    this._drawBackButton();
  }

  // ============================================================
  // Boss grid
  // ============================================================

  _drawBossGrid(raid, saveData) {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    const gridTop    = HEIGHT * 0.10;
    const gridHeight = HEIGHT * 0.80;
    const bosses     = raid.bosses.slice();

    const bossCount  = raid.bosses.length;
    const buttonSize = bossCount <= 1 ? 380
                     : bossCount <= 3 ? 280
                     : BUTTON_SIZE;

    const rows = [];
    bosses.forEach((boss, index) => {
      const rowIndex = Math.floor(index / BOSSES_PER_ROW);
      if (!rows[rowIndex]) rows[rowIndex] = [];
      rows[rowIndex].push(boss);
    });

    const rowCount = rows.length || 1;
    const rowGap   = gridHeight / (rowCount + 1);

    // Pass 1: calculate center positions for every boss panel.
    // Stored as { bossId: { x, y } } so the pipe pass can look them up.
    const posMap = {};
    rows.forEach((rowBosses, rowIndex) => {
      const colGap  = WIDTH / (rowBosses.length + 1);
      const buttonY = gridTop + rowGap * (rowIndex + 1);
      rowBosses.forEach((boss, colIndex) => {
        posMap[boss.id] = { x: colGap * (colIndex + 1), y: buttonY };
      });
    });

    // Pass 2: draw pipes behind panels.
    this._drawUnlockPipes(raid, posMap, buttonSize);

    // Pass 3: draw panels on top.
    rows.forEach((rowBosses, rowIndex) => {
      const colGap  = WIDTH / (rowBosses.length + 1);
      const buttonY = gridTop + rowGap * (rowIndex + 1);
      rowBosses.forEach((boss, colIndex) => {
        const buttonX  = colGap * (colIndex + 1);
        const unlocked = isBossUnlocked(saveData, raid.id, boss.id);
        this._drawBossButton(buttonX, buttonY, boss, raid, saveData, unlocked, buttonSize);
      });
    });
  }

  // Draws silver L-bend pipes from the bottom-center of each prerequisite
  // panel to the top-center of each boss that requires it.
  // All corners are right-angles; the elbow runs at the midpoint Y between
  // the two rows so pipes from the same source share a clean horizontal bus.
  _drawUnlockPipes(raid, posMap, buttonSize) {
    const halfH               = buttonSize / 2;
    const NAMEPLATE_CLEARANCE = 115;
    const PIPE_W              = 6;
    const PIPE_COL            = 0xaaaaaa;
    const DOT_R               = 6;
    const AH                  = 16;
    const AW                  = 10;

    const gfx = this.add.graphics().setDepth(DEPTH_PIPES);

    raid.bosses.forEach(boss => {
      if (!boss.unlockedBy || boss.unlockedBy.length === 0) return;

      const to = posMap[boss.id];
      if (!to) return;

      const toTop = to.y - halfH;

      boss.unlockedBy.forEach(reqId => {
        const from = posMap[reqId];
        if (!from) return;

        const fromBottom = from.y + halfH;
        const rawElbowY  = fromBottom + NAMEPLATE_CLEARANCE;
        const elbowY     = Math.min(rawElbowY, toTop - DOT_R * 2);

        gfx.lineStyle(PIPE_W, PIPE_COL, 0.7);
        gfx.beginPath();
        gfx.moveTo(from.x, fromBottom);
        gfx.lineTo(from.x, elbowY);
        gfx.lineTo(to.x,   elbowY);
        gfx.lineTo(to.x,   toTop - AH);
        gfx.strokePath();

        gfx.fillStyle(PIPE_COL, 0.7);
        gfx.fillCircle(from.x, elbowY, DOT_R);
        gfx.fillCircle(to.x,   elbowY, DOT_R);

        gfx.fillTriangle(
          to.x - AW, toTop - AH,
          to.x + AW, toTop - AH,
          to.x,      toTop
        );
      });
    });
  }

  _drawBossButton(x, y, boss, raid, saveData, unlocked, buttonSize) {
    const alpha     = unlocked ? 1.0 : 0.35;
    const shortName = BOSS_SHORT_NAMES[boss.id] ?? boss.name;

    const icon = this.add.image(x, y, boss.buttonKey)
      .setDisplaySize(buttonSize, buttonSize)
      .setAlpha(alpha)
      .setDepth(DEPTH_ICON);

    // Nameplate -- small dark strip below the icon
    const PLATE_PAD_X = 16;
    const PLATE_PAD_Y = 10;
    const plateW      = buttonSize + 45;

    // Create text off-screen first so we can measure its wrapped height
    // before committing to a final plate position.
    const nameText = this.add.text(0, -9999, shortName, {
      fontFamily:      'monospace',
      fontSize:        '32px',
      color:           unlocked ? '#fff1c7' : '#555555',
      stroke:          '#000000',
      strokeThickness: 4,
      align:           'center',
      wordWrap:        { width: plateW - (PLATE_PAD_X * 2) },
    }).setOrigin(0.5);

    const plateH = nameText.height + (PLATE_PAD_Y * 2);
    const plateY = y + buttonSize / 2 + plateH / 2 + 4;

    nameText.setPosition(x, plateY).setDepth(DEPTH_NAMETEXT);

    const plate = this.add.rectangle(x, plateY, plateW, plateH, 0x000000)
      .setStrokeStyle(1, 0x888888, 0.6)
      .setAlpha(alpha * 0.85)
      .setDepth(DEPTH_PLATE);

    if (!unlocked) {
      nameText.setText('Locked');
      nameText.setColor('#444444');
      return;
    }

    // Hover: icon brightens, nameplate goes gold, text goes gold
    // Uses Phaser tweens for a smooth scale-up on the icon
    icon.setInteractive({ useHandCursor: true });

    icon.on('pointerover', () => {
      icon._scaleTween = this.tweens.add({
        targets:  icon,
        scaleX:   (buttonSize * 1.08) / icon.width,
        scaleY:   (buttonSize * 1.08) / icon.height,
        duration: 120,
        ease:     'Quad.easeOut',
        onComplete: () => {
          icon._scaleTween = null;
          icon._hoverTween = this.tweens.add({
            targets:  icon,
            scaleX:   (buttonSize * 1.04) / icon.width,
            scaleY:   (buttonSize * 1.04) / icon.height,
            duration: 600,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
          });
        },
      });
      plate.setStrokeStyle(2, 0xffd700, 1);
      plate.setFillStyle(0x1a0e2a);
      nameText.setColor('#ffd700');
    });

    icon.on('pointerout', () => {
      if (icon._scaleTween) {
        icon._scaleTween.stop();
        icon._scaleTween = null;
      }
      if (icon._hoverTween) {
        icon._hoverTween.stop();
        icon._hoverTween = null;
      }
      this.tweens.add({
        targets:  icon,
        scaleX:   buttonSize / icon.width,
        scaleY:   buttonSize / icon.height,
        duration: 120,
        ease:     'Quad.easeOut',
      });
      plate.setStrokeStyle(1, 0x888888, 0.6);
      plate.setFillStyle(0x000000);
      nameText.setColor('#fff1c7');
    });

    icon.on('pointerdown', () => {
      this.tweens.add({
        targets:  icon,
        scaleX:   (buttonSize * 0.94) / icon.width,
        scaleY:   (buttonSize * 0.94) / icon.height,
        duration: 80,
        yoyo:     true,
        onComplete: () => this._selectBoss(boss, raid, saveData),
      });
    });
  }

  _selectBoss(boss, raid, saveData) {
    const updatedSave = {
      ...saveData,
      lastSelectedRaidId: raid.id,
      lastSelectedBossId: boss.id,
    };

    saveSaveData(updatedSave);
    this.registry.set('saveData',         updatedSave);
    this.registry.set('selectedRaidId',   raid.id);
    this.registry.set('selectedBossId',   boss.id);
    this.registry.set('selectedBossMeta', boss);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(320, () => {
      this.scene.start('BossLoadingScene');
    });
  }

  _drawBackButton() {
    const { HEIGHT } = window.GAME_CONFIG;

    // Text-based back button - replace with sprite version later
    const btn = this.add.text(85, HEIGHT * 0.96, '< BACK', {
      fontFamily:      'monospace',
      fontSize:        '48px',
      color:           '#ccaa66',
      stroke:          '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#ffd37a'));
    btn.on('pointerout',  () => btn.setColor('#ccaa66'));
    btn.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(320, () => {
        this.scene.start('RaidSelectScene');
      });
    });

    // Sprite-based back button (TODO: Replace when I have the image):
    // const btn = this.add.image(80, HEIGHT * 0.96, 'button_back')
    //   .setDisplaySize(120, 60)
    //   .setOrigin(0.5)
    //   .setInteractive({ useHandCursor: true });
    // btn.on('pointerover', () => btn.setTint(0xffd37a));
    // btn.on('pointerout',  () => btn.clearTint());
    // btn.on('pointerdown', () => {
    //   this.cameras.main.fadeOut(300, 0, 0, 0);
    //   this.time.delayedCall(320, () => { this.scene.start('RaidSelectScene'); });
    // });
  }
}
