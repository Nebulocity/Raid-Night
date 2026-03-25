/**
 * RaidSelectScene.js
 *
 * Lets the player choose which raid to enter.
 *
 * Layout: header (title + wipe tokens) at the top, then a vertical stack of
 * full-width raid buttons -- thumbnail on the left, name and boss count on
 * the right. No zig-zag alternation.
 */
const Phaser = window.Phaser; // Phaser is loaded via <script> in index.html

import { RAID_CATALOG, RAID_ORDER } from '../data/raidCatalog.js';
import { loadSaveData, saveSaveData } from '../utils/saveData.js';

// How tall each raid button row is (px). The thumbnail is scaled to fit inside
// this height with a small inset, and the button background fills the width.
const BTN_HEIGHT   = 345;
const BTN_MARGIN   = 40;   // vertical gap between buttons
const BTN_PADDING  = 32;   // horizontal inset from screen edge
const THUMB_INSET  = 20;   // gap between thumbnail edge and button edge

export default class RaidSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RaidSelectScene' });
  }

  create() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;
    const saveData = loadSaveData();
    this.registry.set('saveData', saveData);

    // Black fill
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000);

    // Background image, dimmed
    this.add.image(WIDTH / 2, HEIGHT / 2, 'bg_raidnight')
      .setOrigin(0.5)
      .setTint(0x777777);

    // ---- Header -------------------------------------------------------
    const titleY = HEIGHT * 0.10;

    this.add.text(WIDTH / 2, titleY, 'Choose Your Raid!', {
      fontFamily: 'Cinzel Decorative, serif',
      fontSize:   '64px',
      color:      '#fff1c7',
      stroke:     '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    const tokenText = this.add.text(WIDTH / 2, titleY + 90, 'Raid Wipe Tokens Left: ' + saveData.raidWipeTokensLeft, {
      fontFamily: 'Cinzel, serif',
      fontSize:   '44px',
      color:      '#f3e6c2',
      stroke:     '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.tweens.add({
      targets:  tokenText,
      alpha:    { from: 1, to: 0.2 },
      duration: 750,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    // ---- Button stack -------------------------------------------------
    // Start the first button far enough below the header to avoid overlap.
    const stackStartY = titleY + 800;

    RAID_ORDER.forEach((raidId, index) => {
      const raid     = RAID_CATALOG[raidId];
      const unlocked = true; // TODO: restore lock check from saveData

      const btnY = stackStartY + index * (BTN_HEIGHT + BTN_MARGIN);
      this._createRaidButton(WIDTH, btnY, raid, unlocked, saveData);
    });

    // ---- Back button --------------------------------------------------
    this._drawBackButton();
  }

  // Draws one full-width raid button row centerd on btnY.
  // Layout: [thumb] [name + boss count] on a dark rounded panel.
  _createRaidButton(WIDTH, btnY, raid, unlocked, saveData) {
    const alpha    = unlocked ? 1.0 : 0.42;
    const btnW     = WIDTH - BTN_PADDING * 2;
    const btnX     = WIDTH / 2;

    // Panel background
    const panel = this.add.rectangle(btnX, btnY, btnW, BTN_HEIGHT, 0x000000)
      .setStrokeStyle(3, 0x554422, 0.9)
      .setAlpha(.65);

    // Thumbnail -- scale to fit the button height minus insets
    const thumbSize = BTN_HEIGHT - THUMB_INSET * 2;
    const thumbX    = BTN_PADDING + THUMB_INSET + thumbSize / 2;

    const thumb = this.add.image(thumbX, btnY, raid.buttonKey)
      .setOrigin(0.5)
      .setAlpha(alpha);

    // Scale to fill the button height, but cap at 45% of the panel width
    // so wide images don't push into the text area.
    const maxThumbW  = btnW * 0.45;
    const scaleByH   = thumbSize / thumb.height;
    const scaleByW   = maxThumbW / thumb.width;
    const scaleToFit = Math.min(scaleByH, scaleByW);
    thumb.setScale(scaleToFit);

    // Raid name and boss count -- textX is based on the thumbnail's actual
    // display width after scaling so text always clears the image.
    const thumbDisplayW = thumb.width * scaleToFit;
    thumb.setX(BTN_PADDING + THUMB_INSET + thumbDisplayW / 2);
    const textX = BTN_PADDING + THUMB_INSET + thumbDisplayW + 60;
    const textW = btnW - textX - BTN_PADDING;

    this.add.text(textX, btnY - 30, raid.name, {
      fontFamily:      'Cinzel, serif',
      fontSize:        '48px',
      color:           '#fff1c7',
      stroke:          '#000000',
      strokeThickness: 6,
      wordWrap:        { width: textW },
    }).setOrigin(0, 0.5).setAlpha(alpha);

    // const bossCount = raid.bosses?.length ?? 0;
    // const bossLabel = bossCount === 1 ? '1 boss' : bossCount + ' bosses';

    const totalBosses    = raid.bosses?.length ?? 0;
    const defeatedBosses = saveData.defeatedBossIds?.[raid.id]?.length ?? 0;
    const raidCleared    = defeatedBosses >= totalBosses;

    const bossWord      = totalBosses === 1 ? 'boss' : 'bosses';
    const progressLabel = raidCleared
      ? 'Raid Cleared!'
      : 'Defeated ' + defeatedBosses + ' of ' + totalBosses + ' ' + bossWord;

    const progressColor  = raidCleared ? '#ffd700' : '#aaaaaa';

    this.add.text(textX, btnY + 50, progressLabel, {
      fontFamily:      'Cinzel, serif',
      fontSize:        '36px',
      color:           progressColor,
      stroke:          '#000000',
      strokeThickness: 4,
    }).setOrigin(0, 0.5).setAlpha(alpha);

    if (!unlocked) {
      this.add.text(btnX, btnY + BTN_HEIGHT / 2 + 18, 'Locked', {
        fontFamily: 'Cinzel, serif',
        fontSize:   '28px',
        color:      '#bbbbbb',
        stroke:     '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5);
      return;
    }

    // Make the whole panel interactive
    panel.setInteractive({ useHandCursor: true });

    panel.on('pointerover', () => {
      panel.setFillStyle(0x1a0e2a);
      panel.setStrokeStyle(4, 0xffd700, 1);
      thumb.setAlpha(0.85);
    });

    panel.on('pointerout', () => {
      panel.setFillStyle(0x000000);
      panel.setStrokeStyle(3, 0x554422, 0.9);
      thumb.setAlpha(1);
    });

    panel.on('pointerdown', () => {
      this.tweens.add({
        targets:  [panel],
        scaleX:   0.98,
        scaleY:   0.98,
        duration: 80,
        yoyo:     true,
      });

      const nextSave = { ...saveData, lastSelectedRaidId: raid.id };
      saveSaveData(nextSave);
      this.registry.set('saveData', nextSave);
      this.registry.set('selectedRaidId', raid.id);

      this.cameras.main.fadeOut(1000, 0, 0, 0);
      this.time.delayedCall(500, () => {
        this.scene.start('RaidBossSelectScene');
      });
    });
  }

  _drawBackButton() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    const btn = this.add.text(85, HEIGHT * 0.96, '< BACK', {
      fontFamily:      'Cinzel, serif',
      fontSize:        '48px',
      color:           '#ccaa66',
      stroke:          '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover',  () => btn.setColor('#ffd37a'));
    btn.on('pointerout',   () => btn.setColor('#ccaa66'));
    btn.on('pointerdown',  () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(320, () => {
        this.scene.start('TitleScene');
      });
    });
  }
}
