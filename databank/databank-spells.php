<?php
extract(json_decode(file_get_contents("$outPath/creaturesID.json"), true));
// This file is written before require()'ing this script.
extract(json_decode(file_get_contents("$outPath/spellsID.json"), true), EXTR_PREFIX_ALL, 's');
extract(array_flip(Spell::context));
extract(array_flip(Spell::aggression));
extract(array_flip(Spell::castAnimationType), EXTR_PREFIX_ALL, 'a');
extract(array_flip(H3Effect::source), EXTR_PREFIX_ALL, 'src');
extract(array_flip(H3Effect::operation));

$offensiveSpell = function ($spell) use ($src_spellOffense) {
  return [
    ['creature_spellImmune', true, 'ifSpell' => $spell, 'ifTargetPlayer' => -1, 'source' => $src_spellOffense],
    ['creature_spellImmune', true, 'ifSpell' => $spell, 'ifTargetPlayer' => -1, 'isTargetAlly' => true, 'source' => $src_spellOffense],
  ];
};

$defensiveSpell = function ($spell) use ($src_spellDefense) {
  return [
    ['creature_spellImmune', true, 'ifSpell' => $spell, 'ifTargetPlayer' => -1, 'isTargetEnemy' => true, 'source' => $src_spellDefense],
  ];
};

return [
  // Determined empirically.
  'staticSpellEffects' => array_merge(
    $offensiveSpell($s_disruptingRay),

    $offensiveSpell($s_magicArrow),
    $offensiveSpell($s_iceBolt),
    $offensiveSpell($s_lightningBolt),
    $offensiveSpell($s_titanBolt),

    $offensiveSpell($s_curse),
    $offensiveSpell($s_slow),
    $offensiveSpell($s_weakness),
    $offensiveSpell($s_forgetfulness),
    $offensiveSpell($s_misfortune),
    $offensiveSpell($s_sorrow),

    $defensiveSpell($s_cure),
    $defensiveSpell($s_antiMagic),

    $defensiveSpell($s_bless),
    $defensiveSpell($s_bloodlust),
    $defensiveSpell($s_haste),
    $defensiveSpell($s_protectionFromWater),
    $defensiveSpell($s_protectionFromFire),
    $defensiveSpell($s_shield),
    $defensiveSpell($s_stoneSkin),
    $defensiveSpell($s_fortune),
    $defensiveSpell($s_precision),
    $defensiveSpell($s_protectionFromAir),
    $defensiveSpell($s_airShield),
    $defensiveSpell($s_mirth),
    $defensiveSpell($s_protectionFromEarth),
    $defensiveSpell($s_counterstrike),
    $defensiveSpell($s_prayer),
    $defensiveSpell($s_frenzy),
    $defensiveSpell($s_slayer),

    [
      ['spellGlobal', true, 'ifSpell' => $s_deathRipple],
      ['creature_spellImmune', true, 'ifSpell' => $s_deathRipple, 'ifTargetCreatureUndead' => 0],
      ['creature_spellImmune', true, 'ifSpell' => $s_deathRipple, 'ifTargetCreatureUndead' => array_search('undead', Creature::undead)],
      ['spellGlobal', true, 'ifSpell' => $s_destroyUndead],
      ['creature_spellImmune', true, 'ifSpell' => $s_destroyUndead, 'ifTargetCreatureUndead' => 0],
      ['creature_spellImmune', true, 'ifSpell' => $s_destroyUndead, 'ifTargetCreatureUndead' => array_search('living', Creature::undead)],
      ['spellGlobal', true, 'ifSpell' => $s_armageddon],

      // No $source to show default help text in combat log as per SoD.
      ['creature_dispelImmune', true, 'ifTargetPlayer' => -1, 'isTargetEnemy' => true, 'stack' => array_search('dispelImmune', H3Effect::stack)],

      ['spellAround', 1, 'ifSpell' => $s_fireball],
      ['spellAround', 1, 'ifSpell' => $s_meteorShower],
      ['spellAround', 2, 'ifSpell' => $s_inferno],

      ['spellAround', 1, 'ifSpell' => $s_frostRing],
      ['spellAroundEye', 1, 'ifSpell' => $s_frostRing],
    ]
  ),

  // Determined empirically.
  'imageOfSpell' => [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
    37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53,
    54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    // Stone Gaze and later.
    null,
  ],

  // Determined empirically.
  //
  // XXX=C,ID add missing
  'mutuallyExclusive' => [
    [$s_curse, $s_bless],
    [$s_misfortune, $s_fortune],
    [$s_slow, $s_haste],
    [$s_sorrow, $s_mirth],
  ],

  // Determined empirically using SPTRAITS.TXT, attributes and abilityText
  // columns (because attributes doesn't contain accurate information).
  'spellOverrides' => [
    // Summon Boat
    ['aggression' => null, 'context' => $map],
    // Scuttle Boat
    ['aggression' => null, 'context' => $map],
    // Visions
    ['aggression' => null, 'context' => $map],
    // View Earth
    ['aggression' => null, 'context' => $map],
    // Disguise
    ['aggression' => $defense, 'context' => $map],
    // View Air
    ['aggression' => null, 'context' => $map],
    // Fly
    ['aggression' => null, 'context' => $map],
    // Water Walk
    ['aggression' => null, 'context' => $map],
    // Dimension Door
    ['aggression' => null, 'context' => $map],
    // Town Portal
    ['aggression' => null, 'context' => $map],

    // Quicksand
    ['aggression' => $offense, 'context' => $combat],
    // Land Mine
    ['aggression' => $offense, 'context' => $combat],
    // Force Field
    ['aggression' => null, 'context' => $combat, 'targetLocation' => true],
    // Fire Wall
    ['aggression' => $offense, 'context' => $combat, 'targetLocation' => true],
    // Earthquake
    ['aggression' => $offense, 'context' => $combat],
    // Magic Arrow
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Ice Bolt
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Lightning Bolt
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Implosion
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Chain Lightning
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Frost Ring
    ['aggression' => $offense, 'context' => $combat, 'targetLocation' => true],
    // Fireball
    ['aggression' => $offense, 'context' => $combat, 'targetLocation' => true],
    // Inferno
    ['aggression' => $offense, 'context' => $combat, 'targetLocation' => true],
    // Meteor Shower
    ['aggression' => $offense, 'context' => $combat, 'targetLocation' => true],
    // Death Ripple
    ['aggression' => $offense, 'context' => $combat],
    // Destroy Undead
    ['aggression' => $offense, 'context' => $combat],
    // Armageddon
    ['aggression' => $offense, 'context' => $combat],
    // Shield
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Air Shield
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Fire Shield
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Protection from Air
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Protection from Fire
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Prot. from Water
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Prot. from Earth
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Anti-Magic
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Dispel
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Magic Mirror
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true, 'animation' => 'SP09_'],
    // Cure
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Resurrection
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true, 'animation' => 'SP12_'],
    // Animate Dead
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Sacrifice
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Bless
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Curse
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Bloodlust
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Precision
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Weakness
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Stone Skin
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Disrupting Ray
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true, 'cancel' => []],
    // Prayer
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Mirth
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true, 'mind' => true],
    // Sorrow
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true, 'mind' => true],
    // Fortune
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Misfortune
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Haste
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Slow
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Slayer
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Frenzy
    ['context' => $combat, 'targetCreature' => true, 'mind' => true],
    // Titan's Lightning Bolt
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Counterstrike
    ['aggression' => $defense, 'context' => $combat, 'targetCreature' => true],
    // Berserk
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true, 'mind' => true],
    // Hypnotize
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true, 'mind' => true],
    // Forgetfulness
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true, 'mind' => true],
    // Blind
    ['aggression' => $offense, 'context' => $combat, 'targetCreature' => true],
    // Teleport
    ['aggression' => null, 'context' => $combat, 'targetCreature' => true],
    // Remove Obstacle
    ['aggression' => null, 'context' => $combat, 'targetObstacle' => true],
    // Clone
    ['aggression' => null, 'context' => $combat, 'targetCreature' => true],
    // Fire Elemental
    ['aggression' => null, 'context' => $combat],
    // Earth Elemental
    ['aggression' => null, 'context' => $combat],
    // Water Elemental
    ['aggression' => null, 'context' => $combat],
    // Air Elemental
    ['aggression' => null, 'context' => $combat],

    // Stone Gaze
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true],
    // Poison
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true, 'animation' => 'SP11_'],
    // Bind
    ['aggression' => null, 'context' => $combat, 'byCreature' => true, 'animation' => 'SP02_'],
    // Disease
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true, 'animation' => 'SP05_'],
    // Paralyze
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true, 'animation' => 'SP10_'],
    // Age
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true, 'animation' => 'SP01_'],
    // Death Cloud
    //
    // XXX=R do we need it, given Lich's attach is implemented using shootingCloud/creature_shootingCloud?
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true, 'animation' => 'SP04_'],
    // Thunderbolt
    //
    // XXX=R do we need it, given it doesn't have (XXX=C) any special effects other than damage?
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true],
    // Dispel Helpful Spells
    ['aggression' => null, 'context' => $combat, 'byCreature' => true],
    // Death Stare
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true],
    // Acid breath
    ['aggression' => $offense, 'context' => $combat, 'byCreature' => true],
  ],

  // Determined empirically.
  //
  // Only verified for spell IDs:
  //   2 15 16 17 18 19 20 21 22 23 24 25 26 27 28 30 31 32 33 34 35 37 41 42 43
  //   44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 61 66 67 68 69 62 64
  'castSoundOfSpell' => [
    // Summon Boat
    null,
    // Scuttle Boat
    null,
    // Visions
    'VISIONS',
    // View Earth
    null,
    // Disguise
    null,
    // View Air
    null,
    // Fly
    null,
    // Water Walk
    null,
    // Dimension Door
    null,
    // Town Portal
    null,

    // Quicksand
    null,
    // Land Mine
    null,
    // Force Field
    null,
    // Fire Wall
    null,
    // Earthquake
    null,
    // Magic Arrow
    'MAGICBLT',
    // Ice Bolt
    //
    // XXX=C the game seems to play, on impact, ICERAY followed by ICERAYEX
    'ICERAYEX',
    // Lightning Bolt
    'LIGHTBLT',
    // Implosion
    'DECAY',
    // Chain Lightning
    'CHAINLTE',
    // Frost Ring
    'FROSTING',
    // Fireball
    'SPONTCOMB',
    // Inferno
    'FIREBLST',
    // Meteor Shower
    'METEOR',
    // Death Ripple
    'DEATHRIP',
    // Destroy Undead
    //
    // XXX=C the game seems to play another sound in parallel with this one (WGHTKILL?)
    'SACBRETH',
    // Armageddon
    'ARMGEDN',
    // Shield
    'SHIELD',
    // Air Shield
    'AIRSHELD',
    // Fire Shield
    null,
    // Protection from Air
    'PROTECTA',
    // Protection from Fire
    'PROTECTF',
    // Prot. from Water
    'PROTECTW',
    // Prot. from Earth
    'PROTECTE',
    // Anti-Magic
    'ANTIMAGK',
    // Dispel
    'DISPELL',
    // Magic Mirror
    null,
    // Cure
    'CURE',
    // Resurrection
    null,
    // Animate Dead
    null,
    // Sacrifice
    null,
    // Bless
    'BLESS',
    // Curse
    'CURSE',
    // Bloodlust
    'BLOODLUS',
    // Precision
    'PRECISON',
    // Weakness
    'WEAKNESS',
    // Stone Skin
    'TUFFSKIN',
    // Disrupting Ray
    'DISRUPTR',
    // Prayer
    'PRAYER',
    // Mirth
    'MIRTH',
    // Sorrow
    'SORROW',
    // Fortune
    'FORTUNE',
    // Misfortune
    'MISFORT',
    // Haste
    'TAILWIND',
    // Slow
    'MUCKMIRE',
    // Slayer
    'SLAYER',
    // Frenzy
    'FRENZY',
    // Titan's Lightning Bolt
    'LIGHTBLT',
    // Counterstrike
    'CNTRSTRK',
    // Berserk
    null,
    // Hypnotize
    null,
    // Forgetfulness
    'FORGET',
    // Blind
    'BLIND',
    // Teleport
    null,
    // Remove Obstacle
    'REMOVEOB',
    // Clone
    null,
    // Fire Elemental
    'SUMNELM',
    // Earth Elemental
    'SUMNELM',
    // Water Elemental
    'SUMNELM',
    // Air Elemental
    'SUMNELM',

    // Stone Gaze
    null,
    // Poison
    null,
    // Bind
    null,
    // Disease
    null,
    // Paralyze
    null,
    // Age
    null,
    // Death Cloud
    null,
    // Thunderbolt
    null,
    // Dispel Helpful Spells
    null,
    // Death Stare
    null,
    // Acid breath
    null,
  ],

  // Determined empirically.
  //
  // Only filled for spell IDs:
  //   2 15 16 17 18 19 20 21 22 23 24 25 26 27 28 30 31 32 33 34 35 37 41 42 43
  //   44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 61 66 67 68 69
  //
  // Format: [$castAnimationType, $castAnimation].
  //
  // XXX=C
  'castAnimationOfSpell' => [
    // Summon Boat
    [],
    // Scuttle Boat
    [],
    // Visions
    [],
    // View Earth
    [],
    // Disguise
    [],
    // View Air
    [],
    // Fly
    [],
    // Water Walk
    [],
    // Dimension Door
    [],
    // Town Portal
    [],

    // Quicksand
    [],
    // Land Mine
    [],
    // Force Field
    [],
    // Fire Wall
    [],
    // Earthquake
    [],
    // Magic Arrow
    [$a_missileEvery, ['C20SPX', 'C20SPX0', 'C20SPX1', 'C20SPX2', 'C20SPX3', 'C20SPX4']],
    // Ice Bolt
    [$a_missileEvery, ['C08SPW5', 'C08SPW0', 'C08SPW1', 'C08SPW2', 'C08SPW3', 'C08SPW4']],
    // Lightning Bolt
    //
    // XXX=C when does SoD show the first part (drop) of the animation? I did see it a few times; if it didn't show it, this would be just:
    //[$a_overlayEvery, 'C11SPA1'],
    [$a_dropEvery, ['C11SPA1', 'C11SPA0']],
    // Implosion
    [$a_overlayEvery, 'C05SPE0'],
    // Chain Lightning
    //
    // XXX=I must use custom animation (polyline)
    [$a_missileEvery, ['C20SPX', 'C20SPX0', 'C20SPX1', 'C20SPX2', 'C20SPX3', 'C20SPX4']],
    // Frost Ring
    [$a_overlay, 'C07SPW'],
    // Fireball
    [$a_overlay, 'C13SPF'],
    // Inferno
    [$a_overlay, 'C04SPF0'],
    // Meteor Shower
    [$a_overlay, 'C08SPE0'],
    // Death Ripple
    [$a_overlayEvery, 'C04SPE0'],
    // Destroy Undead
    [$a_overlayEvery, 'C14SPA0'],
    // Armageddon
    [$a_total, 'C06SPF0'],
    // Shield
    [$a_overlayEvery, 'C13SPE0'],
    // Air Shield
    [$a_overlayEvery, 'C01SPA0'],
    // Fire Shield
    [$a_overlayEvery, 'C05SPF0'],
    // Protection from Air
    [$a_overlayEvery, 'C11SPE0'],
    // Protection from Fire
    [$a_overlayEvery, 'C11SPW0'],
    // Prot. from Water
    [$a_overlayEvery, 'C11SPF0'],
    // Prot. from Earth
    [$a_overlayEvery, 'C13SPA0'],
    // Anti-Magic
    [$a_overlayEvery, 'C02SPE0'],
    // Dispel
    [$a_overlayEvery, 'C05SPW'],
    // Magic Mirror
    [],
    // Cure
    [$a_overlayEvery, 'C03SPW'],
    // Resurrection
    [],
    // Animate Dead
    [],
    // Sacrifice
    [],
    // Bless
    [$a_overlayEvery, 'C01SPW'],
    // Curse
    [$a_overlayEvery, 'C04SPW'],
    // Bloodlust
    //
    // XXX=I custom animation (red overlay fade-in-out)
    [],
    // Precision
    [$a_overlayEvery, 'C12SPA0'],
    // Weakness
    [$a_overlayEvery, 'C17SPW0'],
    // Stone Skin
    [$a_overlayEvery, 'C16SPE'],
    // Disrupting Ray
    [$a_missileEvery, ['C07SPA1', 'C07SPA0']],
    // Prayer
    [$a_lightEvery, 'C10SPW'],
    // Mirth
    [$a_overlayEvery, 'C09SPW0'],
    // Sorrow
    [$a_overlayEvery, 'C14SPE0'],
    // Fortune
    [$a_overlayEvery, 'C09SPA0'],
    // Misfortune
    [$a_overlayEvery, 'C10SPF0'],
    // Haste
    [$a_overlayEvery, 'C15SPA0'],
    // Slow
    [$a_overlayEvery, 'C09SPE0'],
    // Slayer
    [$a_overlayEvery, 'C13SPW0'],
    // Frenzy
    [$a_overlayEvery, 'C08SPF0'],
    // Titan's Lightning Bolt
    [$a_overlayEvery, 'C11SPA1'],
    // Counterstrike
    [$a_overlayEvery, 'C04SPA0'],
    // Berserk
    [],
    // Hypnotize
    [$a_overlayEvery, 'C10SPA0'],
    // Forgetfulness
    [$a_overlayEvery, 'C06SPW'],
    // Blind
    [$a_overlayEvery, 'C02SPF0'],
    // Teleport
    [],
    // Remove Obstacle
    //
    // XXX=I custom animation (fade-out)
    [],
    // Clone
    [],
    // Fire Elemental
    //
    // XXX=I custom animation (fade-in)
    [],
    // Earth Elemental
    //
    // XXX=I custom animation (fade-in)
    [],
    // Water Elemental
    //
    // XXX=I custom animation (fade-in)
    [],
    // Air Elemental
    //
    // XXX=I custom animation (fade-in)
    [],

    // Stone Gaze
    [],
    // Poison
    [],
    // Bind
    [],
    // Disease
    [],
    // Paralyze
    [],
    // Age
    [],
    // Death Cloud
    [],
    // Thunderbolt
    [],
    // Dispel Helpful Spells
    [],
    // Death Stare
    [],
    // Acid breath
    [],
  ],

  // Taken from mightandmagic.fandom.com.
  //
  // Only filled for spell IDs:
  //   2 15 16 17 18 19 20 21 22 23 24 25 26 27 28 30 31 32 33 34 35 37 41 42 43
  //   44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 61 66 67 68 69
  'effectsOfSpell' => [
    // Summon Boat
    [],
    // Scuttle Boat
    [],
    // Visions
    [],
    // View Earth
    [],
    // Disguise
    [],
    // View Air
    [],
    // Fly
    [],
    // Water Walk
    [],
    // Dimension Door
    [],
    // Town Portal
    [],

    // Quicksand
    [],
    // Land Mine
    [],
    // Force Field
    [],
    // Fire Wall
    [],
    // Earthquake
    [],
    // Magic Arrow
    [],   // plain damage
    // Ice Bolt
    [],   // plain damage
    // Lightning Bolt
    [],   // plain damage
    // Implosion
    [],   // plain damage
    // Chain Lightning
    [],
    // Frost Ring
    [],   // plain damage
    // Fireball
    [],   // plain damage
    // Inferno
    [],   // plain damage
    // Meteor Shower
    [],   // plain damage
    // Death Ripple
    [],   // plain damage
    // Destroy Undead
    [],   // plain damage
    // Armageddon
    [],   // plain damage
    // Shield
    [
      ['creature_damageMin', true, 'ifTargetCombatCreature' => true, 'ifCreatureShooting' => 0],
      ['creature_damageMax', true, 'ifTargetCombatCreature' => true, 'ifCreatureShooting' => 0],
    ],
    // Air Shield
    [
      ['creature_damageMin', true, 'ifTargetCombatCreature' => true, 'ifCreatureShooting' => 1],
      ['creature_damageMax', true, 'ifTargetCombatCreature' => true, 'ifCreatureShooting' => 1],
    ],
    // Fire Shield
    [],
    // Protection from Air
    [
      ['spellEfficiency', true, 'ifTargetCombatCreature' => true, 'ifAggression' => $offense, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'air')],
    ],
    // Protection from Fire
    [
      ['spellEfficiency', true, 'ifTargetCombatCreature' => true, 'ifAggression' => $offense, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'fire')],
    ],
    // Prot. from Water
    [
      ['spellEfficiency', true, 'ifTargetCombatCreature' => true, 'ifAggression' => $offense, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'water')],
    ],
    // Prot. from Earth
    [
      ['spellEfficiency', true, 'ifTargetCombatCreature' => true, 'ifAggression' => $offense, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'earth')],
    ],
    // Anti-Magic
    [
      [
        ['creature_spellImmune', true, 'ifTargetCombatCreature' => true, 'ifSpellLevel' => 1],
        ['creature_spellImmune', true, 'ifTargetCombatCreature' => true, 'ifSpellLevel' => 2],
        ['creature_spellImmune', true, 'ifTargetCombatCreature' => true, 'ifSpellLevel' => 3],
      ],
      [
        ['creature_spellImmune', true, 'ifTargetCombatCreature' => true, 'ifSpellLevel' => 1],
        ['creature_spellImmune', true, 'ifTargetCombatCreature' => true, 'ifSpellLevel' => 2],
        ['creature_spellImmune', true, 'ifTargetCombatCreature' => true, 'ifSpellLevel' => 3],
        ['creature_spellImmune', true, 'ifTargetCombatCreature' => true, 'ifSpellLevel' => 4],
      ],
      [
        ['creature_spellImmune', true, 'ifTargetCombatCreature' => true],
      ],
    ],
    // Dispel
    [],
    // Magic Mirror
    [],
    // Cure
    [],
    // Resurrection
    [],
    // Animate Dead
    [],
    // Sacrifice
    [],
    // Bless
    [
      [['creature_damageMin', [$custom, 'spell', $s_bless, 1.0, 0], true]],
      [['creature_damageMin', [$custom, 'spell', $s_bless, 1.0, +1], true]],
      [['creature_damageMin', [$custom, 'spell', $s_bless, 1.0, +1], true]],
    ],
    // Curse
    [
      [['creature_damageMax', [$custom, 'spell', $s_curse, 1.0, 0], true]],
      [['creature_damageMax', [$custom, 'spell', $s_curse, 0.8, -1], true]],
      [['creature_damageMax', [$custom, 'spell', $s_curse, 0.8, -1], true]],
    ],
    // Bloodlust
    [
      ['creature_attack', true, true, 'ifCreatureShooting' => 0],
    ],
    // Precision
    [
      ['creature_attack', true, true, 'ifCreatureShooting' => 1],
    ],
    // Weakness
    [
      ['creature_attack', true, true],
    ],
    // Stone Skin
    [
      ['creature_defense', true, true],
    ],
    // Disrupting Ray
    [
      ['creature_defense', true, true],
    ],
    // Prayer
    [
      ['creature_attack', true, true],
      ['creature_defense', true, true],
      ['creature_speed', true, true],
    ],
    // Mirth
    [
      ['creature_morale', true, true],
    ],
    // Sorrow
    [
      ['creature_morale', true, true],
    ],
    // Fortune
    [
      ['creature_luck', true, true],
    ],
    // Misfortune
    [
      ['creature_luck', true, true],
    ],
    // Haste
    [
      ['creature_speed', true, true],
    ],
    // Slow
    [
      ['creature_speed', true, true],
    ],
    // Slayer
    [
      // XXX=I: sssl: H3.Rules is calculating creature_attack and other creature_... stat targets without respect to who is being attacked
      [
        ['creature_attack', true, true, 'ifTargetCreature' => $behemoth],
        ['creature_attack', true, true, 'ifTargetCreature' => $ancientBehemoth],
        ['creature_attack', true, true, 'ifTargetCreature' => $greenDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $goldDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $boneDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $ghostDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $redDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $blackDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $azureDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $crystalDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $faerieDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $rustDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $hydra],
        ['creature_attack', true, true, 'ifTargetCreature' => $chaosHydra],
      ],
      [
        ['creature_attack', true, true, 'ifTargetCreature' => $behemoth],
        ['creature_attack', true, true, 'ifTargetCreature' => $ancientBehemoth],
        ['creature_attack', true, true, 'ifTargetCreature' => $greenDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $goldDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $boneDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $ghostDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $redDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $blackDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $azureDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $crystalDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $faerieDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $rustDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $hydra],
        ['creature_attack', true, true, 'ifTargetCreature' => $chaosHydra],
        // New:
        ['creature_attack', true, true, 'ifTargetCreature' => $devil],
        ['creature_attack', true, true, 'ifTargetCreature' => $archDevil],
        ['creature_attack', true, true, 'ifTargetCreature' => $angel],
        ['creature_attack', true, true, 'ifTargetCreature' => $archangel],
      ],
      [
        ['creature_attack', true, true, 'ifTargetCreature' => $behemoth],
        ['creature_attack', true, true, 'ifTargetCreature' => $ancientBehemoth],
        ['creature_attack', true, true, 'ifTargetCreature' => $greenDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $goldDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $boneDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $ghostDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $redDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $blackDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $azureDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $crystalDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $faerieDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $rustDragon],
        ['creature_attack', true, true, 'ifTargetCreature' => $hydra],
        ['creature_attack', true, true, 'ifTargetCreature' => $chaosHydra],
        ['creature_attack', true, true, 'ifTargetCreature' => $devil],
        ['creature_attack', true, true, 'ifTargetCreature' => $archDevil],
        ['creature_attack', true, true, 'ifTargetCreature' => $angel],
        ['creature_attack', true, true, 'ifTargetCreature' => $archangel],
        // New:
        //
        // XXX=C no giant?
        ['creature_attack', true, true, 'ifTargetCreature' => $titan],
      ],
    ],
    // Frenzy
    [
      ['creature_attack', true, true],
      ['creature_defense', [$clamp, 0, 0], true],
    ],
    // Laguna Blade
    // ...just kidding.
    // Titan's Lightning Bolt
    [],   // plain damage
    // Counterstrike
    [
      // XXX=I: sscs: this must increment the recurring Garrison->retaliating so that target may retaliate again this turn
      ['creature_retaliating', true, true],
    ],
    // Berserk
    [],
    // Hypnotize
    [],
    // Forgetfulness
    [
      [['creature_attack', 0.50, true, 'ifCreatureShooting' => 1]],
      [['creature_shots', [$clamp, 0, 0], true]],
      [['creature_shots', [$clamp, 0, 0], true]],
    ],
    // Blind
    [],
    // Teleport
    [],
    // Remove Obstacle
    [],
    // Clone
    [],
    // Fire Elemental
    [],
    // Earth Elemental
    [],
    // Water Elemental
    [],
    // Air Elemental
    [],

    // Stone Gaze
    [],
    // Poison
    [],
    // Bind
    [],
    // Disease
    [],
    // Paralyze
    [],
    // Age
    [],
    // Death Cloud
    [],
    // Thunderbolt
    [],
    // Dispel Helpful Spells
    [],
    // Death Stare
    [],
    // Acid breath
    [],
  ],
];