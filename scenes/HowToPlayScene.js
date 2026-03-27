const Phaser = window.Phaser;

const SILVER = 0xd0d0d0;

const TAB_W   = 300;
const TAB_H   = 130;
const TAB_GAP = 24;

const TAB_ROW_ONE_Y = 290;
const TAB_ROW_TWO_Y = TAB_ROW_ONE_Y + TAB_H + TAB_GAP;

const INSTRUCTIONS_TAB = {
  key:         'instructions',
  label:       'Instructions',
  borderColor: SILVER,
  textColor:   SILVER,
};

const INSTRUCTIONS_TAB_W = TAB_W * 3 + TAB_GAP * 2;

const CHARACTER_TABS = [
  { key: 'shaman',  label: 'Shaman',  characterId: 'player', borderColor: 0x0000ff, textColor: 0x44ddbb },
  { key: 'paladin', label: 'Paladin', characterId: 'tank',   borderColor: 0xff88cc, textColor: 0xff88cc },
  { key: 'druid',   label: 'Druid',   characterId: 'healer', borderColor: 0xa0ff69, textColor: 0xa0ff69 },
];

const CARD_MARGIN  = 30;
const CARD_H       = 230;
const CARD_GAP_Y   = 24;
const GRID_START_Y = TAB_ROW_TWO_Y + TAB_H / 2 + 60;
const ICON_SIZE    = 110;
const CARD_PAD_X   = 28;

const INSTRUCTION_CARDS = [
  {
    title: 'The Goal',
    body:  'Defeat all bosses in the raid before your party is wiped out. Some bosses require others to be defeated before they become available..',
  },
  {
    title: 'Abilities',
    body:  'Press and hold an ability for 3 seconds to see a description of that ability.',
  },
  {
    title: 'Mana',
    body:  'Characters regenerate 3% of their total mana every 2 seconds after 5 seconds of not using an ability or spell.',
  },
  {
    title: 'Cooldowns',
    body:  'Powerful abilities have cooldowns shown on the ability card. Plan around them to avoid gaps in your rotation.',
  },
  {
    title: 'Raid Wipe Tokens',
    body:  'When your party is defeated you spend one Raid Wipe Token to try again. When you run out of tokens, the raid is over.',
  },
];

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
    const { FONTS } = window.GAME_CONFIG;
    const { WIDTH, HEIGHT } = window.GAME_CONFIG;

    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000);
    this.add.image(WIDTH / 2, HEIGHT / 2, 'bg_raidnight')
      .setOrigin(0.5)
      .setTint(0x555555);

    this.add.text(WIDTH / 2, 90, 'How to Play', {
      fontFamily:      FONTS.DECORATIVE,
      fontSize:        '80px',
      color:           '#fff1c7',
      stroke:          '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5);

    this._characters = this.cache.json.get('characters') ?? {};
    this._abilities  = this.cache.json.get('charAbilities') ?? {};

    this._tabGroups  = {};
    this._tabButtons = [];
    this._activeTab  = null;

    this._buildTabs(WIDTH);
    this._buildAllCards(WIDTH);
    this._buildBackButton(WIDTH, HEIGHT);

    this._switchTab(INSTRUCTIONS_TAB.key);
  }

  // ==================
  // Tab building
  // ==================

  _buildTabs(width) {
    this._buildInstructionsTab(width);
    this._buildCharacterTabs(width);
  }

  _buildInstructionsTab(width) {
    const { FONTS } = window.GAME_CONFIG;
    const tx = width / 2;

    const bg = this.add.rectangle(tx, TAB_ROW_ONE_Y, INSTRUCTIONS_TAB_W, TAB_H, 0x111111)
      .setStrokeStyle(3, INSTRUCTIONS_TAB.borderColor, 0.9)
      .setInteractive({ useHandCursor: true });

    const silverHex = '#' + INSTRUCTIONS_TAB.textColor.toString(16).padStart(6, '0');

    const label = this.add.text(tx, TAB_ROW_ONE_Y, INSTRUCTIONS_TAB.label, {
      fontFamily:      FONTS.DECORATIVE,
      fontSize:        '54px',
      color:           silverHex,
      stroke:          '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    bg.on('pointerdown', () => this._switchTab(INSTRUCTIONS_TAB.key));
    bg.on('pointerover', () => bg.setFillStyle(0x1a0e2a));
    bg.on('pointerout',  () => {
      bg.setFillStyle(this._activeTab === INSTRUCTIONS_TAB.key ? 0x1a1a2e : 0x111111);
    });

    this._tabButtons.push({
      key:         INSTRUCTIONS_TAB.key,
      bg,
      label,
      borderColor: INSTRUCTIONS_TAB.borderColor,
    });
  }

  _buildCharacterTabs(width) {
    const { FONTS } = window.GAME_CONFIG;
    const tabCount = CHARACTER_TABS.length;
    const rowTotalWidth = tabCount * TAB_W + (tabCount - 1) * TAB_GAP;
    const startX = width / 2 - rowTotalWidth / 2 + TAB_W / 2;

    CHARACTER_TABS.forEach((tab, i) => {
      const tx = startX + i * (TAB_W + TAB_GAP);

      const bg = this.add.rectangle(tx, TAB_ROW_TWO_Y, TAB_W, TAB_H, 0x111111)
        .setStrokeStyle(3, tab.borderColor, 0.9)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(tx, TAB_ROW_TWO_Y, tab.label, {
        fontFamily:      FONTS.DECORATIVE,
        fontSize:        '54px',
        color:           '#' + tab.textColor.toString(16).padStart(6, '0'),
        stroke:          '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => this._switchTab(tab.key));
      bg.on('pointerover', () => bg.setFillStyle(0x1a0e2a));
      bg.on('pointerout',  () => {
        bg.setFillStyle(this._activeTab === tab.key ? 0x1a1a2e : 0x111111);
      });

      this._tabButtons.push({ key: tab.key, bg, label, borderColor: tab.borderColor });
    });
  }

  // ==================
  // Card building
  // ==================

  _buildAllCards(width) {
    const cardW = width - CARD_MARGIN * 2;

    this._tabGroups[INSTRUCTIONS_TAB.key] = this._buildInstructionsGroup(width, cardW);

    CHARACTER_TABS.forEach(tab => {
      const group      = this.add.group();
      const character  = this._characters[tab.characterId];
      const abilityIds = character?.abilityIds ?? [];

      abilityIds.forEach((abilityId, index) => {
        const ability = this._abilities[abilityId];
        if (!ability) return;

        const cy = GRID_START_Y + index * (CARD_H + CARD_GAP_Y) + CARD_H / 2;
        this._buildAbilityCard(width / 2, cy, cardW, ability, tab.borderColor, tab.textColor, group);
      });

      this._tabGroups[tab.key] = group;
    });
  }

  _buildInstructionsGroup(width, cardW) {
    const group = this.add.group();

    INSTRUCTION_CARDS.forEach((card, index) => {
      const cy = GRID_START_Y + index * (CARD_H + CARD_GAP_Y) + CARD_H / 2;
      this._buildInstructionsCard(width / 2, cy, cardW, card.title, card.body, group);
    });

    return group;
  }

  _buildInstructionsCard(cx, cy, cardW, title, body, group) {
    const { FONTS } = window.GAME_CONFIG;
    const bg = this.add.rectangle(cx, cy, cardW, CARD_H, 0x0a0a18)
      .setStrokeStyle(2, SILVER, 0.5);
    group.add(bg);

    const topY = cy - CARD_H / 2 + 24;

    const titleText = this.add.text(cx - cardW / 2 + CARD_PAD_X, topY, title, {
      fontFamily:      FONTS.DECORATIVE,
      fontSize:        '54px',
      color:           '#' + SILVER.toString(16).padStart(6, '0'),
      stroke:          '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0);
    group.add(titleText);

    const bodyMaxW = cardW - CARD_PAD_X * 2;

    const bodyText = this.add.text(
      cx - cardW / 2 + CARD_PAD_X,
      topY + titleText.height + 10,
      body,
      {
        fontFamily:  FONTS.BASE,
        fontSize:    '36px',
        color:       '#cccccc',
        wordWrap:    { width: bodyMaxW },
        lineSpacing: 4,
      }
    ).setOrigin(0, 0);
    group.add(bodyText);
  }

  _buildAbilityCard(cx, cy, cardW, ability, borderColor, textColor, group) {
    const { FONTS } = window.GAME_CONFIG;

    const bg = this.add.rectangle(cx, cy, cardW, CARD_H, 0x0a0a18)
      .setStrokeStyle(2, borderColor, 0.6);
    group.add(bg);

    const iconKey = 'icon_' + ability.id;
    if (this.textures.exists(iconKey)) {
      const iconObj = this.add.image(
        cx - cardW / 2 + CARD_PAD_X + ICON_SIZE / 2,
        cy,
        iconKey
      ).setDisplaySize(ICON_SIZE, ICON_SIZE).setOrigin(0.5);
      group.add(iconObj);
    }

    const textX    = cx - cardW / 2 + CARD_PAD_X + ICON_SIZE + 24;
    const textMaxW = cardW - CARD_PAD_X - ICON_SIZE - 24 - CARD_PAD_X;
    const topY     = cy - CARD_H / 2 + 20;

    const nameText = this.add.text(textX, topY, ability.name ?? ability.id, {
      fontFamily:      FONTS.BASE,
      fontSize:        '42px',
      color:           '#ffffff',
      stroke:          '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0);
    group.add(nameText);

    const descText = this.add.text(textX, topY + nameText.height + 10, ability.description ?? '', {
      fontFamily:  FONTS.BASE,
      fontSize:    '34px',
      color:       '#cccccc',
      wordWrap:    { width: textMaxW },
      lineSpacing: 4,
    }).setOrigin(0, 0);
    group.add(descText);

    const costLabel = (ability.manaCost ? ability.manaCost + 'm' : 'Free') +
      (ability.recastTicks > 0
        ? '   |   ' + ability.recastTicks + 's CD'
        : '   |   No CD');

    const statText = this.add.text(
      cx - cardW / 2 + CARD_PAD_X,
      cy + CARD_H / 2 - 18,
      costLabel,
      {
        fontFamily: FONTS.DECORATIVE,
        fontSize:   '32px',
        color:      '#' + textColor.toString(16).padStart(6, '0'),
      }
    ).setOrigin(0, 1);
    group.add(statText);
  }

  // ==================
  // Tab switching
  // ==================

  _switchTab(tabKey) {
    this._activeTab = tabKey;

    Object.entries(this._tabGroups).forEach(([key, group]) => {
      group.setVisible(key === tabKey);
    });

    this._tabButtons.forEach(btn => {
      const isActive = btn.key === tabKey;
      btn.bg.setFillStyle(isActive ? 0x1a1a2e : 0x111111);
      btn.bg.setStrokeStyle(isActive ? 4 : 2, btn.borderColor, isActive ? 1.0 : 0.7);
    });
  }

  // ==================
  // Back button
  // ==================

  _buildBackButton(WIDTH, HEIGHT) {
    const btn = this.add.text(85, HEIGHT * 0.96, '< BACK', {
      fontFamily:      'Cinzel, serif',
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
