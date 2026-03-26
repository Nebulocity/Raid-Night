/**
 * TitleScene.js
 *
 * Entry point scene for Raid Night.
 * Shows the title screen and routes to raid selection.
 */
const Phaser = window.Phaser; // Phaser is loaded via <script> in index.html

import { loadSaveData, resetSaveData, saveSaveData } from '../utils/saveData.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  preload() {
    // bg_raidnight is loaded by PreloadScene - nothing to do here
  }

  create() {
    const { WIDTH, HEIGHT, TICK_MS } = window.GAME_CONFIG;
    this._drawBackground('screen_title', WIDTH, HEIGHT);
    this.add.image(0, 0, 'bg_raidnight').setOrigin(0, 0);

    const saveData = loadSaveData();
    this.registry.set('saveData', saveData);

    this._createMenuButton(WIDTH / 2, HEIGHT * 0.56, 620, 160, 'New Raid', () => {
    const newSave = resetSaveData();
    this.registry.set('saveData', newSave);
    this._goToRaidSelect(0);
  });

  this._createMenuButton(WIDTH / 2, HEIGHT * 0.64, 620, 160, 'Continue', () => {
    const { FONTS } = window.GAME_CONFIG;
    const currentSave = loadSaveData();
    saveSaveData(currentSave);
    this.registry.set('saveData', currentSave);
    this._goToRaidSelect(TICK_MS * 2);
  });

  this._createMenuButton(WIDTH / 2, HEIGHT * 0.72, 620, 160, 'How to Play', () => {
    const { FONTS } = window.GAME_CONFIG;
    this._goToHowToPlay();
  });
}

  _drawBackground(textureKey, width, height) {
    this.add.image(width / 2, height / 2, textureKey)
      .setDisplaySize(width, height)
      .setOrigin(0.5);
  }

  _createMenuButton(x, y, width, height, label, onClick) {
    const { FONTS } = window.GAME_CONFIG;
    const bg = this.add.rectangle(x, y, width, height, 0x000000, 0.65)
      .setStrokeStyle(3, 0xffd700, 1)
      .setInteractive({ useHandCursor: true });

    const text = this.add.text(x, y, label, {
      fontFamily: FONTS.DECORATIVE,
      fontSize: '64px',
      color: '#fff4cf',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(0x1a0e2a, 1);
      bg.setStrokeStyle(4, 0xffd700, 1);
      bg.setAlpha(0.75);
      text.setScale(1.03);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x000000, 0.65);
      bg.setStrokeStyle(3, 0xffd700, 1);
      text.setScale(1);
    });

    bg.on('pointerdown', () => {
      this.tweens.add({ targets: [bg, text], scaleX: 0.98, scaleY: 0.98, duration: 80, yoyo: true });
      onClick();
    });
  }

  _goToRaidSelect(delayMs) {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(delayMs + 420, () => {
      this.scene.start('RaidSelectScene');
    });
  }

  _goToHowToPlay() {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(320, () => {
      this.scene.start('HowToPlayScene');
    });
  }
}
