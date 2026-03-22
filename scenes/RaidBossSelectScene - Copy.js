/**
 * RaidBossSelectScene.js
 *
 * Shows all bosses for the selected raid as a grid of buttons.
 * Bosses are locked or unlocked based on which prerequisites the
 * player has defeated (determined by isBossUnlocked from saveData).
 */
const Phaser = window.Phaser; // Phaser is loaded via <script> in index.html

import { RAID_CATALOG }                    from '../data/raidCatalog.js';
import { loadSaveData, saveSaveData, isBossUnlocked } from '../utils/saveData.js';

const BOSSES_PER_ROW  = 3;
const BUTTON_SIZE     = 192;   // source art size -- panels scale around this

// Short display names for the boss select screen.
// Keeps the grid readable without long names wrapping badly.
const BOSS_SHORT_NAMES = {
  sir_trotsalot_and_nighttime:        'Sir Trotsalot',
  mortimer:                           'Mortimer',
  lady_proper:                        'Lady Proper',
  the_movie_theater:                  'The Theater',
  the_archivist:                      'The Archivist',
  aether_drake:                       'Aether Drake',
  phantom_magister:                   'Phantom Magister',
  malvestian_doomhoof_and_kilwretch:  'Doomhoof',
  prince_malarkey:                    'Prince Malarkey',
  dreadwing:                          'Dreadwing',
  magtheridax:                        'Magtheridax',
  grull_the_wyrm_whacker:             'Grull',
  high_king_bonkgar:                  'High King Bonkgar'
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
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, raid.backgroundKey)
      .setOrigin(0.5);

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

    const gridTop    = HEIGHT * 0.15;
    const gridHeight = HEIGHT * 0.80;
    const bosses     = raid.bosses.slice();

    const rows = [];
    bosses.forEach((boss, index) => {
      const rowIndex = Math.floor(index / BOSSES_PER_ROW);
      if (!rows[rowIndex]) rows[rowIndex] = [];
      rows[rowIndex].push(boss);
    });

    const rowCount = rows.length || 1;
    const rowGap   = gridHeight / (rowCount + 1);

    // Pass 1: calculate centre positions for every boss panel.
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
    this._drawUnlockPipes(raid, posMap);

    // Pass 3: draw panels on top.
    rows.forEach((rowBosses, rowIndex) => {
      const colGap  = WIDTH / (rowBosses.length + 1);
      const buttonY = gridTop + rowGap * (rowIndex + 1);
      rowBosses.forEach((boss, colIndex) => {
        const buttonX  = colGap * (colIndex + 1);
        const unlocked = true; // isBossUnlocked(saveData, raid.id, boss.id);
        this._drawBossButton(buttonX, buttonY, boss, raid, saveData, unlocked);
      });
    });
  }

  // Draws silver L-bend pipes from the bottom-centre of each prerequisite
  // panel to the top-centre of each boss that requires it.
  // All corners are right-angles; the elbow runs at the midpoint Y between
  // the two rows so pipes from the same source share a clean horizontal bus.
  _drawUnlockPipes(raid, posMap) {
    const panelH   = BUTTON_SIZE + 64;
    const halfH    = panelH / 2;
    const PIPE_W   = 6;
    const PIPE_COL = 0xaaaaaa;
    const DOT_R    = 6;   // filled circle at junction points

    const gfx = this.add.graphics();

    raid.bosses.forEach(boss => {
      if (!boss.unlockedBy || boss.unlockedBy.length === 0) return;

      const to = posMap[boss.id];
      if (!to) return;

      const toTop = to.y - halfH;   // top-centre of destination panel

      boss.unlockedBy.forEach(reqId => {
        const from = posMap[reqId];
        if (!from) return;

        const fromBottom = from.y + halfH;  // bottom-centre of source panel

        // Elbow Y sits halfway between the two panels
        const elbowY = (fromBottom + toTop) / 2;

        gfx.lineStyle(PIPE_W, PIPE_COL, 0.7);
        gfx.beginPath();
        gfx.moveTo(from.x, fromBottom);
        gfx.lineTo(from.x, elbowY);   // drop down from source
        gfx.lineTo(to.x,   elbowY);   // run horizontal to target column
        gfx.lineTo(to.x,   toTop);    // rise up to target
        gfx.strokePath();

        // Small filled circle at the elbow corner for a "pipe joint" look
        gfx.fillStyle(PIPE_COL, 0.7);
        gfx.fillCircle(from.x, elbowY, DOT_R);
        gfx.fillCircle(to.x,   elbowY, DOT_R);

        // Arrowhead at the destination -- a small downward-pointing triangle
        const AH = 16;  // arrow height
        const AW = 10;  // arrow half-width
        gfx.fillTriangle(
          to.x - AW, toTop - AH,
          to.x + AW, toTop - AH,
          to.x,      toTop
        );
      });
    });
  }

  _drawBossButton(x, y, boss, raid, saveData, unlocked) {
    const alpha     = unlocked ? 1.0 : 0.35;
    const panelW    = BUTTON_SIZE + 20;
    const panelH    = BUTTON_SIZE + 64;  // extra room below icon for name
    const shortName = BOSS_SHORT_NAMES[boss.id] ?? boss.name;

    // Panel -- same style as TitleScene/RaidSelectScene buttons
    const panel = this.add.rectangle(x, y, panelW, panelH, 0x000000)
      .setStrokeStyle(2, 0xaaaaaa, 1)
      .setAlpha(alpha * 0.85);

    // Boss icon centred in the upper portion of the panel
    const icon = this.add.image(x, y - 28, boss.buttonKey)
      .setDisplaySize(BUTTON_SIZE, BUTTON_SIZE)
      .setAlpha(alpha);

    // Boss name below the icon, inside the panel
    const nameText = this.add.text(x, y + panelH / 2 - 28, shortName, {
      fontFamily:      'monospace',
      fontSize:        '26px',
      color:           unlocked ? '#fff1c7' : '#666666',
      stroke:          '#000000',
      strokeThickness: 4,
      align:           'center',
      wordWrap:        { width: panelW - 12 },
    }).setOrigin(0.5);

    if (!unlocked) {
      this.add.text(x, y + panelH / 2 - 6, 'Locked', {
        fontFamily:      'monospace',
        fontSize:        '20px',
        color:           '#555555',
        stroke:          '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5);
      return;
    }

    panel.setInteractive({ useHandCursor: true });

    panel.on('pointerover', () => {
      panel.setFillStyle(0x1a0e2a);
      panel.setStrokeStyle(3, 0xffd700, 1);
      nameText.setColor('#ffd700');
    });

    panel.on('pointerout', () => {
      panel.setFillStyle(0x000000);
      panel.setStrokeStyle(2, 0xaaaaaa, 1);
      nameText.setColor('#fff1c7');
    });

    panel.on('pointerdown', () => {
      this.tweens.add({
        targets:  [panel, icon],
        scaleX:   0.96,
        scaleY:   0.96,
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
      fontFamily: 'monospace',
      fontSize:   '48px',
      color:      '#ccaa66',
      stroke:     '#000000',
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

    // Sprite-based back button (uncomment when button art is ready):
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
