<?php
extract($constants['resources']);
extract(json_decode(file_get_contents("$outPath/creaturesID.json"), true));
extract(json_decode(file_get_contents("$outPath/skillsID.json"), true));
extract(json_decode(file_get_contents("$outPath/spellsID.json"), true), EXTR_PREFIX_ALL, 's');
extract(json_decode(file_get_contents("$outPath/heroClassesID.json"), true));
extract(array_flip(Hero::gender));
extract(array_flip(Skill::mastery));
extract(array_flip(H3Effect::context));
extract(array_flip(H3Effect::operation));

$creatureEfficiency = function ($minLevel, ...$creatures) use ($heroSpec) {
  $res = [];
  foreach ($creatures as $id) {
    $res[] = ['creature_attack',  [$heroSpec, 1, $minLevel], true, 'ifCreature' => $id];
    $res[] = ['creature_defense', [$heroSpec, 1, $minLevel], true, 'ifCreature' => $id];
  }
  return $res;
};

// XXX=C See if there are movement bonuses for different heroes much like native terrain to creatures.

return [
  'heroOverrides' => [
  ],

  /*
    Name used in HOTRAITS.TXT => Creature->$idName   // OBJECTS.TXT's subclass
  */
  'nameToCreatureID' => [
    'Air Elementals' => $airElemental, // 112
    'ApprenticeGremlin' => $gremlin, // 28
    'Archer' => $archer, // 2
    'Beholder' => $beholder, // 74
    'Centaur' => $centaur, // 14
    'DragonFly' => $dragonFly, // 105
    'Dwarf' => $dwarf, // 16
    'Enchanters' => $enchanter, // 136
    'Gnoll' => $gnoll, // 98
    'Goblin' => $goblin, // 84
    'Goblin Wolf Rider' => $wolfRider, // 86
    'Goblins' => $goblin, // 84
    'GoblinWolfRider' => $wolfRider, // 86
    'Gog' => $gog, // 44
    'Griffin' => $griffin, // 4
    'Harpy' => $harpy, // 72
    'HellHound' => $hellHound, // 46
    'Imp' => $imp, // 42
    'IronGolem' => $ironGolem, // 33
    'LightCrossbowman' => $archer, // 2
    'Lizardman' => $lizardman, // 100
    'Orc' => $orc, // 88
    'Pikeman' => $pikeman, // 0
    'Pixies' => $pixie, // 118
    'PrimitiveLizardman' => $lizardman, // 100
    'Serpent Fly' => $serpentFly, // 104
    'SerpentFly' => $serpentFly, // 104
    'Sharpshooters' => $sharpshooter, // 137
    'Skeleton' => $skeleton, // 56
    'StoneGargoyle' => $stoneGargoyle, // 30
    'Troglodyte' => $troglodyte, // 70
    'Water Elementals' => $waterElemental, // 115
    'Wight' => $wight, // 60
    'WoodElf' => $woodElf, // 18
    'Zombie' => $zombie, // 59
  ],

  // Taken from the map editor, Map Specifications > Heroes > Properties,
  // with keys from HOTRAITS.TXT.
  'skillsOfHero' => [
    // Orrin
    [$leadership => $basic, $archery => $basic],
    // Valeska
    [$leadership => $basic, $archery => $basic],
    // Edric
    [$leadership => $basic, $armorer => $basic],
    // Sylvia
    [$leadership => $basic, $navigation => $basic],
    // Lord Haart
    [],
    // Sorsha
    [$leadership => $basic, $offense => $basic],
    // Christian
    [$leadership => $basic, $artillery => $basic],
    // Tyris
    [$leadership => $basic, $tactics => $basic],
    // Rion
    [$wisdom => $basic, $firstAid => $basic],
    // Adela
    [$wisdom => $basic, $diplomacy => $basic],
    // Cuthbert
    [$wisdom => $basic, $estates => $basic],
    // Adelaide
    [$wisdom => $advanced],
    // Ingham
    [$wisdom => $basic, $mysticism => $basic],
    // Sanya
    [$wisdom => $basic, $eagleEye => $basic],
    // Loynis
    [$wisdom => $basic, $learning => $basic],
    // Caitlin
    [$wisdom => $basic, $intelligence => $basic],
    // Mephala
    [$leadership => $basic, $armorer => $basic],
    // Ufretin
    [$resistance => $basic, $luck => $basic],
    // Jenova
    [$archery => $advanced],
    // Ryland
    [$leadership => $basic, $diplomacy => $basic],
    // Thorgrim
    [$resistance => $advanced],
    // Ivor
    [$archery => $basic, $offense => $basic],
    // Clancy
    [$resistance => $basic, $pathfinding => $basic],
    // Kyrre
    [$archery => $basic, $logistics => $basic],
    // Coronius
    [$wisdom => $basic, $scholar => $basic],
    // Uland
    [$wisdom => $advanced, $ballistics => $basic],
    // Elleshar
    [$wisdom => $basic, $intelligence => $basic],
    // Gem
    [$wisdom => $basic, $firstAid => $basic],
    // Malcom
    [$wisdom => $basic, $eagleEye => $basic],
    // Melodia
    [$wisdom => $basic, $luck => $basic],
    // Alagar
    [$wisdom => $basic, $sorcery => $basic],
    // Aeris
    [$wisdom => $basic, $scouting => $basic],
    // Piquedram
    [$mysticism => $basic, $scouting => $basic],
    // Thane
    [$scholar => $advanced],
    // Josephine
    [$mysticism => $basic, $sorcery => $basic],
    // Neela
    [$scholar => $basic, $armorer => $basic],
    // Torosar
    [$mysticism => $basic, $tactics => $basic],
    // Fafner
    [$scholar => $basic, $resistance => $basic],
    // Rissa
    [$mysticism => $basic, $offense => $basic],
    // Iona
    [$scholar => $basic, $intelligence => $basic],
    // Astral
    [$wisdom => $advanced],
    // Halon
    [$wisdom => $basic, $mysticism => $basic],
    // Serena
    [$wisdom => $basic, $eagleEye => $basic],
    // Daremyth
    [$wisdom => $basic, $intelligence => $basic],
    // Theodorus
    [$wisdom => $basic, $ballistics => $basic],
    // Solmyr
    [$wisdom => $basic, $sorcery => $basic],
    // Cyra
    [$wisdom => $basic, $diplomacy => $basic],
    // Aine
    [$wisdom => $basic, $scholar => $basic],
    // Fiona
    [$scouting => $advanced],
    // Rashka
    [$scholar => $basic, $wisdom => $basic],
    // Marius
    [$armorer => $advanced],
    // Ignatius
    [$tactics => $basic, $resistance => $basic],
    // Octavia
    [$scholar => $basic, $offense => $basic],
    // Calh
    [$archery => $basic, $scouting => $basic],
    // Pyre
    [$logistics => $basic, $artillery => $basic],
    // Nymus
    [$offense => $advanced],
    // Ayden
    [$wisdom => $basic, $intelligence => $basic],
    // Xyron
    [$wisdom => $basic, $scholar => $basic],
    // Axsis
    [$wisdom => $basic, $mysticism => $basic],
    // Olema
    [$wisdom => $basic, $ballistics => $basic],
    // Calid
    [$wisdom => $basic, $learning => $basic],
    // Ash
    [$wisdom => $basic, $eagleEye => $basic],
    // Zydar
    [$wisdom => $basic, $sorcery => $basic],
    // Xarfax
    [$wisdom => $basic, $leadership => $basic],
    // Straker
    [$necromancy => $basic, $resistance => $basic],
    // Vokial
    [$necromancy => $basic, $artillery => $basic],
    // Moandor
    [$necromancy => $basic, $learning => $basic],
    // Charna
    [$necromancy => $basic, $tactics => $basic],
    // Tamika
    [$necromancy => $basic, $offense => $basic],
    // Isra
    [$necromancy => $advanced],
    // Clavius
    [$necromancy => $basic, $offense => $basic],
    // Galthran
    [$necromancy => $basic, $armorer => $basic],
    // Septienna
    [$necromancy => $basic, $scholar => $basic],
    // Aislinn
    [$necromancy => $basic, $wisdom => $basic],
    // Sandro
    [$necromancy => $basic, $sorcery => $basic],
    // Nimbus
    [$necromancy => $basic, $eagleEye => $basic],
    // Thant
    [$necromancy => $basic, $mysticism => $basic],
    // Xsi
    [$necromancy => $basic, $learning => $basic],
    // Vidomina
    [$necromancy => $advanced],
    // Nagash
    [$necromancy => $basic, $intelligence => $basic],
    // Lorelei
    [$leadership => $basic, $scouting => $basic],
    // Arlach
    [$offense => $basic, $artillery => $basic],
    // Dace
    [$tactics => $basic, $offense => $basic],
    // Ajit
    [$leadership => $basic, $resistance => $basic],
    // Damacon
    [$offense => $advanced],
    // Gunnar
    [$tactics => $basic, $logistics => $basic],
    // Synca
    [$leadership => $basic, $scholar => $basic],
    // Shakti
    [$offense => $basic, $tactics => $basic],
    // Alamar
    [$wisdom => $basic, $scholar => $basic],
    // Jaegar
    [$wisdom => $basic, $mysticism => $basic],
    // Malekith
    [$wisdom => $basic, $sorcery => $basic],
    // Jeddite
    [$wisdom => $advanced],
    // Geon
    [$wisdom => $basic, $eagleEye => $basic],
    // Deemer
    [$wisdom => $basic, $scouting => $advanced],
    // Sephinroth
    [$wisdom => $basic, $intelligence => $basic],
    // Darkstorn
    [$wisdom => $basic, $learning => $basic],
    // Yog
    [$offense => $basic, $ballistics => $basic],
    // Gurnisson
    [$offense => $basic, $artillery => $basic],
    // Jabarkas
    [$offense => $basic, $archery => $basic],
    // Shiva
    [$offense => $basic, $scouting => $basic],
    // Gretchin
    [$offense => $basic, $pathfinding => $basic],
    // Krellion
    [$offense => $basic, $resistance => $basic],
    // Crag Hack
    [$offense => $advanced],
    // Tyraxor
    [$offense => $basic, $tactics => $basic],
    // Gird
    [$wisdom => $basic, $sorcery => $basic],
    // Vey
    [$wisdom => $basic, $leadership => $basic],
    // Dessa
    [$wisdom => $basic, $logistics => $basic],
    // Terek
    [$wisdom => $basic, $tactics => $basic],
    // Zubin
    [$wisdom => $basic, $artillery => $basic],
    // Gundula
    [$wisdom => $basic, $offense => $basic],
    // Oris
    [$wisdom => $basic, $eagleEye => $basic],
    // Saurug
    [$wisdom => $basic, $resistance => $basic],
    // Bron
    [$armorer => $basic, $resistance => $basic],
    // Drakon
    [$armorer => $basic, $leadership => $basic],
    // Wystan
    [$armorer => $basic, $archery => $basic],
    // Tazar
    [$armorer => $advanced],
    // Alkin
    [$armorer => $basic, $offense => $basic],
    // Korbac
    [$armorer => $basic, $pathfinding => $basic],
    // Gerwulf
    [$armorer => $basic, $artillery => $basic],
    // Broghild
    [$armorer => $basic, $scouting => $basic],
    // Mirlanda
    [$wisdom => $advanced],
    // Rosic
    [$wisdom => $basic, $mysticism => $basic],
    // Voy
    [$wisdom => $basic, $navigation => $basic],
    // Verdish
    [$wisdom => $basic, $firstAid => $basic],
    // Merist
    [$wisdom => $basic, $learning => $basic],
    // Styg
    [$wisdom => $basic, $sorcery => $basic],
    // Andra
    [$wisdom => $basic, $intelligence => $basic],
    // Tiva
    [$wisdom => $basic, $eagleEye => $basic],
    // Pasis
    [$artillery => $basic, $offense => $basic],
    // Thunar
    [$estates => $basic, $tactics => $basic],
    // Ignissa
    [$artillery => $basic, $offense => $basic],
    // Lacus
    [$tactics => $advanced],
    // Monere
    [$logistics => $basic, $offense => $basic],
    // Erdamon
    [$estates => $basic, $tactics => $basic],
    // Fiur
    [$offense => $advanced],
    // Kalt
    [$tactics => $basic, $learning => $basic],
    // Luna
    [$wisdom => $basic, $fireMagic => $basic],
    // Brissa
    [$wisdom => $basic, $airMagic => $basic],
    // Ciele
    [$wisdom => $basic, $waterMagic => $basic],
    // Labetha
    [$wisdom => $basic, $earthMagic => $basic],
    // Inteus
    [$wisdom => $basic, $fireMagic => $basic],
    // Aenain
    [$wisdom => $basic, $airMagic => $basic],
    // Gelare
    [$wisdom => $basic, $waterMagic => $basic],
    // Grindan
    [$wisdom => $basic, $earthMagic => $basic],
    // Sir Mullich
    [$leadership => $advanced],
    // Adrienne
    [$wisdom => $basic, $fireMagic => $expert],
    // Catherine
    [$leadership => $basic, $offense => $basic],
    // Dracon
    [$wisdom => $advanced],
    // Gelu
    [$archery => $basic, $leadership => $basic],
    // Kilgor
    [$offense => $advanced],
    // Lord Haart
    [$necromancy => $advanced],
    // Mutare
    [$estates => $basic, $tactics => $basic],
    // Roland
    [$leadership => $basic, $armorer => $basic],
    // Mutare Drake
    [$estates => $basic, $tactics => $basic],
    // Boragus
    [$tactics => $basic, $offense => $basic],
    // Xeron
    [$leadership => $basic, $tactics => $basic],
  ],

  // Taken from the map editor, Map Specifications > Heroes > Properties,
  // with keys from HOTRAITS.TXT.
  'classOfHero' => [
    // Orrin
    $knight,
    // Valeska
    $knight,
    // Edric
    $knight,
    // Sylvia
    $knight,
    // Lord Haart
    $knight,
    // Sorsha
    $knight,
    // Christian
    $knight,
    // Tyris
    $knight,
    // Rion
    $cleric,
    // Adela
    $cleric,
    // Cuthbert
    $cleric,
    // Adelaide
    $cleric,
    // Ingham
    $cleric,
    // Sanya
    $cleric,
    // Loynis
    $cleric,
    // Caitlin
    $cleric,
    // Mephala
    $ranger,
    // Ufretin
    $ranger,
    // Jenova
    $ranger,
    // Ryland
    $ranger,
    // Thorgrim
    $ranger,
    // Ivor
    $ranger,
    // Clancy
    $ranger,
    // Kyrre
    $ranger,
    // Coronius
    $druid,
    // Uland
    $druid,
    // Elleshar
    $druid,
    // Gem
    $druid,
    // Malcom
    $druid,
    // Melodia
    $druid,
    // Alagar
    $druid,
    // Aeris
    $druid,
    // Piquedram
    $alchemist,
    // Thane
    $alchemist,
    // Josephine
    $alchemist,
    // Neela
    $alchemist,
    // Torosar
    $alchemist,
    // Fafner
    $alchemist,
    // Rissa
    $alchemist,
    // Iona
    $alchemist,
    // Astral
    $wizard,
    // Halon
    $wizard,
    // Serena
    $wizard,
    // Daremyth
    $wizard,
    // Theodorus
    $wizard,
    // Solmyr
    $wizard,
    // Cyra
    $wizard,
    // Aine
    $wizard,
    // Fiona
    $demoniac,
    // Rashka
    $demoniac,
    // Marius
    $demoniac,
    // Ignatius
    $demoniac,
    // Octavia
    $demoniac,
    // Calh
    $demoniac,
    // Pyre
    $demoniac,
    // Nymus
    $demoniac,
    // Ayden
    $heretic,
    // Xyron
    $heretic,
    // Axsis
    $heretic,
    // Olema
    $heretic,
    // Calid
    $heretic,
    // Ash
    $heretic,
    // Zydar
    $heretic,
    // Xarfax
    $heretic,
    // Straker
    $deathKnight,
    // Vokial
    $deathKnight,
    // Moandor
    $deathKnight,
    // Charna
    $deathKnight,
    // Tamika
    $deathKnight,
    // Isra
    $deathKnight,
    // Clavius
    $deathKnight,
    // Galthran
    $deathKnight,
    // Septienna
    $necromancer,
    // Aislinn
    $necromancer,
    // Sandro
    $necromancer,
    // Nimbus
    $necromancer,
    // Thant
    $necromancer,
    // Xsi
    $necromancer,
    // Vidomina
    $necromancer,
    // Nagash
    $necromancer,
    // Lorelei
    $overlord,
    // Arlach
    $overlord,
    // Dace
    $overlord,
    // Ajit
    $overlord,
    // Damacon
    $overlord,
    // Gunnar
    $overlord,
    // Synca
    $overlord,
    // Shakti
    $overlord,
    // Alamar
    $warlock,
    // Jaegar
    $warlock,
    // Malekith
    $warlock,
    // Jeddite
    $warlock,
    // Geon
    $warlock,
    // Deemer
    $warlock,
    // Sephinroth
    $warlock,
    // Darkstorn
    $warlock,
    // Yog
    $barbarian,
    // Gurnisson
    $barbarian,
    // Jabarkas
    $barbarian,
    // Shiva
    $barbarian,
    // Gretchin
    $barbarian,
    // Krellion
    $barbarian,
    // Crag Hack
    $barbarian,
    // Tyraxor
    $barbarian,
    // Gird
    $battleMage,
    // Vey
    $battleMage,
    // Dessa
    $battleMage,
    // Terek
    $battleMage,
    // Zubin
    $battleMage,
    // Gundula
    $battleMage,
    // Oris
    $battleMage,
    // Saurug
    $battleMage,
    // Bron
    $beastmaster,
    // Drakon
    $beastmaster,
    // Wystan
    $beastmaster,
    // Tazar
    $beastmaster,
    // Alkin
    $beastmaster,
    // Korbac
    $beastmaster,
    // Gerwulf
    $beastmaster,
    // Broghild
    $beastmaster,
    // Mirlanda
    $witch,
    // Rosic
    $witch,
    // Voy
    $witch,
    // Verdish
    $witch,
    // Merist
    $witch,
    // Styg
    $witch,
    // Andra
    $witch,
    // Tiva
    $witch,
    // Pasis
    $planeswalker,
    // Thunar
    $planeswalker,
    // Ignissa
    $planeswalker,
    // Lacus
    $planeswalker,
    // Monere
    $planeswalker,
    // Erdamon
    $planeswalker,
    // Fiur
    $planeswalker,
    // Kalt
    $planeswalker,
    // Luna
    $elementalist,
    // Brissa
    $elementalist,
    // Ciele
    $elementalist,
    // Labetha
    $elementalist,
    // Inteus
    $elementalist,
    // Aenain
    $elementalist,
    // Gelare
    $elementalist,
    // Grindan
    $elementalist,
    // Sir Mullich
    $knight,
    // Adrienne
    $witch,
    // Catherine
    $knight,
    // Dracon
    $wizard,
    // Gelu
    $ranger,
    // Kilgor
    $barbarian,
    // Lord Haart
    $deathKnight,
    // Mutare
    $overlord,
    // Roland
    $knight,
    // Mutare Drake
    $overlord,
    // Boragus
    $barbarian,
    // Xeron
    $demoniac,
  ],

  // Determined empirically.
  'portraitOfHero' => [
    // Orrin
    '000KN',
    // Valeska
    '001KN',
    // Edric
    '002KN',
    // Sylvia
    '003KN',
    // Lord Haart
    '004KN',
    // Sorsha
    '005KN',
    // Christian
    '006KN',
    // Tyris
    '007KN',
    // Rion
    '008CL',
    // Adela
    '009CL',
    // Cuthbert
    '010CL',
    // Adelaide
    '011CL',
    // Ingham
    '012CL',
    // Sanya
    '013CL',
    // Loynis
    '014CL',
    // Caitlin
    '015CL',
    // Mephala
    '016RN',
    // Ufretin
    '017RN',
    // Jenova
    '018RN',
    // Ryland
    '019RN',
    // Thorgrim
    '020RN',
    // Ivor
    '021RN',
    // Clancy
    '022RN',
    // Kyrre
    '023RN',
    // Coronius
    '024DR',
    // Uland
    '025DR',
    // Elleshar
    '026DR',
    // Gem
    '027DR',
    // Malcom
    '028DR',
    // Melodia
    '029DR',
    // Alagar
    '030DR',
    // Aeris
    '031DR',
    // Piquedram
    '032AL',
    // Thane
    '033AL',
    // Josephine
    '034AL',
    // Neela
    '035AL',
    // Torosar
    '036AL',
    // Fafner
    '037AL',
    // Rissa
    '038AL',
    // Iona
    '039AL',
    // Astral
    '040WZ',
    // Halon
    '041WZ',
    // Serena
    '042WZ',
    // Daremyth
    '043WZ',
    // Theodorus
    '044WZ',
    // Solmyr
    '045WZ',
    // Cyra
    '046WZ',
    // Aine
    '047WZ',
    // Fiona
    '048HR',
    // Rashka
    '049HR',
    // Marius
    '050HR',
    // Ignatius
    '051HR',
    // Octavia
    '052HR',
    // Calh
    '053HR',
    // Pyre
    '054HR',
    // Nymus
    '055HR',
    // Ayden
    '056DM',
    // Xyron
    '057DM',
    // Axsis
    '058DM',
    // Olema
    '059DM',
    // Calid
    '060DM',
    // Ash
    '061DM',
    // Zydar
    '062DM',
    // Xarfax
    '063DM',
    // Straker
    '064DK',
    // Vokial
    '065DK',
    // Moandor
    '066DK',
    // Charna
    '067DK',
    // Tamika
    '068DK',
    // Isra
    '069DK',
    // Clavius
    '070DK',
    // Galthran
    '071DK',
    // Septienna
    '072NC',
    // Aislinn
    '073NC',
    // Sandro
    '074NC',
    // Nimbus
    '075NC',
    // Thant
    '076NC',
    // Xsi
    '077NC',
    // Vidomina
    '078NC',
    // Nagash
    '079NC',
    // Lorelei
    '080OV',
    // Arlach
    '081OV',
    // Dace
    '082OV',
    // Ajit
    '083OV',
    // Damacon
    '084OV',
    // Gunnar
    '085OV',
    // Synca
    '086OV',
    // Shakti
    '087OV',
    // Alamar
    '088WL',
    // Jaegar
    '089WL',
    // Malekith
    '090WL',
    // Jeddite
    '091WL',
    // Geon
    '092WL',
    // Deemer
    '093WL',
    // Sephinroth
    '094WL',
    // Darkstorn
    '095WL',
    // Yog
    '096BR',
    // Gurnisson
    '097BR',
    // Jabarkas
    '098BR',
    // Shiva
    '099BR',
    // Gretchin
    '100BR',
    // Krellion
    '101BR',
    // Crag Hack
    '102BR',
    // Tyraxor
    '103BR',
    // Gird
    '104BM',
    // Vey
    '105BM',
    // Dessa
    '106BM',
    // Terek
    '107BM',
    // Zubin
    '108BM',
    // Gundula
    '109BM',
    // Oris
    '110BM',
    // Saurug
    '111BM',
    // Bron
    '112BS',
    // Drakon
    '113BS',
    // Wystan
    '114BS',
    // Tazar
    '115BS',
    // Alkin
    '116BS',
    // Korbac
    '117BS',
    // Gerwulf
    '118BS',
    // Broghild
    '119BS',
    // Mirlanda
    '120WH',
    // Rosic
    '121WH',
    // Voy
    '122WH',
    // Verdish
    '123WH',
    // Merist
    '124WH',
    // Styg
    '125WH',
    // Andra
    '126WH',
    // Tiva
    '127WH',
    // Pasis
    '000PL',
    // Thunar
    '001PL',
    // Ignissa
    '002PL',
    // Lacus
    '003PL',
    // Monere
    '004PL',
    // Erdamon
    '005PL',
    // Fiur
    '006PL',
    // Kalt
    '007PL',
    // Luna
    '000EL',
    // Brissa
    '001EL',
    // Ciele
    '002EL',
    // Labetha
    '003EL',
    // Inteus
    '004EL',
    // Aenain
    '005EL',
    // Gelare
    '006EL',
    // Grindan
    '007EL',
    // Sir Mullich
    '130KN',
    // Adrienne
    '000SH',
    // Catherine
    '128QC',
    // Dracon
    '003SH',
    // Gelu
    '004SH',
    // Kilgor
    '005SH',
    // Lord Haart
    '006SH',
    // Mutare
    '007SH',
    // Roland
    '009SH',
    // Mutare Drake
    '008SH',
    // Boragus
    '001SH',
    // Xeron
    '131DM',
  ],

  // Determined empirically.
  'combatImageOfHero' => [
    "$knight $male" => "CH00",
    "$knight $female" => "CH01",
    "$cleric $male" => "CH00",
    "$cleric $female" => "CH01",
    "$ranger $male" => "CH02",
    "$ranger $female" => "CH03",
    "$druid $male" => "CH02",
    "$druid $female" => "CH03",
    "$alchemist $male" => "CH05",
    "$alchemist $female" => "CH04",
    "$wizard $male" => "CH05",
    "$wizard $female" => "CH04",
    "$demoniac $male" => "CH06",
    "$demoniac $female" => "CH07",
    "$heretic $male" => "CH06",
    "$heretic $female" => "CH07",
    "$deathKnight $male" => "CH08",
    "$deathKnight $female" => "CH09",
    "$necromancer $male" => "CH08",
    "$necromancer $female" => "CH09",
    "$overlord $male" => "CH010",
    "$overlord $female" => "CH11",
    "$warlock $male" => "CH010",
    "$warlock $female" => "CH11",
    "$barbarian $male" => "CH013",
    "$barbarian $female" => "CH012",
    "$battleMage $male" => "CH013",
    "$battleMage $female" => "CH012",
    "$beastmaster $male" => "CH014",
    "$witch $female" => "CH015",
    "$planeswalker $male" => "CH17",   // XXX+C and update Images.txt
    "$planeswalker $female" => "CH17",   // XXX+C and update Images.txt
    "$elementalist $male" => "CH16",   // XXX+C and update Images.txt
    "$elementalist $female" => "CH16",   // XXX+C and update Images.txt
  ],

  // Generated from HEROSPEC.TXT by hand.
  'specEffectsOfHero' => [
    // Orrin
    $specArchery = [
      ['creature_damageMin', [$heroSpec, 0.05], true, 'ifCreatureShooting' => 1],
      ['creature_damageMax', [$heroSpec, 0.05], true, 'ifCreatureShooting' => 1],
    ],
    // Valeska
    $creatureEfficiency(2, $archer, $marksman),
    // Edric
    $creatureEfficiency(3, $griffin, $royalGriffin),
    // Sylvia
    $specNavigation = [['hero_actionPoints', [$heroSpec, 0.05], true, 'ifVehicle' => array_search('ship', AObject::vehicle)]],
    // Lord Haart
    [],
    // Sorsha
    $creatureEfficiency(4, $swordsman, $crusader),
    // Christian
    $creatureEfficiency(4, $ballista),
    // Tyris
    $creatureEfficiency(6, $cavalier, $champion),
    // Rion
    $specFirstAid = [
      ['creature_damageMin', [$heroSpec, 0.05], true, 'ifCreature' => $firstAidTent],
      ['creature_damageMax', [$heroSpec, 0.05], true, 'ifCreature' => $firstAidTent],
    ],
    // Adela
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_bless]],
    // Cuthbert
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_weakness]],
    // Adelaide
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_frostRing]],
    // Ingham
    $creatureEfficiency(5, $monk, $zealot),
    // Sanya
    //
    // As expected, the bonus only applies to already "unlocked" spell levels
    // (beginner's Eagle Eye learns levels 1 and 2 only). This is because
    // $modifier is multiplied with (not added to) the existing chance, and if
    // it's 0 then result is 0.
    $specEagleEye = [['spellLearn', [$heroSpec, 0.05], true, 'ifContext' => $combat]],
    // Loynis
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_prayer]],
    // Caitlin
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Mephala
    $specArmorer = [
      ['creature_damageMin', [$heroSpec, -0.05], 'ifTargetObject' => true],
      ['creature_damageMax', [$heroSpec, -0.05], 'ifTargetObject' => true],
    ],
    // Ufretin
    $creatureEfficiency(2, $dwarf, $battleDwarf),
    // Jenova
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Ryland
    $creatureEfficiency(5, $dendroidGuard, $dendroidSoldier),
    // Thorgrim
    $specResistance = [['spellEfficiency', [$heroSpec, -0.05], 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat, 'ifTargetObject' => true]],
    // Ivor
    $creatureEfficiency(3, $woodElf, $grandElf),
    // Clancy
    $creatureEfficiency(6, $unicorn, $warUnicorn),
    // Kyrre
    $specLogistics = [['hero_actionPoints', [$heroSpec, 0.05], true, 'ifVehicle' => array_search('horse', AObject::vehicle)]],
    // Coronius
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_slayer]],
    // Uland
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_cure]],
    // Elleshar
    $specIntelligence = [['hero_spellPoints', [$heroSpec, 0.05], true]],
    // Gem
    $specFirstAid,
    // Malcom
    $specEagleEye,
    // Melodia
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_fortune]],
    // Alagar
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_iceBolt]],
    // Aeris
    $creatureEfficiency(4, $pegasus, $silverPegasus),
    // Piquedram
    $creatureEfficiency(2, $stoneGargoyle, $obsidianGargoyle),
    // Thane
    $creatureEfficiency(5, $genie, $masterGenie),
    // Josephine
    $creatureEfficiency(3, $stoneGolem, $ironGolem),
    // Neela
    $specArmorer,
    // Torosar
    $creatureEfficiency(4, $ballista),
    // Fafner
    $creatureEfficiency(6, $walkingDead, $zombie),
    // Rissa
    [['income', +1, 'ifResource' => $mercury, 'ifPlayer' => true, 'whileObject' => true]],
    // Iona
    $creatureEfficiency(5, $genie, $masterGenie),
    // Astral
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_hypnotize]],
    // Halon
    //
    // Tested in SoD: it takes current bonus of the skill and multiplies by
    // 5% * hero level. For example, Expert Mysticism (+4 spellpoints daily)
    // plus specialty of hero's level 5 adds ((5 * 0.05) + 1) * 4 = 5
    // spellpoints daily.
    $specMysticism = [['hero_spellPointsDaily', [$heroSpecSkill, 0.05, $mysticism, 0, 2, 3, 4], true]],
    // Serena
    $specEagleEye,
    // Daremyth
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_fortune]],
    // Theodorus
    $creatureEfficiency(4, $mage, $archMage),
    // Solmyr
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_chainLightning]],
    // Cyra
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_haste]],
    // Aine
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Fiona
    $creatureEfficiency(3, $hellHound, $cerberus),
    // Rashka
    $creatureEfficiency(6, $efreeti, $efreetSultan),
    // Marius
    $creatureEfficiency(4, $walkingDead, $zombie),
    // Ignatius
    $creatureEfficiency(1, $imp, $familiar),
    // Octavia
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Calh
    $creatureEfficiency(2, $gog, $magog),
    // Pyre
    $creatureEfficiency(4, $ballista),
    // Nymus
    $creatureEfficiency(5, $pitFiend, $pitLord),
    // Ayden
    $specIntelligence,
    // Xyron
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_inferno]],
    // Axsis
    $specMysticism,
    // Olema
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_weakness]],
    // Calid
    [['income', +1, 'ifResource' => $sulfur, 'ifPlayer' => true, 'whileObject' => true]],
    // Ash
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_bloodlust]],
    // Zydar
    $specSorcery = [['spellEfficiency', [$heroSpec, 0.05], true, 'ifAggression' => array_search('offense', Spell::aggression), 'ifContext' => $combat]],
    // Xarfax
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_fireball]],
    // Straker
    $creatureEfficiency(2, $walkingDead, $zombie),
    // Vokial
    $creatureEfficiency(4, $vampire, $vampireLord),
    // Moandor
    $creatureEfficiency(5, $lich, $powerLich),
    // Charna
    $creatureEfficiency(3, $wight, $wraith),
    // Tamika
    $creatureEfficiency(6, $blackKnight, $dreadKnight),
    // Isra
    $specNecromancy = [['creature_reanimate', [$heroSpec, 0.05], true]],
    // Clavius
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Galthran
    $creatureEfficiency(1, $skeleton, $skeletonWarrior),
    // Septienna
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_deathRipple]],
    // Aislinn
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_meteorShower]],
    // Sandro
    $specSorcery,
    // Nimbus
    $specEagleEye,
    // Thant
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_animateDead]],
    // Xsi
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_stoneSkin]],
    // Vidomina
    $specNecromancy,
    // Nagash
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Lorelei
    $creatureEfficiency(2, $harpy, $harpyHag),
    // Arlach
    $creatureEfficiency(4, $ballista),
    // Dace
    $creatureEfficiency(5, $minotaur, $minotaurKing),
    // Ajit
    $creatureEfficiency(2, $beholder, $evilEye),
    // Damacon
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Gunnar
    $specLogistics,
    // Synca
    $creatureEfficiency(6, $manticore, $scorpicore),
    // Shakti
    $creatureEfficiency(1, $troglodyte, $infernalTroglodyte),
    // Alamar
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_resurrection]],
    // Jaegar
    $specMysticism,
    // Malekith
    $specSorcery,
    // Jeddite
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_resurrection]],
    // Geon
    $specEagleEye,
    // Deemer
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_meteorShower]],
    // Sephinroth
    [['income', +1, 'ifResource' => $crystal, 'ifPlayer' => true, 'whileObject' => true]],
    // Darkstorn
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_stoneSkin]],
    // Yog
    $creatureEfficiency(6, $cyclops, $cyclopsKing),
    // Gurnisson
    $creatureEfficiency(4, $ballista),
    // Jabarkas
    $creatureEfficiency(3, $orc, $orcChieftain),
    // Shiva
    $creatureEfficiency(5, $roc, $thunderbird),
    // Gretchin
    $creatureEfficiency(1, $goblin, $hobgoblin),
    // Krellion
    $creatureEfficiency(4, $ogre, $ogreMage),
    // Crag Hack
    $specOffense = [
      ['creature_damageMin', [$heroSpec, 0.05], true, 'ifCreatureShooting' => 0],
      ['creature_damageMax', [$heroSpec, 0.05], true, 'ifCreatureShooting' => 0],
    ],
    // Tyraxor
    $creatureEfficiency(2, $wolfRider, $wolfRaider),
    // Gird
    $specSorcery,
    // Vey
    $creatureEfficiency(4, $ogre, $ogreMage),
    // Dessa
    $specLogistics,
    // Terek
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_haste]],
    // Zubin
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_precision]],
    // Gundula
    $specOffense,
    // Oris
    $specEagleEye,
    // Saurug
    [['income', +1, 'ifResource' => $gems, 'ifPlayer' => true, 'whileObject' => true]],
    // Bron
    $creatureEfficiency(4, $basilisk, $greaterBasilisk),
    // Drakon
    $creatureEfficiency(1, $gnoll, $gnollMarauder),
    // Wystan
    $creatureEfficiency(2, $lizardman, $lizardWarrior),
    // Tazar
    $specArmorer,
    // Alkin
    $creatureEfficiency(5, $gorgon, $mightyGorgon),
    // Korbac
    $creatureEfficiency(3, $serpentFly, $dragonFly),
    // Gerwulf
    $creatureEfficiency(4, $ballista),
    // Broghild
    $creatureEfficiency(6, $wyvern, $wyvernMonarch),
    // Mirlanda
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_weakness]],
    // Rosic
    $specMysticism,
    // Voy
    $specNavigation,
    // Verdish
    $specFirstAid,
    // Merist
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_stoneSkin]],
    // Styg
    $specSorcery,
    // Andra
    $specIntelligence,
    // Tiva
    $specEagleEye,
    // Pasis
    $s1 = [
      ['creature_attack',    +3, true, 'ifCreature' => $psychicElemental],
      ['creature_defense',   +3, true, 'ifCreature' => $psychicElemental],
      ['creature_attack',    +3, true, 'ifCreature' => $magicElemental],
      ['creature_defense',   +3, true, 'ifCreature' => $magicElemental],
    ],
    // Thunar
    $s2 = [
      ['creature_attack',    +3, true, 'ifCreature' => $earthElemental],
      ['creature_defense',   +1, true, 'ifCreature' => $earthElemental],
      ['creature_damageMin', +5, true, 'ifCreature' => $earthElemental],
      ['creature_damageMax', +5, true, 'ifCreature' => $earthElemental],
      ['creature_attack',    +3, true, 'ifCreature' => $magmaElemental],
      ['creature_defense',   +1, true, 'ifCreature' => $magmaElemental],
      ['creature_damageMin', +5, true, 'ifCreature' => $magmaElemental],
      ['creature_damageMax', +5, true, 'ifCreature' => $magmaElemental],
    ],
    // Ignissa
    $s3 = [
      ['creature_attack',    +1, true, 'ifCreature' => $fireElemental],
      ['creature_defense',   +2, true, 'ifCreature' => $fireElemental],
      ['creature_damageMin', +2, true, 'ifCreature' => $fireElemental],
      ['creature_damageMax', +2, true, 'ifCreature' => $fireElemental],
      ['creature_attack',    +1, true, 'ifCreature' => $energyElemental],
      ['creature_defense',   +2, true, 'ifCreature' => $energyElemental],
      ['creature_damageMin', +2, true, 'ifCreature' => $energyElemental],
      ['creature_damageMax', +2, true, 'ifCreature' => $energyElemental],
    ],
    // Lacus
    $s4 = [
      ['creature_attack',    +1, true, 'ifCreature' => $waterElemental],
      ['creature_attack',    +1, true, 'ifCreature' => $iceElemental],
    ],
    // Monere
    $s1,
    // Erdamon
    $s2,
    // Fiur
    $s3,
    // Kalt
    $s4,
    // Luna
    [['spellEfficiency', 2.0, true, 'ifSpell' => $s_fireWall]],
    // Brissa
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_haste]],
    // Ciele
    [['spellEfficiency', 1.5, true, 'ifSpell' => $s_magicArrow]],
    // Labetha
    [['spellEfficiency', +3, true, 'ifSpell' => $s_stoneSkin]],
    // Inteus
    [['spellEfficiency', [$spellSpec], true, 'ifSpell' => $s_bloodlust]],
    // Aenain
    [['spellEfficiency', +2, true, 'ifSpell' => $s_disruptingRay]],
    // Gelare
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Grindan
    [['income', +350, 'ifResource' => $gold, 'ifPlayer' => true, 'whileObject' => true]],
    // Sir Mullich
    [['creature_speed', +2, true]],
    // Adrienne
    [
      // $prepend to show first in the skill list in hero info window.
      ['hero_skills', [$prepend, $fireMagic], true],
      ['skillMastery', [$clamp, $expert], true, 'ifSkill' => $fireMagic],
    ],
    // Catherine
    $creatureEfficiency(4, $swordsman, $crusader),
    // Dracon
    [
      ['hero_garrisonConvert', [$append, $enchanter], true, 'ifCreature' => $monk],
      ['hero_garrisonConvert', [$append, $enchanter], true, 'ifCreature' => $zealot],
      ['hero_garrisonConvert', [$append, $enchanter], true, 'ifCreature' => $mage],
      ['hero_garrisonConvert', [$append, $enchanter], true, 'ifCreature' => $archMage],
    ],
    // Gelu
    [
      ['hero_garrisonConvert', [$append, $sharpshooter], true, 'ifCreature' => $archer],
      ['hero_garrisonConvert', [$append, $sharpshooter], true, 'ifCreature' => $marksman],
      ['hero_garrisonConvert', [$append, $sharpshooter], true, 'ifCreature' => $woodElf],
      ['hero_garrisonConvert', [$append, $sharpshooter], true, 'ifCreature' => $grandElf],
    ],
    // Kilgor
    [
      ['creature_attack',    +5,  true, 'ifCreature' => $behemoth],
      ['creature_defense',   +5,  true, 'ifCreature' => $behemoth],
      ['creature_damageMin', +10, true, 'ifCreature' => $behemoth],
      ['creature_damageMax', +10, true, 'ifCreature' => $behemoth],
      ['creature_attack',    +5,  true, 'ifCreature' => $ancientBehemoth],
      ['creature_defense',   +5,  true, 'ifCreature' => $ancientBehemoth],
      ['creature_damageMin', +10, true, 'ifCreature' => $ancientBehemoth],
      ['creature_damageMax', +10, true, 'ifCreature' => $ancientBehemoth],
    ],
    // Lord Haart
    [
      ['creature_attack',    +5,  true, 'ifCreature' => $blackKnight],
      ['creature_defense',   +5,  true, 'ifCreature' => $blackKnight],
      ['creature_damageMin', +10, true, 'ifCreature' => $blackKnight],
      ['creature_damageMax', +10, true, 'ifCreature' => $blackKnight],
      ['creature_attack',    +5,  true, 'ifCreature' => $dreadKnight],
      ['creature_defense',   +5,  true, 'ifCreature' => $dreadKnight],
      ['creature_damageMin', +10, true, 'ifCreature' => $dreadKnight],
      ['creature_damageMax', +10, true, 'ifCreature' => $dreadKnight],
    ],
    // Mutare
    $s5 = [
      ['creature_attack',    +5,  true, 'ifCreature' => $greenDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $greenDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $goldDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $goldDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $boneDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $boneDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $ghostDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $ghostDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $redDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $redDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $blackDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $blackDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $azureDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $azureDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $crystalDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $crystalDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $faerieDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $faerieDragon],
      ['creature_attack',    +5,  true, 'ifCreature' => $rustDragon],
      ['creature_defense',   +5,  true, 'ifCreature' => $rustDragon],
    ],
    // Roland
    $creatureEfficiency(4, $swordsman, $crusader),
    // Mutare Drake
    $s5,
    // Boragus
    $creatureEfficiency(4, $ogre, $ogreMage),
    // Xeron
    [
      ['creature_attack',    +4,  true, 'ifCreature' => $devil],
      ['creature_defense',   +2,  true, 'ifCreature' => $devil],
      ['creature_speed',     +1,  true, 'ifCreature' => $devil],
      ['creature_attack',    +4,  true, 'ifCreature' => $archDevil],
      ['creature_defense',   +2,  true, 'ifCreature' => $archDevil],
      ['creature_speed',     +1,  true, 'ifCreature' => $archDevil],
    ],
  ],

  // Taken from the map editor, Map Specifications > Heroes > Properties,
  // with keys from HOTRAITS.TXT.
  'spellsOfHero' => [
    'Rion' => [$s_stoneSkin],
    'Adela' => [$s_bless],
    'Cuthbert' => [$s_weakness],
    'Adelaide' => [$s_frostRing],
    'Ingham' => [$s_curse],
    'Sanya' => [$s_dispel],
    'Loynis' => [$s_prayer],
    'Caitlin' => [$s_cure],
    'Coronius' => [$s_slayer],
    'Uland' => [$s_cure],
    'Elleshar' => [$s_curse],
    'Gem' => [$s_summonBoat],
    'Malcom' => [$s_magicArrow],
    'Melodia' => [$s_fortune],
    'Alagar' => [$s_iceBolt],
    'Aeris' => [$s_protectionFromAir],
    'Piquedram' => [$s_shield],
    'Thane' => [$s_magicArrow],
    'Josephine' => [$s_haste],
    'Neela' => [$s_shield],
    'Torosar' => [$s_magicArrow],
    'Fafner' => [$s_haste],
    'Rissa' => [$s_magicArrow],
    'Iona' => [$s_magicArrow],
    'Astral' => [$s_hypnotize],
    'Halon' => [$s_stoneSkin],
    'Serena' => [$s_dispel],
    'Daremyth' => [$s_fortune],
    'Theodorus' => [$s_shield],
    'Solmyr' => [$s_chainLightning],
    'Cyra' => [$s_haste],
    'Aine' => [$s_curse],
    'Dracon' => [$s_haste],
    'Ayden' => [$s_viewEarth],
    'Xyron' => [$s_inferno],
    'Axsis' => [$s_protectionFromAir],
    'Olema' => [$s_weakness],
    'Calid' => [$s_haste],
    'Ash' => [$s_bloodlust],
    'Zydar' => [$s_stoneSkin],
    'Xarfax' => [$s_fireball],
    'Straker' => [$s_haste],
    'Vokial' => [$s_stoneSkin],
    'Moandor' => [$s_slow],
    'Charna' => [$s_magicArrow],
    'Tamika' => [$s_magicArrow],
    'Isra' => [$s_magicArrow],
    'Clavius' => [$s_magicArrow],
    'Galthran' => [$s_shield],
    'Lord Haart' => [$s_slow],
    'Septienna' => [$s_deathRipple],
    'Aislinn' => [$s_meteorShower],
    'Sandro' => [$s_slow],
    'Nimbus' => [$s_shield],
    'Thant' => [$s_animateDead],
    'Xsi' => [$s_stoneSkin],
    'Vidomina' => [$s_curse],
    'Nagash' => [$s_protectionFromAir],
    'Mutare' => [$s_magicArrow],
    'Mutare Drake' => [$s_magicArrow],
    'Alamar' => [$s_resurrection],
    'Jaegar' => [$s_shield],
    'Malekith' => [$s_bloodlust],
    'Jeddite' => [$s_resurrection],
    'Geon' => [$s_slow],
    'Deemer' => [$s_meteorShower],
    'Sephinroth' => [$s_protectionFromAir],
    'Darkstorn' => [$s_stoneSkin],
    'Gird' => [$s_bloodlust],
    'Vey' => [$s_magicArrow],
    'Dessa' => [$s_stoneSkin],
    'Terek' => [$s_haste],
    'Zubin' => [$s_precision],
    'Gundula' => [$s_slow],
    'Oris' => [$s_protectionFromAir],
    'Saurug' => [$s_bloodlust],
    'Mirlanda' => [$s_weakness],
    'Rosic' => [$s_magicArrow],
    'Voy' => [$s_slow],
    'Verdish' => [$s_protectionFromFire],
    'Merist' => [$s_stoneSkin],
    'Styg' => [$s_shield],
    'Andra' => [$s_dispel],
    'Tiva' => [$s_stoneSkin],
    'Adrienne' => [$s_inferno],
    'Luna' => [$s_fireWall],
    'Brissa' => [$s_haste],
    'Ciele' => [$s_magicArrow],
    'Labetha' => [$s_stoneSkin],
    'Inteus' => [$s_bloodlust],
    'Aenain' => [$s_disruptingRay],
    'Gelare' => [$s_dispel],
    'Grindan' => [$s_slow],
  ],

  // Taken from the map editor, Map Specifications > Heroes > Properties,
  // with keys from HOTRAITS.TXT.
  'genderOfHero' => str_split(strtr('010101010101010110100001000101000011001100110011101010110001110000011100110001101000001000000010000110001000011000000000111111111111000011110000011000010100', [$male, $female])),
];