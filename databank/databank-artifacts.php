<?php
extract($constants['resources']);
extract(json_decode(file_get_contents("$outPath/creaturesID.json"), true));
extract(json_decode(file_get_contents("$outPath/spellsID.json"), true), EXTR_PREFIX_ALL, 's');
extract(json_decode(file_get_contents("$outPath/skillsID.json"), true));
// This would create circular dependency (artifacts on towns on classes on
// artifacts) but since Town->$id match SoD's, can hardcode them.
//extract(json_decode(file_get_contents("$outPath/townsID.json"), true));
extract(array_flip(explode(' ', 'castle rampart tower inferno necropolis dungeon stronghold fortress conflux')));
extract(array_flip(AObject::vehicle));
extract(array_flip(Spell::aggression));
extract(array_flip(H3Effect::context));
extract(array_flip(H3Effect::operation));

$dragons = [
  'greenDragon',
  'goldDragon',
  'boneDragon',
  'ghostDragon',
  'redDragon',
  'blackDragon',
  'azureDragon',
  'crystalDragon',
  'faerieDragon',
  'rustDragon',
];
extract(array_combine($dragons, nameToID("$outPath/creatures", $dragons)));

// Keys = spell level, spell school. Values = Spell->$id.
$spells = [];
$schools = json_decode(file_get_contents("$outPath/spellSchoolsID.json"), true);
$store = ObjectStore::fromFile("$outPath/spells.json");

for ($id = 0; $id < $store->x(); $id++) {
  if (!$store->atCoords($id, 0, 0, 'byCreature')) {
    $spells[$store->atCoords($id, 0, 0, 'level')][] = $id;
    foreach ($store->atCoords($id, 0, 0, 'schools') ?: [] as $schoolID) {
      $spells[array_search($schoolID, $schools)][] = $id;
    }
  }
}

return [
  'combatOfArtifact' => [
    'Catapult' => [
      'creature' => $catapult,
      'count' => 1,
      'x' => 7,
      // No $destroyArtifact.
    ],
    'Ballista' => [
      'creature' => $ballista,
      'count' => 1,
      'x' => 3,
      'destroyArtifact' => true,
    ],
    'Ammo Cart' => [
      'creature' => $ammoCart,
      'count' => 1,
      'x' => 1,
      'destroyArtifact' => true,
    ],
    'First Aid Tent' => [
      'creature' => $firstAidTent,
      'count' => 1,
      'x' => 9,
      'destroyArtifact' => true,
    ],
  ],

  'noBackpackOfArtifact' => [
    'Spell Book',
    'Catapult',
    'Ballista',
    'Ammo Cart',
    'First Aid Tent',
  ],

  'notTradableArtifact' => [
    'Catapult',
    'Spell Book',
  ],

  'noChanceOfArtifact' => [
    'Spell Book',
    'Spell Scroll',
    'The Grail',
    'Catapult',
    'Ballista',
    'Ammo Cart',
    'First Aid Tent',
  ],

  'artifactOverrides' => [
    'Spell Book' => ['cost_gold' => 500],
  ],

  // Determined empirically using descriptions in ARTRAITS.TXT.
  'effectsOfArtifact' => [
    // Spell Book
    [],
    // Spell Scroll
    [],
    // The Grail
    [],
    // Catapult
    [],
    // Ballista
    [],
    // Ammo Cart
    [],
    // First Aid Tent
    [],
    // Centaurs Axe
    [['hero_attack', +2, true]],
    // Blackshard of the Dead Knight
    [['hero_attack', +3, true]],
    // Greater Gnoll's Flail
    [['hero_attack', +4, true]],
    // Ogre's Club of Havoc
    [['hero_attack', +5, true]],
    // Sword of Hellfire
    [['hero_attack', +6, true]],
    // Titan's Gladius
    [
      ['hero_attack', +12, true],
      ['hero_defense', -3, true],
    ],
    // Shield of the Dwarven Lords
    [['hero_defense', +2, true]],
    // Shield of the Yawning Dead
    [['hero_defense', +3, true]],
    // Buckler of the Gnoll King
    [['hero_defense', +4, true]],
    // Targ of the Rampaging Ogre
    [['hero_defense', +5, true]],
    // Shield of the Damned
    [['hero_defense', +6, true]],
    // Sentinel's Shield
    [
      ['hero_defense', +12, true],
      ['hero_attack', -3, true]
    ],
    // Helm of the Alabaster Unicorn
    [['hero_knowledge', +1, true]],
    // Skull Helmet
    [['hero_knowledge', +2, true]],
    // Helm of Chaos
    [['hero_knowledge', +3, true]],
    // Crown of the Supreme Magi
    [['hero_knowledge', +4, true]],
    // Hellstorm Helmet
    [['hero_knowledge', +5, true]],
    // Thunder Helmet
    [
      ['hero_knowledge', +10, true],
      ['hero_spellPower', -2, true],
    ],
    // Breastplate of Petrified Wood
    [['hero_spellPower', +1, true]],
    // Rib Cage
    [['hero_spellPower', +2, true]],
    // Scales of the Greater Basilisk
    [['hero_spellPower', +3, true]],
    // Tunic of the Cyclops King
    [['hero_spellPower', +4, true]],
    // Breastplate of Brimstone
    [['hero_spellPower', +5, true]],
    // Titan's Cuirass
    [
      ['hero_spellPower', +10, true],
      ['hero_knowledge', -2, true],
    ],
    // Armor of Wonder
    [
      ['hero_attack', +1, true],
      ['hero_defense', +1, true],
      ['hero_knowledge', +1, true],
      ['hero_spellPower', +1, true],
    ],
    // Sandals of the Saint
    [
      ['hero_attack', +2, true],
      ['hero_defense', +2, true],
      ['hero_knowledge', +2, true],
      ['hero_spellPower', +2, true],
    ],
    // Celestial Necklace of Bliss
    [
      ['hero_attack', +3, true],
      ['hero_defense', +3, true],
      ['hero_knowledge', +3, true],
      ['hero_spellPower', +3, true],
    ],
    // Lion's Shield of Courage
    [
      ['hero_attack', +4, true],
      ['hero_defense', +4, true],
      ['hero_knowledge', +4, true],
      ['hero_spellPower', +4, true],
    ],
    // Sword of Judgement
    [
      ['hero_attack', +5, true],
      ['hero_defense', +5, true],
      ['hero_knowledge', +5, true],
      ['hero_spellPower', +5, true],
    ],
    // Helm of Heavenly Enlightenment
    [
      ['hero_attack', +6, true],
      ['hero_defense', +6, true],
      ['hero_knowledge', +6, true],
      ['hero_spellPower', +6, true],
    ],
    // Quiet Eye of the Dragon
    [
      ['hero_attack', +1, true],
      ['hero_defense', +1, true],
    ],
    // Red Dragon Flame Tongue
    [
      ['hero_attack', +2, true],
      ['hero_defense', +2, true],
    ],
    // Dragon Scale Shield
    [
      ['hero_attack', +3, true],
      ['hero_defense', +3, true],
    ],
    // Dragon Scale Armor
    [
      ['hero_attack', +4, true],
      ['hero_defense', +4, true],
    ],
    // Dragonbone Greaves
    [
      ['hero_knowledge', +1, true],
      ['hero_spellPower', +1, true],
    ],
    // Dragon Wing Tabard
    [
      ['hero_knowledge', +2, true],
      ['hero_spellPower', +2, true],
    ],
    // Necklace of Dragonteeth
    [
      ['hero_knowledge', +3, true],
      ['hero_spellPower', +3, true],
    ],
    // Crown of Dragontooth
    [
      ['hero_knowledge', +4, true],
      ['hero_spellPower', +4, true],
    ],
    // Still Eye of the Dragon
    [
      ['creature_luck', +1, true],
      ['creature_morale', +1, true],
    ],
    // Clover of Fortune
    [['creature_luck', +1, true]],
    // Cards of Prophecy
    [['creature_luck', +1, true]],
    // Ladybird of Luck
    [['creature_luck', +1, true]],
    // Badge of Courage
    [['creature_morale', +1, true]],
    // Crest of Valor
    [['creature_morale', +1, true]],
    // Glyph of Gallantry
    [['creature_morale', +1, true]],
    // Speculum
    [['hero_shroud', +1, true]],
    // Spyglass
    [['hero_shroud', +1, true]],
    // Amulet of the Undertaker
    [
      ['creature_reanimate', 0.05, true],
    ],
    // Vampire's Cowl
    [
      ['creature_reanimate', 0.10, true],
    ],
    // Dead Man's Boots
    [
      ['creature_reanimate', 0.15, true],
    ],
    // Garniture of Interference
    [
      ['spellEfficiency', 0.95, 'ifTargetObject' => true, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat],
    ],
    // Surcoat of Counterpoise
    [
      ['spellEfficiency', 0.90, 'ifTargetObject' => true, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat],
    ],
    // Boots of Polarity
    [
      ['spellEfficiency', 0.85, 'ifTargetObject' => true, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat],
    ],
    // Bow of Elven Cherrywood
    [
      ['creature_damageMin', 1.05, true, 'ifCreatureShooting' => 1],
      ['creature_damageMax', 1.05, true, 'ifCreatureShooting' => 1],
    ],
    // Bowstring of the Unicorn's Mane
    [
      ['creature_damageMin', 1.10, true, 'ifCreatureShooting' => 1],
      ['creature_damageMax', 1.10, true, 'ifCreatureShooting' => 1],
    ],
    // Angel Feather Arrows
    [
      ['creature_damageMin', 1.15, true, 'ifCreatureShooting' => 1],
      ['creature_damageMax', 1.15, true, 'ifCreatureShooting' => 1],
    ],
    // Bird of Perception
    //
    // Similarly to hero's specialty in Eagle Eye (see Halon in databank-heroes.php),
    // this only boosts existing chance and has no effect if there's no initial chance,
    // i.e. if the hero doesn't have Eagle Eye skill or if spell being cast is not covered
    // by the skill's $ifSpellLevel.
    [
      ['spellLearn', 1.05, true, 'ifContext' => $combat],
    ],
    // Stoic Watchman
    [
      ['spellLearn', 1.10, true, 'ifContext' => $combat],
    ],
    // Emblem of Cognizance
    [
      ['spellLearn', 1.15, true, 'ifContext' => $combat],
    ],
    // Statesman's Medal
    // XXX=C
    [['surrenderCost', 0.95, true]],
    // Diplomat's Ring
    // XXX=C
    [['surrenderCost', 0.90, true]],
    // Ambassador's Sash
    // XXX=C
    [['surrenderCost', 0.85, true]],
    // Ring of the Wayfarer
    [['creature_speed', +1, true]],
    // Equestrian's Gloves
    [['hero_actionPoints', +201, true, 'ifVehicle' => $horse]],
    // Necklace of Ocean Guidance
    [['hero_actionPoints', +500, true, 'ifVehicle' => $ship]],
    // Angel Wings
    [
      // Angel Wings and Boots of Levitation are not functional when inside a boat. They allow crossing water but not standing on it. When doing so, Angel Wings passes through guarded and impassable spots without triggering them, but doesn't pass through actionable (maybe because you cannot stand on/interact with water objects on horse). In contrast, on the ground it passes through guarded, impassable and actionable spots without triggering them, except triggering an Event's actionable when passing over its spot. As normally, actionable destination spot cannot be reached from a top adjacent cell.
      //
      // Both artifacts have what is likely a bug: when flying over an Event put onto water the Event is triggered and then the hero stops (on the water!) and may choose new move route (he still cannot trigger water-based objects even if their actionable spot is adjacent). But what's more, before triggering an Event the hero triggers the guarded water-based monster, if there is any. For example (when moving from H to E to "_"; combat happens on the beach background, CMBKBCH.BMP):
      //
      //   [_][_][_]    _ = ground
      //   [ ][E][M]    all 3 tiles are water; E = Event, M = monster
      //   [_][H][_]    H = hero on the ground
      ['hero_walkTerrain', [$append, array_search('water', Passable::type)], true, 'ifVehicle' => $horse],
      ['hero_walkImpassable', true, true, 'ifVehicle' => $horse],
    ],
    // Charm of Mana
    [['hero_spellPointsDaily', +1, true]],
    // Talisman of Mana
    [['hero_spellPointsDaily', +2, true]],
    // Mystic Orb of Mana
    [['hero_spellPointsDaily', +3, true]],
    // Collar of Conjuring
    [['spellDuration', +1, true]],
    // Ring of Conjuring
    [['spellDuration', +2, true]],
    // Cape of Conjuring
    [['spellDuration', +3, true]],
    // Orb of the Firmament
    [['spellEfficiency', 1.5, true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'air'), 'ifAggression' => array_search('offense', Spell::aggression)]],
    // Orb of Silt
    [['spellEfficiency', 1.5, true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'earth'), 'ifAggression' => array_search('offense', Spell::aggression)]],
    // Orb of Tempestuous Fire
    [['spellEfficiency', 1.5, true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'fire'), 'ifAggression' => array_search('offense', Spell::aggression)]],
    // Orb of Driving Rain
    [['spellEfficiency', 1.5, true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'water'), 'ifAggression' => array_search('offense', Spell::aggression)]],
    // Recanter's Cloak
    //
    // XXX=C does it affect creatures' spells?
    [
      ['hero_spells', array_merge([$diff], $spells[3], $spells[4], $spells[5]), true, 'ifContext' => $combat],
      ['hero_spells', array_merge([$diff], $spells[3], $spells[4], $spells[5]), true, 'ifContext' => $combat, 'isOpponent' => true],
      ['hero_spells', array_merge([$diff], $spells[3], $spells[4], $spells[5]), true, 'ifContext' => $combat, 'isSupporter' => true],
      ['hero_spells', array_merge([$diff], $spells[3], $spells[4], $spells[5]), true, 'ifContext' => $combat, 'isSupporterSamePlayer' => true],
    ],
    // Spirit of Oppression
    [
      ['creature_morale', [$clamp, 0, 0], true, 'ifContext' => $combat],
      ['creature_morale', [$clamp, 0, 0], true, 'ifContext' => $combat, 'isOpponent' => true],
      ['creature_morale', [$clamp, 0, 0], true, 'ifContext' => $combat, 'isSupporter' => true],
      ['creature_morale', [$clamp, 0, 0], true, 'ifContext' => $combat, 'isSupporterSamePlayer' => true],
    ],
    // Hourglass of the Evil Hour
    [
      ['creature_luck', [$clamp, 0, 0], true, 'ifContext' => $combat],
      ['creature_luck', [$clamp, 0, 0], true, 'ifContext' => $combat, 'isOpponent' => true],
      ['creature_luck', [$clamp, 0, 0], true, 'ifContext' => $combat, 'isSupporter' => true],
      ['creature_luck', [$clamp, 0, 0], true, 'ifContext' => $combat, 'isSupporterSamePlayer' => true],
    ],
    // Tome of Fire Magic
    [['hero_spells', array_merge([$append], $spells['fire']), true]],
    // Tome of Air Magic
    [['hero_spells', array_merge([$append], $spells['air']), true]],
    // Tome of Water Magic
    [['hero_spells', array_merge([$append], $spells['water']), true]],
    // Tome of Earth Magic
    [['hero_spells', array_merge([$append], $spells['earth']), true]],
    // Boots of Levitation
    [['hero_walkTerrain', [$append, array_search('water', Passable::type)], true, 'ifVehicle' => $horse]],
    // Golden Bow
    [['creature_shootPenalty', 1.5, true]],
    // Sphere of Permanence
    [['creature_dispelImmune', true, 'ifTargetObject' => true]],
    // Orb of Vulnerability
    [
      // XXX+I need to use certain Effect priority/stack to clear only creatures' immunities and keep immunities like those of Sphere of Permanence
      ['creature_spellImmune', [$const, false], true, 'ifContext' => $combat],
      ['creature_spellImmune', [$const, false], true, 'ifContext' => $combat, 'isOpponent' => true],
      ['creature_spellImmune', [$const, false], true, 'ifContext' => $combat, 'isSupporter' => true],
      ['creature_spellImmune', [$const, false], true, 'ifContext' => $combat, 'isSupporterSamePlayer' => true],
    ],
    // Ring of Vitality
    [['creature_hitPoints', +1, true]],
    // Ring of Life
    [['creature_hitPoints', +2, true]],
    // Vial of Lifeblood
    [['creature_hitPoints', +3, true]],
    // Necklace of Swiftness
    [['creature_speed', +1, true]],
    // Boots of Speed
    [['hero_actionPoints', +402, true, 'ifVehicle' => $horse]],
    // Cape of Velocity
    [['creature_speed', +2, true]],
    // Pendant of Dispassion
    [['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_berserk]],
    // Pendant of Second Sight
    [['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_blind]],
    // Pendant of Holiness
    [['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_curse]],
    // Pendant of Life
    [['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_deathRipple]],
    // Pendant of Death
    [['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_destroyUndead]],
    // Pendant of Free Will
    [['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_hypnotize]],
    // Pendant of Negativity
    [
      ['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_lightningBolt],
      ['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_chainLightning],
    ],
    // Pendant of Total Recall
    [['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpell' => $s_forgetfulness]],
    // Pendant of Courage
    [
      ['creature_luck', +3, true],
      ['creature_morale', +3, true],
    ],
    // Everflowing Crystal Cloak
    [['income', +1, 'ifResource' => $crystal, 'ifPlayer' => true]],
    // Ring of Infinite Gems
    [['income', +1, 'ifResource' => $gems, 'ifPlayer' => true]],
    // Everpouring Vial of Mercury
    [['income', +1, 'ifResource' => $mercury, 'ifPlayer' => true]],
    // Inexhaustible Cart of Ore
    [['income', +1, 'ifResource' => $ore, 'ifPlayer' => true]],
    // Eversmoking Ring of Sulfur
    [['income', +1, 'ifResource' => $sulfur, 'ifPlayer' => true]],
    // Inexhaustible Cart of Lumber
    [['income', +1, 'ifResource' => $wood, 'ifPlayer' => true]],
    // Endless Sack of Gold
    [['income', +1000, 'ifResource' => $gold, 'ifPlayer' => true]],
    // Endless Bag of Gold
    [['income', +750, 'ifResource' => $gold, 'ifPlayer' => true]],
    // Endless Purse of Gold
    [['income', +500, 'ifResource' => $gold, 'ifPlayer' => true]],
    // Legs of Legion
    [
      ['creature_growth', +5, 'ifGarrisoned' => true, 'ifCreatureLevel' => 2],
      ['creature_growth', +5, 'ifVisiting'   => true, 'ifCreatureLevel' => 2],
    ],
    // Loins of Legion
    [
      ['creature_growth', +4, 'ifGarrisoned' => true, 'ifCreatureLevel' => 3],
      ['creature_growth', +4, 'ifVisiting'   => true, 'ifCreatureLevel' => 3],
    ],
    // Torso of Legion
    [
      ['creature_growth', +3, 'ifGarrisoned' => true, 'ifCreatureLevel' => 4],
      ['creature_growth', +3, 'ifVisiting'   => true, 'ifCreatureLevel' => 4],
    ],
    // Arms of Legion
    [
      ['creature_growth', +2, 'ifGarrisoned' => true, 'ifCreatureLevel' => 5],
      ['creature_growth', +2, 'ifVisiting'   => true, 'ifCreatureLevel' => 5],
    ],
    // Head of Legion
    [
      ['creature_growth', +1, 'ifGarrisoned' => true, 'ifCreatureLevel' => 6],
      ['creature_growth', +1, 'ifVisiting'   => true, 'ifCreatureLevel' => 6],
    ],
    // Sea Captain's Hat
    [
      ['hero_actionPoints', +250, true, 'ifVehicle' => $ship],
      ['hero_spells', [$append, $s_summonBoat, $s_scuttleBoat], true],
      ['creature_whirlpoolPenalty', 1.5, true],
    ],
    // Spellbinder's Hat
    [['hero_spells', array_merge([$append], $spells[5]), true]],
    // Shackles of War
    [
      ['surrenderCan', [$const, false], true],
      ['surrenderCan', [$const, false], true, 'isOpponent' => true],
      ['surrenderCan', [$const, false], true, 'isSupporter' => true],
      ['surrenderCan', [$const, false], true, 'isSupporterSamePlayer' => true],
      ['retreatCan', [$const, false], true],
      ['retreatCan', [$const, false], true, 'isOpponent' => true],
      ['retreatCan', [$const, false], true, 'isSupporter' => true],
      ['retreatCan', [$const, false], true, 'isSupporterSamePlayer' => true],
    ],
    // Orb of Inhibition
    [
      ['hero_spells', [$intersect], true, 'ifContext' => $combat],
      ['hero_spells', [$intersect], true, 'ifContext' => $combat, 'isOpponent' => true],
      ['hero_spells', [$intersect], true, 'ifContext' => $combat, 'isSupporter' => true],
      ['hero_spells', [$intersect], true, 'ifContext' => $combat, 'isSupporterSamePlayer' => true],
    ],
    // Vial of Dragon Blood
    [
      ['creature_attack',  +5,  true, 'ifCreature' => $greenDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $greenDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $goldDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $goldDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $boneDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $boneDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $ghostDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $ghostDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $redDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $redDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $blackDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $blackDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $azureDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $azureDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $crystalDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $crystalDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $faerieDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $faerieDragon],
      ['creature_attack',  +5,  true, 'ifCreature' => $rustDragon],
      ['creature_defense', +5,  true, 'ifCreature' => $rustDragon],
    ],
    // Armageddon's Blade
    [
      ['hero_attack', +3, true],
      ['hero_defense', +3, true],
      ['hero_knowledge', +6, true],
      ['hero_spellPower', +3, true],
      ['hero_spells', [$append, $s_armageddon], true],
      ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], true, 'ifSpell' => $s_armageddon],
      ['creature_spellImmune', true, 'ifSpell' => $s_armageddon, 'ifTargetPlayer' => true],
    ],
    // Angelic Alliance   XXX=I
    //
    // Allows Rampart, Tower, Fortress, Stronghold and Castle creatures to be mixed without a morale penalty, for the player.  Casts Expert Prayer at the start of combat.
    [
      ['creature_morale', [$countAlignments, +2, [$rampart => 1, $tower => 1, $fortress => 1, $stronghold => 1, $castle => 1]], 'ifPlayer' => true, 'stack' => [array_search('mixedAlignments', H3Effect::stack), 1]],
    ],
    // Cloak of the Undead King   XXX=I
    //
    // 30% of battlefield dead are resurrected as Skeletons.  If hero already has the Necromancy skill then the percentages are added to the skill and the level of skill determines what type is resurrected.  Basic: Zombies, Advanced: Wights, Expert:  Liches
    [
      ['creature_reanimate', 0.3, true],
      //['creature_reanimateAs', nameToID("$outPath/creatures", 'zombie'), true],
      //['creature_reanimateAs', nameToID("$outPath/creatures", 'wight'), true],
      //['creature_reanimateAs', nameToID("$outPath/creatures", 'lich'), true],
    ],
    // Elixir of Life   XXX=I
    //
    // All creatures get a 25% health bonus and gain the regeneration ability.  Does not work on Undead or unliving creatures
    [],
    // Armor of the Damned
    [
      ['spellDuration', +50, true, 'ifSpell' => $s_slow],
      ['spellDuration', +50, true, 'ifSpell' => $s_curse],
      ['spellDuration', +50, true, 'ifSpell' => $s_weakness],
      ['spellDuration', +50, true, 'ifSpell' => $s_misfortune],
    ],
    // Statue of Legion
    [['creature_growth', 1.5, 'ifPlayer' => true]],
    // Power of the Dragon Father
    [
      ['hero_attack', +6, true],
      ['hero_defense', +6, true],
      ['hero_knowledge', +6, true],
      ['hero_spellPower', +6, true],
      ['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpellLevel' => 1],
      ['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpellLevel' => 2],
      ['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpellLevel' => 3],
      ['creature_spellImmune', true, 'ifTargetObject' => true, 'ifSpellLevel' => 4],
    ],
    // Titan's Thunder    XXX=I
    //
    // Hero gains the ability to cast Lightning Bolt for 600 points of damage, does not cost any spell points, adds a spell book into their inventory (permanently).
    [
      ['hero_spells', [$append, $s_titanBolt], true],
      ['spellCost', [$clamp, 0, 0], true, 'ifSpell' => $s_titanBolt],
    ],
    // Admiral's Hat
    //
    // XXX+I: hoshi: when it's on, SoD seems to maintain two AP values: one for ship, one for horse; when dis/embarking, it just swaps the two so that after embark you get a lot of APs and if you immediately disembark, you get the same amount of land APs as before; or, if the artifact's description is right, the game maintains one AP value but "converts" between them when dis/embarking
    [
      ['hero_embarkCost', 1.0, true],
      ['hero_actionPoints', +1000, true, 'ifVehicle' => $ship],
    ],
    // Bow of the Sharpshooter
    [
      ['creature_shootBlocked', true, true],
      ['creature_shootPenalty', 0.5, true],
    ],
    // Wizard's Well
    [['hero_spellPointsDaily', +9999, true]],
    // Ring of the Magi
    [['spellDuration', +50, true]],
    // Cornucopia
    [
      ['income', +4, 'ifResource' => $gems, 'ifPlayer' => true],
      ['income', +4, 'ifResource' => $crystal, 'ifPlayer' => true],
      ['income', +4, 'ifResource' => $sulfur, 'ifPlayer' => true],
      ['income', +4, 'ifResource' => $mercury, 'ifPlayer' => true],
    ],
  ],
];