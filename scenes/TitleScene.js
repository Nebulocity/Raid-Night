/**
 * TitleScene.js
 *
 * Entry point scene for Raid Night.
 * Shows the title screen and routes to raid selection.
 */
import { loadSaveData, resetSaveData, saveSaveData } from '../utils/saveData.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  preload() {
    this.load.image('bg_raidnight', 'sprites/bg_raidnight.png');
  }

  create() {
  const { WIDTH, HEIGHT, TICK_MS } = window.GAME_CONFIG;
  this._drawBackground('screen_title', WIDTH, HEIGHT);
  this.add.image(0, 0, 'bg_raidnight').setOrigin(0, 0);

  const saveData = loadSaveData();
  this.registry.set('saveData', saveData);

  this._createMenuButton(WIDTH / 2, HEIGHT * 0.62, 620, 160, 'New Raid Night!', () => {
    const newSave = resetSaveData();
    this.registry.set('saveData', newSave);
    this._goToRaidSelect(0);
  });

  this._createMenuButton(WIDTH / 2, HEIGHT * 0.74, 620, 160, 'Continue Raiding!', () => {
    const currentSave = loadSaveData();
    saveSaveData(currentSave);
    this.registry.set('saveData', currentSave);
    this._goToRaidSelect(TICK_MS * 2);
  });
}

  _drawBackground(textureKey, width, height) {
    this.add.image(width / 2, height / 2, textureKey)
      .setDisplaySize(width, height)
      .setOrigin(0.5);
  }

  _createMenuButton(x, y, width, height, label, onClick) {
    const bg = this.add.rectangle(x, y, width, height, 0x1c120c, 0.92)
      .setStrokeStyle(5, 0xd7a44a, 1)
      .setInteractive({ useHandCursor: true });

    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace',
      fontSize: '44px',
      color: '#fff4cf',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(0x2b1a10, 0.98);
      bg.setStrokeStyle(5, 0xffd37a, 1);
      text.setScale(1.03);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x1c120c, 0.92);
      bg.setStrokeStyle(5, 0xd7a44a, 1);
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
}
