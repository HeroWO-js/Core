<?php
extract(array_flip(H3Effect::operation));
extract(array_flip(Creature::special), EXTR_PREFIX_ALL, 's');
$townsID = json_decode(file_get_contents("$outPath/townsID.json"), true);

// XXX+I hide these from H3.DOM.Combat.Queue
$siegeCreatures = [
  'Trench' => [
    // Trench deals damage direcly, bypassing normal formulas so no attack or absolute is set.
    'damageMin' => 70,
    'damageMax' => 70,
    'passable' => [true],
    'damageGroup' => array_search('invulnerable', Creature::damageGroup),
    'special' => $s_trench,
    // Should be accompanied by SG*MLIP obstacle (cannot be integrated into MOAT because combined color table doesn't fit into 8-bit palette; see SGINMOAT/MLIP for example).
    //
    // Groups: hover, stand, attack.
    'image' => '_SG*MOAT',
  ],
  'Main Building' => [
    // This is base damage only. Actual damage depends on building count.
    //
    // XXX=C are towers affected by hero's attack and other stats? currently they are, using the standard damageRange() formulas
    'damageMin' => 10,
    'damageMax' => 15,
    'attack' => 10,
    'speed' => 102,   // Catapult whose speed is 99 must attack after towers
    'passable' => [true],
    'shots' => +9999,
    'shooting' => true,
    'special' => $s_middleTower,
    'sound' => 'KEEP',
    'image' => '_SG*MAN',     // combined: SGCSMAN1, SGCSMAN2, SGCSMANC, archer
    'damageDiv' => 1,
    'aiValue' => 5000,
    'hitPoints' => 2,
  ],
  'Upper Tower' => [
    'damageMin' => 6,
    'damageMax' => 9,
    'attack' => 10,
    'speed' => 101,
    'shots' => +9999,
    'shooting' => true,
    'special' => $s_upperTower,
    'sound' => 'KEEP',
    'image' => '_SG*TW2',     // combined: SGCSTW21, SGCSTW22, SGCSTW2C, archer
    'damageDiv' => 2,
    'aiValue' => 2500,
  ],
  'Lower Tower' => [
    'damageMin' => 6,
    'damageMax' => 9,
    'attack' => 10,
    'speed' => 100,
    'passable' => [true],
    'shots' => +9999,
    'shooting' => true,
    'special' => $s_lowerTower,
    'sound' => 'KEEP',
    'image' => '_SG*TW1',     // combined: SGCSTW11, SGCSTW12, SGCSTW1C, archer
    'damageDiv' => 2,
    'aiValue' => 2500,
  ],
  'Gate' => [
    'width' => 2,
    'special' => $s_gate,
    'image' => '_SG*DRW',     // combined: SGCSDRW1 (start), SGCSDRW2 (hover, stand), SGCSDRW3 (die)
  ],
  'Upper Wall' => [
    'special' => $s_upperWall,
    'image' => '_SG*WA6',     // combined: SGCSWA61 (hover, stand), SGCSWA62 (hit), SGCSWA63 (die)
  ],
  'Mid-Upper Wall' => [
    'special' => $s_midUpperWall,
    'image' => '_SG*WA4',     // combined: SGCSWA41, SGCSWA42, SGCSWA43
  ],
  'Mid-Lower Wall' => [
    'special' => $s_midLowerWall,
    'image' => '_SG*WA3',     // combined: SGCSWA31, SGCSWA32, SGCSWA33
  ],
  'Lower Wall' => [
    'special' => $s_lowerWall,
    'image' => '_SG*WA1',     // combined: SGCSWA11, SGCSWA12, SGCSWA13
  ],
];

// XXX=C numbers
$forts = [
  'Fort' => [
    'Trench' => false,
    'Main Building' => false,
    'Upper Tower' => false,
    'Lower Tower' => false,
  ],
  'Citadel' => [
    'Upper Tower' => false,
    'Lower Tower' => false,
    'Upper Wall' => ['hitPoints' => 2],
    'Mid-Upper Wall'   => ['hitPoints' => 2],
    'Mid-Lower Wall'   => ['hitPoints' => 2],
    'Lower Wall' => ['hitPoints' => 2],
  ],
  'Castle' => [
    'Upper Wall' => ['hitPoints' => 3],
    'Mid-Upper Wall'   => ['hitPoints' => 3],
    'Mid-Lower Wall'   => ['hitPoints' => 3],
    'Lower Wall' => ['hitPoints' => 3],
  ],
];

$towns = [
  'Castle' => [
    'short' => 'CS',
    // Last lines in ARRAYTXT.TXT.
    'Trench' => ['namePlural' => 'Moat'],
    'Main Building' => ['copyAnimation' => $d_creaturesID['archer']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['archer']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['archer']],
  ],
  'Rampart' => [
    'short' => 'RM',
    'Trench' => ['namePlural' => 'Bramble Hedge'],
    'Main Building' => ['copyAnimation' => $d_creaturesID['woodElf']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['woodElf']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['woodElf']],
  ],
  'Tower' => [
    'short' => 'TW',
    // XXX+I: twm: tower's fortification must be land mines placed along the walls, doing 150 damage but only once per spot/mine per combat; this should be implemented after spells like land mines and quicksand are implemented
    'Trench' => ['namePlural' => 'Land Mines', 'image' => 'SGCSMOAT'],
    'Main Building' => ['copyAnimation' => $d_creaturesID['mage']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['mage']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['mage']],
  ],
  'Inferno' => [
    'short' => 'IN',
    'Trench' => ['namePlural' => 'Lava', 'damageMin' => 90, 'damageMax' => 90],
    'Main Building' => ['copyAnimation' => $d_creaturesID['gog']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['gog']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['gog']],
  ],
  'Necropolis' => [
    'short' => 'NC',
    'Trench' => ['namePlural' => 'Boneyard'],
    'Main Building' => ['copyAnimation' => $d_creaturesID['lich']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['lich']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['lich']],
  ],
  'Dungeon' => [
    'short' => 'DN',
    'Trench' => ['namePlural' => 'Boiling Oil', 'damageMin' => 90, 'damageMax' => 90],
    'Main Building' => ['copyAnimation' => $d_creaturesID['medusa']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['medusa']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['medusa']],
  ],
  'Stronghold' => [
    'short' => 'ST',
    'Trench' => ['namePlural' => 'Spike Barrier'],
    'Main Building' => ['copyAnimation' => $d_creaturesID['orc']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['orc']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['orc']],
  ],
  'Fortress' => [
    'short' => 'FR',
    'Trench' => ['namePlural' => 'Boiling Tar', 'damageMin' => 90, 'damageMax' => 90],
    'Main Building' => ['copyAnimation' => $d_creaturesID['lizardman']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['lizardman']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['lizardman']],
  ],
  'Conflux' => [
    'short' => 'EL',
    'Trench' => ['namePlural' => 'Moat'],
    'Main Building' => ['copyAnimation' => $d_creaturesID['stormElemental']],
    'Upper Tower'   => ['copyAnimation' => $d_creaturesID['stormElemental']],
    'Lower Tower'   => ['copyAnimation' => $d_creaturesID['stormElemental']],
  ],
];

$effects = $specialToCreatureID = [];

foreach ($towns as $town => $townOverrides) {
  $townID = $townsID[strtolower($town)];

  foreach ($forts as $fort => $fortOverrides) {
    foreach ($siegeCreatures as $building => $props) {
      if (($fortOverrides[$building] ?? null) === false) {
        continue;
      }

      $s = preg_match('/[sx]$/', $town) ? "'" : "'s";

      $cr = ($townOverrides[$building] ?? []) + ($fortOverrides[$building] ?? []) + $props + [
        'nameSingular' => "$town$s $fort ".($building === 'Main Building' ? 'Middle Tower' : $building),
        'namePlural' => $building,
        'hitPoints' => 1,
        'town' => $townID,
        'width' => 1,
        'win' => false,
        'damageGroup' => array_search('wall', Creature::damageGroup),
      ];
      $id = $d_creatures->append(new Creature($cr));
      $d_creaturesID[Creature::makeIdentifier($cr['nameSingular'])] = $id;
      $specialToCreatureID[$cr['special']][] = $id;

      $anim = ($townOverrides[$building] ?? []) + $props;
      if ($props['shooting'] ?? false) {
        $schema = $d_creatureAnimations->schema();
        asort($schema, SORT_NUMERIC);
        $anim += array_combine(array_keys($schema), $d_creatureAnimations->objectAtContiguous($d_creatureAnimations->toContiguous($townOverrides[$building]['copyAnimation'], 0, 0, 0)));
      }
      $anim['image'] = str_replace('*', $townOverrides['short'], $anim['image']);
      $aid = $d_creatureAnimations->append(new CreatureAnimation($anim));
      if ($id !== $aid) {
        throw new Exception("New CreatureAnimation's \$id $aid is different from new Creature's \$id $id.");
      }

      $effects[] = ['creature_canControl', [$const, false], 'ifCreature' => $id];

      if ($props['shooting'] ?? false) {
        $effects[] = ['creature_shootBlocked', true, 'ifCreature' => $id];
      }

      if ($props['attack'] ?? 0) {
        $div = $props['damageDiv'];
        $effects[] = ['creature_damageMin', [$custom, 'rules', $div, 2], 'ifCreature' => $id];
        $effects[] = ['creature_damageMax', [$custom, 'rules', $div, 3], 'ifCreature' => $id];

        // XXX=C is tower affected by luck? in H2 it was
        $effects[] = ['creature_luck', [$clamp, 0, 0], 'ifCreature' => $id];
        $effects[] = ['creature_morale', [$clamp, 0, 0], 'ifCreature' => $id];
      }

      if (isset($props['speed'])) {
        // Don't be affected by artifacts and other bonuses to speed.
       $effects[] = ['creature_speed', [$clamp, $props['speed'], $props['speed']], 'ifCreature' => $id];
       $effects[] = ['creature_moveDistance', [$clamp, 0, 0], 'ifCreature' => $id];
      }
    }
  }
}

$baseChances = null;

// XXX=C validate actually generated Effects against % in BALLIST.TXT
foreach (csvFile("$txtPath/BALLIST.TXT") as $line) {
  $chances = $damages = [];

  // Shots and canControl are hardcoded in databank-skills.php.
  list($col, $mastery, $chances[$s_middleTower], $towersChance,
       $chances[$s_gate], $wallsChance, /*shots*/, $damages[], $damages[],
       $damages[], /*sum*/) = $line;

  if ($col !== 'Ballistics Skill Effects') {
    $mastery = array_search(strtolower($mastery), Skill::mastery);
    $chances[$s_upperTower] = $chances[$s_lowerTower] = $towersChance;
    $chances[$s_upperWall] = $chances[$s_lowerWall] = $wallsChance;
    $chances[$s_midUpperWall] = $chances[$s_midLowerWall] = $wallsChance;
    $chances = array_map('intval', $chances);
    $damages = array_map('intval', $damages);

    if (!$mastery) {
      $baseChances = $chances;
      $baseDamages = $damages;

      foreach ($chances as $building => $chance) {
        foreach ($specialToCreatureID[$building] as $id) {
          // Affects Cyclops too.
          $effects[] = ['creature_hitChance', [$override, [1 => (int) ($chance / 100 * $constants['multiplier']), 2 => (int) ((1 - $chance / 100) * $constants['multiplier'])]], 'ifTargetCreature' => $id];
        }
      }

      foreach ($damages as $damage => &$ref) {
        $ref = (int) ($ref / 100 * $constants['multiplier']);
      }

      $effects[] = ['creature_wallDamage', [$override, $damages], 'ifCreature' => $d_creaturesID['catapult']];
    } else {
      $skillEffects = [];

      foreach ($chances as $building => $chance) {
        $chance -= $baseChances[$building];
        foreach ($specialToCreatureID[$building] as $id) {
          $skillEffects[] = ['creature_hitChance', [$override, [1 => (int) ($chance / 100 * $constants['multiplier']), 2 => (int) ((1 - $chance / 100) * $constants['multiplier'])]], 'ifTargetCreature' => $id, 'ifObject' => true];
        }
      }

      foreach ($damages as $damage => &$ref) {
        $ref -= $baseDamages[$damage];
        $ref = (int) ($ref / 100 * $constants['multiplier']);
      }

      $skillEffects[] = ['creature_wallDamage', [$override, $damages], 'ifCreature' => $d_creaturesID['catapult'], 'ifObject' => true];
      $prop = $d_skills->propertyIndex('effects_0') + $mastery;

      $cur = array_merge(
        $d_skills->atCoords($d_skillsID['ballistics'], 0, 0, $prop),
        ...array_map(
          function ($e) use ($d_skills, $prop) {
            $a = [];
            // Sub-schema may include padding so have to pass it on.
            $e->normalize(true)->serializeTo($a, 0, $d_skills->subSchema($prop));
            return $a;
          },
          H3Effect::fromShort($skillEffects, [], ['priority' => array_search('skill', H3Effect::priority), 'default' => ['source' => [array_search('skill', H3Effect::source), $d_skillsID['ballistics']]]])
        )
      );

      $d_skills->setAtCoords($d_skillsID['ballistics'], 0, 0, 0, $prop, $cur);
    }
  }
}

$effects[] = ['creature_wallDamage', [$const, [1 => $constants['multiplier']]], 'ifCreature' => $d_creaturesID['cyclops']];
$effects[] = ['creature_wallDamage', [$const, [1 => $constants['multiplier']]], 'ifCreature' => $d_creaturesID['cyclopsKing']];

$d_staticEffects = array_merge($d_staticEffects, H3Effect::fromShort($effects, [], ['priority' => array_search('garrison', H3Effect::priority), 'default' => ['source' => array_search('garrison', H3Effect::source)]]));
