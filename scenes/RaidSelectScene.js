/**
 * RaidSelectScene.js
 *
 * Lets the player choose which raid to enter.
 */
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

    this.add.image(WIDTH / 2, HEIGHT / 2, 'screen_raid_select')
      .setDisplaySize(WIDTH, HEIGHT)
      .setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.08, 'Choose Your Raid!', {
      fontFamily: 'monospace',
      fontSize: '52px',
      color: '#fff1c7',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    const zoneTop = HEIGHT * 0.15;
    const zoneHeight = HEIGHT * 0.75;
    const centers = [
      { x: WIDTH * 0.30, y: zoneTop + zoneHeight * 0.25 },
      { x: WIDTH * 0.70, y: zoneTop + zoneHeight * 0.25 },
      { x: WIDTH * 0.30, y: zoneTop + zoneHeight * 0.75 },
      { x: WIDTH * 0.70, y: zoneTop + zoneHeight * 0.75 },
    ];

    RAID_ORDER.forEach((raidId, index) => {
      const raid = RAID_CATALOG[raidId];
      const unlocked = saveData.unlockedRaidIds.includes(raidId);
      this._createRaidButton(centers[index].x, centers[index].y, raid, unlocked, saveData);
    });

    this._drawRaidWipeZone(saveData);
  }

  _createRaidButton(x, y, raid, unlocked, saveData) {
    const width = 360;
    const height = 300;
    const alpha = unlocked ? 1 : 0.42;

    const panel = this.add.rectangle(x, y, width, height, 0x1b110d, 0.90)
      .setStrokeStyle(4, unlocked ? 0xd79f4e : 0x666666, 1)
      .setAlpha(alpha)
      .setInteractive(unlocked ? { useHandCursor: true } : undefined);

    this.add.image(x, y - 20, raid.buttonKey)
      .setDisplaySize(180, 180)
      .setOrigin(0.5)
      .setAlpha(alpha);

    this.add.text(x, y + 98, raid.name, {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: unlocked ? '#fff0c9' : '#999999',
      stroke: '#000000',
      strokeThickness: 5,
      align: 'center',
      wordWrap: { width: width - 40 },
    }).setOrigin(0.5);

    if (!unlocked) {
      this.add.text(x, y + 132, 'Locked', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#bbbbbb',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5);
      return;
    }

    panel.on('pointerover', () => panel.setStrokeStyle(4, 0xffd37a, 1));
    panel.on('pointerout', () => panel.setStrokeStyle(4, 0xd79f4e, 1));
    panel.on('pointerdown', () => {
      this.tweens.add({ targets: panel, scaleX: 0.98, scaleY: 0.98, duration: 90, yoyo: true });
      const nextSave = { ...saveData, lastSelectedRaidId: raid.id };
      saveSaveData(nextSave);
      this.registry.set('saveData', nextSave);
      this.registry.set('selectedRaidId', raid.id);
      this.cameras.main.fadeOut(450, 0, 0, 0);
      this.time.delayedCall(500, () => {
        this.scene.start('RaidBossSelectScene');
      });
    });
  }

  _drawRaidWipeZone(saveData) {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    this.add.rectangle(WIDTH / 2, HEIGHT * 0.95, WIDTH, HEIGHT * 0.10, 0x000000, 0.55)
      .setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.95, 'Raid Wipe Tokens Left: ' + saveData.raidWipeTokensLeft, {
      fontFamily: 'monospace',
      fontSize: '34px',
      color: '#f3e6c2',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);
  }
}
