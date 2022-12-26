<?php
extract(json_decode(file_get_contents("$outPath/townsID.json"), true));
extract(json_decode(file_get_contents("$outPath/spellsID.json"), true), EXTR_PREFIX_ALL, 's');
// This file is written before require()'ing this script.
extract(json_decode(file_get_contents("$outPath/creaturesID.json"), true));
extract(array_flip(AClass::terrain), EXTR_PREFIX_ALL, 't');
extract(array_flip(Creature::special), EXTR_PREFIX_ALL, 's');
extract(array_flip(Creature::undead), EXTR_PREFIX_ALL, 'u');
extract(array_flip(Spell::aggression));
extract(array_flip(Creature::alignment));
extract(array_flip(H3Effect::context));
extract(array_flip(H3Effect::operation));
$fire = nameToID("$outPath/spellSchools", 'fire');
$spellImmune = array_search('spellImmune', Effect::source);

// XXX=I new spells provided or existing spells overridden by the map are ignored because databank spells are hardcoded; same issue in defining object effects (Corpse), etc.
$mind = $offensive = $defensive = [];
$store = ObjectStore::fromFile("$outPath/spells.json");

for ($id = 0; $id < $store->x(); $id++) {
  if ($store->atCoords($id, 0, 0, 'mind')) {
    $mind[] = $id;
  }
  if ($store->atCoords($id, 0, 0, 'context') === array_search('combat', Spell::context) and
      $store->atCoords($id, 0, 0, 'targetCreature') and
      !$store->atCoords($id, 0, 0, 'byCreature')) {
    switch (Spell::aggression[$store->atCoords($id, 0, 0, 'aggression')] ?? '') {
      case 'offense':
        $offensive[] = $id;
        break;
      case 'defense':
        $defensive[] = $id;
        break;
    }
  }
}

$mindSpells = function ($effect) use ($mind, $spellImmune) {
  $source = $spellImmune;
  return array_map(function ($ifSpell) use ($effect, $source) {
    return $effect + compact('ifSpell', 'source');
  }, $mind);
};

return [
  'backgroundOfTown' => [
    null => 'CRBKGNEU',
    'CRBKGCAS',
    'CRBKGRAM',
    'CRBKGTOW',
    'CRBKGINF',
    'CRBKGNEC',
    'CRBKGDUN',
    'CRBKGSTR',
    'CRBKGFOR',
    'CRBKGELE',
  ],

  // Taken from the editor's right-click help text in Tools > Monsters.
  'levelOfCreature' => [
    // Castle
    1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    // Rampart
    1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    // Tower
    1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    // Inferno
    1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    // Necropolis
    1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    // Dungeon
    1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    // Stronghold
    1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    // Fortress
    1, 1, 2, 2, 5, 5, 3, 3, 4, 4, 6, 6, 7, 7,
    // conflux and neutrals
    2, 5, 4, 3, 4, 5, 1, 1, 6, 6,
    0, // NOT USED (1)
    3,
    0, // NOT USED (2)
    5,
    0, // NOT USED (3)
    2,
    0, // NOT USED (4)
    4, 7, 7,
    // Neutrals (starting from Azure Dragon)
    10, 10, 8, 10, 6, 4, 1, 1, 2, 3, 3, 2, 5,
    // War machines
    0, 0, 0, 0, 0,
  ],

  // Determined empirically by placing monsters - 1st level creatures of 9 towns
  // (Castle..Conflux) over 8 terrains (dirt..lava), engaging combat with every
  // monster and observing their stats in creature info window.
  //
  // For neutrals, have placed them over 8 terrains and done the same but none
  // of these creatures have shown any change in stats.
  //
  // XXX=C While doing this, I have noticed that casting Armageddon on Diamond Golems deals different damage per group. If you fight 3 groups of Golems and cast it, some groups may have 4 creatures perished, some 5, some 6. Not sure what causes this - Armageddon is supposed to deal the same damage to every party sans their resistance % (which is the same for the same type of creature).
  'terrainOfCreature' => [
    // Castle
    $t_grass, $t_grass, $t_grass, $t_grass, $t_grass, $t_grass, $t_grass,
    $t_grass, $t_grass, $t_grass, $t_grass, $t_grass, $t_grass, $t_grass,
    // Rampart
    $t_grass, $t_grass, $t_grass, $t_grass, $t_grass, $t_grass, $t_grass,
    $t_grass, $t_grass, $t_grass, $t_grass, $t_grass, $t_grass, $t_grass,
    // Tower
    $t_snow, $t_snow, $t_snow, $t_snow, $t_snow, $t_snow, $t_snow,
    $t_snow, $t_snow, $t_snow, $t_snow, $t_snow, $t_snow, $t_snow,
    // Inferno
    $t_lava, $t_lava, $t_lava, $t_lava, $t_lava, $t_lava, $t_lava,
    $t_lava, $t_lava, $t_lava, $t_lava, $t_lava, $t_lava, $t_lava,
    // Necropolis
    $t_dirt, $t_dirt, $t_dirt, $t_dirt, $t_dirt, $t_dirt, $t_dirt,
    $t_dirt, $t_dirt, $t_dirt, $t_dirt, $t_dirt, $t_dirt, $t_dirt,
    // Dungeon
    $t_subterranean, $t_subterranean, $t_subterranean, $t_subterranean,
    $t_subterranean, $t_subterranean, $t_subterranean, $t_subterranean,
    $t_subterranean, $t_subterranean, $t_subterranean, $t_subterranean,
    $t_subterranean, $t_subterranean,
    // Stronghold
    $t_rough, $t_rough, $t_rough, $t_rough, $t_rough, $t_rough, $t_rough,
    $t_rough, $t_rough, $t_rough, $t_rough, $t_rough, $t_rough, $t_rough,
    // Fortress
    $t_swamp, $t_swamp, $t_swamp, $t_swamp, $t_swamp, $t_swamp, $t_swamp,
    $t_swamp, $t_swamp, $t_swamp, $t_swamp, $t_swamp, $t_swamp, $t_swamp,
    // conflux (start)
    $t_grass, $t_grass, $t_grass, $t_grass,
    // Gold golem
    null,
    // Diamond golem
    null,
    // conflux (continues)
    $t_grass, $t_grass, $t_grass, $t_grass,
    null, // NOT USED (1)
    $t_grass,
    null, // NOT USED (2)
    $t_grass,
    null, // NOT USED (3)
    $t_grass,
    null, // NOT USED (4)
    $t_grass, $t_grass, $t_grass,
    // Neutrals following
    null,
  ],

  // Sounds.txt.
  'soundOfCreature' => [
    'PIKE',
    'HALB',
    'LCRS',
    'HCRS',
    'GRIF',
    'RGRF',
    'SWRD',
    'CRUS',
    'MONK',
    'ZELT',
    'CAVA',
    'CHMP',
    'ANGL',
    'AAGL',
    'CNTR',
    'ECNT',
    'DWRF',
    'BDRF',
    'WELF',
    'GELF',
    'PEGA',
    'APEG',
    'TREE',
    'BTRE',
    'UNIC',
    'WUNC',
    'GRDR',
    'GODR',
    'AGRM',
    'MGRM',
    'SGRG',
    'OGRG',
    'SGLM',
    'IGLM',
    'MAGE',
    'AMAG',
    'GENI',
    'CALF',
    'NSEN',
    'NGRD',
    'LTIT',
    'GTIT',
    'IMPP',
    'FMLR',
    'GOGG',
    'MGOG',
    'HHND',
    'CERB',
    'SHDM',
    'DHDM',
    'PFND',
    'PFOE',
    'EFRT',
    'ESUL',
    'DEVL',
    'ADVL',
    'SKEL',
    'SKLW',
    'ZOMB',
    'ZMBL',
    'WGHT',
    'WRTH',
    'VAMP',
    'NOSF',
    'LICH',
    'PLCH',
    'BKNT',
    'BLRD',
    'BODR',
    'GHDR',
    'TROG',
    'ITRG',
    'HARP',
    'HHAG',
    'BHDR',
    'EVLI',
    'MEDU',
    'MEDQ',
    'MINO',
    'MINK',
    'MANT',
    'SCRP',
    'RDDR',
    'BKDR',
    'GBLN',
    'HGOB',
    'GWRD',
    'HGWR',
    'OORC',
    'ORCC',
    'OGRE',
    'OGRM',
    'ROCC',
    'TBRD',
    'CCYC',
    'CYCL',
    'YBMH',
    'BMTH',
    'GNOL',
    'GNLM',
    'PLIZ',
    'ALIZ',
    'CGOR',
    'BGOR',
    'DFLY',
    'FDFL',
    'BASL',
    'GBAS',
    'WYVN',
    'WYVM',
    'HYDR',
    'CHYD',
    'AELM',
    'EELM',
    'FELM',
    'WELM',
    'GGLM',
    'DGLM',
    'PIXI',
    'SPRT',
    'PSYC',
    'MGEL',
    'BAD1',
    'ICEL',
    'BAD2',
    'MAGM',
    'BAD3',
    'STOR',
    'BAD4',
    'ENER',
    'FIRB',
    'PHOE',
    'AZUR',
    'CRYS',
    'FAER',
    'RUST',
    'ENCH',
    'LCRS',   // XXX=C does sharpshooter use the same sounds as archer?
    'HALF',
    'PSNT',
    'BOAR',
    'MUMY',
    'NMAD',
    'ROGU',
    'TRLL',
    'CATA',
    'BALL',
    'FAID',
    'CART',
    null,
  ],

  // Determined empirically.
  'townOfCreature' => [
    // Castle
    $castle, $castle, $castle, $castle, $castle, $castle, $castle,
    $castle, $castle, $castle, $castle, $castle, $castle, $castle,
    // Rampart
    $rampart, $rampart, $rampart, $rampart, $rampart, $rampart, $rampart,
    $rampart, $rampart, $rampart, $rampart, $rampart, $rampart, $rampart,
    // Tower
    $tower, $tower, $tower, $tower, $tower, $tower, $tower,
    $tower, $tower, $tower, $tower, $tower, $tower, $tower,
    // Inferno
    $inferno, $inferno, $inferno, $inferno, $inferno, $inferno, $inferno,
    $inferno, $inferno, $inferno, $inferno, $inferno, $inferno, $inferno,
    // Necropolis
    $necropolis, $necropolis, $necropolis, $necropolis, $necropolis,
    $necropolis, $necropolis, $necropolis, $necropolis, $necropolis,
    $necropolis, $necropolis, $necropolis, $necropolis,
    // Dungeon
    $dungeon, $dungeon, $dungeon, $dungeon, $dungeon, $dungeon, $dungeon,
    $dungeon, $dungeon, $dungeon, $dungeon, $dungeon, $dungeon, $dungeon,
    // stronghold
    $stronghold, $stronghold, $stronghold, $stronghold, $stronghold,
    $stronghold, $stronghold, $stronghold, $stronghold, $stronghold,
    $stronghold, $stronghold, $stronghold, $stronghold,
    // Fortress
    $fortress, $fortress, $fortress, $fortress, $fortress,
    $fortress, $fortress, $fortress, $fortress, $fortress,
    $fortress, $fortress, $fortress, $fortress,
    // conflux and neutrals
    $conflux, $conflux, $conflux, $conflux, null, null, $conflux, $conflux,
    $conflux, $conflux,
    null, // NOT USED (1)
    $conflux,
    null, // NOT USED (2)
    $conflux,
    null, // NOT USED (3)
    $conflux,
    null, // NOT USED (4)
    $conflux, $conflux, $conflux,
    // Neutrals (starting from Azure Dragon)
    null, null, null, null, null, null, null,
    null, null, null, null, null, null,
    // War machines
    null, null, null, null, null,
  ],

  // Determined empirically based on Evil Fog effects on morale.
  'alignmentOfCreature' => [
    // Castle
    $good, $good, $good, $good, $good, $good, $good,
    $good, $good, $good, $good, $good, $good, $good,
    // Rampart
    $good, $good, $good, $good, $good, $good, $good,
    $good, $good, $good, $good, $good, $good, $good,
    // Tower
    $good, $good, $good, $good, $good, $good, $good,
    $good, $good, $good, $good, $good, $good, $good,
    // Inferno
    $evil, $evil, $evil, $evil, $evil, $evil, $evil,
    $evil, $evil, $evil, $evil, $evil, $evil, $evil,
    // Necropolis
    $evil, $evil, $evil, $evil, $evil, $evil, $evil,
    $evil, $evil, $evil, $evil, $evil, $evil, $evil,
    // Dungeon
    $evil, $evil, $evil, $evil, $evil, $evil, $evil,
    $evil, $evil, $evil, $evil, $evil, $evil, $evil,
    // Stronghold
    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    // Fortress
    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    // Conflux and neutrals
    null, null, null, null, null, null, null, null,
    null, null,
    null, // NOT USED (1)
    null,
    null, // NOT USED (2)
    null,
    null, // NOT USED (3)
    null,
    null, // NOT USED (4)
    null, null, null,
    // Neutrals (starting from Azure Dragon)
    null, null, null, null, null, null, null, null, null, null, null, null, null,
    // War machines
    null, null, null, null, null,
  ],

  // Determined empirically using CRTRAITS.TXT, attributes and abilityText columns.
  'effectsOfCreature' => [
    $boneDragon => [
      ['creature_morale', -1, 'ifObject' => true, 'isOpponent' => true],
    ],
    $ghostDragon => [
      ['creature_morale', -1, 'ifObject' => true, 'isOpponent' => true],
      // 20% chance. XXX=I
      //['creature_spells', [$append, $age], 'ifCreature' => $ghostDragon],
    ],
    $angel => [
      ['creature_morale', +1, 'ifObject' => true],
    ],
    $archangel => [
      ['creature_morale', +1, 'ifObject' => true],
      ['creature_spells', [$append, $s_resurrection], 'ifCreature' => $archangel],
    ],
    $minotaur => [
      ['creature_morale', [$clamp, 1], 'ifCreature' => $minotaur],
    ],
    $minotaurKing => [
      ['creature_morale', [$clamp, 1], 'ifCreature' => $minotaurKing],
    ],
    $devil => [
      ['creature_luck', -1, 'ifObject' => true, 'isOpponent' => true],
    ],
    $archDevil => [
      ['creature_luck', -1, 'ifObject' => true, 'isOpponent' => true],
    ],
    $halfling => [
      ['creature_luck', +1, 'ifObject' => true],
    ],
    $mage => [
      ['spellCost', 0.5, 'ifObject' => true, 'ifContext' => $combat],
    ],
    // Arch Mage has const_no_wall_penalty but the game doesn't treat it like that.
    $archMage => [
      ['spellCost', 0.5, 'ifObject' => true, 'ifContext' => $combat],
    ],
    $giant => $mindSpells(['creature_spellImmune', true, 'ifTargetCreature' => $giant]),
    $titan => $mindSpells(['creature_spellImmune', true, 'ifTargetCreature' => $giant]),
    $medusa => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $stoneGaze], 'ifCreature' => $medusa],
    ],
    $medusaQueen => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $stoneGaze], 'ifCreature' => $medusaQueen],
    ],
    $stormElemental => array_merge(
      $mindSpells(['creature_spellImmune', true, 'ifTargetCreature' => $stormElemental]),
      [
        ['spellEfficiency', 2.0, 'ifTargetCreature' => $stormElemental, 'ifSpell' => $s_lightningBolt],
        ['spellEfficiency', 2.0, 'ifTargetCreature' => $stormElemental, 'ifSpell' => $s_fireball],
      ]
    ),
    $enchanter => [
      ['creature_spells', array_merge([$append], $defensive), 'ifCreature' => $enchanter],
      ['spellGlobal', true, 'ifCreature' => $enchanter],
    ],
    $sharpshooter => [
      ['creature_shootPenalty', 1.5, 'ifCreature' => $sharpshooter],
    ],
    $psychicElemental => $mindSpells(['creature_spellImmune', true, 'ifTargetCreature' => $psychicElemental]),
    $magicElemental => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $magicElemental, 'source' => $spellImmune],
    ],
    $vampireLord => [
      ['creature_spells', [$append, $s_drainHitPoints], 'ifCreature' => $vampireLord],
    ],
    $pegasus => [
      ['spellCost', +2, 'ifObject' => true, 'isOpponent' => true],
    ],
    $silverPegasus => [
      ['spellCost', +2, 'ifObject' => true, 'isOpponent' => true],
    ],
    $unicorn => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $s_blind], 'ifCreature' => $unicorn],
      ['creature_spellEvade', +20, 'ifTargetCreature' => $unicorn, 'isTargetAdjacent' => array_search('own', H3Effect::isAdjacent), 'ifAggression' => array_search('offense', Spell::aggression)],
    ],
    $warUnicorn => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $s_blind], 'ifCreature' => $warUnicorn],
      ['creature_spellEvade', +20, 'ifTargetCreature' => $warUnicorn, 'isTargetAdjacent' => array_search('own', H3Effect::isAdjacent), 'ifAggression' => array_search('offense', Spell::aggression)],
    ],
    $greenDragon => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $greenDragon, 'ifSpellLevel' => 1, 'source' => $spellImmune],
      ['creature_spellImmune', true, 'ifTargetCreature' => $greenDragon, 'ifSpellLevel' => 2, 'source' => $spellImmune],
      ['creature_spellImmune', true, 'ifTargetCreature' => $greenDragon, 'ifSpellLevel' => 3, 'source' => $spellImmune],
    ],
    $goldDragon => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $greenDragon, 'ifSpellLevel' => 1, 'source' => $spellImmune],
      ['creature_spellImmune', true, 'ifTargetCreature' => $greenDragon, 'ifSpellLevel' => 2, 'source' => $spellImmune],
      ['creature_spellImmune', true, 'ifTargetCreature' => $greenDragon, 'ifSpellLevel' => 3, 'source' => $spellImmune],
      ['creature_spellImmune', true, 'ifTargetCreature' => $greenDragon, 'ifSpellLevel' => 4, 'source' => $spellImmune],
    ],
    $blackKnight => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $s_curse], 'ifCreature' => $blackKnight],
    ],
    $dreadKnight => [
      // 20% chance for both spells. XXX=I
      //['creature_spells', [$append, $s_curse, $s_deathBlow], 'ifCreature' => $dreadKnight],
    ],
    $scorpicore => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $s_paralyze], 'ifCreature' => $scorpicore],
    ],
    $redDragon => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $redDragon, 'ifSpellLevel' => 1, 'source' => $spellImmune],
      ['creature_spellImmune', true, 'ifTargetCreature' => $redDragon, 'ifSpellLevel' => 2, 'source' => $spellImmune],
      ['creature_spellImmune', true, 'ifTargetCreature' => $redDragon, 'ifSpellLevel' => 3, 'source' => $spellImmune],
    ],
    $blackDragon => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $blackDragon, 'source' => $spellImmune],
    ],
    $thunderbird => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $s_lightningBolt], 'ifCreature' => $thunderbird],
    ],
    $mightyGorgon => [
      // 10% chance. XXX=I
      //['creature_spells', [$append, $s_deathStare], 'ifCreature' => $mightyGorgon],
    ],
    $basilisk => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $s_stoneGaze], 'ifCreature' => $basilisk],
    ],
    $greaterBasilisk => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $s_stoneGaze], 'ifCreature' => $basilisk],
    ],
    $wyvernMonarch => [
      // XXX=I,ID Unknown chance.
      //['creature_spells', [$append, $s_poison], 'ifCreature' => $wyvernMonarch],
    ],
    $firebird => [
      // XXX+IC Magic Arrow belongs to all 4 schools but casting it on Firebird is impossible in SoD. Let's suppose the hero has Expert Air Magic and no other skills; HeroWO would choose ifSpellSchool = [Air] and allow casting but SoD seems to check all schools and if the creature has immunity against any of them the spell cannot be cast.
      ['creature_spellImmune', true, 'ifTargetCreature' => $firebird, 'ifSpellSchool' => $fire, 'source' => $spellImmune],
    ],
    $phoenix => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $firebird, 'ifSpellSchool' => $fire, 'source' => $spellImmune],
    ],
    $azureDragon => [
      // XXX=I,ID Unknown chance.
      //['creature_spells', [$append, $s_fear], 'ifCreature' => $azureDragon],
    ],
    $crystalDragon => [
      ['income', +1, 'ifPlayer' => true, 'ifResource' => $constants['resources']['crystal']],
    ],
    $faerieDragon => [
      ['creature_spells', array_merge([$append], $offensive), 'ifCreature' => $faerieDragon],
    ],
    $rustDragon => [
      ['creature_spells', [$append, $s_acidBreath], 'ifCreature' => $rustDragon],
    ],
    $masterGenie => [
      ['creature_spells', array_merge([$append], $defensive), 'ifCreature' => $masterGenie],
    ],
    $serpentFly => [
      ['creature_spells', [$append, $s_dispelHelpful], 'ifCreature' => $serpentFly],
    ],
    $dragonFly => [
      ['creature_spells', [$append, $s_dispelHelpful, $s_weakness], 'ifCreature' => $dragonFly],
    ],
    $energyElemental => array_merge(
      $mindSpells(['creature_spellImmune', true, 'ifTargetCreature' => $energyElemental]),
      [
        ['creature_spellImmune', true, 'ifTargetCreature' => $energyElemental, 'ifSpellSchool' => $fire, 'source' => $spellImmune],
        ['spellEfficiency', 2.0, 'ifTargetCreature' => $energyElemental, 'ifSpell' => $s_iceRay],
        ['spellEfficiency', 2.0, 'ifTargetCreature' => $energyElemental, 'ifSpell' => $s_frostRing],
        ['creature_spells', [$append, $s_protectionFromFire], 'ifCreature' => $energyElemental],
      ]
    ),
    $iceElemental => array_merge(
      $mindSpells(['creature_spellImmune', true, 'ifTargetCreature' => $iceElemental]),
      [
        ['creature_spellImmune', true, 'ifTargetCreature' => $iceElemental, 'ifSpell' => $s_iceRay, 'source' => $spellImmune],
        ['creature_spellImmune', true, 'ifTargetCreature' => $iceElemental, 'ifSpell' => $s_frostRing, 'source' => $spellImmune],
        ['spellEfficiency', 2.0, 'ifTargetCreature' => $iceElemental, 'ifSpellSchool' => $fire],
        ['creature_spells', [$append, $s_protectionFromWater], 'ifCreature' => $iceElemental],
      ]
    ),
    $efreeti => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $efreeti, 'ifSpellSchool' => $fire, 'source' => $spellImmune]
    ],
    $efreetSultan => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $efreetSultan, 'ifSpellSchool' => $fire, 'source' => $spellImmune],
    ],
    $troglodyte => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $troglodyte, 'ifSpell' => $s_blind, 'source' => $spellImmune],
    ],
    $infernalTroglodyte => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $troglodyte, 'ifSpell' => $s_blind, 'source' => $spellImmune],
    ],
    $airElemental => [
      ['spellEfficiency', 2.0, 'ifTargetCreature' => $airElemental, 'ifSpell' => $s_lightningBolt],
      ['spellEfficiency', 2.0, 'ifTargetCreature' => $airElemental, 'ifSpell' => $s_fireball],
    ],
    $waterElemental => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $waterElemental, 'ifSpell' => $s_iceRay, 'source' => $spellImmune],
      ['creature_spellImmune', true, 'ifTargetCreature' => $waterElemental, 'ifSpell' => $s_frostRing, 'source' => $spellImmune],
      ['spellEfficiency', 2.0, 'ifTargetCreature' => $waterElemental, 'ifSpellSchool' => $fire],
    ],
    $fireElemental => [
      ['creature_spellImmune', true, 'ifTargetCreature' => $fireElemental, 'ifSpellSchool' => $fire, 'source' => $spellImmune],
      ['spellEfficiency', 2.0, 'ifTargetCreature' => $fireElemental, 'ifSpell' => $s_iceRay],
      ['spellEfficiency', 2.0, 'ifTargetCreature' => $fireElemental, 'ifSpell' => $s_frostRing],
    ],
    $earthElemental => [
      ['spellEfficiency', 2.0, 'ifTargetCreature' => $earthElemental, 'ifSpell' => $s_meteorShower],
    ],
    $magmaElemental =>  array_merge(
      $mindSpells(['creature_spellImmune', true, 'ifTargetCreature' => $magmaElemental]),
      [
        ['creature_spells', [$append, $s_protectionFromEarth], 'ifCreature' => $magmaElemental],
      ]
    ),
    $zombie => [
      // 20% chance. XXX=I
      //['creature_spells', [$append, $s_desease], 'ifCreature' => $zombie],
    ],
    $dwarf => [
      ['creature_spellEvade', +20, 'ifTargetCreature' => $dwarf, 'ifAggression' => array_search('offense', Spell::aggression)],
    ],
    $battleDwarf => [
      ['creature_spellEvade', +40, 'ifTargetCreature' => $battleDwarf, 'ifAggression' => array_search('offense', Spell::aggression)],
    ],
    $dendroidGuard => [
      ['creature_spells', [$append, $s_bind], 'ifCreature' => $dendroidGuard],
    ],
    $dendroidSoldier => [
      ['creature_spells', [$append, $s_bind], 'ifCreature' => $dendroidSoldier],
    ],
    $stoneGolem => [
      ['spellEfficiency', 0.50, 'ifTargetCreature' => $stoneGolem, 'ifAggression' => array_search('offense', Spell::aggression)],
    ],
    $ironGolem => [
      ['spellEfficiency', 0.25, 'ifTargetCreature' => $ironGolem, 'ifAggression' => array_search('offense', Spell::aggression)],
    ],
    $pitLord => [
      ['creature_spells', [$append, $s_resurrectionDemon], 'ifCreature' => $pitLord],
    ],
    $ogreMage => [
      ['creature_spells', [$append, $s_bloodlust], 'ifCreature' => $ogreMage],
    ],
    $goldGolem => [
      ['spellEfficiency', 0.15, 'ifTargetCreature' => $goldGolem, 'ifAggression' => array_search('offense', Spell::aggression)],
    ],
    $diamondGolem => [
      ['spellEfficiency', 0.05, 'ifTargetCreature' => $diamondGolem, 'ifAggression' => array_search('offense', Spell::aggression)],
    ],
    $mummy => [
      ['creature_spells', [$append, $s_curse], 'ifCreature' => $mummy],
    ],
    $nomad => [
      ['hero_actionCost', [$clamp, null, 2], 'ifObject' => true, 'ifTerrain' => array_search('sand', AClass::terrain)],
    ],
    $catapult => [
      // Attack after towers and don't be affected by artifacts and other bonuses to speed.
      ['creature_speed', [$clamp, 99, 99], 'ifCreature' => $catapult],
      ['creature_moveDistance', [$clamp, 0, 0], 'ifCreature' => $catapult],
      // For special creatures luck/morale usually has no effect but these Effects exist to display neutral stats in the creature's info dialog, like SoD does.
      ['creature_luck', [$clamp, 0, 0], 'ifCreature' => $catapult],
      ['creature_morale', [$clamp, 0, 0], 'ifCreature' => $catapult],
      ['creature_canControl', [$const, false], 'ifCreature' => $catapult],
    ],
    $ballista => [
      // Don't be affected by artifacts and other bonuses to speed.
      ['creature_speed', [$clamp, 0, 0], 'ifCreature' => $ballista],
      ['creature_moveDistance', [$clamp, 0, 0], 'ifCreature' => $ballista],
      ['creature_morale', [$clamp, 0, 0], 'ifCreature' => $ballista],
      ['creature_shootBlocked', true, 'ifCreature' => $ballista],
      ['creature_canControl', [$const, false], 'ifCreature' => $ballista],
    ],
    $firstAidTent => [
      ['creature_speed', [$clamp, 0, 0], 'ifCreature' => $firstAidTent],
      ['creature_moveDistance', [$clamp, 0, 0], 'ifCreature' => $firstAidTent],
      ['creature_morale', [$clamp, 0, 0], 'ifCreature' => $firstAidTent],
      //['creature_spells', [$append, $s_cure], 'ifCreature' => $firstAidTent],
      ['creature_canControl', [$const, false], 'ifCreature' => $firstAidTent],
    ],
    $ammoCart => [
      ['creature_speed', [$clamp, 0, 0], 'ifCreature' => $ammoCart],
      ['creature_moveDistance', [$clamp, 0, 0], 'ifCreature' => $ammoCart],
      ['creature_morale', [$clamp, 0, 0], 'ifCreature' => $ammoCart],
      // XXX=C if destroyed - cancel effect? if so then can add new Effect->whileCombatCreature and use it here
      ['creature_shots', +9999, 'ifObject' => true, 'ifContext' => $combat, 'ifCreatureShooting' => 1],
      ['creature_canControl', [$const, false], 'ifCreature' => $ammoCart],
    ],
    // Each town has its own arrow tower creature created in databank-custom.php.
  ],

  'townEffectsOfCreature' => [
  ],

  // Determined empirically.
  'heroEffectsOfCreature' => [
    $rogue => [
      // Matches when the viewing player is an enemy of the player whose hero/town is being viewed (ifPlayer). This automatically covers the player who possesses a Rogue and his allies.
      ['garrisonSee', [$const, array_search('full', H3Effect::garrisonDetails)], 'ifPlayer' => true, 'isEnemy' => true, 'ifRadius' => 2, 'ifX' => true, 'ifY' => true, 'ifZ' => true],
    ],
  ],

  'antipodeCreatures' => [
    [[$angel, $archangel], [$devil, $archDevil]],
    [[$genie, $masterGenie], [$efreeti, $efreetSultan]],
    // CRTRAITS.TXT is missing entry for Black Dragons hating Titans but
    // this seems logical and fandom.com confirms it.
    [[$titan], [$blackDragon]],
  ],

  'noMeleePenaltyCreatures' => [
    $mage,
    $archMage,
    $titan,
    $beholder,
    $evilEye,
    $medusa,
    $medusaQueen,
    $stormElemental,
    $enchanter,
    $sharpshooter,
    $zealot,
  ],

  // Determined empirically using CRTRAITS.TXT, attributes and abilityText columns.
  'creatureOverrides' => [
    // creature_wallDamage is added in databank-custom.php.
    $cyclops => ['wallStrikes' => 1, 'shooting' => true],
    $cyclopsKing => ['wallStrikes' => 2, 'shooting' => true],
    // XXX=C: dcj: review jousting bonus
    $cavalier => ['jousting' => 1, 'width' => 2],
    // XXX=C:dcj:
    $champion => ['jousting' => 2, 'width' => 2],
    $boneDragon => ['width' => 2, 'undead' => $u_undead, 'flying' => true, 'attackDepth' => 1],
    $ghostDragon => ['width' => 2, 'undead' => $u_undead, 'flying' => true, 'attackDepth' => 1],
    $angel => ['flying' => true],
    $archangel => ['flying' => true, 'width' => 2],
    $devil => ['enemyRetaliating' => false, 'flying' => true],
    $archDevil => ['enemyRetaliating' => false, 'flying' => true],
    $halfling => ['shooting' => true],
    $mage => ['shooting' => true],
    // Arch Mage has const_no_wall_penalty but the game doesn't treat it like that.
    // Looks like a mistake because it's the only creature in TXT that has this attribute and yet the only creature that does ignore shoot distance in reality is Sharpshooter.
    $archMage => ['shooting' => true],
    $titan => ['shooting' => true],
    $beholder => ['shooting' => true],
    $evilEye => ['shooting' => true],
    $medusa => ['width' => 2, 'shooting' => true],
    $medusaQueen => ['width' => 2, 'shooting' => true],
    $stormElemental => ['shooting' => true],
    $enchanter => ['shooting' => true],
    $sharpshooter => ['shooting' => true],
    $griffin => ['retaliating' => 2, 'width' => 2, 'flying' => true],
    $royalGriffin => ['retaliating' => +9999, 'width' => 2, 'flying' => true],
    $crusader => ['strikes' => 2],
    $wolfRider => ['width' => 2],
    $wolfRaider => ['strikes' => 2, 'width' => 2],
    $marksman => ['strikes' => 2, 'shooting' => true],
    $woodElf => ['shooting' => true],
    $grandElf => ['strikes' => 2, 'shooting' => true],
    $hydra => ['attackAround' => 1, 'enemyRetaliating' => false, 'width' => 2],
    $chaosHydra => ['attackAround' => 1, 'enemyRetaliating' => false, 'width' => 2],
    $psychicElemental => ['attackAround' => 1, 'enemyRetaliating' => false, 'width' => 2],
    $magicElemental => ['attackAround' => 1, 'enemyRetaliating' => false, 'width' => 2],
    $naga => ['enemyRetaliating' => false, 'width' => 2],
    $nagaQueen => ['enemyRetaliating' => false, 'width' => 2],
    $vampire => ['enemyRetaliating' => false, 'flying' => true, 'undead' => $u_undead],
    $vampireLord => ['enemyRetaliating' => false, 'flying' => true, 'undead' => $u_undead],
    $harpy => ['flying' => true],
    $harpyHag => ['enemyRetaliating' => false, 'flying' => true, 'attackAndReturn' => true],
    $sprite => ['enemyRetaliating' => false, 'flying' => true],
    $centaur => ['width' => 2],
    $centaurCaptain => ['width' => 2],
    $pegasus => ['width' => 2, 'flying' => true],
    $silverPegasus => ['width' => 2, 'flying' => true],
    $unicorn => ['width' => 2],
    $warUnicorn => ['width' => 2],
    $greenDragon => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $goldDragon => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $hellHound => ['width' => 2],
    $cerberus => ['enemyRetaliating' => false, 'width' => 2, 'attackAround' => -1],
    $blackKnight => ['width' => 2, 'undead' => $u_undead],
    $dreadKnight => ['width' => 2, 'undead' => $u_undead],
    $manticore => ['width' => 2, 'flying' => true],
    $scorpicore => ['width' => 2, 'flying' => true],
    $redDragon => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $blackDragon => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $roc => ['width' => 2, 'flying' => true],
    $thunderbird => ['width' => 2, 'flying' => true],
    $behemoth => ['width' => 2, 'piercing' => 40],
    $ancientBehemoth => ['width' => 2, 'piercing' => 80],
    $gorgon => ['width' => 2],
    $mightyGorgon => ['width' => 2],
    $basilisk => ['width' => 2],
    $greaterBasilisk => ['width' => 2],
    $wyvern => ['width' => 2, 'flying' => true],
    $wyvernMonarch => ['width' => 2, 'flying' => true],
    $firebird => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    // XXX=I Implement extra skill (Rebirth).
    $phoenix => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $azureDragon => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $crystalDragon => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $faerieDragon => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $rustDragon => ['width' => 2, 'flying' => true, 'attackDepth' => 1],
    $stoneGargoyle => ['flying' => true],
    $obsidianGargoyle => ['flying' => true],
    $genie => ['flying' => true],
    $masterGenie => ['flying' => true],
    $wight => ['flying' => true, 'undead' => $u_undead, 'regenerating' => true],
    // XXX=I Implement extra skill (drains spellpoints).
    $wraith => ['flying' => true, 'undead' => $u_undead, 'regenerating' => true],
    $serpentFly => ['flying' => true],
    $dragonFly => ['flying' => true],
    $pixie => ['flying' => true],
    $energyElemental => ['flying' => true],
    $archer => ['shooting' => true],
    $zealot => ['shooting' => true],
    $monk => ['shooting' => true],
    $masterGremlin => ['shooting' => true],
    $gog => ['shooting' => true],
    $magog => ['shooting' => true, 'shootingCloud' => 1],
    $lich => ['shooting' => true, 'undead' => $u_undead, 'shootingCloud' => 1],
    $powerLich => ['shooting' => true, 'undead' => $u_undead, 'shootingCloud' => 1],
    $orc => ['shooting' => true],
    $orcChieftain => ['shooting' => true],
    $lizardman => ['shooting' => true],
    $lizardWarrior => ['shooting' => true],
    $iceElemental => ['shooting' => true],
    // XXX=I Implement extra skill (Fire Shield).
    $efreetSultan => [],
    $airElemental => ['shooting' => true],
    $skeleton => ['undead' => $u_undead],
    $skeletonWarrior => ['undead' => $u_undead],
    $walkingDead => ['undead' => $u_undead],
    $zombie => ['undead' => $u_undead],
    // XXX=I "channel 20% of spell points spent by enemy spellcasters directly into their hero’s spell point pool".
    $familiar => [],
    $troll => ['regenerating' => true],
    // Listing speed here is technically useless because of $clamp on creature_speed, but it improves output in CreatureInfo where if databank and actual values are identical only one of them is shown.
    $catapult => ['undead' => null, 'strikes' => 0, 'wallStrikes' => 1, 'shooting' => true, 'shots' => +9999, 'speed' => 99, 'win' => false, 'special' => $s_catapult],
    // War machines are normally artifacts (they don't appear in hero's garrison)
    // but when a combat starts the engine creates special creatures "from" these
    // artifacts and places them on the field. Thus war machines have all the normal
    // properties and Effects that regular creatures do.
    $ballista => ['undead' => null, 'shooting' => true, 'win' => false, 'special' => $s_ballista],
    // Damage for First Aid Tent is converted to HPs healed.
    //
    // XXX=C damage numbers
    $firstAidTent => ['undead' => null, 'damageMin' => 3, 'damageMax' => 10, 'win' => false, 'special' => $s_firstAidTent],
    $ammoCart => ['undead' => null, 'win' => false, 'special' => $s_ammoCart],
  ],
];