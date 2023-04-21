<?php
extract(array_flip(H3Effect::context));
extract(array_flip(H3Effect::operation));
extract(array_flip(AClass::terrain), EXTR_PREFIX_ALL, 't');
extract($constants['resources']);
extract($constants['shroud'], EXTR_PREFIX_ALL, 'shr');
extract(json_decode(file_get_contents("$outPath/creaturesID.json"), true));

$h3Classes = [];    // SoD class => array of AClass->$id
//$c_IDNAME = array of AClass->$id
//$c_IDNAME_SUBCLASS = array of AClass->$id

foreach ($objects as $id => $obj) {
  $h3Classes[$obj->class][] = $id;
  $idName = AClass::makeIdentifier($obj->name);
  ${"c_$idName"}[] = $id;
  ${"c_{$idName}_$obj->subclass"}[] = $id;
}

$adve = array_column(csvFile($options, 'ADVEVENT.TXT', 0, false), 0);
$genr = array_column(csvFile($options, 'GENRLTXT.TXT', 0, false), 0);
$seer = csvFile($options, 'SEERHUT.TXT', 0);
$mine = array_column(csvFile($options, 'MINENAME.TXT', 0), 0);
$minc = array_column(csvFile($options, 'MINEEVNT.TXT', 0), 0);
$spells = json_decode(file_get_contents("$outPath/spellsID.json"), true);
$skills = json_decode(file_get_contents("$outPath/skillsID.json"), true);
$skillStore = ObjectStore::fromFile("$outPath/skills.json");

$special = $common = $minor = $major = $relic = [];
$store = ObjectStore::fromFile("$outPath/artifacts.json");

for ($id = 0; $id < $store->x(); $id++) {
  ${Artifact::rarity[$store->atCoords($id, 0, 0, 'rarity')] ?? 'special'}[] = $id;
}

$level1 = $level2 = $level3 = $level4 = $level5 = [];
$store = ObjectStore::fromFile("$outPath/spells.json");

for ($id = 0; $id < $store->x(); $id++) {
  if (!$store->atCoords($id, 0, 0, 'byCreature')) {
    ${'level'.$store->atCoords($id, 0, 0, 'level')}[] = $id;
  }
}

$o_false = [$const, false];

// Generates $modifier value for quest_chances.
// $s = 'label[/chance] [label...]'.
// $chances('W/2 O', 'res')   //=> [$const, ['resW' => 2, 'resO' => 1]]
$chances = function ($s, $prefix = '') use ($const) {
  $res = [];
  foreach (is_array($s) ? $s : explode(' ', $s) as $s) {
    $res[$prefix.strtok($s, '/')] = strtok('') ?: 1;
  }
  return [$const, $res];
};

// function ([placeholder,] [replacer,] array of variants, ...template values)
//
// All arguments but the first are collected into a single array.
// Returns an array sized its length * count of variants, where key equals key
// in variants and value is a copy of the collected array, with two type of
// replacements done on its array members (recursively):
//
//   1. If a key has '$', it's replaced with the variant value (key is renamed).
//   2. If a value is $e, it's replaced with the current variant value.
//   3. If a value is exactly placeholder (non-array), do as with $e above.
//   4. If a value is other and is scalar, it's replaced with replacer's result.
//
// For example, $e(['a' => 1, 'b' => 2], ['message-$' => $e]) returns
// [ 'a' => [['message-1' => 1]], 'b' => [['message-2' => 2]] ].
//
// function (array to flatten)
//
// Removes one layer of nesting from the array by treating each member like so:
//
//   1. If the member's key is an integer, its contents is merged (+=) into
//      the result.
//   2. If it's a string, the contents is inserted under that key verbatim
//      (without unwrapping).
//
// For example, $e([123 => ['a' => 'A', 5 => 'B'], 'c' => 'C']) returns
// ['a' => 'A', 5 => 'B', 'c' => 'C'].
//
// Both call forms should be used in conjunction: the first creates nested
// arrays while the latter unwraps them to form the final value. For example:
//
//   $final = $e([
//     $e([11 => 1, 22 => 2], ['creature_morale', 'ifDay' => $e]),
//    'label' => [['hero_spellPower', -1]],
//   ]);
//
//   // Same as:
//   $final = [
//     11 => [['creature_morale', 'ifDay' => 1]],
//     22 => [['creature_morale', 'ifDay' => 2]],
//    'label' => [['hero_spellPower', -1]],
//   ];
$mergeKeys = array_merge($c_pandoraBox, $c_redwoodObservatory, $c_pillarOfFire, $c_resource_0, $c_resource_1, $c_resource_2, $c_resource_3, $c_resource_4, $c_resource_5, $c_resource_6);
$e = function ($value, ...$array) use (&$e, $mergeKeys) {
  if ($array) {
    $placeholder = $e;
    $replacer = null;
    for ($i = 0; $i <= 1; ) {
      if ($i <= 0 and !is_array($value) and !$value instanceof Closure) {
        $placeholder = $value;
        $i = 1;
      } elseif ($i <= 1 and $value instanceof Closure) {
        $replacer = $value;
        $i = 2;
      } else {
        break;
      }
      $value = array_shift($array);
    }

    $replace = function ($value, $array)
        use (&$replace, $e, $placeholder, $replacer) {
      $res = [];

      foreach ($array as $k => $v) {
        if ($v and (is_array($v) or is_object($v)) and $v !== $e) {
          $v = $replace($value, $v);
        } elseif ($v === $e or $v === $placeholder) {
          $v = $value;
        } elseif ($replacer and is_scalar($v)) {
          $v = $replacer($value, $v);
        }
        $res[str_replace('$', $value, $k)] = $v;
      }

      return $res;
    };

    return array_map(function ($value) use ($array, $replace) {
      return $replace($value, $array);
    }, $value);
  } else {
    $res = [];

    foreach ($value as $k => $v) {
      if (is_int($k)) {
        // The check for duplicate key helps locating misplaced definitions, given the $value is defined over thousands of lines. However, some rare keys intend to be merged, on whitelist basis.
        foreach ($v as $kk => $vv) {
          if (in_array($kk, $mergeKeys)) {
            $res[$kk] = array_merge($res[$kk] ?? [], $vv);
            unset($v[$kk]);
          }
        }
        $old = array_keys($res);
        $res += $v;
        if (count($old) + count($v) !== count($res)) {
          throw new \Exception('Duplicate key(s): '.join(', ', array_intersect(array_keys($v), $old)));
        }
      } else {
        if (array_key_exists($k, $res)) {
          throw new \Exception("Duplicate key: $k");
        }
        $res[$k] = $v;
      }
    }

    return $res;
  }
};

// $e0()/$e00() unwrap 1/2 levels of external arrays.
//
//   $e(['a' => 1, 'b' => 2], ['x']);   //=> ['a' => [['x']], 'b' => [['x']]]
//  $e0(['a' => 1, 'b' => 2], ['x']);   //=> [['x'], ['x']]
// $e00(['a' => 1, 'b' => 2], ['x']);   //=> ['x', 'x']
$e0 = function () use ($e) {
  return array_merge(...array_values($e(...func_get_args())));
};

$e00 = function () use ($e0) {
  return array_merge(...array_values($e0(...func_get_args())));
};

return [
  // Determined empirically from the editor's help and in-game trial.
  //
  // Description snippets below come from the editor's help (H3MAPED.HLP), decoded into RTF using helpdc21.zip.
  //
  // Members are of two types: class description and labeled Effect, depending on whether the key is an integer (AClass->$id) or not (Effect->$label).
  //
  // Class description's value is an array of arrays (static Effects). If the 'ifBonusObjectClass' key is not present ("null" counts as present), it is set to the described AClass->$id. GenericEncounter specifies expansion rules for Effects "inside" bonus_effects.
  //
  // Labeled Effect is also an array of arrays. Index 2 stands for 'ifObject'. If the 'ifBonusObject' key is not present ("null" counts as present), it is set to true. GenericEncounter specifies expansion rules for all arrays (Effects).
  //
  // Top-level Effects of both have defaults for 'priority', and the first also has default for 'source' (labeled Effects do not because it's usually set to $encounter by GenericEncounter's shortcut of false). Nested in bonus_effects do not have these defaults. Nested should be also anchored using 'ifObject' => true, or using 'ifPlayer', 'ifBonusObject' or other.
  //
  // Most of object encounter's parameters are defined here but not all. Some
  // objects have support code in these files:
  // * H3.Rules.js (deviations from common GenericEncounter algorithm)
  // * H3.DOM.UI.js (displaying UI for quest_choices, etc.)
  // * h3m2herowo.php (map-specific features)
  //
  // Audio data is coming from Sounds.txt. XXX=C `{Audio`}-s need to be checked with the actual game sounds.
  //
  // According to action mask in OBJECTS.TXT, there are 116 unique actionable
  // classes. Columns: SoD class, HeroWO $idName, OBJNAMES.TXT entry.
  //
  //   2    altarOfSacrifice          Altar of Sacrifice
  //   4    arena                     Arena
  //   5    artifact                  Artifact
  //   6    pandoraBox                Pandora's Box
  //   7    blackMarket               Black Market
  //   8    boat                      Boat
  //   9    borderGuard               Border Guard
  //   10   keymasterTent             Keymaster's Tent
  //   11   buoy                      Buoy
  //   12   campfire                  Campfire
  //   13   cartographer              Cartographer
  //   14   swanPond                  Swan Pond
  //   15   coverOfDarkness           Cover of Darkness
  //   16   creatureBank              Creature Bank
  //   17   creatureGenerator1        Creature Generator 1
  //   20   creatureGenerator4        Creature Generator 4
  //   22   corpse                    Corpse
  //   23   marlettoTower             Marletto Tower
  //   24   derelictShip              Derelict Ship
  //   25   dragonUtopia              Dragon Utopia
  //   26   event                     Event
  //   27   eyeOfMagi                 Eye of the Magi
  //   28   faerieRing                Faerie Ring
  //   29   flotsam                   Flotsam
  //   30   fountainOfFortune         Fountain of Fortune
  //   31   fountainOfYouth           Fountain of Youth
  //   32   gardenOfRevelation        Garden of Revelation
  //   33   garrison                  Garrison
  //   34   hero                      Hero
  //   35   hillFort                  Hill Fort
  //   36   grail                     Grail
  //   37   hutOfMagi                 Hut of the Magi
  //   38   idolOfFortune             Idol of Fortune
  //   39   leanTo                    Lean To
  //   41   libraryOfEnlightenment    Library of Enlightenment
  //   42   lighthouse                Lighthouse
  //   43   monolithOneWayEntrance    Monolith One Way Entrance
  //   44   monolithOneWayExit        Monolith One Way Exit
  //   45   monolithTwoWay            Monolith Two Way
  //   47   schoolOfMagic             School of Magic
  //   48   magicSpring               Magic Spring
  //   49   magicWell                 Magic Well
  //   51   mercenaryCamp             Mercenary Camp
  //   52   mermaids                  Mermaids
  //   53   mine                      Mine
  //   54   monster                   Monster
  //   55   mysticalGarden            Mystical Garden
  //   56   oasis                     Oasis
  //   57   obelisk                   Obelisk
  //   58   redwoodObservatory        Redwood Observatory
  //   59   oceanBottle               Ocean Bottle
  //   60   pillarOfFire              Pillar of Fire
  //   61   starAxis                  Star Axis
  //   62   prison                    Prison
  //   63   pyramid                   Pyramid
  //   64   rallyFlag                 Rally Flag
  //   65   randomArtifact            Random Artifact
  //   66   randomTreasureArtifact    Random Treasure Artifact
  //   67   randomMinorArtifact       Random Minor Artifact
  //   68   randomMajorArtifact       Random Major Artifact
  //   69   randomRelic               Random Relic
  //   70   randomHero                Random Hero
  //   71   randomMonster             Random Monster
  //   72   randomMonster1            Random Monster 1
  //   73   randomMonster2            Random Monster 2
  //   74   randomMonster3            Random Monster 3
  //   75   randomMonster4            Random Monster 4
  //   76   randomResource            Random Resource
  //   77   randomTown                Random Town
  //   78   refugeeCamp               Refugee Camp
  //   79   resource                  Resource
  //   80   sanctuary                 Sanctuary
  //   81   scholar                   Scholar
  //   82   seaChest                  Sea Chest
  //   83   seerHut                   Seer's Hut
  //   84   crypt                     Crypt
  //   85   shipwreck                 Shipwreck
  //   86   shipwreckSurvivor         Shipwreck Survivor
  //   87   shipyard                  Shipyard
  //   88   shrineOfMagicIncantation  Shrine of Magic Incantation
  //   89   shrineOfMagicGesture      Shrine of Magic Gesture
  //   90   shrineOfMagicThought      Shrine of Magic Thought
  //   91   sign                      Sign
  //   92   sirens                    Sirens
  //   93   spellScroll               Spell Scroll
  //   94   stables                   Stables
  //   95   tavern                    Tavern
  //   96   temple                    Temple
  //   97   denOfThieves              Den of Thieves
  //   98   town                      Town
  //   99   tradingPost               Trading Post
  //   100  learningStone             Learning Stone
  //   101  treasureChest             Treasure Chest
  //   102  treeOfKnowledge           Tree of Knowledge
  //   103  subterraneanGate          Subterranean Gate
  //   104  university                University
  //   105  wagon                     Wagon
  //   106  warMachineFactory         War Machine Factory
  //   107  schoolOfWar               School of War
  //   108  warriorTomb               Warrior's Tomb
  //   109  waterWheel                Water Wheel
  //   110  wateringHole              Watering Hole
  //   111  whirlpool                 Whirlpool
  //   112  windmill                  Windmill
  //   113  witchHut                  Witch Hut
  //   162  randomMonster5            Random Monster 5
  //   163  randomMonster6            Random Monster 6
  //   164  randomMonster7            Random Monster 7
  //   212  borderGate                Border Gate
  //   213  freelancerGuild           Freelancer's Guild
  //   214  heroPlaceholder           Hero Placeholder
  //   215  questGuard                Quest Guard
  //   216  randomDwelling            Random Dwelling
  //   217  randomDwellingByLevel
  //   218  randomDwellingByTown
  //   219  garrison                  Garrison
  //   220  mine                      Mine
  //   221  tradingPost               Trading Post
  //
  // Classes with effects that don't have actionability in OBJECTS.TXT:
  //   3    anchorPoint               Anchor Point (?)
  //   18   creatureGenerator2        Creature Generator 2
  //   19   creatureGenerator3        Creature Generator 3
  //   21   cursedGround Cursed       Ground
  //   46   magicPlains               Magic Plains
  //   50   marketOfTime              Market of Time (?)
  //   222  cloverField               Clover Field
  //   223  cursedGround              Cursed Ground
  //   224  evilFog                   Evil Fog
  //   225  favorableWinds            Favorable Winds (?)
  //   226  fieryFields               Fiery Fields
  //   227  holyGround                Holy Ground
  //   228  lucidPools                Lucid Pools
  //   229  magicClouds               Magic Clouds
  //   230  magicPlains               Magic Plains
  //   231  rocklands                 Rocklands
  'encounterEffectsOfObject' => $e([
    //array_fill_keys($c_altarofSacrifice, [XXX=I]),
    // Castle, Rampart, and Tower heroes may sacrifice artifacts for experience.
    //
    // Inferno, Necropolis, and Dungeon heroes may sacrifice creatures for experience.
    //
    // Stronghold and Fortress heroes may sacrifice artifacts or creatures for experience.

    array_fill_keys($c_arena, [
      ['quest_choices', [$append, 'attack2', 'defense2']],
      ['quest_message', [$const, [$adve[1].'`{Audio NOMAD`}']]],
    ]),
    // Player's choice to add +2 to the visiting hero's Attack or Defense.
    'attack2'  => [['hero_attack',  +2, true, 'ifBonusObject' => null]],
    'defense2' => [['hero_defense', +2, true, 'ifBonusObject' => null]],

    // pandoraBox and event are defined by map convertor.
    array_fill_keys($c_pandoraBox, [
      ['quest_remove', true],
    ]),
    // Anything or everything may be put into Pandora’s Box.
    //
    // Events are user created experiences.
    // Events placed on the map can only be triggered by heroes.
    $e($e0(
      function ($v, $s) use ($adve, $c_event) {
        if ($s === $adve[15] and in_array($v, $c_event)) {
          $s = null;  // show no message for Event if there are no standard effects
        }
        return $s;
      },
      array_merge($c_pandoraBox, $c_event),
      [
        '$' => [
          // XXX=IC SoD filters learned secondary skills in the message by ignoring ones the hero already has (or all, if he has 8 skills already)
          //
          // XXX=IC SoD may show multiple messages if it deems the content to be displayed is too large; each message uses its own text detection (i.e. if first bonus shown on that message is 'creatures' that it'd use that text, no matter what was the first bonus of the first message)
          ['bonus_message', [$custom, 'rules', 3,
           sprintf(toMarkup($adve[175], ''), '`{HeroName`}'),
           sprintf(toMarkup($adve[177], ''), '`{HeroName`}'),
           // SoD seems to have a bug: it shows the "gains" message even if negative.
           sprintf(toMarkup($adve[176], ''), '`{HeroName`}'),
           // SoD shows 1 icon -1/+1 even if modifier is -2/+2/-3/+2. We show multiple, in classic mode. Same for luck (shows 0/+1 icons).
           sprintf(toMarkup($adve[179], ''), '`{HeroName`}'),
           sprintf(toMarkup($adve[178], ''), '`{HeroName`}'),
           sprintf(toMarkup($adve[181], ''), '`{HeroName`}'),
           sprintf(toMarkup($adve[180], ''), '`{HeroName`}'),
           sprintf(toMarkup($adve[183], ''), '`{HeroName`}'),
           sprintf(toMarkup($adve[182], ''), '`{HeroName`}'),
           // XXX=C need to check for spell book and wisdom (quest_fulfilled)?
           sprintf(toMarkup($adve[184], ''), '`{HeroName`}'),
           sprintf(toMarkup($adve[188], ''), '`{HeroName`}'),
           // ADVEVENT.TXT[185]
           //
           // XXX=IC Slightly different message from SoD (SoD shows "A" instead of count "1"); also it has a bug: it only checks first creature's stack size; if it's 1 then this message is used even if there are other creatures granted (or the same creature but in another stack)
           "`{Bonuses`} joins `{HeroName`}'s army.\n\n`{BonusesImages`}",
           // XXX=IC Slightly different message from SoD (SoD shows no count)
           sprintf(toMarkup($adve[186], ''), '`{Bonuses`}', '`{HeroName`}'),
           sprintf(toMarkup($adve[175], ''), '`{HeroName`}'),
           $adve[15]]],
        ],
      ]
    )),

    //array_fill_keys($c_blackMarket, [XXX=I]),
    // Artifacts may be purchased at the Black Market.

    // No Effects needed.
    //array_fill_keys($c_boat, []),

    array_fill_keys($c_borderGuard, [
      ['quest_fulfilled', $o_false],
      ['quest_choices', [$append, 'remove', 'cancel']],
      ['quest_message', [$const, [$borderGuard = $adve[18].'`{Audio XXX=ID:dbos:`}']]],
    ]),
    // Usually placed at choke points, a hero must visit a Keymaster’s tent of the associated color for the password.
    'remove'  => [['quest_remove', true]],

    array_fill_keys($c_borderGate, [
      ['quest_fulfilled', $o_false],
      ['quest_message', [$const, [$borderGuard]]],
    ]),
    // Usually placed at choke points, a hero must visit the keymaster of the associated color in order to get the password.  Each player must visit the keymaster, as the Border Gate will not disappear after the first player visits it.

    array_fill_keys($c_keymasterTent_0, [
      bonus_effects([
        [
          $append,
          ['quest_fulfilled', $o_false, 'ifBonusObjectClass' => $c_keymasterTent_0[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGuard[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGate[0],  'ifPlayer' => true],
        ],
      ]),
      $qmsg = ['quest_message', [$const, [$adve[20].'`{Audio XXX=ID:dbos:`}']]],
      $bmsg = ['bonus_message', [$const, [$adve[19].'`{Audio XXX=ID:dbos:`}']]],
    ]),
    // For a hero to pass a Border Guard, the hero must visit the Keymaster’s tent of the associated color.
    array_fill_keys($c_keymasterTent_1, [
      bonus_effects([
        [
          $append,
          ['quest_fulfilled', $o_false, 'ifBonusObjectClass' => $c_keymasterTent_1[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGuard[1], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGate[1],  'ifPlayer' => true],
        ],
      ]),
      $qmsg,
      $bmsg,
    ]),
    array_fill_keys($c_keymasterTent_2, [
      bonus_effects([
        [
          $append,
          ['quest_fulfilled', $o_false, 'ifBonusObjectClass' => $c_keymasterTent_2[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGuard[2], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGate[2],  'ifPlayer' => true],
        ],
      ]),
      $qmsg,
      $bmsg,
    ]),
    array_fill_keys($c_keymasterTent_3, [
      bonus_effects([
        [
          $append,
          ['quest_fulfilled', $o_false, 'ifBonusObjectClass' => $c_keymasterTent_3[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGuard[3], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGate[3],  'ifPlayer' => true],
        ],
      ]),
      $qmsg,
      $bmsg,
    ]),
    array_fill_keys($c_keymasterTent_4, [
      bonus_effects([
        [
          $append,
          ['quest_fulfilled', $o_false, 'ifBonusObjectClass' => $c_keymasterTent_4[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGuard[4], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGate[4],  'ifPlayer' => true],
        ],
      ]),
      $qmsg,
      $bmsg,
    ]),
    array_fill_keys($c_keymasterTent_5, [
      bonus_effects([
        [
          $append,
          ['quest_fulfilled', $o_false, 'ifBonusObjectClass' => $c_keymasterTent_5[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGuard[5], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGate[5],  'ifPlayer' => true],
        ],
      ]),
      $qmsg,
      $bmsg,
    ]),
    array_fill_keys($c_keymasterTent_6, [
      bonus_effects([
        [
          $append,
          ['quest_fulfilled', $o_false, 'ifBonusObjectClass' => $c_keymasterTent_6[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGuard[6], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGate[6],  'ifPlayer' => true],
        ],
      ]),
      $qmsg,
      $bmsg,
    ]),
    array_fill_keys($c_keymasterTent_7, [
      bonus_effects([
        [
          $append,
          ['quest_fulfilled', $o_false, 'ifBonusObjectClass' => $c_keymasterTent_7[0], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGuard[7], 'ifPlayer' => true],
          ['quest_fulfilled', true, 'ifBonusObjectClass' => $c_borderGate[7],  'ifPlayer' => true],
        ],
      ]),
      $qmsg,
      $bmsg,
    ]),

    array_fill_keys($c_buoy, [
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]]]),
      ['quest_message', [$const, [toMarkup($adve[22], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[21], '`{MoraleImage +1`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // Visiting a Buoy gives a hero +1 morale until the next battle.

    array_fill_keys($c_campfire, [
      ['quest_chances', $chances('GW GM GO GS GC GJ', 'camp')],
      ['bonus_resource', [$random, 400, 600], 'ifResource' => $gold, 'ifTargetPlayer' => -1],
      ['quest_remove', true],
      ['bonus_message', [$const, [toMarkup($adve[23], '`{BonusesImages`}`{Audio EXPERNCE`}')]]],
    ]),
    // +400-600 gold.
    // +4-6 random resource other than gold.
    'campGW' => [
      ['bonus_resource', [$random, 4, 6], 'ifResource' => $wood,    'ifTargetPlayer' => -1],
    ],
    'campGM' => [
      ['bonus_resource', [$random, 4, 6], 'ifResource' => $mercury, 'ifTargetPlayer' => -1],
    ],
    'campGO' => [
      ['bonus_resource', [$random, 4, 6], 'ifResource' => $ore,     'ifTargetPlayer' => -1],
    ],
    'campGS' => [
      ['bonus_resource', [$random, 4, 6], 'ifResource' => $sulfur,  'ifTargetPlayer' => -1],
    ],
    'campGC' => [
      ['bonus_resource', [$random, 4, 6], 'ifResource' => $crystal, 'ifTargetPlayer' => -1],
    ],
    'campGJ' => [
      ['bonus_resource', [$random, 4, 6], 'ifResource' => $gems,    'ifTargetPlayer' => -1],
    ],

    array_fill_keys($c_cartographer_0, [
      ['quest_fulfilled', [$check, 'resources_gold', 1000]],
      ['quest_choices', [$append, 'cartW', 'cancel']],
      ['bonus_resource', -1000, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_water, 'ifTargetPlayer' => -1],
      $msg = ['quest_message', [$custom, 'rules', 2,
        str_replace('1000 gold', '`{Checks`}`{Audio LIGHTHOUSE`}', $adve[28]),
        $adve[24].'`{Audio LIGHTHOUSE`}',
      ]],
    ]),
    // There are three different cartographers: land, ocean, or underworld.
    //
    // A Hero pays 1000 gold to remove the shroud from the land, ocean, or underworld.
    'cartW' => $e0(
      PHP_INT_MAX,
      $c_cartographer_0,
      bonus_effects([[$append, ['quest_fulfilled', [$check, false], 'ifPlayer' => true, 'ifBonusObjectClass' => PHP_INT_MAX]]])
    ),
    array_fill_keys($c_cartographer_1, [
      ['quest_fulfilled', [$check, 'resources_gold', 1000]],
      ['quest_choices', [$append, 'cartT', 'cancel']],
      ['bonus_resource', -1000, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_dirt, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_desert, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_grass, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_snow, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_swamp, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_rough, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_lava, 'ifTargetPlayer' => -1],
      $msg,
    ]),
    'cartT' => $e0(
      PHP_INT_MAX,
      $c_cartographer_1,
      bonus_effects([[$append, ['quest_fulfilled', [$check, false], 'ifPlayer' => true, 'ifBonusObjectClass' => PHP_INT_MAX]]])
    ),
    array_fill_keys($c_cartographer_2, [
      ['quest_fulfilled', [$check, 'resources_gold', 1000]],
      ['quest_choices', [$append, 'cartU', 'cancel']],
      ['bonus_resource', -1000, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
      ['bonus_shroudTerrain', [$append, ['AtCoords', null, null, null, null, $shr_cartographer, true]], 'ifTerrain' => $t_subterranean, 'ifTargetPlayer' => -1],
      $msg,
    ]),
    'cartU' => $e0(
      PHP_INT_MAX,
      $c_cartographer_2,
      bonus_effects([[$append, ['quest_fulfilled', [$check, false], 'ifPlayer' => true, 'ifBonusObjectClass' => PHP_INT_MAX]]])
    ),

    // XXX+B HeroAP remains full at the end of the move because its update is called twice: first in response to GenericEncounter setting AP to 0, then during running transaction of do=heroMove that triggered the encounter
    array_fill_keys($c_swanPond, [
      bonus_effects([[$append, ['creature_luck', +2, true, 'maxCombats' => 1]]]),
      ['bonus_actionPoints', 0.0, 'ifTargetObject' => -1],
      ['quest_message', [$const, [toMarkup($adve[30], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[29], '`{LuckImage +2`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // +2 Luck until the next battle.
    // Lose all current movement.

    array_fill_keys($c_coverOfDarkness, [
      [
        'bonus_shroud',
        [
          $append,
          ['WithinCircle', null, null, 20, null, null, $shr_cartographer, false],
          ['WithinCircle', null, null, 20, null, null, $shr_observatory, false],
          ['WithinCircle', null, null, 20, null, null, $shr_eyeOfMagi, false],
        ],
        'ifTargetPlayer' => -1,
        'isTargetEnemy' => true,
      ],
      ['bonus_message', [$const, [toMarkup($adve[31], '`{Audio LIGHTHOUSE`}')]]],
    ]),
    // Regenerates the shroud for enemy heroes, for a 20-tile radius.
    //
    // mightandmagic.fandom.com states that: "Visiting the Cover of Darkness will cover the nearest city with a permanent shroud for all players." - but this claim is not supported by in-game tests.

    array_fill_keys($c_corpse, [
      ['quest_chances', $chances('nothing/799 artT/67 artM/67 artJ/67')],
      ['quest_fulfilled', $o_false, 'ifGrantedMin' => 1],
      ['quest_message', [$const, [$msg = toMarkup($adve[38], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$custom, 'rules', 1,
        toMarkup($adve[37])."`{Bonuses`}.\n\n`{BonusesImages`}`{Audio XXX=ID:dbos:`}",
        $msg]],
    ]),
    // 80% chance of finding nothing.
    // 20% chance of finding random Treasure, Minor, or Major artifact.
    'nothing' => [],

    array_fill_keys($c_marlettoTower, [
      bonus_effects([[$append, ['hero_defense', +1, true]]]),
      ['quest_message', [$const, [toMarkup($adve[40], '`{Audio NOMAD`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[39], '`<`{StatImage defense`} +1 Defense Skill`>`{Audio NOMAD`}')]]],
    ]),
    // +1 Defense

    // Defined by write_banks().
    array_fill_keys($c_derelictShip, [
      bonus_effects([[$append, ['creature_morale', -1, true, 'maxCombats' => 1]], 'ifGrantedMin' => 1]),
      // No audio in this message.
      ['quest_message', [$const, [$adve[42]."\n\n`{MoraleImage -1`}"]]],
    ]),
    // 30% 20 Water Elementals for 3kgold.
    // 30% 30 Water Elementals for 3kgold and 1 Treasure Artifact.
    // 30% 40 Water Elementals for 4kgold and 1 Treasure Artifact.
    // 10% 60 Water Elementals for 6kgold and 1 Minor Artifact.
    //
    // (The above help from the editor doesn't mention that hero gets -1 morale if the ship was visited before.)

    // Defined by write_banks().
    array_fill_keys($c_dragonUtopia, [
      ['quest_message', [$const, [$genr[425].'`{Audio DRAGON`}']]],
    ]),
    // 30% Fight 8 Green Dragons, 5 Red Dragons, 2 Gold Dragons, and 1 Black Dragons for 20kgold and 1 Treasure Artifact, 1 Minor Artifact, 1 Major Artifact, and 1 Relic Artifact.
    //
    // 30% Fight 8 Green Dragons, 6 Red Dragons, 3 Gold Dragons, and 2 Black Dragons for 30kgold and 1 Minor Artifact, 1 Major Artifact, and 2 Relic Artifacts.
    //
    // 30% Fight 8 Green Dragons, 6 Red Dragons, 4 Gold Dragons, and 3 Black Dragons for 40kgold and 1 Major Artifact, and 3 Relic Artifacts.
    //
    // 10% Fight 8 Green Dragons, 7 Red Dragons, 6 Gold Dragons, and 5 Black Dragons for 50kgold and 4 Relic Artifacts.

    // Defined by map convertor.
    array_fill_keys($c_eyeOfMagi, [
      ['bonus_message', [$const, [$adve[48].'`{Audio LIGHTHOUSE`}']]],
    ]),
    // Not interactive, Eyes of the Magi illuminate shrouded areas when a hero visits a Hut of the Magi.

    array_fill_keys($c_faerieRing, [
      bonus_effects([[$append, ['creature_luck', +1, true, 'maxCombats' => 1]]]),
      ['quest_message', [$const, [toMarkup($adve[50], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[49], '`{LuckImage +1`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // +1 Luck until the next battle.

    array_fill_keys($c_flotsam, [
      ['quest_chances', $chances('nothing wood5 wgold200 wgold500')],
      ['quest_remove', true],
      ['bonus_message', [$custom, 'rules', 2,
       toMarkup($adve[52], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}'),
       toMarkup($adve[53], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}'),
       toMarkup($adve[51], '`{Audio XXX=ID:dbos:`}')]],
    ]),
    // 25% chance of getting nothing.
    // 25% chance of getting 05 Wood.
    // 25% chance of getting 05 Wood and 200 Gold.
    // 25% chance of getting 10 Wood and 500 Gold.
    'wood5' => [
      ['bonus_resource', 5,   'ifResource' => $wood, 'ifTargetPlayer' => -1],
    ],
    'wgold200' => [
      ['bonus_resource', 5,   'ifResource' => $wood, 'ifTargetPlayer' => -1],
      ['bonus_resource', 200, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
    ],
    'wgold500' => [
      ['bonus_resource', 10,  'ifResource' => $wood, 'ifTargetPlayer' => -1],
      ['bonus_resource', 500, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
    ],

    array_fill_keys($c_fountainOfFortune, [
      // One way to generate random luck would be by using quest_chances + quest_reset (with bonus_effects and bonus_message in every label's Effects). Another, less straightforward but less verbose is using $randomArray to replace bonus_effects, with a single bonus_message that reads the actual value (addressed by encounterLabel).
      bonus_effects([
        [$randomArray, 0,
          // Doesn't give 0 luck, from my tests.
          [['creature_luck', -1, true, 'maxCombats' => 1, 'encounterLabel' => 'm']],
          [['creature_luck', +1, true, 'maxCombats' => 1, 'encounterLabel' => 'm']],
          [['creature_luck', +2, true, 'maxCombats' => 1, 'encounterLabel' => 'm']],
          [['creature_luck', +3, true, 'maxCombats' => 1, 'encounterLabel' => 'm']],
        ],
      ]),
      ['quest_message', [$const, [toMarkup($adve[56], '`{Audio XXX=ID:dbos:`}')]]],
      // XXX=IC Slightly different from SoD: it shows one neutral luck (0) icon for -1 luck or one +1 for others. We in classic mode show 2/3 +1 icons for +2/+3 luck.
      ['bonus_message', [$const, [toMarkup($adve[55], '`{LuckImage m`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // -1 to +3 Luck until the next battle.

    array_fill_keys($c_fountainOfYouth, [
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]]]),
      ['bonus_actionPoints', +4, 'ifTargetObject' => -1],
      ['quest_message', [$const, [toMarkup($adve[58], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[57], '`{MoraleImage +1`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // +1 Morale until next battle.
    // +4 Adventure movement until the end of the day.

    // No Effects needed. Has entry in spotEffectsOfObject.
    // Class 33 subclass 0, class 219 subclass 0.
    //array_fill_keys($c_garrison_0, []),
    // Location for storing troops at a choke point.

    array_fill_keys($c_gardenOfRevelation, [
      bonus_effects([[$append, ['hero_knowledge', +1, true]]]),
      ['quest_message', [$const, [toMarkup($adve[60], '`{Audio GETPROTECTION`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[59], '`<`{StatImage knowledge`} +1 Knowledge`>`{Audio GETPROTECTION`}')]]],
    ]),
    // +1 Knowledge

    //array_fill_keys($c_hillFort, [XXX=I]),
    // Upgrade base grade creatures.

    //array_fill_keys($c_grail, [XXX=I:grl:),
    // Customizable.
    // Buried artifact found via the Puzzle Map.
    // Placing this object determines the location of grail.
    // Otherwise, a random location is chosen when an obelisk is placed.

    // Defined by map convertor.
    array_fill_keys($c_hutOfMagi, [
      ['bonus_message', [$const, [$adve[61].'`{Audio LIGHTHOUSE`}']]],
      // XXX=I: eyom: SoD also shows every Eye, pausing for several seconds before going to next; we should do the same, plus allow breaking out of this by clicking anywhere (in non-classic mode)
    ]),
    // Visiting a Hut of the Magi illuminates locations around an Eye of the Magi.

    array_fill_keys($c_idolOfFortune, [
      bonus_effects([[$append, ['creature_luck',   +1, true, 'maxCombats' => 1]], 'ifDateDay' => 1]),
      bonus_effects([[$append, ['creature_luck',   +1, true, 'maxCombats' => 1]], 'ifDateDay' => 3]),
      bonus_effects([[$append, ['creature_luck',   +1, true, 'maxCombats' => 1]], 'ifDateDay' => 5]),
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]], 'ifDateDay' => 2]),
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]], 'ifDateDay' => 4]),
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]], 'ifDateDay' => 6]),
      bonus_effects([
        [
          $append,
          ['creature_luck',   +1, true, 'maxCombats' => 1],
          ['creature_morale', +1, true, 'maxCombats' => 1],
        ],
        'ifDateDay' => 7,
      ]),
      ['quest_message', [$const, [toMarkup($adve[63], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [$luck = toMarkup($adve[62], '`{LuckImage +1`}`{Audio XXX=ID:dbos:`}')]], 'ifDateDay' => 1],
      ['bonus_message', [$const, [$luck]], 'ifDateDay' => 3],
      ['bonus_message', [$const, [$luck]], 'ifDateDay' => 5],
      ['bonus_message', [$const, [$morale = toMarkup($adve[62], '`{MoraleImage +1`}`{Audio XXX=ID:dbos:`}')]], 'ifDateDay' => 2],
      ['bonus_message', [$const, [$morale]], 'ifDateDay' => 4],
      ['bonus_message', [$const, [$morale]], 'ifDateDay' => 6],
      ['bonus_message', [$const, [toMarkup($adve[62], '`{LuckImage +1`} `{MoraleImage +1`}`{Audio XXX=ID:dbos:`}')]], 'ifDateDay' => 7],
    ]),
    // +1 Luck until the next battle, on odd days of the week not Day7.
    // +1 Morale until next battle, on even days of the week.
    // +1 Luck and Morale until next battle, on Day7.

    array_fill_keys($c_leanTo, [
      ['quest_chances', $chances('W M O C S J', 'lean')],
      ['quest_fulfilled', $o_false, 'ifGrantedMin' => 1],
      ['quest_message', [$const, [toMarkup($adve[65], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[64], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // +1-4 of any resource other than gold.
    'leanW' => [['bonus_resource', [$random, 1, 4], 'ifResource' => $wood,    'ifTargetPlayer' => -1]],
    'leanM' => [['bonus_resource', [$random, 1, 4], 'ifResource' => $mercury, 'ifTargetPlayer' => -1]],
    'leanO' => [['bonus_resource', [$random, 1, 4], 'ifResource' => $ore,     'ifTargetPlayer' => -1]],
    'leanC' => [['bonus_resource', [$random, 1, 4], 'ifResource' => $crystal, 'ifTargetPlayer' => -1]],
    'leanS' => [['bonus_resource', [$random, 1, 4], 'ifResource' => $sulfur,  'ifTargetPlayer' => -1]],
    'leanJ' => [['bonus_resource', [$random, 1, 4], 'ifResource' => $gems,    'ifTargetPlayer' => -1]],

    array_fill_keys($c_libraryOfEnlightenment, [
      // Determined empirically that level 10+ starts working.
      ['quest_fulfilled', [$check, 'level', 10]],
      bonus_effects([[$append,
        ['hero_attack',     +2, true],
        ['hero_defense',    +2, true],
        ['hero_spellPower', +2, true],
        ['hero_knowledge',  +2, true],
      ]]),
      ['quest_message', [$custom, 'rules', 3,
       toMarkup($adve[68], '`{Audio XXX=ID:dbos:`}'),
       toMarkup($adve[67], '`{Audio XXX=ID:dbos:`}')]],
      ['bonus_message', [$const, [toMarkup($adve[66], '`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // Possibly gives visiting hero +2 Attack, +2 Defense, +2 Power, +2 Knowledge.

    array_fill_keys($c_lighthouse, [
      ['quest_fulfilled', [$check, 'quest', 'O']],
      bonus_effects([[$append,
        ['hero_actionPoints', +200, 'ifPlayer' => true, 'ifVehicle' => array_search('ship', AObject::vehicle), 'whileOwned' => true, 'whileOwnedPlayer' => true],
      ]]),
      ['bonus_message', [$const, [toMarkup($adve[69], '`{Audio LIGHTHOUSE`}')]]],
    ]),
    // +5 Sea mobility for your ships for each lighthouse you own.

    // No Effects needed.
    //array_fill_keys($c_monolithOneWayEntrance, []),
    // Teleports hero one-way to a specific map location.

    array_fill_keys($c_monolithOneWayExit, [
      // No audio in this message.
      ['bonus_message', [$const, [$adve[70]]]],
    ]),
    // Exit point for a hero teleporting through a one-way entrance.

    // No Effects needed.
    //array_fill_keys($c_monolithTwoWay, []),
    // Teleports a hero to another two-way monolith, with the ability to return to the gate of origin.

    array_fill_keys($c_schoolOfMagic, [
      ['quest_fulfilled', [$check, 'resources_gold', 1000]],
      ['quest_choices', [$append, 'spellPower', 'knowledge', 'cancel']],
      ['bonus_resource', -1000, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
      ['quest_message', [$custom, 'rules', 3,
       str_replace('1000 gold', '`{Checks`}', toMarkup($adve[73], '`{Audio XXX=ID:dbos:`}')),
       toMarkup($adve[72], '`{Audio XXX=ID:dbos:`}')]],
    ]),
    // Pay 1000 gold to increase the Power or Knowledge of your hero by +1.

    array_fill_keys($c_magicSpring, [
      ['quest_fulfilled', [$check, 'spellPointsMax', 0, 2]],
      ['bonus_spellPoints', [$custom, 'rules'], 'ifTargetObject' => -1],
      ['bonus_spellPoints', 2.0, 'ifTargetObject' => -1],
      // Magic Spring stops working for everybody if someone visits it, for the week. It's possible to visit two different Magic Springs and both will work.
      bonus_effects([[$append, ['quest_fulfilled', [$check, false], 'ifBonusObject' => true, 'maxDays' => -1]]]),
      ['quest_message', [$custom, 'rules', 2,
       toMarkup($adve[76], '`{Audio XXX=ID:dbos:`}'),
       toMarkup($adve[75], '`{Audio XXX=ID:dbos:`}')]],
      ['bonus_message', [$const, [toMarkup($adve[74], '`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // Replenishes spell points, then doubles the amount.

    array_fill_keys($c_magicWell, array_merge(
      [
        ['quest_fulfilled', [$check, 'spellPointsMax', 0, 1]],
        ['bonus_spellPoints', [$custom, 'rules'], 'ifTargetObject' => -1],
        ['quest_message', [$custom, 'rules', 2,
         toMarkup($adve[78], '`{Audio XXX=ID:dbos:`}')]],
        ['bonus_message', [$const, [toMarkup($adve[77], '`{Audio XXX=ID:dbos:`}')]]],
      ],
      $e0(
        PHP_INT_MAX,
        $c_magicWell,
        // Magic Well stops working only for the particular hero, for the day. However, all Magic Wells stop working for that day, not only the visited one.
        bonus_effects([[$append, ['quest_fulfilled', [$check, false], true, 'ifBonusObjectClass' => PHP_INT_MAX, 'maxDays' => 1]]])
      )
    )),
    // Replenishes spell points.

    //array_fill_keys($c_marketOfTime, [XXX=I]),

    array_fill_keys($c_mercenaryCamp, [
      bonus_effects([[$append, ['hero_attack', +1, true]]]),
      ['quest_message', [$const, [toMarkup($adve[81], '`{Audio NOMAD`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[80], '`<`{StatImage attack`} +1 Attack Skill`>`{Audio NOMAD`}')]]],
    ]),
    // Hero receives +1 Attack.

    array_fill_keys($c_mermaids, [
      bonus_effects([[$append, ['creature_luck', +1, true, 'maxCombats' => 1]]]),
      ['quest_message', [$const, [toMarkup($adve[82], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[83], '`{LuckImage +1`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // +1 Luck until next battle.

    array_fill_keys($c_mysticalGarden, [
      ['quest_chances', $chances('gold500 gems5')],
      ['quest_reset', [$const, ['R']]],
      bonus_effects([[$const, [['quest_fulfilled', $o_false, 'maxDays' => -1, 'ifBonusObject' => true]]]]),
      ['quest_message', [$const, [toMarkup($adve[93], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[92], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // 50% chance to get +500 Gold.
    // 50% chance to get 05 Gems.
    // Replenishes on Day 1 of each week.
    'gold500' => [['bonus_resource', 500, 'ifResource' => $gold, 'ifTargetPlayer' => -1]],
    'gems5'   => [['bonus_resource', 5,   'ifResource' => $gems, 'ifTargetPlayer' => -1]],

    array_fill_keys($c_oasis, [
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]]]),
      ['bonus_actionPoints', +8, 'ifTargetObject' => -1],
      ['quest_message', [$const, [toMarkup($adve[94], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[95], '`{MoraleImage +1`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // +1 Morale until the next battle.
    // +8 Movement until the end of the day.

    //array_fill_keys($c_obelisk, [XXX=I]),
    // Reveals portion of the Puzzle Map.

    array_fill_keys(array_merge($c_redwoodObservatory, $c_pillarOfFire), [
      ['bonus_shroud', [$append, ['WithinCircle', null, null, 20, null, null, $shr_observatory, true]], 'ifTargetPlayer' => -1],
    ]),
    array_fill_keys($c_redwoodObservatory, [
      ['bonus_message', [$const, [toMarkup($adve[98], '`{Audio LIGHTHOUSE`}')]]],
    ]),
    // Shroud is removed from all tiles within 20 tiles of the Observatory.
    array_fill_keys($c_pillarOfFire, [
      ['bonus_message', [$const, [toMarkup($adve[99], '`{Audio LIGHTHOUSE`}')]]],
    ]),
    // Shroud is removed from all tiles within 20 tiles.

    array_fill_keys($c_oceanBottle, [
      ['quest_remove', true],
      ['bonus_message', [$randomSign]],
    ]),
    // Acts like a Sign, but on the water.

    array_fill_keys($c_starAxis, [
      bonus_effects([[$append, ['hero_spellPower', +1, true]]]),
      ['quest_message', [$const, [toMarkup($adve[101], '`{Audio GAZEBO`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[100], '`<`{StatImage spellPower`} +1 Spell Power`>`{Audio GAZEBO`}')]]],
    ]),
    // Hero receives +1 Power.

    array_fill_keys($c_prison, [
      ['quest_remove', true],
      ['bonus_message', [$const, [$adve[102].'`{Audio ROGUE`}']]],
    ]),
    // Free a specific hero.  Joins you for free.

    array_fill_keys($c_pyramid, [
      ['quest_chances', $chances($level5, 's_')],
      ['quest_garrison', [$const, [$goldGolem => 40, $diamondGolem => 20]]],
      bonus_effects([[$append, ['creature_luck', -2, true, 'maxCombats' => 1]], 'ifGrantedMin' => 1]),
      ['quest_fulfilled', [$check, false], 'ifGrantedMin' => 1],
      ['quest_fulfilled', [$check, 'artifact', nameToID("$outPath/artifacts", 'spellBook')]],
      ['quest_fulfilled', [$check, 'skill', nameToID("$outPath/skills", 'wisdom'), array_search('expert', Skill::mastery)]],
      // No audio in quest/bonus messages.
      ['quest_message', [$custom, 'rules', 1,
       "$adve[106]'`{Databank spells`, name`, m`}'.$adve[109]",
       "$adve[106]'`{Databank spells`, name`, m`}'.$adve[108]",
       "$adve[107]\n\n`{LuckImage -2`}"]],
      // XXX=IC Slightly different message from SoD
      ['bonus_message', [$const,
       ["$adve[106]'`{Databank spells`, name`, m`}'.\n\n`{SpellImage m`}"]]],
    ]),
    // Defeat 40 Gold Golems and 20 Diamond Golems for a random 5th level spell.
    // If hero doesn't have the wisdom to learn the spell, the spell is lost.
    // Visiting the Pyramid after defeating the guardians results in -2 Luck until next battle.

    array_fill_keys($c_rallyFlag, [
      bonus_effects([[$append,
        ['creature_luck',   +1, true, 'maxCombats' => 1],
        ['creature_morale', +1, true, 'maxCombats' => 1],
      ]]),
      ['bonus_actionPoints', +4, 'ifTargetObject' => -1],
      ['quest_message', [$const, [toMarkup($adve[110], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[111], '`{MoraleImage +1`} `{LuckImage +1`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // +1 Luck.
    // +1 Morale until the next battle.
    // +4 adventure movement until the end of the day.

    array_fill_keys(array_merge($c_spellScroll, $c_artifact, $c_randomArtifact, $c_randomMajorArtifact, $c_randomMinorArtifact, $c_randomTreasureArtifact, $c_randomRelic), [
      ['quest_remove', true],
      // XXX=IC SoD doesn't play sound for Spell Scroll
      ['bonus_message', [$const, ["`{Audio TREASURE`}`{Databank artifacts`, encounterText`, artifacts`}\n\n`{BonusesImages`}"]]],
      // bonus_artifacts is added in H3.Rules (for random) or in h3m2herowo.php.
    ]),
    // XXX=C,I SoD sometimes (randomly?) adds quests to some artifact objects (have Wisdom, have Leadership, have gold, have gold and precious resource, etc(?)); this needs research
    //
    // randomArtifact: Places a random artifact on the Adventure Map.  Artifact can be any class.  Grail is excluded.
    //
    // randomTreasureArtifact: Places a random Treasure class artifact on the Adventure Map.
    //
    // randomMinorArtifact: Places a random Minor class artifact on the Adventure Map.
    //
    // randomMajorArtifact: Places a random Major class artifact on the Adventure Map.
    //
    // randomRelic: Places a random Relic class artifact on the Adventure Map.
    //
    // spellScroll: This scroll contains a spell, which is added into a hero’s spell book for as long as you carry the scroll.
    //
    // I think I've seen another (unused?) class for spell scroll somewhere. At least the editor's help has this second entry:
    //
    // 01 spell per scroll.  Appears in hero's spell book if artifact is equipped.

    // No Effects needed.
    //array_fill_keys($c_randomHero, []),
    // At the start of the game, a random hero is chosen from all classes.
    //
    // If a town alignment is chosen, choices are limited to those classes associated with the town alignment.

    array_fill_keys(array_merge($c_monster, $c_randomMonster, $c_randomMonster1, $c_randomMonster2, $c_randomMonster3, $c_randomMonster4, $c_randomMonster5, $c_randomMonster6, $c_randomMonster7), [
      ['quest_remove', true],
      ['quest_removeAudio', 'KILLFADE'],
      // This is different from SoD that shows one message box for every piece of reward (a box for the artifact, then a box for each resource), all boxes with no text. This looks strange so we show a combined bank-like message instead.
      ['bonus_message', [$custom, 'rules', 1,
       sprintf(toMarkup($adve[34], ''), 'monsters', '`{Bonuses`}')]],
    ]),
    //
    // randomMonster: At the start of the game, this object is replaced with a random monster, chosen from all the potential monsters.
    //
    // randomMonster1: At the start of the game, this object is replaced with a random level 1 monster, chosen from all the potential level 1monsters.
    //
    // randomMonster2: At the start of the game, this object is replaced with a random level 2 monster, chosen from all the potential level 2 monsters.
    //
    // randomMonster3: At the start of the game, this object is replaced with a random level 3 monster, chosen from all the potential level 3 monsters.
    //
    // randomMonster4: At the start of the game, this object is replaced with a random level 4 monster, chosen from all the potential level 4 monsters.
    //
    // randomMonster5: At the start of the game, this object is replaced with a random level 5 monster, chosen from all the potential level 5 monsters.
    //
    // randomMonster6: At the start of the game, this object is replaced with a random level 6 monster, chosen from all the potential level 6 monsters.
    //
    // randomMonster7: At the start of the game, this object is replaced with a random level 7 monster, chosen from all the potential level 7 monsters.

    // Other Effects are added by H3.Rules.
    array_fill_keys(array_merge($c_randomResource, $c_resource_0, $c_resource_1, $c_resource_2, $c_resource_3, $c_resource_4, $c_resource_5, $c_resource_6), [
      ['quest_remove', true],
      // PICKUP is played in the message window so no need to play it on object removal.
      ['quest_removeAudio', ''],
      // XXX+I instead of modal message show it in the right-side panel
      ['bonus_message', [$const, ["`{Audio PICKUP%02d`, 1`, 7`}You find `{Bonuses`}.\n\n`{BonusesImages`}"]]],
    ]),
    // randomResource: At the start of the game, this object is replaced with one of the seven resource types.

    array_fill_keys($c_resource_0, [
      ['bonus_resource', [$random, 5, 10], 'ifResource' => $wood,    'ifTargetPlayer' => -1, 'stack' => array_search('resource', H3Effect::stack)],
    ]),
    array_fill_keys($c_resource_1, [
      ['bonus_resource', [$random, 3, 6],  'ifResource' => $mercury, 'ifTargetPlayer' => -1, 'stack' => array_search('resource', H3Effect::stack)],
    ]),
    array_fill_keys($c_resource_2, [
      ['bonus_resource', [$random, 5, 10], 'ifResource' => $ore,     'ifTargetPlayer' => -1, 'stack' => array_search('resource', H3Effect::stack)],
    ]),
    array_fill_keys($c_resource_3, [
      ['bonus_resource', [$random, 3, 6],  'ifResource' => $sulfur,  'ifTargetPlayer' => -1, 'stack' => array_search('resource', H3Effect::stack)],
    ]),
    array_fill_keys($c_resource_4, [
      ['bonus_resource', [$random, 3, 6],  'ifResource' => $crystal, 'ifTargetPlayer' => -1, 'stack' => array_search('resource', H3Effect::stack)],
    ]),
    array_fill_keys($c_resource_5, [
      ['bonus_resource', [$random, 3, 6],  'ifResource' => $gems,    'ifTargetPlayer' => -1, 'stack' => array_search('resource', H3Effect::stack)],
    ]),
    array_fill_keys($c_resource_6, [
      ['bonus_resource', [$random, 5, 10, 100], 'ifResource' => $gold, 'ifTargetPlayer' => -1, 'stack' => array_search('resource', H3Effect::stack)],
    ]),

    // No Effects needed.
    //array_fill_keys($c_randomTown, []),
    // With this object, a player may choose a specific town type, or let the computer choose it for them.

    //array_fill_keys($c_refugeeCamp, [XXX=I]),
    // Random creature type available for recruiting every 7 days.

    // Has entry in spotEffectsOfObject.
    array_fill_keys($c_sanctuary, [
      ['bonus_message', [$const, [$adve[114].'`{Audio GETPROTECTION`}']]],
    ]),
    // Hero residing here cannot be attacked.

    // XXX=C: sclr: what happens if hero has no room for more secondary skills?
    //
    // XXX+I:sclr: a cap on the number of secondary skills should be enforced like in SoD
    //
    // XXX+I: sclr: SoD never chooses a spell bonus if hero's no book
    array_fill_keys($c_scholar, [
      ['quest_chances', [$const,
        array_merge(
          array_fill_keys(preg_replace('/^/', 's_',  $spells), (int) (1000 / count($spells))),
          array_fill_keys(preg_replace('/^/', 'sk_', $skills), (int) (1000 / count($skills))),
          ['attack' => 1000/4, 'defense' => 1000/4, 'spellPower' => 1000/4, 'knowledge' => 1000/4]
        ),
      ]],
      // The default check of 'S' fails because quest_chances is applied before the check, adding hero_attack Effect to the hero and making the Scholar object "already visited".
      ['quest_fulfilled', [$const, true]],
      ['quest_remove', true],
      ['bonus_message', [$const, [toMarkup($adve[115], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // Learn 1 spell, one secondary skill, or one primary skill.
    // Scholar then disappears.
    //
    // The help text is wrong: Scholar gives at least level 2 spells as well.
    // Don't know about 3+ (XXX=C).
    $e00($spells, [
      // Also used by h3m2herowo.php.
      's_$' => [
        // Dummy Effect to store the chosen spell's ID somewhere recognizable by `{Databank ...`, $encounterLabel`}.
        ['hero_spells', $e, 0, 'encounterLabel' => 'm'],
        bonus_effects([
          [$append, ['hero_spells', [$append, $e], true]], 'ifBonusObject' => true,
        ]),
      ],
    ]),
    $e00(PHP_INT_MAX, $skills, [
      'sk_$' => [
        bonus_effects([
          [
            $append,
            ['hero_skills', [$append, $e], true],
            ['skillMastery', +1, true, 'ifSkill' => PHP_INT_MAX],
          ],
          'ifBonusObject' => true,
        ]),
      ],
    ]),
    'attack'     => [['hero_attack',     +1, true, 'ifBonusObject' => null]],
    'defense'    => [['hero_defense',    +1, true, 'ifBonusObject' => null]],
    'spellPower' => [['hero_spellPower', +1, true, 'ifBonusObject' => null]],
    'knowledge'  => [['hero_knowledge',  +1, true, 'ifBonusObject' => null]],

    array_fill_keys($c_seaChest, [
      ['quest_chances', $chances('nothing/2 gold1500/7 gartT/1')],
      ['quest_remove', true],
      ['bonus_message', [$custom, 'rules', 1,
       str_replace('1500 gold', '`{Bonuses`}', toMarkup($adve[118], '`{BonusesImages`}`{Audio CHEST`}')),
       toMarkup($adve[116], '`{Audio CHEST`}')]],
    ]),
    // 20% for nothing.
    // 70% chance for 1500 gold.
    // 10% chance for 1500 gold and 1 random Treasure Artifact.
    // If backpack is full, get 1500 gold.
    'gartT' => [
      ['bonus_resource', 1500, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
      ['bonus_artifacts', array_merge([$randomArray, 1], $common)],
    ],
    // XXX=C can backpack be full? see also other effects here

    // Other Effects are defined by map convertor.
    array_fill_keys($c_questGuard, [
      ['quest_choices', [$append, 'claim', 'cancel']],
      ['quest_remove', true],
      ['quest_message', [$custom, 'rules', 5, null, $seer[1][4].'`{Audio XXX=ID:dbos:`}'], 'stack' => array_search('quest', H3Effect::stack)],
    ]),
    // Usually place at choke points, a hero must complete a quest in order to pass.

    // Defined by map convertor.
    array_fill_keys($c_seerHut, [
      ['quest_fulfilled', $o_false, 'ifGrantedMin' => 1],
      ['quest_choices', [$append, 'claim', 'cancel']],
    ]),
    // Heroes may complete a Seer’s Quest for a reward.
    // Map Makers must specify the quest.

    // The following quest_message are defined for Quest Guard and Seer's Hut:
    // - (QG, 0) here - QG deadline (rules/5//msg)
    // - (QG, 1) h3m2herowo.php - QG without quest (const/[])
    // - (no stack) H3.Rules - $progress (rules/5/msg/)
    // - (SH, no stack) H3.Rules - abandoned Hut (rules/5//msg)

    // Other properties are defined by write_banks().
    array_fill_keys($c_crypt, [
      bonus_effects([[$append, ['creature_morale', -1, true, 'maxCombats' => 1]], 'ifGrantedMin' => 1]),
      // No audio in this message because it always appears after a prompt that does have audio.
      ['quest_message', [$const, [toMarkup($adve[120], '`{MoraleImage -1`}')]]],
    ]),
    // 30% chance to fight 30 Skeletons and 20 Zombies for 1000 gold.
    //
    // 30% chance to fight 25 Skeletons, 20 Zombies, and 5 Wights for 2000 gold.
    //
    // 30% chance to fight 20 Skeletons, 20 Zombies, 10 Wights, and 5 Vampires for 2500 gold and 1 Treasure Artifact.
    //
    // 10% chance to fight 20 Skeletons, 20 Zombies, 10 Wights, and 10 Vampires for 5000 gold and 1 Treasure Artifact.
    //
    // -1 Morale if you visit the crypt and the guardians have already been defeated.

    // Other properties are defined by write_banks().
    array_fill_keys($c_shipwreck, [
      bonus_effects([[$append, ['creature_morale', -1, true, 'maxCombats' => 1]], 'ifGrantedMin' => 1]),
      // No audio in this message because it always appears after a prompt that does have audio.
      ['quest_message', [$const, [toMarkup($adve[123], '`{MoraleImage -1`}')]]],
      // XXX+C: shwr: is shipwreck impassable from ground? it stands on water and pathcost may consider it passable for water only (in SoD it's passable for both because the hero doesn't move onto the object when interacting with it)
    ]),
    // 30% chance to fight 10 Wights for 2000 gold.
    //
    // 30% chance to fight 15 Wights for 3000 gold.
    //
    // 30% chance to fight 25 Wights for 4000 gold and 1 random treasure artifact.
    //
    // 10% chance to fight 50 Wights for 5000 gold and 1 random minor artifact.
    //
    // -1 Morale if you visit the shipwreck and the guardians have already been defeated.

    array_fill_keys($c_shipwreckSurvivor, [
      ['quest_chances', $chances('artT/55 artM/20 artJ/20 artR/5')],
      ['quest_remove', true],
      ['bonus_message', [$const, [sprintf(toMarkup($adve[127], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}'), '`{Bonuses`}')]]],
    ]),
    // Receive 1 random artifact.
    // 55% Treasure Artifact.
    // 20% Minor Artifact
    // 20% Major Artifact
    // 05% Relic Artifact
    'artT' => [['bonus_artifacts', array_merge([$randomArray, 1], $common), 'encounterLabel' => 'a']],
    'artM' => [['bonus_artifacts', array_merge([$randomArray, 1], $minor),  'encounterLabel' => 'a']],
    'artJ' => [['bonus_artifacts', array_merge([$randomArray, 1], $major),  'encounterLabel' => 'a']],
    'artR' => [['bonus_artifacts', array_merge([$randomArray, 1], $relic),  'encounterLabel' => 'a']],

    // No Effects needed.
    //array_fill_keys($c_shipyard, []),
    // Purchase a ship.

    array_fill_keys($c_shrineOfMagicIncantation, [
      ['quest_chances', $chances($level1, 's_')],
      ['quest_fulfilled', [$check, 'artifact', nameToID("$outPath/artifacts", 'spellBook')]],
      ['quest_message', [$custom, 'rules', 1,
       toMarkup($adve[127])."`{Databank spells`, name`, m`}.$adve[131]`{Audio TEMPLE`}",
       null,
       toMarkup($adve[127])."`{Databank spells`, name`, m`}.$adve[174]`{Audio TEMPLE`}"]],
      ['bonus_message', [$const,
       [toMarkup($adve[127])."`{Databank spells`, name`, m`}.\n\n`{SpellImage m`}`{Audio TEMPLE`}"]]],
    ]),
    // Learn level 1 spell.

    array_fill_keys($c_shrineOfMagicGesture, [
      ['quest_chances', $chances($level2, 's_')],
      ['quest_fulfilled', [$check, 'artifact', nameToID("$outPath/artifacts", 'spellBook')]],
      ['quest_message', [$custom, 'rules', 1,
       toMarkup($adve[128])."`{Databank spells`, name`, m`}.$adve[131]`{Audio TEMPLE`}",
       null,
       toMarkup($adve[128])."`{Databank spells`, name`, m`}.$adve[174]`{Audio TEMPLE`}"]],
      ['bonus_message', [$const,
       [toMarkup($adve[128])."`{Databank spells`, name`, m`}.\n\n`{SpellImage m`}`{Audio TEMPLE`}"]]],
    ]),
    // Learn level 2 spell.

    array_fill_keys($c_shrineOfMagicThought, [
      ['quest_chances', $chances($level3, 's_')],
      ['quest_fulfilled', [$check, 'artifact', nameToID("$outPath/artifacts", 'spellBook')]],
      ['quest_fulfilled', [$check, 'skill', nameToID("$outPath/skills", 'wisdom')]],
      ['quest_message', [$custom, 'rules', 1,
       toMarkup($adve[129])."`{Databank spells`, name`, m`}.$adve[131]`{Audio TEMPLE`}",
       toMarkup($adve[129])."`{Databank spells`, name`, m`}.$adve[130]`{Audio TEMPLE`}",
       toMarkup($adve[129])."`{Databank spells`, name`, m`}.$adve[174]`{Audio TEMPLE`}"]],
      // XXX+I spells are not handled by Bonuses/Images
      //['bonus_message', [$append,
      // toMarkup($adve[129])."`{Bonuses`}.\n\n`{BonusesImages`}"]],
      ['bonus_message', [$const,
       [toMarkup($adve[129])."`{Databank spells`, name`, m`}.\n\n`{SpellImage m`}`{Audio TEMPLE`}"]]],
    ]),
    // Learn random level 3 spell.

    array_fill_keys($c_sign, [
      ['bonus_message', [$randomSign]],
    ]),
    // Displays a message when visited.
    // Customizable.

    //array_fill_keys($c_sirens, [XXX=I]),
    // Lose 30% of each army and gain 1 experience point for each point of health for the lost creatures.

    array_fill_keys($c_stables, [
      bonus_effects([[$append, ['hero_actionPoints', +268, true, 'ifVehicle' => array_search('horse', AObject::vehicle), 'maxDays' => -1]]]),
      ['bonus_actionPoints', +6, 'ifTargetObject' => -1, 'ifVehicle' => array_search('horse', AObject::vehicle)],
      ['quest_message', [$const, [toMarkup($adve[136], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[137], '`{Audio XXX=ID:dbos:`}')]]],
      // XXX+I: stcv: upgrade cavaliers
    ]),
    // +6 movement each day until the end of the week.
    // Cavaliers are automatically upgraded to Champions.

    // No Effects needed.
    //array_fill_keys($c_tavern, []),
    // Recruit heroes.  Listen to rumors.

    array_fill_keys($c_temple, [
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]]]),
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]], 'ifDateDay' => 7]),
      ['quest_message', [$const, [toMarkup($adve[141], '`{Audio TEMPLE`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[140], '`{MoraleImage +1`}`{Audio TEMPLE`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[140], '`{MoraleImage +2`}`{Audio TEMPLE`}')]],
       'ifDateDay' => 7, 'priority' => 1],
    ]),
    // +1 Morale until next battle.
    // +2 Morale until next battle, on Day 7.

    //array_fill_keys($c_denOfThieves, [XXX=I]),
    // Gives complete thieves' guild information.

    //array_fill_keys($c_tradingPost, [XXX=I]),
    // Trade resources at the efficiency of 5 markets.

    array_fill_keys($c_learningStone, [
      ['bonus_experience', 1000, 'ifTargetObject' => -1],
      bonus_effects([[$const, [['quest_fulfilled', $o_false, true, 'ifBonusObject' => true]]]]),
      ['quest_message', [$const, [toMarkup($adve[144], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[143], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}')]]],
    ]),
    // +1000 experience points.

    array_fill_keys($c_treasureChest, [
      ['quest_chances', $chances('ge500/32 ge1000/32 ge1500/31 chArtT/5')],
      ['quest_remove', true],
    ]),
    // 32% chance for 1000 gold or 500 experience. (Wood)
    //
    // 32% chance for 1500 gold or 1000 experience. (Silver)
    //
    // 31% chance for 2000 gold or 1500 experience. (Gold)
    //
    // 05% chance for random treasure artifact.  If backpack is full, get choice of 1000 gold or 500 experience. (Gold)
    'ge500'     => [['quest_choices', [$append, 'gold1000', 'exp500']]],
    'ge1000'    => [['quest_choices', [$append, 'gold1500', 'exp1000']]],
    'ge1500'    => [['quest_choices', [$append, 'gold2000', 'exp1500']]],
    'gold1000'  => [['bonus_resource',   1000, 'ifResource' => $gold, 'ifTargetPlayer' => -1]],
    'gold1500'  => [['bonus_resource',   1500, 'ifResource' => $gold, 'ifTargetPlayer' => -1]],
    'gold2000'  => [['bonus_resource',   2000, 'ifResource' => $gold, 'ifTargetPlayer' => -1]],
    'exp500'    => [['bonus_experience', 500,  'ifTargetObject' => -1]],
    'exp1000'   => [['bonus_experience', 1000, 'ifTargetObject' => -1]],
    'exp1500'   => [['bonus_experience', 1500, 'ifTargetObject' => -1]],
    'chArtT' => [
      ['bonus_artifacts', array_merge([$randomArray, 1], $common)],
      ['bonus_message', [$const, [sprintf(toMarkup($adve[145], '`{BonusesImages`}`{Audio CHEST`}'), '`{Bonuses`}`{Audio CHEST`}')]]],
    ],

    array_fill_keys($c_treeOfKnowledge, [
      ['quest_chances', $chances('lupDo/34 lupG/33 lupJ/33')],
      ['bonus_experience', [$custom, 'rules'], 'ifTargetObject' => -1],
      bonus_effects([[$const, [['quest_fulfilled', [$check, false], true, 'ifBonusObject' => true]]]]),
      ['quest_message', [$custom, 'rules', 2,
       str_replace('2000 gold', '`{Checks`}', toMarkup($adve[150], '`{Audio XXX=ID:dbos:`}')),
       toMarkup($adve[147], '`{Audio XXX=ID:dbos:`}')]],
    ]),
    // 34% Chance of paying 0 gold for a hero to advance to his next level of experience.
    //
    // 33% Chance of paying 2000 gold for a hero to advance to his next level of experience.
    //
    // 33% Chance of paying 10 gems for a hero to advance to his next level of experience.
    'lupDo' => [
      // XXX=I the message should appear before LevelUp window
      //
      // XXX Audio for lupDo is the same as for choices with lupG/J
      ['bonus_message', [$const, [toMarkup($adve[148], '`<`{StatImage experience`} +1 Level`>`{Audio XXX=ID:dbos:`}')]]],
    ],
    'lupG' => [
      ['quest_fulfilled', [$check, 'resources_gold', 2000]],
      ['quest_choices', [$append, 'lupGDo', 'cancel']],
    ],
    'lupGDo' => [
      ['bonus_resource', -2000, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
    ],
    'lupJ' => [
      ['quest_fulfilled', [$check, 'resources_gems', 10]],
      ['quest_choices', [$append, 'lupJDo', 'cancel']],
    ],
    'lupJDo' => [
      ['bonus_resource', -10, 'ifResource' => $gems, 'ifTargetPlayer' => -1],
    ],

    // No Effects needed.
    //array_fill_keys($c_subterraneanGate, []),
    // Entering the Subterranean Gate leads to the Underground Map, if any.

    //array_fill_keys($c_university, [XXX=I]),
    // Pay 2000g for a 'new' Secondary Skill.

    array_fill_keys($c_wagon, [
      ['quest_chances', [$const,
        $chances('nothing/10 artT/20 artM/20')[1] +
        $chances('W/8 M/8 O/8 C/8 S/8 J/8', 'wagon')[1]]],
      ['quest_fulfilled', $o_false, 'ifGrantedMin' => 1],
      ['quest_message', [$const, [toMarkup($adve[156], '`{Audio XXX=ID:dbos:`}')]]],
      ['bonus_message', [$custom, 'rules', 0,
      // XXX=IC Slightly different message from SoD
      str_replace("the '%s'", '`{Bonuses`}', toMarkup($adve[155], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}')),
      toMarkup($adve[154], '`{BonusesImages`}`{Audio XXX=ID:dbos:`}')]],
    ]),
    // 10% chance for nothing.
    //
    // 40% chance for 1 random Treasure or Minor artifact.  If backpack is full, you get nothing.
    //
    // 50% chance for 2-5 of any resource but gold.
    'wagonW' => [['bonus_resource', [$random, 2, 5], 'ifResource' => $wood,    'ifTargetPlayer' => -1]],
    'wagonM' => [['bonus_resource', [$random, 2, 5], 'ifResource' => $mercury, 'ifTargetPlayer' => -1]],
    'wagonO' => [['bonus_resource', [$random, 2, 5], 'ifResource' => $ore,     'ifTargetPlayer' => -1]],
    'wagonC' => [['bonus_resource', [$random, 2, 5], 'ifResource' => $crystal, 'ifTargetPlayer' => -1]],
    'wagonS' => [['bonus_resource', [$random, 2, 5], 'ifResource' => $sulfur,  'ifTargetPlayer' => -1]],
    'wagonJ' => [['bonus_resource', [$random, 2, 5], 'ifResource' => $gems,    'ifTargetPlayer' => -1]],

    array_fill_keys($c_warMachineFactory, [
      ['quest_choices', [$append, 'hire', 'cancel']],
    ]),
    // Purchase any of the three war machines.

    array_fill_keys($c_schoolOfWar, [
      ['quest_fulfilled', [$check, 'resources_gold', 1000]],
      ['quest_choices', [$append, 'attack', 'defense', 'cancel']],
      ['bonus_resource', -1000, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
      ['quest_message', [$custom, 'rules', 3,
      str_replace('1000 gold', '`{Checks`}', toMarkup($adve[160], '`{Audio MILITARY`}')),
      toMarkup($adve[159], '`{Audio MILITARY`}')]],
    ]),
    // Pay 1000 gold to increase the Attack or Defense of the visiting hero by +1.

    // As with other similar objects (Crypt, etc.), revisiting Warrior's Tomb while still have the negative morale effect results in the same message displayed but no more morale modifiers added.
    array_fill_keys($c_warriorTomb, [
      ['quest_chances', $chances('artT/30 artM/50 artJ/15 artR/5')],
      // On the first encounter, quest_chances is not initialized yet so there's nothing to quest_reset (it's queried before quest_chances). On subsequent encounters, this removes Effects of quest_chances but doesn't reset the $initialized['random'] so quest_chances Effects are not re-applied and the visitor gets nothing but bad morale.
      //
      // $ifGrantedMin prevents removal if nobody claimed the reward yet. This is good practice and recommended in case of Warrior's Tomb since it has a prompt message and so the encounter can be interrupted (see the description of GenericEncounter for details).
      ['quest_reset', [$append, 'a'], 'ifGrantedMin' => 1],
      bonus_effects([[$const, [['creature_morale', -3, true, 'maxCombats' => 1]]]]),
      // No audio in this message because it always appears after a prompt that does have audio.
      ['quest_message', [$const, [toMarkup($adve[163], '`{MoraleImage -3`}')]]],
      // No audio for this message.
      ['bonus_message', [$const,
       [sprintf(toMarkup($adve[162], ''), '`{Bonuses`}')]]],
    ]),
    // Ransack grave for 1 random artifact and -3 morale.
    // 30% Treasure Artifact.
    // 50% Minor Artifact
    // 15% Major Artifact
    // 05% Relic Artifact

    array_fill_keys($c_waterWheel, [
      ['bonus_resource', 1000, 'ifResource' => $gold, 'ifTargetPlayer' => -1],
      ['bonus_resource', -500, 'ifResource' => $gold, 'ifTargetPlayer' => -1, 'ifDateWeek' => 1],
      bonus_effects([[$const, [['quest_fulfilled', $o_false, 'maxDays' => -1, 'ifBonusObject' => true]]]]),
      ['quest_message', [$const, [toMarkup($adve[165], '`{Audio XXX=ID:dbs:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[164], '`{BonusesImages`}`{Audio XXX=ID:dbs:`}')]]],
    ]),
    // Week 1 gives 500 gold.
    // Each subsequent week is set to give 1000 gold.

    array_fill_keys($c_wateringHole, [
      bonus_effects([[$append, ['creature_morale', +1, true, 'maxCombats' => 1]]]),
      ['bonus_actionPoints', +4, true, 'ifTargetObject' => -1],
      ['quest_message', [$const, [toMarkup($adve[167], '`{Audio XXX=ID:dbs:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[166], '`{MoraleImage +1`}`{Audio XXX=ID:dbs:`}')]]],
    ]),
    // +1 Morale until next battle.
    // +4 Adventure movement until the end of the day.

    // No Effects needed.
    //array_fill_keys($c_whirlpool, []),
    // Teleports hero to another Whirlpool at the cost of 50% of the weakest troop in the hero's army.

    array_fill_keys($c_windmill, [
      ['quest_chances', $chances('M O C S J', 'wind')],
      ['quest_reset', [$const, ['R']]],
      bonus_effects([[$const, [['quest_fulfilled', $o_false, 'maxDays' => -1, 'ifBonusObject' => true]]]]),
      ['quest_message', [$const, [toMarkup($adve[169], '`{Audio XXX=ID:dbs:`}')]]],
      ['bonus_message', [$const, [toMarkup($adve[170], '`{BonusesImages`}`{Audio XXX=ID:dbs:`}')]]],
    ]),
    // +03-06 of any random resource other than Wood or Gold.
    'windM' => [['bonus_resource', [$random, 3, 6], 'ifResource' => $mercury,  'ifTargetPlayer' => -1]],
    'windO' => [['bonus_resource', [$random, 3, 6], 'ifResource' => $ore,      'ifTargetPlayer' => -1]],
    'windC' => [['bonus_resource', [$random, 3, 6], 'ifResource' => $crystal, 'ifTargetPlayer' => -1]],
    'windS' => [['bonus_resource', [$random, 3, 6], 'ifResource' => $sulfur,  'ifTargetPlayer' => -1]],
    'windJ' => [['bonus_resource', [$random, 3, 6], 'ifResource' => $gems,     'ifTargetPlayer' => -1]],

    // XXX=C ADVEVENT.TXT[190] suggests that Witch Hut can be deserted
    array_fill_keys($c_witchHut, [
      [
        'quest_chances',
        // This allows default skills when not overridden in the editor, i.e. all
        // but Leadership and Necromancy (SoD behaviour).
        // However, the override may specify any existing skills, including those,
        // so need to declare all skills as wk_$ (used in h3m2herowo.php).
        $chances(array_diff_key($skills, ['leadership' => 1, 'necromancy' => 1]), 'wk_'),
      ],
      // XXX should count "visible" skills, filtered by source?
      ['quest_fulfilled', [$check, 'skillCount', 0, 7]],
    ]),
    // Random Secondary Skill other than Leadership or Necromancy.
    $e00(
      PHP_INT_MAX,
      function ($v, $s) use ($skillStore) {
        is_string($s) and $s = strtr($s, ['`SKILLID' => $v, '`SKILL' => $skillStore->atCoords($v, 0, 0, 'name', 0)]);
        return $s;
      },
      $skills,
      [
        // Also used by h3m2herowo.php.
        'wk_$' => [
          ['quest_fulfilled', [$check, 'skill', $e, -1, 0]],
          bonus_effects([
            [
              $append,
              ['hero_skills', [$append, $e], true],
              ['skillMastery', [$clamp, array_search('basic', Skill::mastery)], true, 'ifSkill' => PHP_INT_MAX],
            ],
            'ifBonusObject' => true,
          ]),
          ['quest_message', [$custom, 'rules', 4,
           sprintf(toMarkup($adve[172], '`{Audio XXX=ID:dbos:`}'), '`SKILL'),
           sprintf(toMarkup($adve[173], '`{Audio XXX=ID:dbos:`}'), '`SKILL')]],
          ['bonus_message', [$const,
           [sprintf(toMarkup($adve[171], '`<`{SkillImage `SKILLID`, basic`} Basic `SKILL`>`{Audio XXX=ID:dbos:`}'), '`SKILL')]]],
        ],
      ]
    ),

    //array_fill_keys($c_freelancerGuild, [XXX=I]),
    // This allows you to exchange troops for resources.

    //array_fill_keys($c_heroPlaceholder, [XXX=I]),
    // This allows you to have a hero crossover from one scenario of a campaign to another.

    // No Effects needed.
    //array_fill_keys($c_randomDwelling, []),
    // Can be linked with specific towns.

    // No Effects needed.
    //array_fill_keys($c_randomDwellingByLevel, []),

    // No Effects needed.
    //array_fill_keys($c_randomDwellingByTown, []),

    // XXX=I a visit to already owned mine allows leaving garrison (for abandoned too)
    //
    // XXX=IC SoD doesn't play FLAGMINE for Abandoned Mine (but it plays it when entering an already owned AM to leave garrison)
    array_fill_keys(array_merge(['abandM'], $c_mine_1), [
      ['quest_fulfilled', [$check, 'quest', 'O']],
      bonus_effects([[$append, ['income', +1, 'ifPlayer' => true, 'ifResource' => $mercury, 'whileOwned' => true, 'whileOwnedPlayer' => true]]]),
      ['bonus_message', [$const, [toMarkup($minc[1], '`{ResourceImage mercury`, 1/day`}`{Audio FLAGMINE`}')]]],
    ]),
    array_fill_keys(array_merge(['abandC'], $c_mine_4), [
      ['quest_fulfilled', [$check, 'quest', 'O']],
      bonus_effects([[$append, ['income', +1, 'ifPlayer' => true, 'ifResource' => $crystal, 'whileOwned' => true, 'whileOwnedPlayer' => true]]]),
      ['bonus_message', [$const, [toMarkup($minc[4], '`{ResourceImage crystal`, 1/day`}`{Audio FLAGMINE`}')]]],
    ]),
    array_fill_keys(array_merge(['abandJ'], $c_mine_5), [
      ['quest_fulfilled', [$check, 'quest', 'O']],
      bonus_effects([[$append, ['income', +1, 'ifPlayer' => true, 'ifResource' => $gems, 'whileOwned' => true, 'whileOwnedPlayer' => true]]]),
      ['bonus_message', [$const, [toMarkup($minc[5], '`{ResourceImage gems`, 1/day`}`{Audio FLAGMINE`}')]]],
    ]),
    array_fill_keys(array_merge(['abandG'], $c_mine_6), [
      ['quest_fulfilled', [$check, 'quest', 'O']],
      bonus_effects([[$append, ['income', +1000, 'ifPlayer' => true, 'ifResource' => $gold, 'whileOwned' => true, 'whileOwnedPlayer' => true]]]),
      ['bonus_message', [$const, [toMarkup($minc[6], '`{ResourceImage gold`, 1000/day`}`{Audio FLAGMINE`}')]]],
    ]),
    array_fill_keys(array_merge(['abandO'], $c_mine_2), [
      ['quest_fulfilled', [$check, 'quest', 'O']],
      bonus_effects([[$append, ['income', +2, 'ifPlayer' => true, 'ifResource' => $ore, 'whileOwned' => true, 'whileOwnedPlayer' => true]]]),
      ['bonus_message', [$const, [toMarkup($minc[2], '`{ResourceImage ore`, 2/day`}`{Audio FLAGMINE`}')]]],
    ]),
    array_fill_keys($c_mine_0, [
      ['quest_fulfilled', [$check, 'quest', 'O']],
      bonus_effects([[$append, ['income', +2, 'ifPlayer' => true, 'ifResource' => $wood, 'whileOwned' => true, 'whileOwnedPlayer' => true]]]),
      ['bonus_message', [$const, [toMarkup($minc[0], '`{ResourceImage wood`, 2/day`}`{Audio FLAGMINE`}')]]],
    ]),
    array_fill_keys(array_merge(['abandS'], $c_mine_3), [
      ['quest_fulfilled', [$check, 'quest', 'O']],
      bonus_effects([[$append, ['income', +1, 'ifPlayer' => true, 'ifResource' => $sulfur, 'whileOwned' => true, 'whileOwnedPlayer' => true]]]),
      ['bonus_message', [$const, [toMarkup($minc[3], '`{ResourceImage sulfur`, 1/day`}`{Audio FLAGMINE`}')]]],
    ]),
    // Unlike artifacts and other objects, no matter its resource the Abandoned Mine
    // looks exactly the same so can be fully implemneted with quest_chances.
    array_fill_keys($c_mine_7, [
      ['quest_chances', $chances('M O S C J G', 'aband')],
      // Guards are defeated permanently. Another player captures the mine without a combat.
      //
      // Short form of override modifier.
      ['quest_garrison', [$troglodyte => [0, $random, 100, 200]], 'ifGrantedMax' => 0],  // XXX=C garrison count numbers
      // $minc[7] seems to be unused.
      //['bonus_message', [$const, [toMarkup($minc[7])]]],
    ]),
    // XXX ADVMAP's status bar text and RMB help box is as such: if player owns the mine "Abandoned Mine Owned by red player (Gems)", if doesn't and the mine has guards "Abandoned Mine Guarded by a throng of Troglodytes", if not guarded "Abandoned Mine Owned by red player"

    // Determined empirically by placing every dwelling object in the editor and visiting it in game.
    array_fill_keys($c_monastery,             [['quest_garrison', [$const, [$monk => 9]]]]),
    array_fill_keys($c_trainingGrounds,       [['quest_garrison', [$const, [$cavalier => 6]]]]),
    array_fill_keys($c_portalOfGlory,         [['quest_garrison', [$const, [$angel => 3]]]]),
    array_fill_keys($c_dendroidArches,        [['quest_garrison', [$const, [$dendroidGuard => 9]]]]),
    array_fill_keys($c_unicornGlade,          [['quest_garrison', [$const, [$unicorn => 6]]]]),
    array_fill_keys($c_dragonCliffs,          [['quest_garrison', [$const, [$greenDragon => 3]]]]),
    array_fill_keys($c_altarOfWishes,         [['quest_garrison', [$const, [$genie => 9]]]]),
    array_fill_keys($c_goldenPavilion,        [['quest_garrison', [$const, [$naga => 6]]]]),
    array_fill_keys($c_cloudTemple,           [['quest_garrison', [$const, [$giant => 3]]]]),
    array_fill_keys($c_hellHole,              [['quest_garrison', [$const, [$pitFiend => 9]]]]),
    array_fill_keys($c_fireLake,              [['quest_garrison', [$const, [$efreeti => 6]]]]),
    array_fill_keys($c_forsakenPalace,        [['quest_garrison', [$const, [$devil => 3]]]]),
    array_fill_keys($c_mausoleum,             [['quest_garrison', [$const, [$lich => 9]]]]),
    array_fill_keys($c_hallOfDarkness,        [['quest_garrison', [$const, [$blackKnight => 6]]]]),
    array_fill_keys($c_dragonVault,           [['quest_garrison', [$const, [$boneDragon => 3]]]]),
    array_fill_keys($c_labyrinth,             [['quest_garrison', [$const, [$minotaur => 9]]]]),
    array_fill_keys($c_manticoreLair,         [['quest_garrison', [$const, [$manticore => 6]]]]),
    array_fill_keys($c_dragonCave,            [['quest_garrison', [$const, [$redDragon => 3]]]]),
    array_fill_keys($c_cliffNest,             [['quest_garrison', [$const, [$roc => 9]]]]),
    array_fill_keys($c_cyclopsCave,           [['quest_garrison', [$const, [$cyclops => 6]]]]),
    array_fill_keys($c_behemothCrag,          [['quest_garrison', [$const, [$behemoth => 3]]]]),
    array_fill_keys($c_gorgonLair,            [['quest_garrison', [$const, [$gorgon => 9]]]]),
    array_fill_keys($c_wyvernNest,            [['quest_garrison', [$const, [$wyvern => 6]]]]),
    array_fill_keys($c_hydraPond,             [['quest_garrison', [$const, [$hydra => 3]]]]),
    array_fill_keys($c_earthElementalConflux, [['quest_garrison', [$const, [$earthElemental => 12]]]]),
    array_fill_keys($c_sulfurousLair,         [['quest_garrison', [$const, [$rustDragon => 3]]]]),
    array_fill_keys($c_altarOfThought,        [['quest_garrison', [$const, [$psychicElemental => 6]]]]),
    array_fill_keys($c_pyre,                  [['quest_garrison', [$const, [$firebird => 6]]]]),
    array_fill_keys($c_enchanterHollow,       [['quest_garrison', [$const, [$enchanter => 6]]]]),
    array_fill_keys($c_altarOfEarth,          [['quest_garrison', [$const, [$earthElemental => 12]]]]),
    array_fill_keys($c_frozenCliffs,          [['quest_garrison', [$const, [$azureDragon => 3]]]]),
    array_fill_keys($c_crystalCavern,         [['quest_garrison', [$const, [$crystalDragon => 3]]]]),
    array_fill_keys($c_magicForest,           [['quest_garrison', [$const, [$faerieDragon => 3]]]]),
    array_fill_keys($c_trollBridge,           [['quest_garrison', [$const, [$troll => 9]]]]),
    array_fill_keys($c_golemFactory,          [['quest_garrison', [$const, [$goldGolem => 9, $diamondGolem => 6]]]]),
    array_fill_keys($c_elementalConflux,      [['quest_garrison', [$const, [$earthElemental => 12]]]]),
  ]),

  // "Snippets" come from GENRLTXT.TXT.
  'spotEffectsOfObject' => $e([
    // Provide both "explored, not visible" shroud bit (via bonus_shroud) and
    // "visible" by increasing hero_shroud of heroes who stand on the object.
    array_fill_keys(array_merge($c_redwoodObservatory, $c_pillarOfFire), [
      ['hero_shroud', [$clamp, 20]],
    ]),

    array_fill_keys($c_sanctuary, [['canCombat', $o_false]]),

    // Anti-magic Garrison.
    // Class 33 subclass 1, class 219 subclass 1.
    //
    // There are 4 objects: two with class 33 and two with class 219.
    // Both groups have two subclasses: 0 (regular garrison) and
    // 1 (anti-magic).
    array_fill_keys(
      $c_garrison_1,
      [['combatCasts', 0.0, 'ifContext' => $combat]]
    ),
    // Location for storing troops at a choke point.
    // Spells cannot be cast in combat.

    // "No luck effects on cursed ground"
    // "No morale effects on cursed ground"
    // "Cursed Ground prevents all spellcasting except for level one spells".
    // All but first level spells can not be cast while on Cursed Ground.
    // In combat native terrain, luck and moral have no effect.
    array_fill_keys($c_cursedGround, [
      ['creature_luck',   0.0, 'ifContext' => $combat],
      ['creature_morale', 0.0, 'ifContext' => $combat],
      ['hero_spells', array_merge([$intersect], $level1)],
      // XXX=C affects creature spells?
      //['creature_spells', [$intersect]],
    ]),
    // "On the magic plains, even the common man can cast spells like the greatest wizard."
    //
    // All Adventure and Combat spells are cast at Expert proficiency.
    array_fill_keys($c_magicPlains, [
      ['spellMastery', [$clamp, array_search('expert', Spell::mastery)]],
    ]),
    // "Creature of neutral town alignment on Clover Field +2 [luck]"
    // Gives all Neutral aligned troops +2 Luck.
    array_fill_keys($c_cloverField, [
      ['creature_luck', +2, 'ifCreatureAlignment' => 0, 'ifContext' => $combat],
    ]),
    // "Creature of X town alignment on Evil Fog +1/-1"
    // Gives all Evil aligned troops +1 Morale, and Good troops -1 Morale.
    array_fill_keys($c_evilFog, [
      ['creature_morale', +1, 'ifCreatureAlignment' => array_search('evil', Creature::alignment), 'ifContext' => $combat],
      ['creature_morale', -1, 'ifCreatureAlignment' => array_search('good', Creature::alignment), 'ifContext' => $combat],
    ]),
    // Increases the Navigation Skill by 50%  At Basic you would have it at 100%, then 150% and at Expert have it at 200%.
    array_fill_keys($c_favorableWinds, [
      ['hero_actionPoints', 1.50, 'ifVehicle' => array_search('ship', AObject::vehicle)],
    ]),
    // Gives all Good aligned troops +1 Morale, and Evil troops -1 Morale.
    array_fill_keys($c_holyGround, [
      ['creature_morale', +1, 'ifCreatureAlignment' => array_search('good', Creature::alignment), 'ifContext' => $combat],
      ['creature_morale', -1, 'ifCreatureAlignment' => array_search('evil', Creature::alignment), 'ifContext' => $combat],
    ]),
    // Causes all Fire Spells to be cast at Expert Level.
    array_fill_keys($c_fieryFields, [
      ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'fire')],
    ]),
    // Causes all Water Spells to be cast at Expert Level.
    array_fill_keys($c_lucidPools, [
      ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'water')],
    ]),
    // Causes all Air Spells to be cast at Expert Level.
    array_fill_keys($c_magicClouds, [
      ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'air')],
    ]),
    // Causes all Earth Spells to be cast at Expert Level.
    array_fill_keys($c_rocklands, [
      ['spellMastery', [$clamp, array_search('expert', Spell::mastery)], 'ifSpellSchool' => nameToID("$outPath/spellSchools", 'earth')],
    ]),
  ]),

  // Determined empirically. Incidentally or not but the order of dwellings in
  // OBJECTS.TXT matches the order in CRTRAITS.TXT almost until the end.
  //
  // XXX=I add growth effect in towns for these creatures whileOwned, and to their upgraded forms
  'produceOfObject' => $e([
    array_fill_keys($c_airElementalConflux,   [$airElemental]),
    array_fill_keys($c_altarOfAir,            [$airElemental]),
    array_fill_keys($c_portalOfGlory,         [$angel]),
    array_fill_keys($c_archersTower,          [$archer]),
    array_fill_keys($c_frozenCliffs,          [$azureDragon]),
    array_fill_keys($c_basiliskPit,           [$basilisk]),
    array_fill_keys($c_behemothCrag,          [$behemoth]),
    array_fill_keys($c_pillarOfEyes,          [$beholder]),
    array_fill_keys($c_hallOfDarkness,        [$blackKnight]),
    array_fill_keys($c_boarGlen,              [$boar]),
    array_fill_keys($c_dragonVault,           [$boneDragon]),
    array_fill_keys($c_trainingGrounds,       [$cavalier]),
    array_fill_keys($c_centaurStables,        [$centaur]),
    array_fill_keys($c_crystalCavern,         [$crystalDragon]),
    array_fill_keys($c_cyclopsCave,           [$cyclops]),
    array_fill_keys($c_demonGate,             [$demon]),
    array_fill_keys($c_dendroidArches,        [$dendroidGuard]),
    array_fill_keys($c_forsakenPalace,        [$devil]),
    array_fill_keys($c_dwarfCottage,          [$dwarf]),
    array_fill_keys($c_earthElementalConflux, [$earthElemental]),
    array_fill_keys($c_altarOfEarth,          [$earthElemental]),
    array_fill_keys($c_fireLake,              [$efreeti]),
    array_fill_keys($c_enchanterHollow,       [$enchanter]),
    array_fill_keys($c_magicForest,           [$faerieDragon]),
    array_fill_keys($c_pyre,                  [$firebird]),
    array_fill_keys($c_fireElementalConflux,  [$fireElemental]),
    array_fill_keys($c_altarOfFire,           [$fireElemental]),
    array_fill_keys($c_altarOfWishes,         [$genie]),
    array_fill_keys($c_cloudTemple,           [$giant]),
    array_fill_keys($c_gnollHut,              [$gnoll]),
    array_fill_keys($c_goblinBarracks,        [$goblin]),
    array_fill_keys($c_hallOfSins,            [$gog]),
    array_fill_keys($c_gorgonLair,            [$gorgon]),
    array_fill_keys($c_dragonCliffs,          [$greenDragon]),
    array_fill_keys($c_workshop,              [$gremlin]),
    array_fill_keys($c_griffinTower,          [$griffin]),
    array_fill_keys($c_thatchedHut,           [$halfling]),
    array_fill_keys($c_harpyLoft,             [$harpy]),
    array_fill_keys($c_kennels,               [$hellHound]),
    array_fill_keys($c_hydraPond,             [$hydra]),
    array_fill_keys($c_impCrucible,           [$imp]),
    array_fill_keys($c_mausoleum,             [$lich]),
    array_fill_keys($c_lizardDen,             [$lizardman]),
    array_fill_keys($c_mageTower,             [$mage]),
    array_fill_keys($c_manticoreLair,         [$manticore]),
    array_fill_keys($c_chapelOfStilledVoices, [$medusa]),
    array_fill_keys($c_labyrinth,             [$minotaur]),
    array_fill_keys($c_monastery,             [$monk]),
    array_fill_keys($c_tombOfCurses,          [$mummy]),
    array_fill_keys($c_goldenPavilion,        [$naga]),
    array_fill_keys($c_nomadTent,             [$nomad]),
    array_fill_keys($c_ogreFort,              [$ogre]),
    array_fill_keys($c_orcTower,              [$orc]),
    array_fill_keys($c_hovel,                 [$peasant]),
    array_fill_keys($c_enchantedSpring,       [$pegasus]),
    array_fill_keys($c_guardhouse,            [$pikeman]),
    array_fill_keys($c_hellHole,              [$pitFiend]),
    array_fill_keys($c_magicLantern,          [$pixie]),
    array_fill_keys($c_altarOfThought,        [$psychicElemental]),
    array_fill_keys($c_dragonCave,            [$redDragon]),
    array_fill_keys($c_cliffNest,             [$roc]),
    array_fill_keys($c_rogueCavern,           [$rogue]),
    array_fill_keys($c_sulfurousLair,         [$rustDragon]),
    array_fill_keys($c_serpentFlyHive,        [$serpentFly]),
    array_fill_keys($c_treetopTower,          [$sharpshooter]),
    array_fill_keys($c_cursedTemple,          [$skeleton]),
    array_fill_keys($c_parapet,               [$stoneGargoyle]),
    array_fill_keys($c_barracks,              [$swordsman]),
    array_fill_keys($c_warren,                [$troglodyte]),
    array_fill_keys($c_trollBridge,           [$troll]),
    array_fill_keys($c_unicornGlade,          [$unicorn]),
    array_fill_keys($c_estate,                [$vampire]),
    array_fill_keys($c_graveyard,             [$walkingDead]),
    array_fill_keys($c_waterElementalConflux, [$waterElemental]),
    array_fill_keys($c_altarOfWater,          [$waterElemental]),
    array_fill_keys($c_tombOfSouls,           [$wight]),
    array_fill_keys($c_wolfPen,               [$wolfRider]),
    array_fill_keys($c_homestead,             [$woodElf]),
    array_fill_keys($c_wyvernNest,            [$wyvern]),
    array_fill_keys($c_golemFactory, [
      $stoneGolem, $ironGolem, $goldGolem, $diamondGolem,
    ]),
    array_fill_keys($c_elementalConflux, [
      $airElemental, $earthElemental, $fireElemental, $waterElemental,
    ]),
  ]),

  // Sounds according to Sounds.txt.
  'objectOverrides' => $e([
    array_fill_keys($h3Classes[217], [
      'name' => 'Random Dwelling By Level',
    ]),
    array_fill_keys($h3Classes[218], [
      'name' => 'Random Dwelling By Town',
    ]),
    array_fill_keys($c_mine_0, [
      'name' => $mine[0],
      'sound' => 'LOOPLUMB',
    ]),
    array_fill_keys($c_mine_1, [
      'name' => $mine[1],
      //'sound' => 'XXX=ID: dbs:',
    ]),
    array_fill_keys($c_mine_2, [
      'name' => $mine[2],
      //'sound' => 'XXX=ID:dbs:',
    ]),
    array_fill_keys($c_mine_3, [
      'name' => $mine[3],
      'sound' => 'LOOPSULF',
    ]),
    array_fill_keys($c_mine_4, [
      'name' => $mine[4],
      'sound' => 'LOOPCRYS',
    ]),
    array_fill_keys($c_mine_5, [
      'name' => $mine[5],
      'sound' => 'LOOPGEMP',
    ]),
    array_fill_keys($c_mine_6, [
      'name' => $mine[6],
      'sound' => 'LOOPMINE',
    ]),
    array_fill_keys($c_mine_7, [
      'name' => $mine[7],
      'sound' => 'LOOPCAVE',
    ]),
    array_fill_keys($c_garrison_1, [
      'name' => 'Anti-Magic Garrison',
      //'sound' => 'XXX=ID:dbs:',
    ]),
    //array_fill_keys($c_garrison_0, ['sound' => 'XXX=ID:dbs:']),
    array_fill_keys($c_altarOfAir, ['sound' => 'LOOPAIR']),
    array_fill_keys($c_arena, ['sound' => 'LOOPAREN']),
    array_fill_keys($c_marlettoTower, ['sound' => 'LOOPAREN']),
    array_fill_keys($c_campfire, ['sound' => 'LOOPCAMP']),
    array_fill_keys($c_denOfThieves, ['sound' => 'LOOPDEN']),
    // Cyclops Stockpile
    //array_fill_keys($c_creatureBank_0, ['sound' => 'XXX=ID:dbs:']),
    // Dwarven Treasury
    array_fill_keys($c_creatureBank_1, ['sound' => 'LOOPDWAR']),
    // Griffin Conservatory
    array_fill_keys($c_creatureBank_2, ['sound' => 'LOOPGRIF']),
    // Imp Cache
    //array_fill_keys($c_creatureBank_3, ['sound' => 'XXX=ID:dbs:']),
    // Medusa Stores
    //array_fill_keys($c_creatureBank_4, ['sound' => 'XXX=ID:dbs:']),
    // Naga Bank
    //array_fill_keys($c_creatureBank_5, ['sound' => 'XXX=ID:dbs:']),
    // Dragon Fly Hive
    //array_fill_keys($c_creatureBank_6, ['sound' => 'XXX=ID:dbs:']),
    array_fill_keys($c_warMachineFactory, ['sound' => 'LOOPFACT']),
    array_fill_keys($c_faerieRing, ['sound' => 'LOOPFAER']),
    array_fill_keys($c_magicSpring, ['sound' => 'LOOPFALL']),
    array_fill_keys($c_altarOfFire, ['sound' => 'LOOPFIRE']),
    array_fill_keys($c_rallyFlag, ['sound' => 'LOOPFLAG']),
    array_fill_keys($c_fountainOfFortune, ['sound' => 'LOOPFOUN']),
    array_fill_keys($c_fountainOfYouth, ['sound' => 'LOOPFOUN']),
    array_fill_keys($c_gardenOfRevelation, ['sound' => 'LOOPGARD']),
    array_fill_keys($c_subterraneanGate, ['sound' => 'LOOPGATE']),
    array_fill_keys($c_stables, ['sound' => 'LOOPHORS']),
    array_fill_keys($c_learningStone, ['sound' => 'LOOPLEAR']),
    array_fill_keys($c_mysticalGarden, ['sound' => 'LOOPLEPR']),
    array_fill_keys($c_shipyard, ['sound' => 'LOOPLUMB']),
    array_fill_keys($c_schoolOfMagic, ['sound' => 'LOOPMAGI']),
    array_fill_keys($c_tradingPost, ['sound' => 'LOOPMARK']),
    array_fill_keys($c_mercenaryCamp, ['sound' => 'LOOPMERC']),
    array_fill_keys($c_waterWheel, ['sound' => 'LOOPMILL']),
    array_fill_keys($c_monolithOneWayEntrance, ['sound' => 'LOOPMON1']),
    array_fill_keys($c_monolithOneWayExit, ['sound' => 'LOOPMON1']),
    //array_fill_keys($c_monolithTwoWay, ['sound' => 'LOOPMON2']), XXX=ID:dbs:
    array_fill_keys($c_temple, ['sound' => 'LOOPSANC']),
    array_fill_keys($c_sanctuary, ['sound' => 'LOOPSANC']),
    array_fill_keys($c_shrineOfMagicIncantation, ['sound' => 'LOOPSHRIN']),
    array_fill_keys($c_shrineOfMagicGesture, ['sound' => 'LOOPSHRIN']),
    array_fill_keys($c_shrineOfMagicThought, ['sound' => 'LOOPSHRIN']),
    array_fill_keys($c_starAxis, ['sound' => 'LOOPSTAR']),
    array_fill_keys($c_schoolOfWar, ['sound' => 'LOOPSWAR']),
    array_fill_keys($c_tavern, ['sound' => 'LOOPTAV']),
    array_fill_keys($c_whirlpool, ['sound' => 'LOOPWHIR']),
    array_fill_keys($c_windmill, ['sound' => 'LOOPWIND']),
//    array_fill_keys($c_airElementalConflux, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_alchemistLab, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_altarOfEarth, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_altarOfSacrifice, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_altarOfThought, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_altarOfWater, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_altarOfWishes, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_archersTower, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_barracks, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_basiliskPit, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_behemothCrag, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_blackMarket, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_boarGlen, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_boat, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_borderGate, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_borderGuard, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_buoy, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_cartographer, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_centaurStables, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_chapelOfStilledVoices, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_cliffNest, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_cloudTemple, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_cloverField, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_corpse, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_coverOfDarkness, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_crypt, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_crystalCavern, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_cursedGround, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_cursedTemple, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_cyclopsCave, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_demonGate, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_dendroidArches, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_derelictShip, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_dragonCave, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_dragonCliffs, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_dragonUtopia, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_dragonVault, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_dwarfCottage, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_earthElementalConflux, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_elementalConflux, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_enchantedSpring, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_enchanterHollow, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_estate, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_evilFog, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_eyeOfMagi, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_favorableWinds, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_fieryFields, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_fireElementalConflux, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_fireLake, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_flotsam, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_forsakenPalace, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_freelancerGuild, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_frozenLake, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_garrison, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_gnollHut, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_goblinBarracks, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_goldenPavilion, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_golemFactory, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_gorgonLair, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_graveyard, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_griffinTower, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_guardhouse, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_hallOfDarkness, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_hallOfSins, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_harpyLoft, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_hellHole, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_hillFort, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_holyGround, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_homestead, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_hutOfMagi, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_hydraPond, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_idolOfFortune, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_impCrucible, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_kennels, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_keymasterTent, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_labyrinth, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_leanTo, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_libraryOfEnlightenment, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_lighthouse, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_lizardDen, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_lucidPools, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_mageTower, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_magicClouds, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_magicForest, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_magicLantern, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_magicPlains, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_magicWell, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_manticoreLair, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_mausoleum, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_mermaids, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_monastery, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_monster, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_nomadTent, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_oasis, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_obelisk, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_oceanBottle, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_ogreFort, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_orcTower, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_orePit, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_pandoraBox, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_parapet, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_pillarOfEyes, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_pillarOfFire, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_portalOfGlory, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_prison, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_pyramid, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_pyre, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_questGuard, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_redwoodObservatory, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_refugeeCamp, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_resource, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_rocklands, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_rogueCavern, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_scholar, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_seaChest, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_seerHut, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_serpentFlyHive, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_shipwreck, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_shipwreckSurvivor, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_sign, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_sirens, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_spellScroll, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_sulfurousLair, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_swanPond, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_thatchedHut, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_tombOfCurses, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_tombOfSouls, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_trainingGrounds, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_treasureChest, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_treeOfKnowledge, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_treetopTower, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_trollBridge, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_unicornGlade, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_university, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_volcano, ['sound' => 'XXX=ID:dbs:']),  LOOPVOLC?
//    array_fill_keys($c_wagon, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_warren, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_warriorTomb, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_waterElementalConflux, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_wateringHole, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_witchHut, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_wolfPen, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_workshop, ['sound' => 'XXX=ID:dbs:']),
//    array_fill_keys($c_wyvernNest, ['sound' => 'XXX=ID:dbs:']),
  ]),
];