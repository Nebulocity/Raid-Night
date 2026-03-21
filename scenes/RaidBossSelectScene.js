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
const BUTTON_SIZE     = 280;   // square — buttons are the artwork, no panel needed

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

  _drawBossButton(x, y, boss, raid, saveData, unlocked) {
    const alpha = unlocked ? 1 : 0.35;

    const icon = this.add.image(x, y, boss.buttonKey)
      .setOrigin(0.5)
      .setDisplaySize(BUTTON_SIZE, BUTTON_SIZE)
      .setAlpha(alpha);

    // Boss name below the icon
    const nameText = this.add.text(x, y + BUTTON_SIZE * 0.52, boss.name, {
      fontFamily:      'monospace',
      fontSize:        '22px',
      color:           unlocked ? '#fff1c7' : '#888888',
      stroke:          '#000000',
      strokeThickness: 5,
      align:           'center',
      wordWrap:        { width: BUTTON_SIZE },
    }).setOrigin(0.5);

    // Unlock hint for locked bosses
    if (!unlocked) {
      const requiredNames = boss.unlockedBy
        .map(reqId => raid.bosses.find(b => b.id === reqId)?.name || reqId)
        .join(', ');
      this.add.text(x, y + BUTTON_SIZE * 0.52 + 32, 'Defeat: ' + requiredNames, {
        fontFamily:      'monospace',
        fontSize:        '16px',
        color:           '#666666',
        stroke:          '#000000',
        strokeThickness: 3,
        align:           'center',
        wordWrap:        { width: BUTTON_SIZE },
      }).setOrigin(0.5);
      return;
    }

    icon.setInteractive({ useHandCursor: true });

    // Hover: brighten with tint
    icon.on('pointerover', () => {
      icon.setTint(0xffd37a);
      nameText.setColor('#ffd37a');
    });
    icon.on('pointerout', () => {
      icon.clearTint();
      nameText.setColor('#fff1c7');
    });

    // Click: quick scale pulse then select
    icon.on('pointerdown', () => {
      this.tweens.add({
        targets:  icon,
        scaleX:   (BUTTON_SIZE * 0.93) / icon.width,
        scaleY:   (BUTTON_SIZE * 0.93) / icon.height,
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
    const btn = this.add.text(80, HEIGHT * 0.96, '< BACK', {
      fontFamily: 'monospace',
      fontSize:   '36px',
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
