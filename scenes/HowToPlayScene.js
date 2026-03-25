/**
 * HowToPlayScene.js
 *
 * Shows the full ability list for each party member.
 * Three tabs: Shaman (player) | Paladin (tank) | Druid (healer).
 * Each tab displays 2-column ability cards with icon, name, description,
 * mana cost, and cooldown.
 */
const Phaser = window.Phaser;

const TABS = [
  { key: 'shaman',  label: 'Shaman',  characterId: 'player', color: 0x0000FF },
  { key: 'paladin', label: 'Paladin', characterId: 'tank',   color: 0xff88cc },
  { key: 'druid',   label: 'Druid',   characterId: 'healer', color: 0xa0ff69 },
];

const CARD_W       = 490;
const CARD_H       = 210;
const CARD_PAD_X   = 30;
const CARD_GAP_X   = 40;
const CARD_GAP_Y   = 24;
const GRID_START_Y = 420;
const ICON_SIZE    = 72;

export default class HowToPlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HowToPlayScene' });
  }

  preload() {
    if (!this.cache.json.exists('characters')) {
      this.load.json('characters', 'data/characters/characters.json');
    }
    if (!this.cache.json.exists('charAbilities')) {
      this.load.json('charAbilities', 'data/characters/abilities.json');
    }
  }

  create() {
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000);
    this.add.image(WIDTH / 2, HEIGHT / 2, 'bg_raidnight')
      .setOrigin(0.5)
      .setTint(0x555555);

    this.add.text(WIDTH / 2, 90, 'How to Play', {
      fontFamily:      'monospace',
      fontSize:        '72px',
      color:           '#fff1c7',
      stroke:          '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    this._characters  = this.cache.json.get('characters') ?? {};
    this._abilities   = this.cache.json.get('charAbilities') ?? {};

    this._tabGroups   = {};
    this._tabButtons  = [];
    this._activeTab   = null;

    this._buildTabs(WIDTH);
    this._buildAllCards(WIDTH);
    this._buildBackButton(WIDTH, HEIGHT);

    this._switchTab(TABS[0].key);
  }

  // ===========
  // Tabs
  // ===========
  _buildTabs(WIDTH) {
    const tabW   = 300;
    const tabH   = 100;
    const tabY   = 240;
    const total  = TABS.length;
    const startX = WIDTH / 2 - (total * tabW + (total - 1) * 20) / 2 + tabW / 2;

    TABS.forEach((tab, i) => {
      const tx = startX + i * (tabW + 20);

      const bg = this.add.rectangle(tx, tabY, tabW, tabH, 0x111111)
        .setStrokeStyle(3, tab.color, 0.9)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(tx, tabY, tab.label, {
        fontFamily: 'monospace',
        fontSize:   '46px',
        color:      '#' + tab.color.toString(16).padStart(6, '0'),
        stroke:     '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => this._switchTab(tab.key));
      bg.on('pointerover', () => bg.setFillStyle(0x1a0e2a));
      bg.on('pointerout',  () => {
        bg.setFillStyle(this._activeTab === tab.key ? 0x1a1a2e : 0x111111);
      });

      this._tabButtons.push({ key: tab.key, bg, label, color: tab.color });
    });
  }

  // ===========
  // Cards
  // ===========
  _buildAllCards(WIDTH) {
    TABS.forEach(tab => {
      const group      = this.add.group();
      const character  = this._characters[tab.characterId];
      const abilityIds = character?.abilityIds ?? [];

      const cols    = 2;
      const offsetX = (WIDTH - (cols * CARD_W + (cols - 1) * CARD_GAP_X)) / 2;

      abilityIds.forEach((abilityId, index) => {
        const ability = this._abilities[abilityId];
        if (!ability) return;

        const col  = index % cols;
        const row  = Math.floor(index / cols);
        const cx   = offsetX + col * (CARD_W + CARD_GAP_X) + CARD_W / 2;
        const cy   = GRID_START_Y + row * (CARD_H + CARD_GAP_Y) + CARD_H / 2;

        this._buildAbilityCard(cx, cy, ability, tab.color, group);
      });

      this._tabGroups[tab.key] = group;
    });
  }

  _buildAbilityCard(cx, cy, ability, accentColor, group) {
    const bg = this.add.rectangle(cx, cy, CARD_W, CARD_H, 0x0a0a18)
      .setStrokeStyle(2, accentColor, 0.6);
    group.add(bg);

    const iconKey = 'icon_' + ability.id;
    if (this.textures.exists(iconKey)) {
      const iconObj = this.add.image(
        cx - CARD_W / 2 + CARD_PAD_X + ICON_SIZE / 2,
        cy,
        iconKey
      ).setDisplaySize(ICON_SIZE, ICON_SIZE).setOrigin(0.5);
      group.add(iconObj);
    }

    const textX    = cx - CARD_W / 2 + CARD_PAD_X + ICON_SIZE + 16;
    const textMaxW = CARD_W - CARD_PAD_X - ICON_SIZE - 16 - 16;

    const nameText = this.add.text(textX, cy - CARD_H / 2 + 16, ability.name ?? ability.id, {
      fontFamily:      'monospace',
      fontSize:        '42px',
      color:           '#ffffff',
      stroke:          '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0);
    group.add(nameText);

    const descText = this.add.text(textX, cy - CARD_H / 2 + 56, ability.description ?? '', {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#cccccc',
      wordWrap:   { width: textMaxW },
    }).setOrigin(0, 0);
    group.add(descText);

    const costLabel = (ability.manaCost ? ability.manaCost + 'm' : 'Free') +
      (ability.recastTicks > 0 ? '   |   ' + ability.recastTicks + 's CD' : '   |   No CD');

    const statText = this.add.text(textX, cy + CARD_H / 2 - 16, costLabel, {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#' + accentColor.toString(16).padStart(6, '0'),
    }).setOrigin(0, 1);
    group.add(statText);
  }

  // ===========
  // Tab switch
  // ===========
  _switchTab(tabKey) {
    this._activeTab = tabKey;

    Object.entries(this._tabGroups).forEach(([key, group]) => {
      group.setVisible(key === tabKey);
    });

    this._tabButtons.forEach(btn => {
      const isActive = btn.key === tabKey;
      btn.bg.setFillStyle(isActive ? 0x1a1a2e : 0x111111);
      btn.bg.setStrokeStyle(isActive ? 4 : 2, btn.color, isActive ? 1.0 : 0.7);
    });
  }

  // ===========
  // Back button
  // ===========
  _buildBackButton(WIDTH, HEIGHT) {
    const btn = this.add.text(85, HEIGHT * 0.96, '< BACK', {
      fontFamily:      'monospace',
      fontSize:        '48px',
      color:           '#ccaa66',
      stroke:          '#000000',
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
  }
}
