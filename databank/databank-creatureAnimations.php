<?php
extract(json_decode(file_get_contents("$outPath/creaturesID.json"), true));

return [
  // Determined empirically.
  'defOfCreature' => [
    'CPKMAN',       // Pikeman
    'CHALBD',       // Halberdier
    'CLCBOW',       // Light Crossboman
    'CHCBOW',       // Heavy Crossbowman
    'CGRIFF',       // Griffin
    'CRGRIF',       // Royal Griffin
    'CSWORD',       // Swordsman
    'CCRUSD',       // Crusader
    'CMONKK',       // Monk
    'CZEALT',       // Zealot
    'CCAVLR',       // Cavalier
    'CCHAMP',       // Champion
    'CANGEL',       // Angel
    'CRANGL',       // Archangel
    'CCENTR',       // Centaur
    'CECENT',       // Elite Centaur
    'CDWARF',       // Dwarf
    'CBDWAR',       // Battle Dwarf
    'CELF',         // Wood Elf
    'CGRELF',       // Grand Elf
    'CPEGAS',       // Pegasus
    'CAPEGS',       // Silver Pegasus
    'CTREE',        // Treefolk
    'CBTREE',       // Briar Treefolk
    'CUNICO',       // Unicorn
    'CWUNIC',       // War Unicorn
    'CGDRAG',       // Green Dragon
    'CDDRAG',       // Gold Dragon
    'CGREMA',       // Apprentice Gremlin
    'CGREMM',       // Master Gremlin
    'CGARGO',       // Stone Gargoyle
    'COGARG',       // Obsidian Gargoyle
    'CSGOLE',       // Iron Golem
    'CIGOLE',       // Stone Golem
    'CMAGE',        // Mage
    'CAMAGE',       // Arch Mage
    'CGENIE',       // Genie
    'CSULTA',       // Caliph
    'CNAGA',        // Naga Sentinel
    'CNAGAG',       // Naga Guardian
    'CLTITA',       // Lesser Titan
    'CGTITA',       // Greater Titan
    'CIMP',         // Imp
    'CFAMIL',       // Familiar
    'CGOG',         // Gog
    'CMAGOG',       // Magog
    'CHHOUN',       // Hell Hound
    'CCERBU',       // Cerberus
    'COHDEM',       // Single-Horned Demon
    'CTHDEM',       // Dual-Horned Demon
    'CPFIEN',       // Pit Fiend
    'CPFOE',        // Pit Foe
    'CEFREE',       // Efreet
    'CEFRES',       // Efreet Sultan
    'CDEVIL',       // Devil
    'CADEVL',       // Arch Devil
    'CSKELE',       // Skeleton
    'CWSKEL',       // Skeleton Warrior
    'CZOMBI',       // Zombie
    'CZOMLO',       // Zombie Lord
    'CWIGHT',       // Wight
    'CWRAIT',       // Wraith
    'CVAMP',        // Vampire
    'CNOSFE',       // Nosferatu
    'CLICH',        // Lich
    'CPLICH',       // Power Lich
    'CBKNIG',       // Black Knight
    'CBLORD',       // Black Lord
    'CNDRGN',       // Bone Dragon
    'CHDRGN',       // Ghost Dragon
    'CTROGL',       // Troglodyte
    'CITROG',       // Infernal Troglodyte
    'CHARPY',       // Harpy
    'CHARPH',       // Harpy Hag
    'CBEHOL',       // Beholder
    'CEVEYE',       // Evil Eye
    'CMEDUS',       // Medusa
    'CMEDUQ',       // Medusa Queen
    'CMINOT',       // Minotaur
    'CMINOK',       // Minotaur King
    'CMCORE',       // Manticore
    'CCMCOR',       // Scorpicore
    'CRDRGN',       // Red Dragon
    'CBDRGN',       // Black Dragon
    'CGOBLI',       // Goblin
    'CHGOBL',       // Hobgoblin
    'CBWLFR',       // Goblin Wolf Rider
    'CUWLFR',       // Hobgoblin Wolf Rider
    'CORC',         // Orc
    'CORCCH',       // Orc Chieftain
    'COGRE',        // Ogre
    'COGMAG',       // Ogre Mage
    'CROC',         // Roc
    'CTBIRD',       // Thunderbird
    'CCYCLR',       // Cyclops
    'CCYCLLOR',     // Cyclops Lord
    'CYBEHE',       // Young Behemoth
    'CABEHE',       // Ancient Behemoth
    'CGNOLL',       // Gnoll
    'CGNOLM',       // Gnoll Marauder
    'CPLIZA',       // Primitive Lizardman
    'CALIZA',       // Advanced Lizardman
    'CCGORG',       // Copper Gorgon
    'CBGOG',        // Bronze Gorgon
    'CDRFLY',       // Dragon Fly
    'CDRFIR',       // Fire Dragon Fly
    'CBASIL',       // Basilisk
    'CGBASI',       // Greater Basilisk
    'CWYVER',       // Wyvern
    'CWYVMN',       // Wyvern Monarch
    'CHYDRA',       // Hydra
    'CCHYDR',       // Chaos Hydra
    'CAELEM',       // Air Elemental
    'CEELEM',       // Earth Elemental
    'CFELEM',       // Fire Elemental
    'CWELEM',       // Water Elemental
    'CGGOLE',       // Gold Golem
    'CDGOLE',       // Diamond Golem
    'CPIXIE',       // Pixie
    'CSPRITE',      // Sprite
    'CPSYEL',       // Psi Elemental
    'CMAGEL',       // Magic Elemental
    '',             // NOT USED
    'CICEE',        // Ice Elemental
    '',             // NOT USED
    'CSTONE',       // Stone Elemental
    '',             // NOT USED
    'CSTORM',       // Storm Elemental
    '',             // NOT USED
    'CNRG',         // Energy Elemental
    'CFBIRD',       // Firebird
    'CPHX',         // Pheonix
    'CADRGN',       // Azure Dragon
    'CCDRGN',       // Crystal Dragon
    'CFDRGN',       // Fairie Dragon
    'CRSDGN',       // Rust Dragon
    'CENCH',        // Enchanter
    'CSHARP',       // Sharpshooter
    'CHALF',        // Halfling
    'CPEAS',        // Peasant
    'CBOAR',        // Boar
    'CMUMMY',       // Mummy
    'CNOMAD',       // Nomad
    'CROGUE',       // Rogue
    'CTROLL',       // Troll
    'SMCATA',       // Catapult
    'SMBAL',        // Ballista
    'SMTENT',       // First-Aid Tent
    'SMCART',       // Ammo Cart
  ],

  // Determined empirically.
  //
  // XXX=C
  'missileOfCreature' => [
    $gog => 'CPRGOGX',              // 9 frames
    $magog => 'CPRGOGX',
    $masterGremlin => 'CPRGRE',     // 9 frames
    $titan => 'CPRGTIX',            // 9 frames
    $monk => 'CPRZEAX',             // 9 frames
    $zealot => 'CPRZEAX',
    $cyclops => 'PCYCLBX',          // 10 frames (!)
    $cyclopsKing => 'PCYCLBX',
    $woodElf => 'PELFX',            // 9 frames
    $grandElf => 'PELFX',
    $halfling => 'PHALF',           // 1 frame (!)
    $iceElemental => 'PICEE',       // 9 frames
    $stormElemental => 'PICEE',
    $archer => 'PLCBOWX',           // 9 frames
    $marksman => 'PLCBOWX',
    $sharpshooter => 'PLCBOWX',
    $lich => 'PLICH',               // 9 frames
    $powerLich => 'PLICH',
    // XXX=I in SoD is using a beam attack
    $mage => 'PMAGEX',              // 9 frames
    $archMage => 'PMAGEX',
    $medusa => 'PMEDUSX',           // 9 frames
    $medusaQueen => 'PMEDUSX',
    $orc => 'PORCHX',               // 9 frames
    $orcChieftain => 'PORCHX',
    $lizardman => 'PPLIZAX',        // 9 frames
    $lizardWarrior => 'PPLIZAX',
    $ballista => 'SMBALX',          // 9 frames
    $catapult => 'SMCATX',          // 8 frames (!)

    // Missile images for the following creatures are unknown.
    $enchanter => 'PMAGEX',   // XXX=ID
    // XXX=I in SoD is using a beam attack
    $beholder => 'PMAGEX',
    $evilEye => 'PMAGEX',     // XXX=ID
  ],
];