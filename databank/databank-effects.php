<?php
extract(array_flip(Map::bonus));
extract(array_flip(H3Effect::operation));
extract(array_flip(H3Effect::stack), EXTR_PREFIX_ALL, 'st');
extract($constants['resources']);

extract((new Building)->schema(), EXTR_PREFIX_ALL, 'bu');
extract((new Artifact)->schema(), EXTR_PREFIX_ALL, 'ar');
extract((new Creature)->schema(), EXTR_PREFIX_ALL, 'cr');

// XXX=C chances of bonuses
$mul = $constants['multiplier'];
$monthlyBonuses = $weeklyBonuses = [];
$handle = fopenTXT($options, 'ARRAYTXT.TXT');
$group = null;

while ($line = readCSV($handle, [], 1)) {
  if (in_array($line = $line[0], ['gMonthNames', 'gWeekNames', 'cLuckInfo'])) {
    $group = $line;
  } else {
    switch ($group) {
      case 'gMonthNames':
        $monthlyBonuses["$growth,$line"] = 10 * $mul;
        break;
      case 'gWeekNames':
        $weeklyBonuses["$growth,$line"] = 10 * $mul;
    }
  }
}

fclose($handle);

$creaturesID = json_decode(file_get_contents("$outPath/creaturesID.json"), true);
$creatures = ObjectStore::fromFile("$outPath/creatures.json");

// XXX=C Is the upgraded creature growth boosted (at least weekly) if base creature was selected? SoD's message includes only the base creature name but I haven't checked actual numbers in dwellings; I assume in towns both creatures grow (since they share the same building's availability number) but what about on-map dwellings? Also strange that the only case (?) when the message includes both Imp and Familiar is after building Grail in Inferno. In any case, the inverse probably doesn't apply (i.e. Black Dragon grows alone).
foreach ($creaturesID as $id) {
  if ($creatures->atCoords($id, 0, 0, 'growth')) {
    $name = $creatures->atCoords($id, 0, 0, 'nameSingular');
    $monthlyBonuses["$horde,$name,$id,2.0"] = 1 * $mul;
    $weeklyBonuses["$horde,$name,$id,5"] = 1 * $mul;
  }
}

$monthlyBonuses["$plague,PLAGUE,0.5"] = 10 * $mul;

return compact('monthlyBonuses', 'weeklyBonuses') + [
  'initialTargetEffectsOfCreature' => [
                            // To assist Find & Replace:
    'abilityText',          // creature_abilityText
    'aiValue',              // creature_aiValue
    'attack',               // creature_attack
    'attackAndReturn',      // creature_attackAndReturn
    'attackAround',         // creature_attackAround
    'attackDepth',          // creature_attackDepth
    'damageMax',            // creature_damageMax
    'damageMin',            // creature_damageMin
    'defense',              // creature_defense
    'enemyRetaliating',     // creature_enemyRetaliating
    'fightValue',           // creature_fightValue
    'flying',               // creature_flying
    'growth',               // creature_growth
    'hitPoints',            // creature_hitPoints
    'hordeGrowth',          // creature_hordeGrowth
    'jousting',             // creature_jousting
    'mapMax',               // creature_mapMax
    'mapMin',               // creature_mapMin
    'regenerating',         // creature_regenerating
    'retaliating' => 1,     // creature_retaliating
    'shootingCloud',        // creature_shootingCloud
    'shots',                // creature_shots
    'speed',                // creature_speed
    'strikes' => 1,         // creature_strikes
    'wallStrikes',          // creature_wallStrikes
    //'piercing',           // creature_piercing - coming from static Effects
    'critical',             // creature_critical
    'criticalChance',       // creature_criticalChance
    'absolute',             // creature_absolute
    // creature_wallDamage is added in databank-custom.php.
  ],

  // Determined empirically.
  //
  // Effects where target type's initial value (0 for GenericNumber, etc.) matches the target's value are
  // commented out since they are not necessary.
  //
  // Targets that require a value (have no initial value):
  //* combatImage
  //* creature_reanimateAs
  //* name
  //* portrait
  //* spellEfficiency
  'initialTargetEffects' => [
    //['artifactChance', [$const, []]],
    //['bonus_actionPoints', 1.0],
    //['bonus_artifacts', [$const, []]],
    //['bonus_available', [$const, []]],
    //['bonus_availableCount', 0],
    //['bonus_buildings', [$const, []]],
    //['bonus_creatureCount', 0],
    //['bonus_creatures', [$const, []]],
    //['bonus_effects', [$const, []]],
    //['bonus_experience', 1.0],
    //['bonus_message', [$const, []]],
    //['bonus_resource', 0],
    //['bonus_shroud', [$const, []]],
    //['bonus_shroudRiver', [$const, []]],
    //['bonus_shroudRoad', [$const, []]],
    //['bonus_shroudTerrain', [$const, []]],
    //['bonus_spellPoints', 1.0],
    //['creature_dispelImmune', [$const, false]],
    //['creature_hitChance', [$const, []]],
    //['creature_luck', 0],
    //['creature_meleePenalty', 1.0],
    //['creature_shootBlocked', [$const, false]],
    //['creature_spellEvade', 0],
    //['creature_spellImmune', [$const, false]],
    //['creature_spells', [$const, []]],
    //['creature_upgradeCan', [$const, []]],
    //['creature_wallDamage', [$const, []]],
    //['fortifications', [$const, []]],
    //['hero_attack', 0],
    //['hero_biography', ''],
    //['hero_defense', 0],
    //['hero_experienceGain', 1.0],
    //['hero_garrisonConvert', [$const, []]],
    //['hero_gender', 0],
    //['hero_knowledge', 0],
    //['hero_skillChance', 0],
    //['hero_skills', [$const, []]],
    //['hero_specialty', null],
    //['hero_spellPointsDaily', 0],
    //['hero_spellPower', 0],
    //['hero_spells', [$const, []]],
    //['hero_walkImpassable', [$const, false]],
    //['hireAvailable', [$const, []]],
    //['income', 0],
    //['quest_chances', [$const, []]],
    //['quest_choices', [$const, []]],
    //['quest_garrison', [$const, []]],
    //['quest_granted', 0],
    //['quest_message', [$const, []]],
    //['quest_remove', [$const, false]],
    //['quest_requirement', 1.0],
    //['quest_reset', [$const, []]],
    //['shroud', [$const, false]],
    //['skillMastery', 0],
    //['spellAround', 0],
    //['spellAroundEye', 0],
    //['spellGlobal', [$const, false]],
    //['spellMastery', 0],
    //['spellTradeGive', [$const, false]],
    //['spellTradeTake', [$const, false]],
    //['tacticsDistance', 0],
    //['town_buildings', [$const, []]],
    //['town_spellChance', 0],
    //['town_spellCount', 0],
    //['town_spells', [$const, []]],
    //['worldBonusChances', [$const, []]],

    ['town_spellCountable', 5, 'ifSpellLevel' => 1],
    ['town_spellCountable', 4, 'ifSpellLevel' => 2],
    ['town_spellCountable', 3, 'ifSpellLevel' => 3],
    ['town_spellCountable', 2, 'ifSpellLevel' => 4],
    ['town_spellCountable', 1, 'ifSpellLevel' => 5],

    ['creature_morale', [$countAlignments, +2], 'stack' => $st_mixedAlignments],
    // After player has built something, that town gets a [false, maxDays => 1] Effect.
    //
    // XXX=R change to a recurring target similarly to creature_strikes and combatCasts
    ['town_canBuild', true],
    ['town_hasBuilt', 1],
    ['canCombat', true],
    ['artifactCost', [$databank, 'ifArtifact', 'artifacts', $ar_cost, 'ifResource']],
    ['creature_queue', true],
    ['creature_cost', [$databank, 'ifCreature', 'creatures', $cr_cost, 'ifResource']],
    ['creature_costUpgrade', [$custom, 'rules']],
    ['creature_moveDistance', [$custom, 'rules']],
    // This must be 0.0 ('relative'), not 0 so that skills like Necromancy add to
    // this percentage. If it were 0, initial number of creatures (const) would
    // be changed to 0 (const) and 'relative' won't change the result.
    ['creature_reanimate', 0.0],
    ['creature_shootPenalty', 0.5],
    ['creature_whirlpoolPenalty', 0.5],
    ['garrisonSee', [$const, array_search('approximate', H3Effect::garrisonDetails)], 'stack' => $st_garrisonSee],
    ['garrisonSee', [$const, array_search('full', H3Effect::garrisonDetails)], 'ifTargetPlayer' => -1, 'stack' => [$st_garrisonSee, 1]],
    ['garrisonSee', [$const, array_search('full', H3Effect::garrisonDetails)], 'ifTargetPlayer' => -1, 'isTargetAlly' => true, 'stack' => [$st_garrisonSee, 1]],
    ['hero_actionPoints', 1005],
    ['hero_embarkCost', 0.0],
    ['hero_walkTerrain', [$const, [array_search('ground', Passable::type)]], 'ifVehicle' => array_search('horse', AObject::vehicle)],
    ['hero_stopTerrain', [$const, [array_search('ground', Passable::type)]], 'ifVehicle' => array_search('horse', AObject::vehicle)],
    ['hero_walkTerrain', [$const, [array_search('water', Passable::type)]], 'ifVehicle' => array_search('ship', AObject::vehicle)],
    ['hero_stopTerrain', [$const, [array_search('water', Passable::type)]], 'ifVehicle' => array_search('ship', AObject::vehicle)],
    ['surrenderCost', [$custom, 'rules']],
    ['town_buildingCost', [$databank, 'ifBuilding', 'buildings', $bu_cost, 'ifResource']],
    ['hero_shroud', 5],
    ['town_shroud', 5],
    ['ownable_shroud', 3],
    ['hero_spellPoints', [$custom, 'rules']],
    ['spellDuration', [$custom, 'rules']],
    ['spellCost', [$custom, 'rules']],
    ['hero_attackChance', [$custom, 'rules']],
    ['hero_defenseChance', [$custom, 'rules']],
    ['hero_spellPowerChance', [$custom, 'rules']],
    ['hero_knowledgeChance', [$custom, 'rules']],
    ['heroChance', [$custom, 'rules']],
    ['tradeRate', [$custom, 'rules']],
    ['tavernRumor', [$custom, 'rules']],
    ['shipCost', 10, 'ifResource' => $wood],
    ['shipCost', 2500, 'ifResource' => $gold],
    ['tavernCost', 2500, 'ifResource' => $gold],
    ['tavernHeroes', [$custom, 'rules']],
    ['player_town', [$custom, 'rules']],
    ['spellEfficiency', [$custom, 'rules']],
    ['grows', true],
    ['creature_join', 0.5],
    ['combatCasts', 1],
    ['creature_canControl', true],
    ['hireFree', true, 'ifCreatureLevel' => 1],
    ['artifactTrade', true],
    // XXX=I:mof:
    //['retreatCan', true, 'ifObjectType' => array_search('monster', AObject::type)],
    ['garrison_reinforce', true],
    ['garrison_reduce', true],
    ['bonus_build', true],
    // Evaluates to true if no Effect with $source exists.
    ['quest_fulfilled', [$check, 'quest', 'S']],
    ['quest_placement', 'l'],
    ['randomRumors', [$custom, 'rules']],
    ['randomSigns', [$custom, 'rules']],
    ['retreatCan', [$custom, 'rules']],
    ['surrenderCan', [$custom, 'rules']],
    ['spellLearn', 1*$mul, 'ifSpellLevel' => 1],
    ['spellLearn', 1*$mul, 'ifSpellLevel' => 2],
    ['quest_removeAudio', [$randomArray, 0, 'PICKUP01', 'PICKUP02', 'PICKUP03', 'PICKUP04', 'PICKUP05', 'PICKUP06', 'PICKUP07']],

    // XXX++C
    //
    // XXX=I Angel Wings affects path cost
    ['hero_actionCost', -50.0, 'ifRoad' => array_search('dirt', AClass::road), 'stack' => [$st_terrain, 1]],
    ['hero_actionCost', -42.0, 'ifRoad' => array_search('gravel', AClass::road), 'stack' => [$st_terrain, 1]],
    ['hero_actionCost', -32.0, 'ifRoad' => array_search('cobblestone', AClass::road), 'stack' => [$st_terrain, 1]],
    ['hero_actionCost', -67.0, 'ifTerrain' => array_search('dirt', AClass::terrain), 'stack' => $st_terrain],
    ['hero_actionCost', -100.0, 'ifTerrain' => array_search('desert', AClass::terrain), 'stack' => $st_terrain],
    ['hero_actionCost', -67.0, 'ifTerrain' => array_search('grass', AClass::terrain), 'stack' => $st_terrain],
    ['hero_actionCost', -100.0, 'ifTerrain' => array_search('snow', AClass::terrain), 'stack' => $st_terrain],
    ['hero_actionCost', -125.0, 'ifTerrain' => array_search('swamp', AClass::terrain), 'stack' => $st_terrain],
    ['hero_actionCost', -83.0, 'ifTerrain' => array_search('rough', AClass::terrain), 'stack' => $st_terrain],
    ['hero_actionCost', -67.0, 'ifTerrain' => array_search('subterranean', AClass::terrain), 'stack' => $st_terrain],
    ['hero_actionCost', -67.0, 'ifTerrain' => array_search('lava', AClass::terrain), 'stack' => $st_terrain],
    ['hero_actionCost', -50.0, 'ifTerrain' => array_search('water', AClass::terrain), 'stack' => $st_terrain],
  ],
];