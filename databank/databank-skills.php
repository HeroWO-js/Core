<?php
extract(array_flip(AObject::vehicle));
extract(array_flip(H3Effect::context));
extract(array_flip(H3Effect::operation));
$mul = $constants['multiplier'];

return [
  // Determined empirically using descriptions in SSTRAITS.TXT.
  'effectsOfSkill' => [
    // Pathfinding
    [
      // From fandom.com.
      [
        ['hero_actionCost', 0.75, true, 'ifTerrain' => array_search('snow', AClass::terrain)],
        ['hero_actionCost', 0.75, true, 'ifTerrain' => array_search('rough', AClass::terrain)],
        ['hero_actionCost', 0.75, true, 'ifTerrain' => array_search('swamp', AClass::terrain)],
      ],
      [
        ['hero_actionCost', 0.50, true, 'ifTerrain' => array_search('snow', AClass::terrain)],
        ['hero_actionCost', 0.50, true, 'ifTerrain' => array_search('rough', AClass::terrain)],
        ['hero_actionCost', 0.50, true, 'ifTerrain' => array_search('swamp', AClass::terrain)],
      ],
      [
        // fandom.com says Expert Pathfinding reduction is 100%, not 75%.
        ['hero_actionCost', 0.25, true, 'ifTerrain' => array_search('snow', AClass::terrain)],
        ['hero_actionCost', 0.25, true, 'ifTerrain' => array_search('rough', AClass::terrain)],
        ['hero_actionCost', 0.25, true, 'ifTerrain' => array_search('swamp', AClass::terrain)],
      ],
    ],
    // Archery
    [
      [
        ['creature_damageMin', 1.10, true, 'ifCreatureShooting' => 1],
        ['creature_damageMax', 1.10, true, 'ifCreatureShooting' => 1],
      ],
      [
        ['creature_damageMin', 1.25, true, 'ifCreatureShooting' => 1],
        ['creature_damageMax', 1.25, true, 'ifCreatureShooting' => 1],
      ],
      [
        ['creature_damageMin', 1.50, true, 'ifCreatureShooting' => 1],
        ['creature_damageMax', 1.50, true, 'ifCreatureShooting' => 1],
      ],
    ],
    // Logistics
    [
      [['hero_actionPoints', 1.10, true, 'ifVehicle' => $horse]],
      [['hero_actionPoints', 1.20, true, 'ifVehicle' => $horse]],
      [['hero_actionPoints', 1.30, true, 'ifVehicle' => $horse]],
    ],
    // Scouting
    [
      [['hero_shroud', +1, true]],    // 6 tiles total (determined empirically)
      [['hero_shroud', +2, true]],    // 7 tiles total (determined empirically)
      [['hero_shroud', +4, true]],    // 9 tiles total (determined empirically)
    ],
    // Diplomacy
    [
      // XXX+I:mof: 25%/50%/100% of creatures normally fleeing from your army offer to join
      //
      // XXX+I:mof: Some creatures will ask for money for joining, but most of them will not, especially if they are weak enough.
      [['surrenderCost', 0.80, true]],
      [['surrenderCost', 0.60, true]],
      [['surrenderCost', 0.40, true]],
    ],
    // Navigation
    [
      [['hero_actionPoints', 1.50, true, 'ifVehicle' => $ship]],
      [['hero_actionPoints', 2.00, true, 'ifVehicle' => $ship]],
      [['hero_actionPoints', 2.50, true, 'ifVehicle' => $ship]],
    ],
    // Leadership
    [
      [['creature_morale', +1, true]],
      [['creature_morale', +2, true]],
      [['creature_morale', +3, true]],
    ],
    // Wisdom
    [
      [
        ['spellLearn', [$clamp, 1*$mul], true, 'ifSpellLevel' => 3, 'ifContext' => $map],
      ],
      [
        ['spellLearn', [$clamp, 1*$mul], true, 'ifSpellLevel' => 3, 'ifContext' => $map],
        ['spellLearn', [$clamp, 1*$mul], true, 'ifSpellLevel' => 4, 'ifContext' => $map],
      ],
      [
        ['spellLearn', [$clamp, 1*$mul], true, 'ifSpellLevel' => 3, 'ifContext' => $map],
        ['spellLearn', [$clamp, 1*$mul], true, 'ifSpellLevel' => 4, 'ifContext' => $map],
        ['spellLearn', [$clamp, 1*$mul], true, 'ifSpellLevel' => 5, 'ifContext' => $map],
      ],
    ],
    // Mysticism
    [
      [['hero_spellPointsDaily', +2, true]],
      [['hero_spellPointsDaily', +3, true]],
      [['hero_spellPointsDaily', +4, true]],
    ],
    // Luck
    [
      [['creature_luck', +1, true]],
      [['creature_luck', +2, true]],
      [['creature_luck', +3, true]],
    ],
    // Ballistics
    //
    // Taken from BALLIST.TXT.
    [
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'catapult')],
      ],
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'catapult')],
        ['creature_wallStrikes', +1, true, 'ifCreature' => nameToID("$outPath/creatures", 'catapult')],
      ],
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'catapult')],
        ['creature_wallStrikes', +1, true, 'ifCreature' => nameToID("$outPath/creatures", 'catapult')],
      ],
    ],
    // Eagle Eye
    [
      [
        ['spellLearn', [$clamp, 0.4*$mul], true, 'ifSpellLevel' => 1, 'ifContext' => $combat],
        ['spellLearn', [$clamp, 0.4*$mul], true, 'ifSpellLevel' => 2, 'ifContext' => $combat],
      ],
      [
        ['spellLearn', [$clamp, 0.5*$mul], true, 'ifSpellLevel' => 1, 'ifContext' => $combat],
        ['spellLearn', [$clamp, 0.5*$mul], true, 'ifSpellLevel' => 2, 'ifContext' => $combat],
        ['spellLearn', [$clamp, 0.5*$mul], true, 'ifSpellLevel' => 3, 'ifContext' => $combat],
      ],
      [
        ['spellLearn', [$clamp, 0.6*$mul], true, 'ifSpellLevel' => 1, 'ifContext' => $combat],
        ['spellLearn', [$clamp, 0.6*$mul], true, 'ifSpellLevel' => 2, 'ifContext' => $combat],
        ['spellLearn', [$clamp, 0.6*$mul], true, 'ifSpellLevel' => 3, 'ifContext' => $combat],
        ['spellLearn', [$clamp, 0.6*$mul], true, 'ifSpellLevel' => 4, 'ifContext' => $combat],
      ],
    ],
    // Necromancy
    [
      [
        ['creature_reanimate', 0.1, true],
        ['creature_reanimateAs', nameToID("$outPath/creatures", 'skeleton'), true],
      ],
      [
        ['creature_reanimate', 0.2, true],
        ['creature_reanimateAs', nameToID("$outPath/creatures", 'skeleton'), true],
      ],
      [
        ['creature_reanimate', 0.3, true],
        ['creature_reanimateAs', nameToID("$outPath/creatures", 'skeleton'), true],
      ],
    ],
    // Estates
    [
      [['income', +125, 'ifResource' => $constants['resources']['gold'], 'ifPlayer' => true]],
      [['income', +250, 'ifResource' => $constants['resources']['gold'], 'ifPlayer' => true]],
      [['income', +500, 'ifResource' => $constants['resources']['gold'], 'ifPlayer' => true]],
    ],
    // Fire Magic
    //
    // Spell point discounts are not applied by Magic expertise skills because
    // costs for all masteries are already specified in the databank (from
    // SPTRAITS.TXT).
    //
    // spellGlobal info was taken from fandom.com.
    [
      [
        ['spellMastery', [$clamp, array_search('basic', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'fire')],
      ],
      [
        ['spellMastery', [$clamp, array_search('advanced', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'fire')],
      ],
      [
        ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'fire')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'bloodlust')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'curse')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'protectionFromFire')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'misfortune')],
      ],
    ],
    // Air Magic
    [
      [
        ['spellMastery', [$clamp, array_search('basic', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'air')],
      ],
      [
        ['spellMastery', [$clamp, array_search('advanced', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'air')],
      ],
      [
        ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'air')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'haste')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'fortune')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'precision')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'protectionFromAir')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'airShield')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'counterstrike')],
      ],
    ],
    // Water Magic
    [
      [
        ['spellMastery', [$clamp, array_search('basic', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'water')],
      ],
      [
        ['spellMastery', [$clamp, array_search('advanced', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'water')],
        // Has higher priority (skills) than default in databank-spells.php (initial).
        ['creature_dispelImmune', [$const, false], true, 'ifTargetPlayer' => -1, 'isTargetEnemy' => true, 'stack' => [array_search('dispelImmune', H3Effect::stack), 1]],
      ],
      [
        ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'water')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'bless')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'cure')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'dispel')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'protectionFromWater')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'weakness')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'forgetfulness')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'mirth')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'prayer')],
        ['creature_dispelImmune', [$const, false], true, 'ifTargetPlayer' => -1, 'isTargetEnemy' => true, 'stack' => [array_search('dispelImmune', H3Effect::stack), 1]],
      ],
    ],
    // Earth Magic
    [
      [
        ['spellMastery', [$clamp, array_search('basic', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'earth')],
      ],
      [
        ['spellMastery', [$clamp, array_search('advanced', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'earth')],
      ],
      [
        ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], true, 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'earth')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'protectionFromEarth')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'shield')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'slow')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'stoneSkin')],
        ['spellGlobal', true, true, 'ifSpell' => nameToID("$outPath/spells", 'sorrow')],
      ],
    ],
    // Scholar
    [
      [
        ['spellTradeGive', true, true, 'ifSpellLevel' => 1],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 1],
        ['spellTradeGive', true, true, 'ifSpellLevel' => 2],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 2],
      ],
      [
        ['spellTradeGive', true, true, 'ifSpellLevel' => 1],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 1],
        ['spellTradeGive', true, true, 'ifSpellLevel' => 2],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 2],
        ['spellTradeGive', true, true, 'ifSpellLevel' => 3],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 3],
      ],
      [
        ['spellTradeGive', true, true, 'ifSpellLevel' => 1],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 1],
        ['spellTradeGive', true, true, 'ifSpellLevel' => 2],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 2],
        ['spellTradeGive', true, true, 'ifSpellLevel' => 3],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 3],
        ['spellTradeGive', true, true, 'ifSpellLevel' => 4],
        ['spellTradeTake', true, true, 'ifSpellLevel' => 4],
      ],
    ],
    // Tactics
    [
      [['tacticsDistance', +3, true]],
      [['tacticsDistance', +5, true]],
      [['tacticsDistance', +7, true]],
    ],
    // Artillery
    [
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
        ['creature_strikes', +1, true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
        ['creature_criticalChance', (int) (0.50 * $constants['multiplier']), true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
      ],
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
        ['creature_strikes', +1, true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
        ['creature_criticalChance', (int) (0.75 * $constants['multiplier']), true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
      ],
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
        ['creature_strikes', +1, true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
        ['creature_criticalChance', (int) (1.0 * $constants['multiplier']), true, 'ifCreature' => nameToID("$outPath/creatures", 'ballista')],
      ],
    ],
    // Learning
    [
      [['hero_experienceGain', 1.05, true]],
      [['hero_experienceGain', 1.10, true]],
      [['hero_experienceGain', 1.15, true]],
    ],
    // Offense
    [
      [
        ['creature_damageMin', 1.10, true, 'ifCreatureShooting' => 0],
        ['creature_damageMax', 1.10, true, 'ifCreatureShooting' => 0],
      ],
      [
        ['creature_damageMin', 1.20, true, 'ifCreatureShooting' => 0],
        ['creature_damageMax', 1.20, true, 'ifCreatureShooting' => 0],
      ],
      [
        ['creature_damageMin', 1.30, true, 'ifCreatureShooting' => 0],
        ['creature_damageMax', 1.30, true, 'ifCreatureShooting' => 0],
      ],
    ],
    // Armorer
    [
      [
        ['creature_damageMin', 0.95, 'ifTargetObject' => true],
        ['creature_damageMax', 0.95, 'ifTargetObject' => true],
      ],
      [
        ['creature_damageMin', 0.90, 'ifTargetObject' => true],
        ['creature_damageMax', 0.90, 'ifTargetObject' => true],
      ],
      [
        ['creature_damageMin', 0.80, 'ifTargetObject' => true],
        ['creature_damageMax', 0.80, 'ifTargetObject' => true],
      ],
    ],
    // Intelligence
    [
      [['hero_spellPoints', 1.25, true]],
      [['hero_spellPoints', 1.50, true]],
      [['hero_spellPoints', 2.00, true]],
    ],
    // Sorcery
    [
      [['spellEfficiency', 1.05, true, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat]],
      [['spellEfficiency', 1.10, true, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat]],
      [['spellEfficiency', 1.15, true, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat]],
    ],
    // Resistance
    [
      [['spellEfficiency', 0.95, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat, 'ifTargetObject' => true]],
      [['spellEfficiency', 0.90, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat, 'ifTargetObject' => true]],
      [['spellEfficiency', 0.80, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat, 'ifTargetObject' => true]],
    ],
    // First Aid
    [
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'firstAidTent')],
        ['creature_damageMax', 50, true, 'ifCreature' => nameToID("$outPath/creatures", 'firstAidTent')],
      ],
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'firstAidTent')],
        ['creature_damageMax', 75, true, 'ifCreature' => nameToID("$outPath/creatures", 'firstAidTent')],
      ],
      [
        ['creature_canControl', true, true, 'ifCreature' => nameToID("$outPath/creatures", 'firstAidTent')],
        ['creature_damageMax', 100, true, 'ifCreature' => nameToID("$outPath/creatures", 'firstAidTent')],
      ],
    ],
  ],
];