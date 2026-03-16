/**
 * main.js - Phaser 3 game configuration and boot
 *
 * STORMCALLER
 * Target:   1080 x 2400 (portrait, FHD+ Android)
 * Browser:  auto-scales to fit viewport while keeping aspect ratio
 */

import Phaser             from 'phaser';
import BootScene          from './scenes/BootScene.js';
import PreloadScene       from './scenes/PreloadScene.js';
import TitleScene         from './scenes/TitleScene.js';
import RaidSelectScene    from './scenes/RaidSelectScene.js';
import RaidBossSelectScene from './scenes/RaidBossSelectScene.js';
import BossLoadingScene   from './scenes/BossLoadingScene.js';
import GameScene          from './scenes/GameScene.js';
import UIScene            from './scenes/UIScene.js';

// Layout constants (shared across all scenes via window.GAME_CONFIG)
window.GAME_CONFIG = {
  // Base design resolution
  WIDTH: 1080,
  HEIGHT: 2400,

  // Zone definitions
  // Each zone: { x, y, w, h } in base-resolution pixels.
  // x/y = top-left corner of the zone.
  ZONES: {
    BACKGROUND: { x: 0, y: 0, w: 1080, h: 2400 },
    BOSS: { x: 190, y: 325, w: 700, h: 760 },
    TANK: { x: 40, y: 950, w: 400, h: 575 },
    HEALER: { x: 640, y: 950, w: 400, h: 575 },
    PLAYER: { x: 45, y: 1500, w: 400, h: 575 },
    TOTEMS: { x: 640, y: 1500, w: 400, h: 575 },
    POPUP: { x: 215, y: 1100, w: 650, h: 200 },
    ACTION_BAR: { x: 0, y: 2200, w: 1080, h: 200 },
  },

  // Gameplay timing
  TICK_MS: 1200,

  // DEBUG SKIP INTRO
  DEBUG_SKIP_INTRO: true,

  // Debug
  DEBUG_ZONES: false,
};

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',

  width: window.GAME_CONFIG.WIDTH,
  height: window.GAME_CONFIG.HEIGHT,

  backgroundColor: '#1a1008',

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.GAME_CONFIG.WIDTH,
    height: window.GAME_CONFIG.HEIGHT,
  },

  audio: {
    disableWebAudio: false,
  },

  render: {
    pixelArt: true,
    antialias: false,
    antialiasGL: false,
    roundPixels: true,
  },

  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },

  // Scene order: Boot -> Preload -> Menu flow -> Boss Loading -> Gameplay
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    RaidSelectScene,
    RaidBossSelectScene,
    BossLoadingScene,
    GameScene,
    UIScene,
  ],
};

const game = new Phaser.Game(config);
window.__game = game;
