/**
 * BootScene.js
 *
 * The very first scene Phaser runs.
 * Responsibilities:
 *   - Confirm Phaser is alive (hide HTML loading overlay)
 *   - Load the minimal assets needed to SHOW a loading bar in PreloadScene
 *     (fonts, the loading bar graphic itself, etc.)
 *   - Hand off to PreloadScene
 *
 * Nothing gameplay-related lives here.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  // preload 
  preload() {
    // Tell the HTML overlay we're alive
    this._updateOverlay(5, 'Engine online...');

    // Load the loading-bar spritesheet / graphics used by PreloadScene.
    // For now we generate them procedurally so there's nothing to fetch here.
    // Later: this.load.image('loading_bg', 'assets/ui/loading_bg.png');
  }

  // create 
  create() {
    this._updateOverlay(20, 'Loading assets...');

    // Small delay so the browser can paint the overlay update before we leave
    this.time.delayedCall(100, () => {
      this.scene.start('PreloadScene');
    });
  }

  // helpers 
  _updateOverlay(pct, msg) {
    const bar    = document.getElementById('loading-bar-inner');
    const status = document.getElementById('loading-status');
    if (bar)    bar.style.width  = pct + '%';
    if (status) status.textContent = msg;
  }
}
