/**
 * RaidSelectScene.js
 *
 * Lets the player choose which raid to enter.
 */
const Phaser = window.Phaser; // Phaser is loaded via <script> in index.html

import { RAID_CATALOG, RAID_ORDER } from '../data/raidCatalog.js';
import { loadSaveData, saveSaveData } from '../utils/saveData.js';

export default class RaidSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RaidSelectScene' });
  }

  create() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;
    const saveData = loadSaveData();
    this.registry.set('saveData', saveData);

    // Black background fill
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000);

    // Raid Night background image, centered
    this.add.image(WIDTH / 2, HEIGHT / 2, 'bg_raidnight')
      .setOrigin(0.5)
      .setTint(0x777777);

    this.add.text(WIDTH / 2, (HEIGHT * 0.08) + 100, 'Choose Your Raid!', {
      fontFamily: 'monospace',
      fontSize: '64px',
      color: '#fff1c7',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    const zoneTop = HEIGHT * 0.15;
    const zoneHeight = HEIGHT * 0.75;
    
    const topY = zoneTop + zoneHeight * 0.25;
    const bottomY = zoneTop + zoneHeight * 0.75;
    
    const newBottomY = bottomY - 100;
    const newTopY = newBottomY - 350;

    // Button spacing
    const centers = [
      { x: WIDTH * 0.70, y: newTopY - 90   },  // spookspire_keep - aligned to the right
      { x: WIDTH * 0.30, y: newBottomY - 125 }, // the_cracked_mountain - aligned to the left
      { x: WIDTH * 0.70, y: newBottomY + 130 }, // the_basement_demon - aligned to the right
    ];

    RAID_ORDER.forEach((raidId, index) => {
      const raid = RAID_CATALOG[raidId];
      const unlocked = saveData.unlockedRaidIds.includes(raidId);
      this._createRaidButton(centers[index].x, centers[index].y, raid, unlocked, saveData);
    });

    this._drawBackButton();
    this._drawRaidWipeZone(saveData, newTopY);
  }

  _createRaidButton(x, y, raid, unlocked, saveData) {

    // Only for testing, remove later.
    unlocked = true;
    
    const alpha = unlocked ? 1 : 0.42;

    const icon = this.add.image(x, y, raid.buttonKey)
      .setOrigin(0.5)
      .setAlpha(alpha)
      .setScale(0.5);

    // Show locked/unlocked
    if (!unlocked) {
      this.add.text(x, y + icon.displayHeight * 0.5 + 16, 'Locked', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#bbbbbb',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5);
      return;
    }

    icon.setInteractive({ useHandCursor: true });

    // Hover effect
    icon.on('pointerover', () => icon.setAlpha(0.8));
    icon.on('pointerout',  () => icon.setAlpha(1));

    // Click
    icon.on('pointerdown', () => {
      this.tweens.add({
        targets: icon,
        scaleX: 0.47,
        scaleY: 0.47,
        duration: 90,
        yoyo: true,
      });

      const nextSave = { ...saveData, lastSelectedRaidId: raid.id };
      saveSaveData(nextSave);
      this.registry.set('saveData', nextSave);
      this.registry.set('selectedRaidId', raid.id);

      this.tweens.add({
        targets: icon,
        alpha: 0,
        duration: 300,
        ease: 'Quad.easeOut',
      });

      this.cameras.main.fadeOut(1000, 0, 0, 0);
      this.time.delayedCall(500, () => {
        this.scene.start('RaidBossSelectScene');
      });
    });
  }

  _drawBackButton() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

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
        this.scene.start('TitleScene');
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
    //   this.time.delayedCall(320, () => { this.scene.start('TitleScene'); });
    // });
  }

  _drawRaidWipeZone(saveData, buttonTopY) {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    const titleY = HEIGHT * 0.08;
    const buttonEdgeY = buttonTopY - 150;
    const tokenY = (titleY + buttonEdgeY) / 2;

    const tokenText = this.add.text(WIDTH / 2, tokenY + 300, 'Raid Wipe Tokens Left: ' + saveData.raidWipeTokensLeft, {
      fontFamily: 'monospace',
      fontSize: '52px',
      color: '#f3e6c2',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: tokenText,
      alpha: { from: 1, to: 0.15 },
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
