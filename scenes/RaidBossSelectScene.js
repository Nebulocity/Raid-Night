/**
 * RaidBossSelectScene.js
 *
 * Lets the player choose which boss to fight within a raid.
 */
import { RAID_CATALOG } from '../data/raidCatalog.js';
import { loadSaveData, saveSaveData } from '../utils/saveData.js';

export default class RaidBossSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RaidBossSelectScene' });
  }

  create() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;
    const saveData = loadSaveData();
    const selectedRaidId = this.registry.get('selectedRaidId') || saveData.lastSelectedRaidId || 'molten_core';
    const raid = RAID_CATALOG[selectedRaidId] || RAID_CATALOG.molten_core;

    this.registry.set('saveData', saveData);
    this.registry.set('selectedRaidId', raid.id);

    this.add.image(WIDTH / 2, HEIGHT / 2, raid.backgroundKey)
      .setDisplaySize(WIDTH, HEIGHT)
      .setOrigin(0.5);

    this.add.rectangle(WIDTH / 2, HEIGHT * 0.075, WIDTH, HEIGHT * 0.15, 0x000000, 0.32)
      .setOrigin(0.5);

    this.add.text(WIDTH / 2, HEIGHT * 0.08, raid.name, {
      fontFamily: 'monospace',
      fontSize: '54px',
      color: '#fff1c7',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    this._drawBossGrid(raid, saveData);
    this._drawRaidWipeZone(saveData);
  }

  _drawBossGrid(raid, saveData) {
    const { WIDTH, HEIGHT, TICK_MS } = window.GAME_CONFIG;
    const zoneTop = HEIGHT * 0.15;
    const zoneHeight = HEIGHT * 0.75;
    const unlockedBossIds = saveData.unlockedBossIds?.[raid.id] || [];
    const bosses = raid.bosses.slice(0, 12);
    const rows = [[], [], []];

    bosses.forEach((boss, index) => {
      if (index < 4) {
        rows[0].push(boss);
      } else if (index < 8) {
        rows[1].push(boss);
      } else {
        rows[2].push(boss);
      }
    });

    const visibleRows = rows.filter((row) => row.length > 0);
    const rowCount = visibleRows.length || 1;
    const rowGap = zoneHeight / (rowCount + 1);

    visibleRows.forEach((rowBosses, rowIndex) => {
      const colGap = WIDTH / (rowBosses.length + 1);
      const y = zoneTop + rowGap * (rowIndex + 1);

      rowBosses.forEach((boss, colIndex) => {
        const x = colGap * (colIndex + 1);
        const unlocked = unlockedBossIds.includes(boss.id);

        const panel = this.add.rectangle(x, y, 220, 220, 0x1a100c, 0.90)
          .setStrokeStyle(4, unlocked ? 0xd7a44a : 0x666666, 1)
          .setAlpha(unlocked ? 1 : 0.42)
          .setInteractive(unlocked ? { useHandCursor: true } : undefined);

        this.add.image(x, y - 10, boss.buttonKey)
          .setDisplaySize(132, 132)
          .setOrigin(0.5)
          .setAlpha(unlocked ? 1 : 0.42);

        this.add.text(x, y + 84, boss.name, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: unlocked ? '#fff1c7' : '#9e9e9e',
          stroke: '#000000',
          strokeThickness: 5,
          align: 'center',
          wordWrap: { width: 190 },
        }).setOrigin(0.5);

        if (!unlocked) {
          return;
        }

        panel.on('pointerover', () => panel.setStrokeStyle(4, 0xffd37a, 1));
        panel.on('pointerout', () => panel.setStrokeStyle(4, 0xd7a44a, 1));
        panel.on('pointerdown', () => {
          const nextSave = {
            ...saveData,
            lastSelectedRaidId: raid.id,
            lastSelectedBossId: boss.id,
          };

          saveSaveData(nextSave);
          this.registry.set('saveData', nextSave);
          this.registry.set('selectedRaidId', raid.id);
          this.registry.set('selectedBossId', boss.id);
          this.registry.set('selectedBossMeta', boss);

          this.time.delayedCall(TICK_MS * 2, () => {
            this.cameras.main.fadeOut(450, 0, 0, 0);
            this.time.delayedCall(500, () => {
              this.scene.start('BossLoadingScene');
            });
          });
        });
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
