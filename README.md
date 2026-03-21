# Raid Night

A Phaser 3 browser game inspired by World of Warcraft TBC Classic.
Play as a Shaman (for now), fight alongside your two companions, and defeat raid bosses for loot and glory!  (or, maybe just the loot...)
Built for 1080×2400 (FHD+ Android portrait), playable in any desktop browser.

---

## Running the Game

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Start the dev server — browser opens automatically
npm run dev

# 3. Build for production / Android packaging
npm run build
```

---

## Tech Stack

- [Phaser 3](https://phaser.io/) — game engine (loaded via /phaser/phaser.min.js)
- Vanilla JS — no build step required for development
- [Capacitor](https://capacitorjs.com/) — Android packaging (later)
