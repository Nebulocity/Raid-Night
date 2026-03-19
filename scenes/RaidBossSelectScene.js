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

// How many boss buttons to place per row
const BOSSES_PER_ROW = 4;

// Button dimensions
const BUTTON_WIDTH   = 220;
const BUTTON_HEIGHT  = 180;
const BUTTON_ICON_SIZE = 96;

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

    // Background
    this.add.image(WIDTH / 2, HEIGHT / 2, raid.backgroundKey)
      .setDisplaySize(WIDTH, HEIGHT)
      .setOrigin(0.5);

    // Raid name header
    this.add.rectangle(WIDTH / 2, HEIGHT * 0.075, WIDTH, HEIGHT * 0.15, 0x000000, 0.32)
      .setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.08, raid.name, {
      fontFamily:      'monospace',
      fontSize:        '54px',
      color:           '#fff1c7',
      stroke:          '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    this._drawBossGrid(raid, saveData);
    this._drawWipeTokenFooter(saveData);
  }

  // ============================================================
  // Boss grid
  // ============================================================

  _drawBossGrid(raid, saveData) {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    const gridTop    = HEIGHT * 0.15;
    const gridHeight = HEIGHT * 0.75;
    const bosses     = raid.bosses.slice();

    // Split bosses into rows
    const rows = [];
    bosses.forEach((boss, index) => {
      const rowIndex = Math.floor(index / BOSSES_PER_ROW);
      if (!rows[rowIndex]) rows[rowIndex] = [];
      rows[rowIndex].push(boss);
    });

    const rowCount = rows.length || 1;
    const rowGap   = gridHeight / (rowCount + 1);

    rows.forEach((rowBosses, rowIndex) => {
      const colGap = WIDTH / (rowBosses.length + 1);
      const buttonY = gridTop + rowGap * (rowIndex + 1);

      rowBosses.forEach((boss, colIndex) => {
        const buttonX = colGap * (colIndex + 1);
        const unlocked = isBossUnlocked(saveData, raid.id, boss.id);
        this._drawBossButton(buttonX, buttonY, boss, raid, saveData, unlocked);
      });
    });
  }

  _drawBossButton(x, y, boss, raid, saveData, unlocked) {
    const borderColor  = unlocked ? 0xd7a44a : 0x666666;
    const textColor    = unlocked ? '#fff1c7' : '#9e9e9e';
    const buttonAlpha  = unlocked ? 1 : 0.42;
    const interactive  = unlocked ? { useHandCursor: true } : undefined;

    const panel = this.add.rectangle(x, y, BUTTON_WIDTH, BUTTON_HEIGHT, 0x1a100c, 0.90)
      .setStrokeStyle(4, borderColor, 1)
      .setAlpha(buttonAlpha)
      .setInteractive(interactive);

    this.add.image(x, y - 18, boss.buttonKey)
      .setDisplaySize(BUTTON_ICON_SIZE, BUTTON_ICON_SIZE)
      .setOrigin(0.5)
      .setAlpha(buttonAlpha);

    this.add.text(x, y + 52, boss.name, {
      fontFamily:      'monospace',
      fontSize:        '19px',
      color:           textColor,
      stroke:          '#000000',
      strokeThickness: 5,
      align:           'center',
      wordWrap:        { width: BUTTON_WIDTH - 40 },
    }).setOrigin(0.5);

    // Show unlock hint for locked bosses
    if (!unlocked) {
      const requiredNames = boss.unlockedBy
        .map(reqId => raid.bosses.find(b => b.id === reqId)?.name || reqId)
        .join(', ');
      this.add.text(x, y + 78, 'Defeat: ' + requiredNames, {
        fontFamily:      'monospace',
        fontSize:        '14px',
        color:           '#888888',
        stroke:          '#000000',
        strokeThickness: 3,
        align:           'center',
        wordWrap:        { width: BUTTON_WIDTH - 20 },
      }).setOrigin(0.5);
      return;
    }

    // Hover / press handlers for unlocked bosses
    panel.on('pointerover', () => panel.setStrokeStyle(4, 0xffd37a, 1));
    panel.on('pointerout',  () => panel.setStrokeStyle(4, 0xd7a44a, 1));
    panel.on('pointerdown', () => this._selectBoss(boss, raid, saveData));
  }

  _selectBoss(boss, raid, saveData) {
    const updatedSave = {
      ...saveData,
      lastSelectedRaidId: raid.id,
      lastSelectedBossId: boss.id,
    };

    saveSaveData(updatedSave);
    this.registry.set('saveData',        updatedSave);
    this.registry.set('selectedRaidId',  raid.id);
    this.registry.set('selectedBossId',  boss.id);
    this.registry.set('selectedBossMeta', boss);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(320, () => {
      this.scene.start('BossLoadingScene');
    });
  }

  // ============================================================
  // Footer
  // ============================================================

  _drawWipeTokenFooter(saveData) {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    this.add.rectangle(WIDTH / 2, HEIGHT * 0.95, WIDTH, HEIGHT * 0.10, 0x000000, 0.55)
      .setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.95, 'Raid Wipe Tokens Left: ' + saveData.raidWipeTokensLeft, {
      fontFamily:      'monospace',
      fontSize:        '34px',
      color:           '#f3e6c2',
      stroke:          '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);
  }
}
