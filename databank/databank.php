<?php
// You may include databank.php as a library.
require_once __DIR__.'/core.php';

// Targets are actions that this script may execute, performed in this order.
//
// When adding new foos.json file to databank (in ObjectStore or other format):
// - create write_...() (and add to $allTargets) or add to write_misc()
// - file_put_contents(foos.json) and optionally foosID.json
// - update H3.Databank: create foos property, add to stores{} and optionally to maps{}
$allTargets = [
  'misc',
  'animations',
  'creaturesID',
  'audio',
  'artifactsID',  // doesn't include Spell Scrolls
  'spellSchools',
  'spells',       // needs creaturesID, artifactsID, spellSchools
  'creatureAnimations',   // needs creaturesID, animations
  'skills',       // needs creaturesID, spellSchools
  'artifactSlots',
  'artifacts',    // needs skills, spells, creaturesID, artifactSlots, spellSchools, (towns)
  'classes',      // needs spells, misc, creaturesID, artifacts, skills, spellSchools
  'towns',        // needs spells, classes
  'creatures',    // needs creaturesID, towns, spells, spellSchools
  'heroClasses',  // needs skills, towns
  'heroes',       // needs artifactsID, artifactSlots, creaturesID, skills, spells, heroClasses
  'banks',        // needs classes, artifacts, creatures/ID
  'buildings',    // needs towns, creaturesID
  'combat',       // needs classes, towns
  'effects',  // must be almost last ($globalStaticEffects); needs heroes, classes, towns, creatures/ID
  'custom',   // must be almost last (uses all of above)
  'combined', // must be last
];

// Data common to all targets.
$o = [
  // Options that can be overridden via CLI -flags.
  'txtPath' => '',
  'idTxtPath' => '',
  'pngPath' => '',
  'outPath' => '',
  'shapesPath' => '',
  'prettyPrint' => false,
  'bitmapCSS' => '',
  'bitmapUrlPrefix' => '',
  'defUrlPrefix' => '',
  'audioPaths' => [],
  'audioUrlPrefix' => '',
  'version' => '',
  'charset' => 'cp1250',
  'targets' => [],

  // Written to constants.json in addition to const-s of StoredObject classes.
  'constants' => [
    //'version' => '',    // set by write_combined()
    //'date' => '',       // ditto

    // Size of adventure map cell, in pixels.
    'tileSize' => 32,

    // This is written as constants.effect.multiplier.
    //
    // Sets baseline for Effect targets with integer "chance %" values. 1 stands for 0...1 range, 100 - for 0...100 (i.e. percentage). Used to avoid floating point arithmetic and essentially indicates the minimal chance
    // seen as non-0% (100000 allows 0.001%). To calculate a value to use in
    // such a target, a client should first determine the decimal chance in 0...1
    // range, then multiply by this number and round.
    //
    // Avoid making it below 1000;
    // for example, if it's 100 and target is heroChance,
    // because there are ~9 heroes per class and chances are specified in SoD per class while in HeroWO - per hero, per-class chances below 9 converted to per-hero would
    // be all 0 (and SoD is specifying 5% and 6% chances only): trunc(6/9).
    'multiplier' => 100000,

    // Hero's primary skills and other simple properties.
    'stats' => array_flip([
      'attack', 'defense', 'spellPower', 'knowledge',
      'experience', 'spellPoints',
    ]),

    // Resource IDs match SoD's as defined in RESTYPES.TXT (lines 1-7).
    //
    // Should be in display order (used by H3.DOM.Bits.ResourceList).
    // SoD in various dialogs displays resources in this order (which matches
    // its internal resource IDs as seen in TXT files).
    'resources' => array_flip([
      'wood',
      'mercury',
      'ore',
      'sulfur',
      'crystal',
      'gems',
      'gold',
    ]),

    // DEF contains several animations (groups of frames) for various situations the displayed object may find itself in.
    //
    // See Animations.txt. This is written as constants.animation.group.
    // Cannot be made into Animation::const because of duplicate keys.
    'animationGroups' => [
      // DEF type 2 ($42) - Creature.
      'move' => 0,
      'hover' => 1,
      'stand' => 2,
      'hit' => 3,
      'defend' => 4,
      'die' => 5,
      'turnLeft' => 7,
      'turnRight' => 8,
      'attackUp' => 11,
      'attack' => 12,
      'attackDown' => 13,
      'shootUp' => 14,
      'shoot' => 15,
      'shootDown' => 16,
      'castUp' => 17,
      'cast' => 18,
      'castDown' => 19,
      'start' => 20,
      'stop' => 21,

      // DEF type 4 ($44) - on-map Hero.
      'up' => 0,
      'upRight' => 1,
      'right' => 2,
      'visiting' => 2,
      'downRight' => 3,
      'down' => 4,
      'moveUp' => 5,
      'moveUpRight' => 6,
      'moveRight' => 7,
      'moveDownRight' => 8,
      'moveDown' => 9,

      // DEF type 9 ($49) - in-combat Hero.
      'heroStand' => 0,
      'heroShuffle' => 1,
      'heroLose' => 2,
      'heroWin' => 3,
      'heroCast' => 4,
    ],

    // Frame numbers in ADAG.DEF (arrows used to draw hero's travel route over adventure map). See Images.txt.
    'routeDirections' => [
      // Mnemonic: move "FROM _ TO".
      'BL_T'  => 1,
      'L_TR'  => 2,
      'TL_R'  => 3,
      'T_BR'  => 4,
      'TR_B'  => 5,
      'R_BL'  => 6,
      'BR_L'  => 7,
      'B_TL'  => 8,
      'B_T'   => 9,
      'BL_TR' => 10,
      'L_R'   => 11,
      'TL_BR' => 12,
      'T_B'   => 13,
      'TR_BL' => 14,
      'R_L'   => 15,
      'BR_TL' => 16,
      'BR_T'  => 17,
      'B_TR'  => 18,
      'BL_R'  => 19,
      'L_BR'  => 20,
      'TL_B'  => 21,
      'T_BL'  => 22,
      'TR_L'  => 23,
      'R_TL'  => 24,

      // Missing images.
      'R_TR'  => 18,    // adjacent
      'TR_R'  => 3,
      'L_TL'  => 8,
      'TL_L'  => 23,
      'T_L'   => 23,    // diagonal
      'L_T'   => 1,
      'T_R'   => 3,
      'R_T'   => 17,
      'BL_TL' => 8,     // normal
      'BR_TR' => 18,
      'TL_BL' => 22,
      'TR_BR' => 4,
      'BR_BL' => 6,
      'TR_TL' => 24,
      'BL_BR' => 20,
      'TL_TR' => 2,
    ],

    // Number of hero's experience points required to reach a specific level.
    //
    // Determined empirically by changing hero's experience in the editor and starting the game.
    'levelUps' => [
      1000, 2000, 3200, 4600, 6200,
      8000,   // the editor's dropdown list has 7700 for level 7
      10000,  // ...has 9000
      12200,  // ...has 11000
      14700,  // ...has 13200
      17500,  // ...has 15500
      20600,  // ...has 18500
      // Determined empirically.
      // Multiplier for level 13 onwards: 24320, 28784, 34140, etc.
      // The editor's dropdown list ends on level 12.
      // There is no level limit but the editor doesn't permit entering more than 8 digits, thus 99999999 (level 59) is the highest you can set.
      1.18,
    ],

    // Configuration of adventure map Shroud (fog of war).
    //
    // XXX+C recheck order (precedence, e.g. cartographer vs cover of darkness)
    'shroud' => [
      // Bits setting visible/invisible state of a single map spot.
      //
      // 76543210 54321098    bit # (LE)
      // 01101111 *1101111    (1) visible  (0) hidden  (*) Effects
      //   Eeeeee  Vv vvvv    (e)xplored  (v)isible  others may be used by mods
      'cartographer' => 0,
      'observatory' => 1,   // redwoodObservatory, pillarOfFire (when not standing on them)
      'ownable_explored' => 2,    // owned a town, mine, etc. that lit the area
      'hero_explored' => 3,         // normal hero exploration
      'coverOfDarkness' => 4,    // both map object and Necropolis' building
      'hero_shroud' => 8,         // around hero's current spot
      'ownable_shroud' => 9,   // mine, etc.
      'town_shroud' => 10,   // affected by lookoutTower
      'eyeOfMagi' => 11,
      'skyship' => 13,    // XXX=I:grl:
      // Should be greater than the max explored bit but less than the min visible bit. This is a _initializeAlliedShroud() requirement. For example, if two allies... were MSBs (13th and 14th) and a spot in alliesExplored state (13th), and an ally changes state to visible then the change would not triggered due to alliesExplored being more significant than the (new) visible bit so the spot remains explored for all players instead of changing to visible.
      'alliesExplored' => 5,
      // Should be greater than the max visible bit.
      'alliesVisible' => 14,
      // 15th bit reserved for effectsMask.

      'bytes' => 2,
      'visibleMask' => 0b01101111,
      'effectsMask' => 0b10000000,

      // Bit indexes that reveal all objects. Others explore the terrain without showing objects of certain type (like enemy heroes).
      'visible' => [8, 9, 10, 11, 13, 14],
      // Pattern of graphics shown in place of fully obscured map cells. From Images.txt.
      'repeat' => [ [1, 2, 3], [0, 3, 2], [3, 0, 1], [2, 1, 0] ],

      // Set by write_misc().
      //'edge' => ...,
      //'edgeKey' => ...,
    ],
  ],
];

// ...Execution continues near EOF.

// Called if databank.php is the main script invoked by CLI, not as library.
function databankTakeOver(array $argv) {
  global $allTargets;
  global $o;
  global $globalStaticEffects;
  global $globalLabeledEffects;

  array_shift($argv);

  while (null !== $arg = array_shift($argv)) {
    if ($arg[0] === '-') {
      switch ($arg) {
        case '-t':
          $o['txtPath'] = array_shift($argv);
          break;
        case '-ti':
          $o['idTxtPath'] = array_shift($argv);
          break;
        case '-d':
          $o['pngPath'] = array_shift($argv);
          break;
        case '-g':
          $o['shapesPath'] = array_shift($argv);
          break;
        case '-p':
          $o['prettyPrint'] = true;
          break;
        case '-ts':
          $o['constants']['tileSize'] = (int) array_shift($argv);
          break;
        case '-du':
          $o['defUrlPrefix'] = array_shift($argv);
          break;
        case '-b':
          $o['bitmapCSS'] = array_shift($argv);
          break;
        case '-bu':
          $o['bitmapUrlPrefix'] = array_shift($argv);
          break;
        case '-a':
          $o['audioPaths'][] = array_shift($argv);
          break;
        case '-au':
          $o['audioUrlPrefix'] = array_shift($argv);
          break;
        case '-v':
          $o['version'] = array_shift($argv);
          break;
        case '-s':
          $o['charset'] = array_shift($argv);
          break;
        default:
          throw new Exception("Invalid -option: $arg.");
      }
    } elseif (!$o['outPath']) {
      $o['outPath'] = $arg;
    } else {
      $o['targets'][] = $arg;
    }
  }

  if (!is_dir($o['txtPath']) or !is_dir($o['pngPath']) or
      !is_dir($o['outPath']) or !is_file($o['shapesPath'])) {
    sort($allTargets);
    $allTargets = wordwrap(join(', ', $allTargets), 70, "\n  ");
    echo <<<HELP
databank.php -t BMP-TXTs/ -d DEF-PNGs/ -g shapes.json [-optional...] output/ [write[ what...]]

-d contents is produced by def2png.php, with texture.json and CSS files.
-g is produced by bmp2shape.php (-o).

You might need to increase PHP's memory_limit:
  php -d memory_limit=1G databank.php ...

Optional options:
  -ti DIR         folder with English BMP-TXTs; required if -t holds non-English
  -p              pretty-print produced JSONs; doesn't affect combined.json
  -ts PX          tile size in pixels; default: 32
  -du URL         url() prefix for merged DEF-PNG/*/*.css; relative to databank
  -b FILE         path to bitmap.css produced by bmp2png.php, to copy to output/
  -bu URL         as -du but for -b
  -a DIR          folder(s) with audio files with globally unique base names;
                  multiple -a allowed; sub-DIR not scanned
  -au URL         as -du but for all -a
  -v VERSION      override constants.json[version]; use when new databank is a
                  fixed or upgraded but compatible variant of an earlier VERSION
  -s CHARSET      iconv charset for TXTs (e.g. cp1251 for Cyrillic)

output/ may be followed by targets to process (all processed by default):
  $allTargets

Information about TXT files from SoD:
+--------------+------------+--------------------------------------------------
| File         | Processed? | Purpose
+--------------+------------+--------------------------------------------------
| ADVEVENT.TXT | Yes        | Texts for encounters of various map objects
| ARRAYTXT.TXT | Yes        | Various texts
| ARTEVENT.TXT | Yes        | Texts for encountering artifacts
| ARTRAITS.TXT | Yes (L)    | Artifact definitions
| ARTSLOTS.TXT | Yes (L)    | Texts - names of artifact slots
| BALLIST.TXT  | Yes        | Ballista attack calculation
| BLDGNEUT.TXT | Yes        | Texts for buildings
| BLDGSPEC.TXT | Yes        | Texts for buildings
| BUILDING.TXT | No,        | Building costs
|              | it's missing other info; taken from the editor
| CAMPBTTN.TXT | No         | Campaign texts
| CAMPDIAG.TXT | No         | Campaign texts - map finish
| CAMPHIGH.TXT | No         | Campaign highscores
| CAMPTEXT.TXT | No         | Campaign map names
| CASTINFO.TXT | No         | Several text lines
| CMPEDCMD.TXT | No         | Campaign editor texts
| CMPEDITR.TXT | No         | Campaign editor texts
| CMPMOVIE.TXT | No         | Campaign movie names - map finish
| CMPMUSIC.TXT | No         | Campaign music names
| CRANIM.TXT   | Yes        | In-combat and Fort creature animation definitions
| CRBANKS.TXT  | Yes (L)    | Bank building definitions
| CREDITS.TXT  | No,        | Texts for main menu's Credits screen
|              | it's used outside of the game subsystem; just copy/pasted it
| CRGEN1.TXT   | Yes (L)    | Map object names for dwellings of class 17
| CRGEN4.TXT   | Yes (L)    | ...of class 20
| CRGENERC.TXT | No         | Several names for generic building
| CRTRAITS.TXT | Yes (L)    | Creature definitions
| DWELLING.TXT | Yes        | Names for buildings that produce creatures
| EDITOR.TXT   | No         | Map editor texts
| EDITRCMD.TXT | No         | Map editor texts
| GARRISON.TXT | Yes (L)    | Map object names for Anti-magic/Garrison
| GENRLTXT.TXT | Yes        | Various texts
| HALLINFO.TXT | No         | Several text lines
| HCTRAITS.TXT | Yes (L)    | Hero class definitions
| HELP.TXT     | No (*)     | Various texts
| HEROBIOS.TXT | Yes        | Hero biography texts
| HEROES.TXT   | Yes        | Map object definitions - heroes only
| HEROSCRN.TXT | No         | Several text lines
| HEROSPEC.TXT | Yes        | Texts for hero specialties
| HOTRAITS.TXT | Yes (L)    | Starting hero army definitions
| JKTEXT.TXT   | No         | Several text lines
| LCDESC.TXT   | No         | Several lose condition texts
| MINEEVNT.TXT | Yes        | Texts for encountering mines
| MINENAME.TXT | Yes (L)    | Texts for mine names
| MONOLITH.TXT | No (?)     | Something (?) related to teleport stones
| MOVEMENT.TXT | No (*)     | Hero land and sea movement calculation
| OBJECTS.TXT  | Yes        | Map object definitions
| OBJNAMES.TXT | Yes (L)    | Map object names
| OBJTMPLT.TXT | No         | Dummy map object definitions
| OVERVIEW.TXT | No         | Several text lines
| PLCOLORS.TXT | Yes (L)    | Player text names - red, etc.
| PRISKILL.TXT | No         | Several text lines for each primary skill
| RAND_TRN.TXT | No         | Random map generator definitions
| RANDSIGN.TXT | Yes        | Texts for encountering signs
| RANDTVRN.TXT | Yes        | Texts for tavern rumors
| REGIONS.TXT  | No         | Campaign texts - map start
| RESTYPES.TXT | No         | Several text lines for every resource type
| RMG.TXT      | No         | Random map generator definitions
| SEERHUT.TXT  | Yes        | Text for seers' quests and names
| SERIAL.TXT   | No         | Dummy text lines
| SKILLLEV.TXT | No         | Several text lines for each skill mastery level
| SPTRAITS.TXT | Yes (L)    | Spell definitions
| SSTRAITS.TXT | Yes (L)    | Texts for secondary skill names and descriptions
| TCOMMAND.TXT | No         | Several text lines
| TENTCOLR.TXT | No (*)     | Several text lines for each Border Guard color
| TERRNAME.TXT | Yes (L)    | Map terrain text names - Dirt, etc.
| TOWNNAME.TXT | Yes        | Random town names, in groups of 16
| TOWNTYPE.TXT | Yes (L)    | Texts for town type titles - Castle, etc.
| TURNDUR.TXT  | No         | Several text lines for map options' turn duration
| TVRNINFO.TXT | No         | Several text lines
| VCDESC.TXT   | No         | Several victory condition texts
| WALLS.TXT    | No,        | Town fortification definitions
|              | combat is too different and here all towns have the same specs
| XTRAINFO.TXT | No         | Several text lines
+--------------+------------+--------------------------------------------------
 (*) Likely to be processed in the future
 (L) If localized, must have an English version in -ti
HELP;
    exit(1);
  }

  $globalStaticEffects = $globalLabeledEffects = [];
  $o['prettyPrint'] or $encodeJsonFlags &= ~JSON_PRETTY_PRINT;
  $targets = $o['targets'] ?: $allTargets;

  if ($diff = array_diff($o['targets'], $allTargets)) {
    throw new Exception("Unknown target(s): ".join(', ', $diff));
  }

  if (is_file("$o[outPath]/constants.json")) {
    // Overwriting an existing databank.
    // php databank.php databank/V   without -v newly generated version may
    // differ from the string in existing databank/V/constants.json.
    foreach ($targets as $target) {
      echo "$target...", PHP_EOL;
      call_user_func("write_$target", $o);
    }
  } else {
    // No constants.json means we are writing a new databank, thus place it
    // in a subfolder. Or we're overwriting existing if version matches:
    // php databank.php databank -v V   while databank/V/ exists.
    do {
      $tempPath = "$o[outPath]/".mt_rand();
    } while (file_exists($tempPath));

    mkdir($tempPath);
    echo $tempPath, PHP_EOL;

    try {
      foreach ($targets as $target) {
        echo "$target...", PHP_EOL;
        call_user_func("write_$target", ['outPath' => $tempPath] + $o);
      }
    } finally {
      try {
        $version = json_decode(file_get_contents("$tempPath/constants.json"))->version;
      } catch (Throwable $e) {}

      if (isset($version)) {
        $outPath = "$o[outPath]/$version";
        printf('%s -> %s%s%s', $tempPath, $outPath,
          file_exists($outPath) ? ' (overwriting)' : '', PHP_EOL);
        is_dir($outPath) or mkdir($outPath);

        foreach (scandir($tempPath) as $file) {
          if ($file !== '.' and $file !== '..') {
            rename("$tempPath/$file", "$outPath/$file");
          }
        }

        rmdir($tempPath);
      }
    }
  }
}

function write_classes(array $options) {
  global $globalStaticEffects;
  global $globalLabeledEffects;
  extract($options, EXTR_SKIP);

  // Determined empirically.
  //
  // XXX=R use 'terrain' rather than 'other' for non-interactive objects like Kelp
  $typeOfObject = [
    8   => 'boat',
    17  => 'dwelling',
    18  => 'dwelling',  // Creature Generator 2 (has no objects in SoD)
    19  => 'dwelling',  // Creature Generator 3 (ditto)
    20  => 'dwelling',
    216 => 'dwelling',  // random dwelling
    217 => 'dwelling',  // name-less (in SoD) random dwelling by level
    218 => 'dwelling',  // name-less (in SoD) random dwelling by town
    34  => 'hero',
    70  => 'hero',      // random hero
    214 => 'hero',      // hero placeholder
    53  => 'mine',
    220 => 'mine',
    77  => 'town',
    98  => 'town',
    54  => 'monster',
    71  => 'monster',   // random monster
    72  => 'monster',   // ditto
    73  => 'monster',   // ditto
    74  => 'monster',   // ditto
    75  => 'monster',   // ditto
    162 => 'monster',   // ditto
    163 => 'monster',   // ditto
    164 => 'monster',   // ditto
    65  => 'artifact',  // random artifact
    66  => 'artifact',  // ditto
    67  => 'artifact',  // ditto
    68  => 'artifact',  // ditto
    69  => 'artifact',  // ditto
    93  => 'artifact',  // spell scroll
    5   => 'artifact',
    12  => 'treasure',  // bonfire
    22  => 'treasure',  // skeleton
    29  => 'treasure',  // water debris
    36  => 'artifact',  // Grail
    59  => 'treasure',  // water bottle
    76  => 'treasure',  // random resource pile
    79  => 'treasure',  // resource pile
    81  => 'treasure',  // scholar
    82  => 'treasure',  // water chest
    86  => 'treasure',  // survivor
    101 => 'treasure',  // treasure chest
    6   => 'treasure',  // pandora's box
    215 => 'quest',     // quest guard
    83  => 'quest',     // seer's hut
    26  => 'event',
    33  => 'garrison',  // horizontal (regular and anti-magic)
    219 => 'garrison',  // vertical (ditto)
    43  => 'teleport',
    44  => 'teleport',
    45  => 'teleport',
    103 => 'teleport',
    111 => 'teleport',  // whirlpool
  ];

  // Determined empirically.
  $ownableClasses = [
    17, 18, 19, 20, 216, 217, 218,  // dwelling
    33, 219,            // garrison gate
    42,                 // lighthouse
    53, 220,            // mine
    77, 98,             // town
    87,                 // shipyard
  ];

  // Determined empirically.
  $movableClasses = [
    34, 70, 214,    // hero
    54, 71, 72, 73, 74, 75, 162, 163, 164,  // monster
  ];

  // Determined empirically.
  //
  // Being transparent is different from being hidden (displayOrder < 0) in that
  // hidden objects are not interactive (actionable). Event is transparent while Grail is hidden.
  $transparentClasses = [
    26,     // event
  ];

  // Determined empirically.
  //
  // This is in addition to $passableClasses and to $type of hero, monster, boat, treasure, artifact,
  // garrison.
  $actionableFromTopClasses = [
    85,                 // shipwreck
  ];

  // Determined empirically.
  $passableClasses = [
    26, 111,    // event, whirlpool
  ];

  // Determined empirically.
  $impassableClasses = [
    56, 110, 117, 118, 119, 121, 124, 126, 127, 128, 129,
    130, 131, 132, 133, 134, 135, 136, 137, 147, 148, 149,
    150, 151, 153, 155, 158, 161, 177, 199, 206, 207, 208,
    209, 210, 211, 220,
  ];

  // Determined empirically. $texture of town without Fort and Capitol. See Images.txt
  $fortlessTexture = [
    'AVCCAST0', 'AVCRAMP0', 'AVCTOWR0', 'AVCINFT0', 'AVCNECR0',
    'AVCDUNG0', 'AVCSTRO0', 'AVCFTRT0', 'AVCHFOR0',
  ];

  $handle = fopen('php://temp', 'r+b');
  fwrite($handle, file_get_contents("$txtPath/OBJECTS.TXT"));
  fwrite($handle, file_get_contents("$txtPath/HEROES.TXT"));
  rewind($handle);

  $dwellingNames = [
    17 => idListFile($options, 'CRGEN1.TXT', 'AClass::makeIdentifier'),
    20 => idListFile($options, 'CRGEN4.TXT', 'AClass::makeIdentifier'),
  ];

  $objectNames = idListFile($options, 'OBJNAMES.TXT', 'AClass::makeIdentifier');
  $animations = ObjectStore::fromFile("$outPath/animations.json");
  $animationToID = json_decode(file_get_contents("$outPath/animationsID.json"), true);
  $objects = [];

  // Unlike other TXTs, OBJECTS.TXT/HEROES.TXT use space for delimiter.
  while ($line = fgetcsv($handle, 0, ' ')) {
    // First line with the count, last line blank.
    if (count($line) < 2) { continue; }

    $objects[] = $obj = new AClass;

    list($texture, $passability, $actions, $supportedTerrain, $editorTerrain,
         $obj->class, $obj->subclass, $obj->editorGroup,
         $obj->isGround) = $line;

    $obj->type = array_search($typeOfObject[$obj->class] ?? 'other', AObject::type);
    $obj->indexName = 'object';
    // SoD treats names as case-insensitive but CSS and some file systems we
    // are running on don't so normalize.
    $texture = str_replace('.DEF', '', strtoupper($texture));
    $textureGroup = 0;
    if ($obj->class === '34') {
      // For heroes, actually used texture in game is AH00_E.DEF -> AH00_.DEF.
      $texture = str_replace('_E', '_', $texture);
      // Heroes face right, not up by default.
      $textureGroup = $constants['animationGroups']['visiting'];
    }
    if ($obj->type === array_search('boat', AObject::type)) {
      // For boats, actual texture is AVXBOAT0.DEF -> AB01_.DEF.
      $texture = 'AB0'.(preg_replace('/\\D/', '', $texture) + 1).'_';
      $textureGroup = $constants['animationGroups']['visiting'];
    }
    $obj->texture = "Hh3-def_frame_,$texture,-,,$textureGroup,-,0";
    list($obj->name, $obj->idName) =
      $dwellingNames[$obj->class][$obj->subclass] ?? $objectNames[$obj->class];
    $obj->ownable = array_search(in_array($obj->class, $movableClasses) ? 'movable' : (in_array($obj->class, $ownableClasses) ? 'ownable' : ''), AClass::ownable);
    $obj->miniMapObstacle = in_array($obj->class, $impassableClasses);
    $obj->supportedTerrain = str_split(strrev($supportedTerrain));
    $obj->editorTerrain = str_split(strrev($editorTerrain));

    if ($obj->ownable) {
      $obj->miniMap = in_array($obj->class, $movableClasses) ? -2 : 0;
    //} elseif ($obj->group == 0) {
      // 0-5 - other/town/monster/hero/artifact/treasure
      // This check is not used because the game's mini-map doesn't show
      // many impassable objects, e.g. mills, wells, border gates.
    } elseif ($obj->miniMapObstacle) {
      // Since we don't know which terrain this obstacle will overlay, we store
      // -1 for all obstacles and let particular map generator set it to the
      // correct terrain type.
      $obj->miniMap = -1;
    }

    $animationID = $animationToID[$texture."_$textureGroup"];
    $w = $animations->atCoords($animationID, 0, 0, 'width');
    $h = $animations->atCoords($animationID, 0, 0, 'height');
    if ($w % $constants['tileSize'] or $h % $constants['tileSize']) {
      throw new Exception("Invalid texture size of $texture: $w*$h.");
    }
    $obj->width  = $w / $constants['tileSize'];
    $obj->height = $h / $constants['tileSize'];

    $obj->duration = $animations->atCoords($animationID, 0, 0, 'duration');
    // Ensuring $animation for random/placeholder heroes is string so that owner/feature recording is done properly, else after H3.Rules initializes such an object it'd have incomplete $animation value.
    if ($obj->duration or in_array($obj->class, ['70', '214'])) {
      $obj->animation = sprintf('Hanim Hh3-anim_id_,%s,-,,%s',
        $animations->atCoords($animationID, 0, 0, 'name'),
        $animations->atCoords($animationID, 0, 0, 'group'));
    }

    if (strlen($passability) !== 48 or strlen($actions) !== 48) {
      throw new Exception("Invalid length of passability and/or actions bitmask.");
    }
    $obj->passable = $obj->actionable = [];
    // SoD has fixed 8x6 passability table regardless of the object's real size.
    // On top of that, it's counted from bottom right corner, leftwards.
    $pw = 8;
    $ph = 6;
    if ($obj->width > $pw or $obj->height > $ph) {
      // In HeroWO there is no such limit but this is a sanity check against SoD data format.
      throw new Exception("Texture size exceeds the maximum limit.");
    }
    foreach (range(0, $obj->width - 1) as $x) {
      foreach (range(0, $obj->height - 1) as $y) {
        // Example: AVGpike0 (Guardhouse), 3x3, passability = 0011111110{other 1...}.
        // Impassable are: bottom right corner, the tile on the left and the tile
        // on top of that tile on the left:
        // +---------------+
        // |o o o o o o o o|    o - passable tiles outside of the object's real size
        // |o o o o o o o o|
        // |o o o o o,-----,
        // |o o o o o|. . .|    . - passable tiles
        // |o o o o o|. 3 .|    1 2 3 - impassable tiles
        // |o o o o o|. 2 1|
        // +---------'-----+
        // Converted to $passability, tile 1 = 0th bit, 2 = 1st, 3 = $pw+1 = 9.
        // But in our coordinate system, Object->$passable = [x0y0, x1y0, ...].
        // For tile 1, $i = (8-3)+2 + ((6-3)+2)*8 = 47 or, reversed, 0th.
        // For tile 2, $i = (8-3)+1 + ((6-3)+2)*8 = 46 or, reversed, 1st.
        // For tile 3, $i = (8-3)+1 + ((6-3)+1)*8 = 38 or, reversed, 47-38 = 9.
        $i = ($pw - $obj->width) + $x + (($ph - $obj->height) + $y) * $pw;
        // Reverse the order of bits in $passability so it goes from top left
        // corner, rightwards.
        $i = strlen($passability) - $i - 1;
        if ($passability[$i] and $actions[$i]) {
          // In HeroWO this is not a requirement but this is a sanity check against SoD data format.
          throw new Exception("Only impassable tiles can be actionable.");
        }
        $obj->passable[$x + $y * $obj->width] = $passability[$i];
        $obj->actionable[$x + $y * $obj->width] = $actions[$i];
      }
    }
    ksort($obj->passable);
    ksort($obj->actionable);

    // Monster's box must have at least 1 cell around its actionable spot,
    // else SpotObject won't be created and $guarded won't be set.
    // This assumes all monsters are standard as in SoD:    [ ][ ] -> [ ][ ][ ]
    // Animation's dimensions are patched by def2png.php.   [ ][@]    [ ][@][ ]
    //                                                                [ ][ ][ ]
    if ($obj->type === array_search('monster', AObject::type) and
        !strncmp($texture, 'AVW', 3)) {
      $obj->adjusted = true;
      array_splice($obj->passable,   4, 0, [array_pop($obj->passable)]);
      array_splice($obj->actionable, 4, 0, [array_pop($obj->actionable)]);
    }

    if (in_array($obj->class, $transparentClasses)) {
      $obj->texture = $obj->animation = $obj->duration = null;
    }

    if (in_array($obj->class, $passableClasses)) {
      $obj->adjusted = true;  // prevent copying from .h3m; see h3m2herowo.php
      $obj->passable = false;
    }

    switch ($obj->type) {
      default:
        if (!in_array($obj->class, $actionableFromTopClasses) and
            $obj->passable !== false /*$passableClasses*/) {
          break;
        }
      case array_search('hero', AObject::type):
      case array_search('monster', AObject::type):
      case array_search('boat', AObject::type):
      case array_search('treasure', AObject::type):
      case array_search('artifact', AObject::type):
      case array_search('garrison', AObject::type):
        $obj->actionableFromTop = true;
    }

    // SoD has only one object entry per each town and it dynamically changes town's appearance based on its buildings. We create a fort-less version for each town to specify properties the AObject should have, allowing different size, passability, etc. like in Disciples 2.
    //
    // Not done for random town (77) since user will never see it in game.
    if ($obj->class === '98') {
      $objects[] = $clone = clone $obj;
      // Keeping $texture/$animation at false if originally unset.
      $clone->texture and $clone->texture = str_replace($texture, $fortlessTexture[$clone->subclass], $clone->texture);
      $clone->animation and $clone->animation = str_replace($texture, $fortlessTexture[$clone->subclass], $clone->animation);
    }
  }

  fclose($handle);

  // For below arrays keys must match the corresponding AClass constants.

  // Same order as in TERRNAME.TXT (SoD). Subclasses are indexes in texture.json's
  // groups[0] (HDL's Group0).
  $terrain = [
    'DIRTTL',       // 0  Dirt
    'SANDTL',       // 1  Desert
    'GRASTL',       // 2  Grass
    'SNOWTL',       // 3  Snow
    'SWMPTL',       // 4  Swamp
    'ROUGTL',       // 5  Rough
    'SUBBTL',       // 6  Subterranean
    'LAVATL',       // 7  Lava
    'WATRTL',       // 8  Water
    'ROCKTL',       // 9  Rock
  ];

  // Determined empirically.
  $soundOfTerrain = [
    [['DIRT', 'bgm']],
    [['SAND', 'bgm']],
    [['GRASS', 'bgm']],
    [['SNOW', 'bgm']],
    [['SWAMP', 'bgm']],
    [['ROUGH', 'bgm']],
    [['UNDERGROUND', 'bgm']],
    [['LAVA', 'bgm']],
    [['WATER', 'bgm'], ['LOOPOCEA', null]],
    [],
  ];

  // From h3m_description.english.txt.
  $river = [
    1 => 'CLRRVR',  // 1  Clear
    2 => 'ICYRVR',  // 2  Icy
    3 => 'MUDRVR',  // 3  Muddy
    4 => 'LAVRVR',  // 4  Lava
  ];

  $road = [
    1 => 'DIRTRD',  // 1  Dirt
    2 => 'GRAVRD',  // 2  Gravel
    3 => 'COBBRD',  // 3  Cobblestone
  ];

  $terrname = idListFile($options, 'TERRNAME.TXT', 'AClass::makeIdentifier');
  $passableSchema = (new Passable)->schema();

  foreach (['terrain', 'river', 'road'] as $type) {
    foreach ($$type as $class => $texture) {
      $info = json_decode(file_get_contents("$pngPath/$texture/texture.json"));

      foreach ($info->groups[0] as $subclass => $image) {
        $objects[] = $obj = new AClass(compact('class', 'subclass'));
        $obj->type = array_search($type, AObject::type);
        $obj->indexName = $type;
        $obj->texture = "Hh3-def_frame_,$texture,-,,0,-,$subclass";
        $animationID = $animationToID[$texture.'_0'];
        $w = $animations->atCoords($animationID, 0, 0, 'width');
        $h = $animations->atCoords($animationID, 0, 0, 'height');
        $obj->width  = $w / $constants['tileSize'];  // should be 1
        $obj->height = $h / $constants['tileSize'];  // same

        switch ($type) {
          case 'terrain':
            list($obj->name, $obj->idName) = $terrname[$class];
            $obj->miniMap = $class + 1;
            foreach ($soundOfTerrain[$class] as $props) {
              $obj->sounds[] = new ClassSound(array_combine(['sound', 'group'], $props));
            }
            if (in_array($class, [array_search('rock', AClass::terrain)])) {
              $obj->passable = [false];
            } else {
              // Water is passable depending on AObject->$vehicle.
              $obj->passableType = [
                $passableSchema['type'] => array_search($class === array_search('water', AClass::terrain) ? 'water' : 'ground', Passable::type),
              ];
            }
            break;

          case 'river':
          case 'road':
            $obj->name = ucwords(constant("AClass::$type")[$class]." $type");
            $obj->idName = AClass::makeIdentifier($obj->name);
        }

        // [ $terrain/river/road => AClass::terrain/river/road[this] ]
        $obj->passableType[$passableSchema[$type]] = $class;
        // Prevent json_encode() from treating $passableType as an object.
        $obj->passableType = array_replace(
          array_fill(0, max(array_keys($obj->passableType)) + 1, null),
          $obj->passableType
        );
      }
    }
  }

  // All $objects must have a set $idName by now.

  extract(require(__DIR__.'/databank-objects.php'), EXTR_SKIP);

  foreach ($objectOverrides as $id => $overrides) {
    entityOverrides($objects[$id], $overrides);
  }

  foreach ($objects as $id => $obj) {
    $effects = $spotEffectsOfObject[$id] ?? [];
    $obj->spotEffects = H3Effect::fromShort($effects, [], ['priority' => array_search('mapObject', H3Effect::priority), 'default' => ['source' => array_search('spot', H3Effect::source)]]);
    $obj->produce = $produceOfObject[$id] ?? null;
    $obj->produce and $encounterEffectsOfObject[$id][] = ['hireAvailable', array_merge([array_search('append', H3Effect::operation)], $obj->produce)];
  }

  foreach ($encounterEffectsOfObject as $key => $effects) {
    if (is_int($key)) {
      $globalStaticEffects = array_merge(
        $globalStaticEffects,
        H3Effect::fromShort($effects, [], ['priority' => array_search('mapObject', H3Effect::priority), 'default' => ['source' => array_search('initial', H3Effect::source), 'ifBonusObjectClass' => $key]])
      );
    } else {
      $globalLabeledEffects[$key] = H3Effect::fromShort($effects, ['ifObject'], ['priority' => array_search('mapObject', H3Effect::priority), 'default' => [/*'source' => array_search('initial', H3Effect::source),*/ 'ifBonusObject' => true]]);
    }
  }

  file_put_contents("$outPath/classes.json", encodeJSON(AClass::from1D($objects)));

  // Classes are separated into different indexes because their SoD's class
  // numbers duplicate due to coming from different TXTs: OBJECTS.TXT+HEROES.TXT
  // have unique classes, each ground type also has unique, but not among the
  // former two files.
  //
  // For class + subclass keys,
  // objectsID.json value is array of AClass->$id while in others
  // (terrains.json/roads.json/rivers.json) it's a single $id. This is because
  // OBJECTS.TXT has duplicate classes/subclasses pairs (and textures too) so
  // it's usually hard or impossible to determine the exact entry given just
  // a SoD class and subclass.
  $indexes = [];
  foreach ($objects as $id => $obj) {
    // "_" doesn't appear in standard SoD class names so it's safe to use as a separator.
    foreach (['', "_$obj->subclass"] as $suffix) {
      $ref = &$indexes[$obj->indexName][$obj->idName.$suffix];
      if (!$suffix or $obj->indexName === 'object') {
        $ref[] = $id;
      } else {
        $ref = $id;
      }
    }
  }
  foreach ($indexes as $col => $index) {
    file_put_contents("$outPath/{$col}sID.json", encodeJSON($index));
  }

  $text = sprintf("%-25s %s\n", 'SoD object name', 'class_subclass / HeroWO AClass->$id');
  $index = [];
  foreach ($objects as $obj) {
    if ($obj->indexName === 'object') {
      $index[$obj->idName][] = $obj->class."_$obj->subclass/$obj->id";
    }
  }
  ksort($index);
  foreach ($index as $idName => $classes) {
    sort($classes, SORT_NATURAL);
    $text .= sprintf("%-25s %s\n", $idName, join(' ', $classes));
  }
  file_put_contents("$outPath/classes.txt", $text);
}

// Kind of adventure map object - AObject's "blueprint": Windmill on a snow landscape, Dirt tile, Road tile, Blue's hero, etc.
//
// AClass->$id *mismatch* 'class' in SoD as defined in OBJECTS.TXT/HEROES.TXT.
class AClass extends StoredEntity {
  const editorGroup = [
    'other',
    'town',
    'monster',
    'hero',
    'artifact',
    'treasure',
  ];

  const terrain = [
    'dirt',
    'desert',
    'grass',
    'snow',
    'swamp',
    'rough',
    'subterranean',
    'lava',
    'water',
    'rock',
  ];

  const river = [
    1 => 'clear',
    'icy',
    'muddy',
    'lava',
  ];

  const road = [
    1 => 'dirt',
    'gravel',
    'cobblestone',
  ];

  const ownable = [
    1 => 'ownable',
    2 => 'movable',   // an object that is ownable and also routinely mobile
  ];

  static $normalize = [
    'name' => 'strval',
    'type' => 'intval',
    'class' => 'intval',
    'subclass' => 'intval',
    'editorGroup' => 'intval',
    '*supportedTerrain' => 'boolval',
    '*editorTerrain' => 'boolval',
    'texture' => 'strval',
    'animation' => 'strval',
    'duration' => 'intval',
    'width' => 'intval',
    'height' => 'intval',
    'adjusted' => 'boolval',
    'isGround' => 'boolval',
    'miniMap' => 'intval',
    '*passableType' => 'intornullval',
    '*passable' => 'boolval',
    '*actionable' => 'boolval',
    'actionableFromTop' => 'boolval',
    'ownable' => 'intval',
    'miniMapObstacle' => 'boolval',
    'sounds' => '',
    'spotEffects' => '',
    '*produce' => 'intval',
  ];

  static $compact = [
    'passable',
    'actionable',
    'supportedTerrain' => 'intval',
    'editorTerrain' => 'intval',
    'sounds' => 'ClassSound',
    'spotEffects' => 'H3Effect',
  ];

  public $name;
  public $type;   // AObject::type
  public $class;     // if $class is 'object' then this is its OBJECTS.TXT ID (cannot be 0 because SoD has 0 for DEFAULT.DEF which is unused), else is one of ::terrain/::river/::road
  public $subclass;     // variant of $class (SoD ID)
  public $editorGroup;   // submenu of this class in SoD editor's Tools menu
  public $supportedTerrain; // array ::terrain => bool; false for Rock
  public $editorTerrain;  // on which of Tools > Objects > [...] Objects this class appears (same format as $supportedTerrain)
  public $texture;      // false if transparent (invisible on map but interactive)
  public $animation;    // false if not animated (may have static $texture or be transparent)
  public $duration;     // ditto
  public $width;      // object's box on map, in tiles
  public $height;
  public $adjusted;   // indicates the fact properties are somehow different from ones in OBJECTS.TXT
  public $isGround;   // purpose not entirely clear/implemented XXX=C
  public $miniMap;    // same format as AObject->$miniMap
  public $passableType; // matches AObject->$passableType
  public $passable;
  public $actionable;
  public $actionableFromTop;
  public $ownable;    // ::ownable
  public $miniMapObstacle;    // affects $miniMap, doesn't necessary match with $passable
  // XXX make part of AObject similarly to $texture?
  public $sounds;
  // _initializeEffectsSpot() duplicates these Effects for every object's actionable point (or passable point if there are no actionable), setting $ifX/Y/Z to those coordinates.
  public $spotEffects;
  public $produce;    // array of Creature->$id; for dwellings; only informational, mainly for map convertors for filtering "dwelling" classes

  function compact_passable(array $value) {
    return (new AObject(['passable' => $value]))->normalize(true)->passable;
  }

  function compact_actionable(array $value) {
    return (new AObject(['actionable' => $value]))->normalize(true)->actionable;
  }
}

class ClassSound extends StoredObject {
  static $normalize = [
    'sound' => 'strval',
    'group' => 'strval',
  ];

  public $sound;    // looped environmental sound; distance from hero/town is calculated based on this object's actionable spot(s) (if any), or impassable spot(s) (if any), or full box (if neither)
  // Tells how all environmental sounds taken together combine with each other. If set, of all sounds with the same $group value only one is played, with volume of the closest to hero/town (with lowest AObject->$id in case distance is the same). When these play, there is normally no background or other music except as indicated by $sound. Standard group 'bgm' is used for terrain (as in SoD). If unset, sound doesn't combine with any group. However, in the end if two identical $sound are to be played (even if one has unset $group) only one of them is played (closest/loudest).
  public $group;
}

function write_misc(array $options) {
  extract($options, EXTR_SKIP);

  foreach (get_declared_classes() as $class) {
    if (is_a($class, StoredObject::class, true) and $class !== Effect::class) {
      // AObject -> object, not aObject.
      $classKey = lcfirst(preg_replace('/^A([A-Z])/', '\1', substr(strrchr("\\$class", '\\'), 1)));
      $classKey === 'h3Effect' and $classKey = 'effect';
      if (isset($constants[$classKey])) {
        throw new Exception("Duplicate constants class key $classKey coming from $class.");
      }
      foreach ((new ReflectionClass($class))->getConstants() as $property => $values) {
        if (is_array($values) and preg_match('/^[a-z]/', $property)) {
          foreach ($values as $valueNumber => $valueName) {
            $constants[$classKey][$property][$valueName] = $valueNumber;
          }
        }
      }
    }
  }

  $constants['shroud'] += shroudEdgeFrames();
  $constants['animation']['group'] = $constants['animationGroups'];
  $constants['effect']['multiplier'] = $constants['multiplier'];
  $constants = array_diff_key($constants, array_flip(['animationGroups', 'multiplier']));
  file_put_contents("$outPath/constants.json", encodeJSON($constants));

  // Texts for signs (class 91, AVXsn???.def). Support markup.
  $signs = listFile($options, 'RANDSIGN.TXT');
  foreach ($signs as &$ref) { $ref .= '`{Audio STORE`}'; }
  file_put_contents("$outPath/randomSigns.json", encodeJSON($signs));

  $rumors = array_column(csvFile($options, 'RANDTVRN.TXT'), 0);
  file_put_contents("$outPath/randomRumors.json", encodeJSON($rumors));

  $players = idListFile($options, 'PLCOLORS.TXT', 'Player::makeIdentifier');
  $image38 = 'RBYGOPTS';
  foreach ($players as $id => &$ref) {
    $ref = new Player([
      'name' => mb_convert_case($ref[0], MB_CASE_TITLE),
      'idName' => $ref[1],
      'image15' => $id,
      'image38' => 'ADOPFLG'.$image38[$id],
      'image58' => $id,
    ]);
  }
  array_unshift($players, new Player([
    'name' => 'Neutral',
    'image58' => 8,
  ]));
  // The above foreach has turned last $player's member into a reference.
  // from1D() changes $players and even though it is not obvious in PHP, the last
  // member in from1D()'s copy of $players remains a reference, meaning last member of $players in
  // write_misc() also changes, and when we give $players to makeIdIndex(), its last
  // member's value is not what it used to be when we have called from1D().
  //
  // See the last example in PHP Manual's References Explained > What References Do > Assign By Reference:
  // https://www.php.net/manual/en/language.references.whatdo.php#language.references.whatdo.assign
  //
  // $arr = array(1);
  // $a = &$arr[0];       - equivalent to foreach ($arr as &$a)
  // $arr2 = $arr;        - like passing $arr2 to from1D() *not* by reference
  // $arr2[0]++;          - from1D() changing its "copy" of $players
  // var_dump($arr);      - what makeIdIndex() sees (here it's 2, not 1!)
  //
  // Assigning by reference turns the right-side value into a special reference slot (as opposed to immediate value slot). Normal assignment ($arr2 = $arr; or passing to a function or foreach ($arr as $v) or other) creates a copy of the right-side value but a copy of reference slot is a new reference slot which points to the same value in PHP's memory.
  //
  // Doing unset($a); before $arr2 = $arr; converts $arr[0] from a reference slot to an immediate value slot and the subsequent assignment copies $arr members, all of which are now immediate values. Then $arr2[0]++ changes the value in its own immediate value slot, not the shared value pointed by reference slots in $arr and $arr2.
  unset($ref);
  file_put_contents("$outPath/players.json", encodeJSON(Player::from1D($players)));
  file_put_contents("$outPath/playersID.json", encodeJSON(Player::makeIdIndex($players)));
}

// Playable map player: Red, Blue, etc.
//
// Player->$id *mismatch* SoD's as defined in PLCOLORS.TXT.
class Player extends StoredEntity {
  static $normalize = [
    'name' => 'strval',
    'image15' => 'intval',
    'image38' => 'strval',
    'image58' => 'intval',
  ];

  public $name;
  public $image15;   // frame in ITGFLAGS
  public $image38;   // bitmap name
  public $image58;   // frame in CREST58
}

function shroudEdgeFrames() {
  // Copied from Images.txt.
  static $shroud = <<<SHROUD
              TL T  TR L  R  BL B  BR   TSHRE frame number
              ---------------------------------------------------------------
                                        (no sides visible)
                                   ↘    22
                             *  ↓  *    04 (even X), 05 (odd X)
                             ↙          flip X 22
                             ↙     ↘    23
                    *     →        *    02 (even Y), 03 (odd Y)
                    V     →  V  ↓  *    12
                          →     ↓  *    14
                    *     →  ↙     *    25
              *        ←     *          flip X 02 (even Y), flip X 03 (odd Y)
              *        ←     *     ↘    flip X 25
              V        ←     *  ↓  V    flip X 12
                       ←     *  ↓       flip X 14
              *     *  ←  →  *     *    09
              *     *  ←  →  *  ↓  *    06
                    ↗                   15
                    ↗              ↘    16
                    ↗        *  ↓  *    30
                    ↗        ↙          17
                    ↗        ↙     ↘    19
              *     ↗  ←     *          flip X 26
              *     ↗  ←     *     ↘    32
              *     ↗  ←     *  ↓  *    flip X 28
              *  ↑  *                   00 (even X), 01 (odd X)
              *  ↑  *              ↘    24
              *  ↑  *        *  ↓  *    29
              *  ↑  *        ↙          flip X 24
              *  ↑  *        ↙     ↘    33
              V  ↑  *     →        V    11
                 ↑  *     →             13
              *  ↑  *     →  *  ↓  *    flip X 07
              *  ↑  *     →  ↙     *    27
              V  ↑  *  ←     *     V    flip X 11
                 ↑  *  ←     *          flip X 13
              *  ↑  *  ←     *     ↘    flip X 27
              *  ↑  *  ←     *  ↓  *    07
              *  ↑  *  ←  →  *     *    08
              *  ↑  *  ←  →  *  ↓  *    10
              ↖                         flip X 15
              ↖                    ↘    flip X 17
              ↖              *  ↓  *    flip X 30
              ↖              ↙          flip X 16
              ↖              ↙     ↘    flip X 19
              ↖     *     →        *    26
              ↖     *     →  *  ↓  *    28
              ↖     *     →  ↙     *    flip X 32
              ↖     ↗                   18
              ↖     ↗              ↘    20
              ↖     ↗        *  ↓  *    31
              ↖     ↗        ↙          flip X 20
              ↖     ↗        ↙     ↘    21
SHROUD;

  $columns = $edge = [];

  foreach (explode("\n", $shroud) as $line) {
    if (trim($line, " -\r") === '') {
      continue;
    } elseif (!$columns) {
      $columns = preg_split('/\\s+/', rtrim($line), 10, PREG_SPLIT_OFFSET_CAPTURE);
      array_shift($columns);
    } else {
      $values = ['oddX' => '*', 'oddY' => '*'];

      foreach ($columns as $i => [, $pos]) {
        $next = $columns[$i + 1][1] ?? PHP_INT_MAX;
        // The $columns line is ASCII so can use offsets as codepoints on next lines.
        $frames = $values[] = trim(mb_substr($line, $pos, $next - $pos));
      }

      $frames = end($values);

      if (strrchr($frames, ',')) {
        $variants = array_map(function ($frame) use ($values, $columns) {
          if (!preg_match('/^(.+) \\((even|odd) (X|Y)\\)$/u', $frame, $match)) {
            throw new Exception("Cannot parse frame: $frame");
          }

          list(, $frame, $evenOdd, $axis) = $match;

          $values[count($columns) - 1] = $frame;
          $values["odd$axis"] = $evenOdd === 'odd';

          return $values;
        }, explode(', ', $frames));
      } else {
        $variants = [$values];
      }

      $vary = function (array $variants, $var) {
        return array_merge(...array_map(function ($values) use ($var) {
          $count = array_count_values(array_map('strval', $values))[$var] ?? 0;

          return array_map(function ($i) use ($values, $var) {
            $bin = str_split(sprintf('%08b', $i));

            return array_map(function ($value) use (&$bin, $var) {
              return $value === $var ? array_pop($bin) : $value;
            }, $values);
          }, range($var === 'V' and $count, pow(2, $count) - 1));
            // "V" means some field must be set so skipping $i of 0, but only if
            // there are any "V" ($count > 0), else result will be [].
        }, $variants));
      };

      $variants = $vary($variants, 'V');
      $variants = $vary($variants, '*');

      foreach ($variants as $values) {
        $frame = array_pop($values);

        $key = 0;
        foreach ($values as $value) { $key = $key << 1 | (bool) $value; }

        $ref = &$edge[$key];

        if ($frame === '(no sides visible)') {
          $ref = null;
        } elseif (!preg_match('/^(flip X )?0*(\\d+)$/u', $frame, $match)) {
          throw new Exception("Cannot parse frame: $frame");
        } else {
          $ref = (int) $match[2];
          $match[1] and $ref = ~$ref;
        }
      }
    }
  }

  $edgeKey = array_flip(array_reverse(array_merge(
    array_filter(array_keys($values), 'is_string'),
    array_map('strtolower', array_column(array_slice($columns, 0, -1), 0))
  )));

  ksort($edge);
  if (array_keys($edge) !== range(0, pow(2, count($edgeKey)) - 1)) {
    throw new Exception('Wrongly generated shroud edge combinations.');
  }

  return compact('edgeKey', 'edge');
}

// Extends databank with data not present in SoD's data files. For example, creates special siege creatures (arrow towers, gates, etc.).
function write_custom(array $options) {
  extract($options, EXTR_SKIP);
  $files = [];

  foreach (scandir($outPath) as $file) {
    if (substr($file, -5) === '.json' and $file !== 'combined.json') {
      $var = 'd_'.basename($file, '.json');
      $$var = json_decode(file_get_contents($files[$var] = "$outPath/$file"), true);

      if (is_array($$var['schema'] ?? null)) {
        $$var = ObjectStore::from($$var);
      }
    }
  }

  require __DIR__.'/databank-custom.php';

  foreach ($files as $var => $file) {
    file_put_contents($file, encodeJSON($$var));
  }
}

function write_combined(array $options) {
  global $encodeJsonFlags;
  extract($options, EXTR_SKIP);

  $combined = [];
  $hash = hash_init('sha1');
  $css = '';
  $skip = ['combined.json', 'combined.css'];

  // This assumes there are no unrelated files in $outPath.
  foreach (scandir($outPath) as $file) {
    if (substr($file, -5) === '.json' and !in_array($file, $skip)) {
      $data = file_get_contents("$outPath/$file");
      hash_update($hash, $data);
      $combined[$file] = json_decode($data);
    }
    if (substr($file, -4) === '.css' and !in_array($file, $skip)) {
      $css .= file_get_contents("$outPath/$file")."\n";
    }
  }

  hash_update($hash, $css);
  $hash = hash_final($hash);
  $combined['constants.json']->version = strlen($version) ? $version : $hash;
  // DATE_W3C includes the time zone. Can be parsed in JavaScript with
  // new Date('...'.split(' ')[0]).
  $combined['constants.json']->date = date(DATE_W3C).' '.time();

  $json = encodeJSON($combined, $encodeJsonFlags & ~JSON_PRETTY_PRINT);
  file_put_contents("$outPath/combined.json", $json);
  file_put_contents("$outPath/constants.json", encodeJSON($combined['constants.json']));

  // Use external tools (uglify, cssmin, etc.) to minify this file and menu.css.
  file_put_contents("$outPath/combined.css", $css);

  write_mainMenu($options);
}

// Pictures' styles used in the main menu (H3.DOM.MainMenu). It cannot rely on
// databank styles being present since the menu is shown outside of the game,
// when no databank (or H3 module) is loaded. Makes sense to be generated
// for the "current" databank only since the menu doesn't use other game/mod versions.
function write_mainMenu(array $options) {
  extract($options, EXTR_SKIP);

  $classPrefixes = [
    'animations' => [
    ],
    'bitmap' => [
      'HPS',
      'HPSRAND0',
      'HPSRAND1',
      'HPSRAND6',
    ],
    'buttons' => [
      'ADOPLFA',
      'ADOPRTA',
      'AOFLGBB',
      'AOFLGBG',
      'AOFLGBO',
      'AOFLGBP',
      'AOFLGBR',
      'AOFLGBS',
      'AOFLGBT',
      'AOFLGBY',
      'GSPBUT3',
      'GSPBUT4',
      'GSPBUT5',
      'GSPBUT6',
      'GSPBUT7',
      'GSPBUTT',
      'GTBACK',
      'GTCAMPN',
      'GTMULTI',
      'GTSINGL',
      'GTTUTOR',
      'MMENUCR',
      'MMENUHS',
      'MMENULG',
      'MMENUNG',
      'MMENUQT',
      'SCALBUT',
      'SCBUTCP',
      'SCBUTT1',
      'SCBUTT2',
      'SCBUTT3',
      'SCBUTT4',
      'SCBUTT5',
      'SCLGBUT',
      'SCMDBUT',
      'SCNRBACK',
      'SCNRBDN',
      'SCNRBEG',
      'SCNRBLF',
      'SCNRBRT',
      'SCNRBSL',
      'SCNRBUP',
      'SCNRLOD',
      'SCNRSAV',
      'SCSMBUT',
      'SCXLBUT',
    ],
    'defs' => [
      'ITPA-0-',
      'SCNRSTAR-0-',
    ],
  ];

  $classes = [];
  foreach ($classPrefixes['animations'] as $name) {
    $classes[] = "Hh3-anim_id_$name";
    // Above also matches @keyframes.
  }
  foreach ($classPrefixes['bitmap'] as $name) {
    $classes[] = "Hh3-bmp_id_$name";
  }
  foreach ($classPrefixes['buttons'] as $name) {
    $classes[] = "Hh3-btn_id_$name";
  }
  foreach ($classPrefixes['defs'] as $name) {
    $classes[] = "Hh3-def_frame_$name";
  }

  $h = fopen("$outPath/combined.css", 'rb');
  $state = 0;
  $menu = $buf = [];
  // This is much faster than foreach ($classes as $c) if (stripos($c)).
  $re = '/'.join('|', array_map('preg_quote', $classes)).'/i';

  while (false !== $line = fgets($h)) {
    if (!$state) {
      if (substr(rtrim($line), -1) !== '{') {
        $buf[] = $line;
      } elseif (preg_match($re, join($buf).$line)) {
        $buf[] = $line;
        $state = 2;
      } else {
        $buf = [];
        $state = 1;
      }
    } else {
      $state === 2 and $buf[] = $line;

      if (rtrim($line) === '}') {
        if ($state === 2) {
          $menu[] = preg_replace($re, 'M$0', join($buf));
          $buf = [];
        }
        $state = 0;
      }
    }
  }

  fclose($h);
  file_put_contents("$outPath/menu.css", join($menu));

  if ($audioPaths) {
    $menuSounds = ['BUTTON', 'MAINMENU', 'PLAYCOME', 'PLAYEXIT'];

    $audio = json_decode(file_get_contents("$outPath/audio.json"), true);
    $audio = array_intersect_key($audio, array_flip($menuSounds));
    file_put_contents("$outPath/menuAudio.json", encodeJSON($audio));
  }
}

function write_animations(array $options) {
  extract($options, EXTR_SKIP);
  $animations = [];

  foreach (scandir($pngPath, SCANDIR_SORT_NONE) as $dir) {
    if (is_file($file = "$pngPath/$dir/texture.json")) {
      $texture = json_decode(file_get_contents($file));
      foreach ($texture->groups as $gn => $files) {
        // ?: - trigger an error if getimagesize() fails.
        list($w, $h) = getimagesize("$pngPath/$dir/$gn-0.png") ?: [];
        $animations[] = new Animation([
          'name' => strtoupper($dir),
          'idName' => strtoupper($dir)."_$gn",
          'type' => $texture->type,
          'group' => $gn,
          'width' => $w,
          'height' => $h,
          'frameCount' => count($files),
          'duration' => count($files) > 1 ? $texture->interval * count($files) : false,
        ]);
      }
    }
  }

  file_put_contents("$outPath/animations.json", encodeJSON(Animation::from1D($animations)));
  file_put_contents("$outPath/animationsID.json", encodeJSON(Animation::makeIdIndex($animations)));

  $prefix = function ($css, $prefix) {
    strlen($prefix) and $css = preg_replace('/\burl\(/u', "$0$prefix", $css);
    return $css;
  };

  if ($bitmapCSS) {
    file_put_contents("$outPath/bitmap.css", $prefix(file_get_contents($bitmapCSS), $bitmapUrlPrefix));
  }

  $animations = $buttons = $defs = '';

  foreach (scandir($pngPath, SCANDIR_SORT_NONE) as $dir) {
    $files = [
      "$dir/animation.css" => &$animations,
      "$dir/button.css" => &$buttons,
      "$dir/def.css" => &$defs,
    ];

    $dir = strlen($defUrlPrefix) ? "$defUrlPrefix$dir/" : '';

    foreach ($files as $file => &$ref) {
      if (is_file("$pngPath/$file")) {
        $ref .= $prefix(file_get_contents("$pngPath/$file"), $dir)."\n";
      }
    }
  }

  file_put_contents("$outPath/animations.css", $animations);
  file_put_contents("$outPath/buttons.css", $buttons);
  file_put_contents("$outPath/defs.css", $defs);
}

function write_audio(array $options) {
  extract($options, EXTR_SKIP);

  if (!$audioPaths) {
    return fwrite(STDERR, 'Not writing audio.json in absence of -a.'.PHP_EOL);
  }

  $audio = [];

  foreach ($audioPaths as $path) {
    // Removing excessive path separators because they would break relative <audio src>.
    $path = rtrim(preg_replace('~[\\\\/]+~u', '/', $path), '/');

    foreach (scandir($path) as $file) {
      $full = "$path/$file";
      if (is_file($full) and $ext = strrchr($file, '.') and
          // There are LoopLepr.mp3 and LOOPLEPR.WAV. Skipping the former, it's the same.
          strcasecmp($file, 'LoopLepr.mp3')) {
        $base = substr($file, 0, -strlen($ext));
        if (isset($audio[$base])) {
          throw new Exception("Duplicate -a'udio file name: $full");
        }
        // SoD names use random case in even similar files (e.g. "AITheme0"
        // but "AITHEME1") so normalizing them.
        //
        // XXX perhaps also normalize to a valid identifier (remove spaces)?
        $audio[strtoupper($base)] = $audioUrlPrefix.$full;
      }
    }
  }

  file_put_contents("$outPath/audio.json", encodeJSON($audio));
}

// Info about a single animation (group of frames) from a DEF file. For example, hero moving up on adventure map.
class Animation extends StoredEntity {
  const type = [
    'spell',
    'spritedef', // unused in SoD
    'creature', // in combat
    'object', // on ADVMAP
    'mapHero',
    'ground',
    'cursor',
    'interface',
    'frame',  // unused in SoD
    'combatHero',
  ];

  static $normalize = [
    'name' => 'strval',
    'type' => 'intval',
    'group' => 'intval',
    'width' => 'intval',
    'height' => 'intval',
    'frameCount' => 'intval',
    'duration' => 'boolorintval',
  ];

  public $name;   // base name of the .def file
  public $type;   // type of .def; same for all $group-s in $name
  public $group;  // group number in $name.def; from animationGroups constant
  public $width;  // first frame's image, in pixels
  public $height;
  public $frameCount; // 1+
  public $duration;   // ms; false if $frameCount is 1
}

function write_effects(array $options) {
  global $globalStaticEffects;
  global $globalLabeledEffects;
  extract($options, EXTR_SKIP);
  extract(require(__DIR__.'/databank-effects.php'), EXTR_SKIP);

  if ($targets) {
    return fwrite(STDERR, 'Not writing staticEffects.json because it needs all targets to be processed.'.PHP_EOL);
  }

  $effects = $initialTargetEffects;

  $effects[] = ['worldBonusChances', [$override, $weeklyBonuses], 'ifDateDay' => 1];
  $effects[] = ['worldBonusChances', [$override, $monthlyBonuses], 'ifDateDay' => 1, 'ifDateWeek' => 1];

  foreach ($initialTargetEffectsOfCreature as $prop => $default) {
    if (is_int($prop)) {
      $prop = $default;
      $default = null;
    }
    $effects[] = ["creature_$prop", [$databank, 'ifCreature', 'creatures', ${"cr_$prop"}, null, $default, $prop === 'critical']];
  }

  $effects = array_merge(
    H3Effect::fromShort($effects, [], ['priority' => array_search('defaults', H3Effect::priority), 'default' => ['source' => array_search('initial', H3Effect::source)]]),
    $globalStaticEffects
  );

  foreach ($effects as $effect) {
    isset($effect->source) or $effect->source = array_search('initial', H3Effect::source);
  }

  // Not an ObjectStore because it's not used by JS directly. h3m2herowo.php
  // combines it with map-specific Effects and this requires knowing
  // precise object structures.
  file_put_contents("$outPath/staticEffects.json", encodeJSON($effects));
  file_put_contents("$outPath/staticLabeledEffects.json", encodeJSON($globalLabeledEffects));
  file_put_contents("$outPath/staticEffectsSchema.json", encodeJSON(H3Effect::$normalize));
}

// Extension of core.php's Effect actually used by the engine. Done here in an attempt to keep H3 subsystem separate from the core engine (that can be used by several subsystems - H2, H3, others). This separation is rudimentary at the moment as most core parts are heavily intertwined with H3.
class H3Effect extends Effect {
  const context = [
    // null/0 - custom/inapplicable.
    1 => 'map',
    'combat',
  ];

  const aggression = ['defender', 'attacker'];

  const garrisonDetails = [
    // 0/null - see nothing
    1 => 'list',  // list of creatures w/o numbers
    'approximate',    // "several of"
    'full',   // precise numbers
  ];

  // Members must go in order of strength.
  // Numeric suffix indicates a stronger version (e.g. Citadel's over Fort's).
  const fortification = [
    'trench2',   // for Citadel; for Tower town type, this creates Land Mines
    'trench3',   // for Castle
    'middleTower2',
    'middleTower3',
    'upperTower3',
    'lowerTower3',
    'gate',   // for Fort
    'gate2',
    'gate3',
    'upperWall',
    'midUpperWall',
    'midLowerWall',
    'lowerWall',
    'upperWall2',
    'midUpperWall2',
    'midLowerWall2',
    'lowerWall2',
    'upperWall3',
    'midUpperWall3',
    'midLowerWall3',
    'lowerWall3',
  ];

  const isAdjacent = [
    // 0/null - not adjacent.
    1 => 'own',
    'ally',
    'enemy',
  ];

  // Conditions

  // During combat, $ifObject holds Town if defending a town without a hero.
  //
  //> surrenderCan `- the hero wishing to surrender
  //> surrenderCost `- the hero wishing to surrender
  //> retreatCan `- the hero trying to retreat
  //> spellMastery `- if casting by hero
  //> spellDuration `- casting hero
  //> spellLearn `- casting hero; $ifTargetObject can be used to match the targeted hero
  //> creature_cost `- if hiring from a town ($ifBuilding is also set) or hero ($ifBuilding is not set)
  //> hireAvailable `- the hirer (hero or town, unset if determining potential "produceability")
  //> creature_growth `- Town, Hero, Dwelling
  //> tradeRate `- can be Town or other ADVMAP object (Trading Post)
  //> tavernRumor `- hero visiting either a Town or a standalone Tavern ADVMAP object, possibly unset
  //> tavernCost `- as `'tavernRumor
  //> tavernHeroes `- as `'tavernRumor
  //> garrison_reinforce AObject->$id `- if visiting a town, gates, exchanging with other hero
  //> artifactChance `- when giving initial MapPlayer.bonus.artifact to startingHero
  //> shipCost `- hiring hero, if any
  //> fortifications `- either the defending hero or town itself (in absence of visiting/garrisoned hero); if hero, the besieged town is in $ifVisiting/$ifGarrisoned (if those are unset, the combat happens outside of any town and usually has no fortifications)
  //> town_canBuild `- the town
  //
  // When evaluating global bonus (timed events) both this and $ifBonusObject are 0 and $ifPlayer is set.
  //public $ifObject;

  //public $ifObjectType;

  //> hero_embarkCost `- 1+ the boat, 0 if disembarking
  //> tavernRumor `- town or standalone tavern
  //> shipCost `- town or standalone shipyard
  //> fortifications `- the besieger (hero)
  //> hireAvailable `- dwelling/hero/town from which hiring happens
  //= int 0 timed event`, int 1+ AObject->$id of map object performing the bonus/encounter (Witch Hut, etc.)
  //
  // When evaluating global bonus (timed events) for a particular town or hero, this is 0 while $ifObject is truthy.
  //
  // Meanings of possible combinations of _opt.ifObject, _opt.ifBonusObject and
  // _opt.ifPlayer:
  //
  //     iO  | iBO | iP  <- values in _opt
  //   | null| null| *   |     non-encounter/bonus Effect
  //   | null| 0   | *   | INVALID
  //   | null| 1+  | *   | INVALID
  //   | 0   | null| *   | INVALID
  //   | 0   | 0   | null| INVALID
  //   | 0   | 0   |!null|             player-wise timed event
  //   | 0   | 1+  | *   | INVALID
  //   | 1+  | null| null| INVALID
  //   | 1+  | null|!null|     non-encounter/bonus Effect
  //   | 1+  | 0   | null| INVALID
  //   | 1+  | 0   |!null|             town- or hero-wise timed event
  //   | 1+  | 1+  | null| INVALID
  //   | 1+  | 1+  |!null|         encounter
  public $ifBonusObject;

  //= int AClass->$id of $ifBonusObject
  public $ifBonusObjectClass;

  // If $ifObject is a Hero, 0 or 1 of these is set to Town->$id if garrisoned or visiting there.
  // During combat, attacker has these unset.
  //
  // If it's a Town: 0, 1 or 2 of these are set to Hero->$id. During combat,
  // these are unset (else $ifObject would be a Hero).
  //
  // "Unset" value is 0 (not false).
  //
  // XXX=I $ifVisiting may be also set to the hero that visits a garrison (gates).
  public $ifGarrisoned;
  public $ifVisiting;

  //> tavernHeroes `- ifPlayer must be provided
  //public $ifPlayer;

  //public $ifPlayerController;

  //public $isAlly;
  //public $isEnemy;

  // During combat, this specifies hero state on ADVMAP.
  //public $ifVehicle;

  // During combat, these specify coords on ADVMAP, not on combat field.
  //
  // For objects with action spot they indicate that spot's coords.
  //> canCombat
  //> hero_embarkCost `- not of $ifObject (hero) but of the boat (embarking) or shore (disembarking)
  //public $ifX;
  //public $ifY;
  //public $ifZ;
  //public $ifRadius;

  //= int resource ID
  //> tradeRate `- what is given to Marketplace
  public $ifResource;

  //> tradeRate `- what is obtained from Marketplace
  public $ifResourceReceive;

  //= int Skill->$id
  public $ifSkill;

  //= int Spell->$id
  public $ifSpell;

  //= int SpellSchool->$id
  public $ifSpellSchool;

  //= int (0 if unspecified Spell->$level)
  public $ifSpellLevel;

  // Type of action's effect on its target. Spell::aggression.
  //= 0 general action (e.g. View Air)`, 1 defensive action (e.g. Fire
  //  Wall)`, 2 offensive action (e.g. Armageddon)
  public $ifAggression;

  //= int ::context
  //> spellLearn `- on ADVMAP is for Mage Guild/Shrine/etc. visit, in combat is for spell cast by enemy (Eagle Eye)
  public $ifContext;

  // During combat, $ifObject is of a combat's party.
  //= int ::aggression
  public $ifContextAggression;

  // During combat, these specify ADVMAP features.
  //= int constants.terrain
  //> artifactChance `- if resolving a randomArtifact AObject
  public $ifTerrain;

  //= int constants.river
  public $ifRiver;

  //= int constants.road
  public $ifRoad;

  // Matches only during combat, for specific creature stack/slot in a party's garrison (i.e. matches one, not all
  // creatures with the same Creature->$id if they're split in multiple interactive creatures). This identifier is temporary, specific to
  // particular combat.
  public $ifCombatCreature;

  //= str Party _parentKey
  public $ifCombatParty;

  //= str Combat _parentKey
  public $ifCombat;

  //= int Creature->$id
  //> creature_costUpgrade `- original unupgraded creature
  //> creature_upgradeCan `- original unupgraded creature
  //> spellMastery `- if casting by creature    XXX=I creature casting
  //> creature_luck `- can be `'null if evaluating generally for hero/town
  public $ifCreature;

  //= int 1+ minimum level to match
  public $ifCreatureLevel;

  //= int use 0 to match neutrals (not `'null/`'false)
  public $ifCreatureAlignment;

  //= null don't check`, int 0 melee, 1 shooting (not bool!)
  // This tests only creature's "shootability" as a trait, not actual ability to shoot in a particular combat (which may be affected by Effects).
  public $ifCreatureShooting;

  //= null don't check`, int Creature::undead (not bool!), 0 if neutral/mechanical
  public $ifCreatureUndead;

  //> spellEfficiency `- target is not given if spellGlobal
  public $ifTargetCombatCreature;
  //> creature_costUpgrade `- the to-be-upgraded-into form of $ifCreature
  public $ifTargetCreature;
  public $ifTargetCreatureLevel;
  public $ifTargetCreatureAlignment;
  public $ifTargetCreatureUndead;

  //> artifactTrade `- receiver
  //> garrison_reinforce `- receiver
  //
  // Special -1 value takes value of $ifObject ("take from self and put back to self").
  public $ifTargetObject;

  // Similar to $ifPlayer/$isAlly/$isEnemy but $ifTargetPlayer can be -1 to take _opt.ifPlayer. Thus if -1, matches if targeted player, whoever he may be, is ally/enemy of the originating (casting) player, else matches if targeted player is an ally/enemy of that specific $ifTargetPlayer.
  //
  // For example, if casting Magic Arrow:
  // - $ifPlayer, _opt.ifPlayer = 1 - who casts the spell
  // - $ifTargetPlayer = 2 - whose creature is targeted
  // Such Effect matches if the caster is P1 and the target belongs to P2 (_opt.ifTargetPlayer is 2).
  //
  // Another example:
  // - $ifPlayer, _opt.ifPlayer = 1
  // - $ifTargetPlayer = null
  // Such Effect matches whenever the caster is P1, for any target or lack thereof (any _opt.ifTargetPlayer).
  //
  // Another example:
  // - $ifPlayer, _opt.ifPlayer = 1
  // - $ifTargetPlayer = -1 (= _opt.ifPlayer = 1)
  // Such Effect matches whenever the caster is P1 and the target belongs to P1 (_opt.ifTargetPlayer is 1).
  //
  // Another example:
  // - $ifPlayer, _opt.ifPlayer = 1
  // - $ifTargetPlayer = -1 (= _opt.ifPlayer = 1)
  // - $isTargetPlayerAlly = true
  // Such Effect matches if the caster is P1 and, if _opt.ifTargetPlayer = 1, then never; if 2, then P2 is an ally of P1.
  //
  // Another example:
  // - $ifPlayer, _opt.ifPlayer = 1
  // - $ifTargetPlayer = 2
  // - $isTargetPlayerAlly = true
  // Such Effect matches if the caster is P1 and, if _opt.ifTargetPlayer = 2, then never; if 1, then P2 is an ally of P1; if 3, then P2 is an ally of P3; etc.
  public $ifTargetPlayer;
  public $isTargetAlly;
  public $isTargetEnemy;

  // If `'true, only matches during combat, for hero or town opposing `'$ifObject.
  // $isSupporter matches for allies of $ifObject, excluding other parties of the same player participating in one combat - these are listed in $isSupporterSamePlayer (but they don't include the party of $ifObject). Only one of these 3 may be set.
  //
  // Don't use these to match actions against a specific hero, like for an artifact protecting against harmful magic. Use $ifTargetPlayer or $ifTargetObject instead. $isOpponent matches for every casting enemy regardless who is the target so, for example, given a combat with 3 parties (hero 1 wearing the artifact, enemy hero 2, ally hero 3) and artifact's Effect using $ifObject = hero 1, $isOpponent = true, spells cast by enemy 2 on ally 3 will be subject to the Effect (which may or may not be desirable). But it won't if Effect is defined as $ifTargetObject = hero 1.
  //= bool
  public $isOpponent;
  public $isSupporter;
  public $isSupporterSamePlayer;

  // If `'true, only matches during combat, for creatures that are adjacent to
  // `'$ifTargetCreature on the field. Used to implement Unicorn's spell resistance aura.
  //
  //= int ::isAdjacent
  public $isTargetAdjacent;

  //= int Artifact->$id
  //
  //> creature_cost `- if hiring from artifact
  public $ifArtifact;

  //= int Building->$id
  //
  //> creature_cost `- if hiring from building
  //> tavernRumor `- if a town's tavern
  //> tavernCost `- same
  //> tavernHeroes `- same
  //> artifactChance `- if buying from Artifact Merchant    XXX=I
  //> shipCost `- if building from town
  //> hireAvailable `- if hiring from town
  public $ifBuilding;

  //= int AObject->$id
  //> tavernCost
  public $ifTavernHero;

  //= Hero->$id
  // Used by Quest Guard, etc.
  public $ifHero;

  //= int
  // Inclusive. As usual, null/false mean "any". Only for targets calculated by GenericEncounter. Used to implement one-time quests (Seer's Hut, banks). Disappearing quests (Scholar, resource) are implemented using quest_remove.
  //
  // Similar in purpose to $encounterLabel (quest_reset) and $whileOwned; see the latter for details.
  public $ifGrantedMin;
  public $ifGrantedMax;

  // Properties

  //= str
  // Used by GenericEncounter when applying quest_reset. Don't use strings special to that target, like `'R.
  public $encounterLabel;

  // Below are all valid Effect targets, their description (unless obvious) and type of result (and therefore modifier).
  //
  //> creature_cost int amount per 1
  //> creature_costUpgrade int amount per 1
  //> creature_upgradeCan array upgraded creature ID
  //> creature_fightValue int
  //> creature_aiValue int
  //> creature_growth int - recurring through AObject->available
  //> creature_hordeGrowth int `- not currently used (horde world bonus = double creature_growth) XXX=I
  //> creature_hitPoints int `- recurring
  //> creature_speed int
  //> creature_moveDistance int
  //> creature_attack int
  //> creature_defense int
  //> creature_damageMin int
  //> creature_damageMax int
  //> creature_mapMin int
  //> creature_mapMax int
  //> creature_shots int `- recurring
  //> creature_luck int
  //> creature_morale int
  //> creature_shootPenalty int absolute damage `- applied when performing a
  //  shot through obstacle or fortification or over a long distance, else
  //  damage is not adjusted (100%); obviously,
  //  only $shooting Creature can have this
  //> creature_absolute bool `- whether damage calculation ignores hero's/creature's attack/defense/piercing
  //> hero_attack int
  //> hero_defense int
  //> hero_spellPower int
  //> hero_knowledge int
  //> hero_actionPoints int `- recurring
  //> hero_actionCost int `- cost of moving over a tile on ADVMAP
  //> hero_spellPoints int `- recurring
  //> hero_spellPointsDaily int
  //> income int amount
  //> hireAvailable array creature ID
  //> hireFree bool `- for dwellings; which of hireAvailable join the hero for free (full available count for hire at the moment of encounter)
  //> surrenderCost int amount `- cost for surrendering a combat
  //> surrenderCan bool `- possibility for surrendering
  //> retreatCan bool `- possibility for fleeing, for combat hero >>and for ADVMAP monster (XXX=I) before combat (this happens after check for 'creature_join')<< (XXX=I:mof: rename target for this case)
  //> creature_abilityText str `- shown in Creature Info dialog in tooltip mode (right mouse button)
  //> grows bool `- increase monster's numbers every Monday; applies to monsters, dwellings and towns
  //> creature_join int % multiplier `- chance whether monster group will join hero on encounter (XXX=I)
  //> name str `- for hero, town, Seer's Hut ($ifObject)
  //> portrait str `- for heroes: bitmap file name without prefix: '000EL'
  //  (actual is 'HPL|HPS' + ... + '.bmp'); for towns: DEF frame number in ITPT, group 0 (actual
  //  is 'ITPT|ITPA', group 0, adjusted to show the cross if town_hasBuilt)
  //> combatImage str `- for heroes: DEF file name; other object types potentially could have this but it's not implemented yet
  //> hero_biography str
  //> hero_gender int `- Hero::gender
  //> tacticsDistance int `- number of hex tiles in pre-combat stage
  //> hero_walkTerrain array Passable->$type `- tiles hero can pass over
  //> hero_stopTerrain array Passable->$type `- tiles hero can end travel on
  //> hero_walkImpassable bool `- to ignore Passable->$impassable and pass over
  //> hero_garrisonConvert array new creature IDs `- like some heroes can upgrade
  //  Archers to Sharpshooters, etc. (XXX=I,R also merge with creature_upgradeCan?)
  //> creature_whirlpoolPenalty int absolute creature number `- only applied to the weakest stack; if evaluates to < 1, is set to 1
  //> creature_queue bool `- whether the creature is present in combat queue and
  //  can take its turn according to `'creature_speed
  //> town_canBuild bool`- allows or forbids erecting certain buildings
  //> town_hasBuilt int <= 0 if cannot build more this turn in $ifObject
  //> town_buildings array Building->$id
  //> randomRumors array str `- plain text (no markup)
  //> randomSigns array str `- supports markup
  //> garrisonSee int `- ::garrisonDetails
  //> creature_spells array Spell->$id
  //> hero_spells array Spell->$id
  //> spellMastery int Spell::mastery
  //> hero_skills array Skill->$id
  //> skillMastery int Skill::mastery`, 0 for none (should be > 0 for skills part of hero_skills)
  //> spellEfficiency int `- spell-specific absolute value (damage dealt, HPs cured, etc.); strength of the spell that wasn't evaded; implements hero specialties in spells
  //  ("Casts Bless with increased effect, based on hero level compared to the
  //   level of the target unit (the bonus is greater when used on weaker
  //   units).")
  //  and creature vulnerabilities ("Meteor shower vulnerability.")
  //> spellCost int SPs
  //> spellLearn int % multiplier `- chance whether hero can learn this spell (for
  //  Wisdom and Eagle Eye)
  //> spellTradeGive bool `- whether an "owned" spell from hero_spells (not from bonuses like artifacts) can be copied to another hero when initiating hero trade (for Scholar skill); if true, is followed by spellLearn checked for the opposite hero (receiving the spell)
  //> spellTradeTake bool `- similar but copied from another hero to trade initiator
  //> spellDuration int turns `- recurring
  //> town_spellChance int % multiplier
  //> town_spells array Spell->$id
  //> town_spellCount int `- number of spells revealed in a town by Mage Guild
  //> town_spellCountable int `- number of spells that a town can potentially reveal (e.g. 6 for Tower's Mage Guild level 1 with Library)
  //> hero_skillChance int % multiplier
  //> town_buildingCost int
  //> hero_embarkCost int `- remaining APs after changing vehicles (to/from ship)
  //> creature_meleePenalty int absolute damage `- applied when performing a
  //  melee attack, regardless of Creature->$shooting
  //> creature_shootBlocked bool `- if a $shooting can shoot when adjacent to an
  //  enemy
  //> creature_spellEvade int % multiplier `- chance to entirely avoid a spell (of any
  //  aggression, even friendly)
  //> creature_spellImmune bool `- whether spell is allowed to be cast at all;
  //  evasion/efficiency/immunity are all different, e.g. Orb of Vulnerability affects immunity
  //  but not evasion or efficiency
  //> creature_dispelImmune bool `- immunity to Dispel; in SoD, this is separate from regular spell immunity (creature_spellImmune); XXX replace with special spell context/ifContext?
  //> canCombat bool `- whether it's allowed to start new combat (Sanctuary)
  //> hero_shroud int `- number of tiles
  //> town_shroud int `- number of tiles
  //> ownable_shroud int `- number of tiles around owned non-hero/town objects (e.g. mine); XXX=R merge with *_shroud?
  //> creature_reanimate int `- number of new creatures to create after combat (XXX+I)
  //> creature_reanimateAs int Creature->$id `- type of creatures; defaults to
  //  the original (fallen) creature
  //> hero_experienceGain int absolute number of experience points
  //> creature_flying bool
  //> creature_regenerating bool
  //> creature_jousting int % `- percentage of damage increased per every cell traveled to target;
  //  only for melee attack
  //> creature_shootingCloud int cells
  //> creature_piercing int absolute `- reduction in attacked creature's Defense; regardless of
  //  Creature->$shooting
  //> creature_attackAndReturn bool
  //> creature_attackAround int
  //> creature_attackDepth int
  //> creature_retaliating int `- recurring; use +9999 for unlimited
  //> creature_enemyRetaliating bool
  //> creature_strikes int `- recurring
  //> creature_wallStrikes int
  //> hero_attackChance int % multiplier `- chance this primary skill and not others will increase
  //> hero_defenseChance int % multiplier
  //> hero_spellPowerChance int % multiplier
  //> hero_knowledgeChance int % multiplier
  //> heroChance array associative Hero->$id => int % multiplier `- due to the number of
  //  potential heroes (over a hundred), fetching an array of all candidates
  //  rather than querying them one by one
  //> spellGlobal bool `- whether casting affects all targets (creatures in a
  //  combat); only applicable to some spells (e.g. Bless but not Armageddon);
  //  isn't filtered by aggression (thus global Bless affects enemies unless prevented with creature_spellImmune)
  //> tradeRate int % multiplier `- resource trading on marketplace;
  //  value / 1000 = 0-100% (0 = cannot trade, 50 = give 2X than will receive, etc.);
  //  $multiplier should be at least 100000 for better precision
  //> tavernRumor str
  //> tavernCost int
  //> tavernHeroes array AObject->$id `- in result, ignore deleted ObjectStore
  //  members and members with owner !== 0 (already hired)
  //> player_town int Town->$id `- player's "race"; initial town or hero (if no town) determined at game start
  //> hero_specialty array`, null if none `- description of hero's specialty for showing in the UI; actual specialty is implemented with Effects; array indexes: icon (int, UN32.DEF/UN44.DEF frame), short name (str), long name (str), description (str)
  //> spellAround int 1+ `- number of hexes around the spot targeted by spell that are affected (Fireball); similar to `'creature_attackAround
  //> spellAroundEye int 0+ `- like `'spellAround but specifies inner region excluded from the effect area (for Frost Ring) plus one, so that 0 means nothing excluded, 1 means the targeted cell alone is excluded, etc.
  //> combatCasts int `- recurring; number of times hero can cast spells per round
  //> creature_criticalChance int % multiplier `- likelihood of creature_critical
  //> creature_critical int absolute damage `- applied on creature_criticalChance
  //> creature_canControl bool `- if player can choose actions for the creature in combat or if it's controlled by system (e.g. Arrow Tower)
  //> artifactTrade bool `- if it's allowed to transfer artifact from hero to another hero
  //> artifactChance array associative Artifact->$id => int % multiplier `- chance of a random artifact map object to assume a certain artifact, or for an artifact to appear in Artifact Merchants (on-map or in-town)
  //> artifactCost int amount
  //> quest_placement str `- hero's troops combat position; one of `'random, `'middle (bank), `'l (monster)
  //> quest_requirement int absolute value `- affects numeric `'check operations; useful to reduce requirements by Quest Guard and others
  //> quest_fulfilled bool `- used by GenericEncounter to determine if the encounter (quest) is "successful" (goals met); for example, Quest Guard disappears after that (because of quest_remove), Seer's Hut ceases working (because of $ifGrantedMin), etc.
  //> garrison_reinforce bool `- if visiting/garrisoned hero can add creatures to the garrison he is at (town, gates, etc.)
  //> garrison_reduce bool `- if visiting/garrisoned hero can take creatures from the garrison to his own army
  //> shroud int `- enabled MSB index (positive means visible, negative means invisible bit's two's complement); may impact performance (see Shroud.Effects); for this `'target, existing Shroud's (non-Effect) visibility bits are regarded as Effects with `'$priority = bit's index and `'$modifier = `[$const, <bit's index>`]
  //> bonus_effects embedded Effects array `- may in turn contain more `'bonus_effects
  //
  //  GenericEncounter allows special shortcut: leading strings stand for Effect->$label-s in addition to other Effects embedded in this array. This allows creating recursive/recurring bonuses.
  //
  //  New Effects take effect immediately (and their added `'bonus_effects too, recursively). Their $priority is kept which means, for same-$priority ones, that the later added Effects have higher n and take precedence (this is how Calculator.Effect goes through them).
  //
  //  `? Example for the certain kind of map objects (AClass->$id of 123) that immediately grants the visiting hero 1000 experience points and adds two Effects. First Effect happens in 1 day (`'$ifDate... = current date + 1) to reduce the hero's action points by 5 (happens on the following day, when action points are recalculated); it lasts for 1 day and doesn't affect action points on the next day. Second is a global per-hero Effect first happening in 2 days, adding the same two Effects to create infinite repetitions. In other words, the hero's APs are affected like this: in 2 days from encounter with 123, in 4 days, in 7/9 days, in 12/15 days, etc.
  //     `[
  //        ['bonus_experience', 1000, 'ifBonusObjectClass' => 123],
  //        ['bonus_effects', 'ifBonusObjectClass' => 123, 'label' => 'L',
  //         'modifier' => fromShort([
  //           ['bonus_actionPoints', -5, 'ifDateMin' => -1, 'ifDateMax' => -1, 'maxDays' => 1, 'ifObject' => true],
  //           ['bonus_effects', ['L', $append], 'ifDateMin' => -2, 'ifDateMax' => -2, 'ifObject' => true],
  //         ])],
  //     `]
  //
  //  It is easy to create one-shot, two-shot and infinitely recurring bonuses but not so easy to recur for a certain number of times. However, if the number of repetitions is small then "unrolling" the effect is an option: for example, to repeat the above example thrice we could create not one labeled Effect but three: `'L1, `'L2 and `'L3 and make `'L1 invoke `'L2, `'L2 invoke `'L3 and `'L3 invoke nothing. Another possibility in some contexts is using `'$ifGrantedMax, `'$maxDays, `'$whileObject, etc. Finally, a custom `'$tester may also do the trick.
  //
  //> bonus_message array of str `- shown to the user upon successful bonus acquisition
  //> quest_message array of str `- shown to the user one after another if not `'quest_fulfilled
  //> bonus_resource int absolute value `- grants or takes from the player; initial value = current player's resource quantity
  //> bonus_creatures array of Creature->$id `- for town/hero; added to garrison
  //> bonus_creatureCount int 1+
  //> bonus_experience int absolute value `- for hero; initial value = current hero's experience
  //> bonus_artifacts array of Artifact->$id `- for hero
  //> bonus_actionPoints int absolute value `- for hero; initial value = current hero's $actionPoints
  //> bonus_spellPoints int absolute value `- for hero; initial value = current hero's $spellPoints
  //> bonus_buildings array of Building->$id `- for town timed event; erect/demolish (bonus_build), buildings inapplicable to town's type are ignored (so can have static Effects for random towns)
  //> bonus_build bool `- erect/demolish (true/false)
  //> bonus_available array of Building->$id `- for town timed event; change the number (bonus_availableCount) of available creatures for hire; keys for non-erected building are ignored (in doing so inferiors of upgraded building are not considered, only explicitly erected buildings are)
  //> bonus_availableCount int absolute value `- creature hire quantity change; initial value = currently available count for hire
  //> bonus_shroud array of arrays `- each nested array's first item is name of a method of Shroud.Effects without the "set" prefix, other items are its arguments (x/y/z arguments may be null to assign the bonus' actionable spot coords; null player argument assigns the encountering hero's or town's owner)
  //> bonus_shroudTerrain `- value as in `'bonus_shroud; is evaluated for every existing terrain type on map, with set `'$ifTerrain selector but unset $ifX/Y/Z (for performance); result is applied (as `'bonus_shroud) to every such tile; used by Cartographer-s to reveal water and other regions
  //> bonus_shroudRiver `- as `'bonus_shroudTerrain but with `'$ifRiver
  //> bonus_shroudRoad `- as `'bonus_shroudTerrain but with `'$ifRoad
  //> quest_granted int `- internally used by GenericEncounter to record how many times an object's encounter requirements were successfully met; this is per bonus object, not per encountering hero or player
  //> quest_remove bool `- if the bonus object is removed after successful encounter
  //> quest_removeAudio str `- sound played at the time the object is removed because of quest_remove ('' if none)
  //> quest_reset array of str `- remove every Effect produced by the encountered object's quest_chances, quest_choices and bonus_effects (recursively) with matching $encounterLabel
  //  Special member values:
  //  `> G `- clear initialized[garrison] (apply quest_garrison again)
  //  `> R `- clear initialized[random] (apply quest_chances again)
  //  `> * `- as `'R plus remove all Effects; removing Effects without resetting 'random' will cause new encounter to add new quest_choices/etc. Effects, which may be desirable or not
  //  It is technically easy to allow quest_reset operate on other bonus objects' Effects (making it even closer to $whileOwned) but this is not implemented right now.
  //> quest_chances array associative Effect->$label => int % multiplier
  //> quest_choices array of Effect->$label `- `'cancel is special
  //> quest_garrison array associative Creature->$id => int count
  //> shipCost int
  //> fortifications array of ::fortification `- only for defender ($ifObject); only highest-ranking members are used of a group (group = without numeric suffix: trench < trench2)
  //> creature_hitChance array associative type => int % multiplier `- for wall attacks (hurl/ram); 0 = chance of a strike doing no damage, 1 = hitting another wall (ignored if there're none or if 'ram'; if picked, a wall is chosen from all alive walls' combined creature_hitChance 2 chances), 2 = hitting the user-specified wall (XXX=RH to const?)
  //> creature_wallDamage array associative damage 0+ => int % multiplier
  //> worldBonusChances array type => int % multiplier `- evaluated when date changes; use ifDate... to specify unique bonuses, e.g. monthly; type is empty string (retain previous bonus) or comma-separated with at least two parts: first is Map::bonus, second is display text in the UI, others are optional and arbitrary
  //public $modifier;
}

H3Effect::$normalize = array_merge(H3Effect::$normalize, [
  'ifBonusObject' => 'boolorintval',   // true is an allowed shortcut in some contexts
  'ifBonusObjectClass' => 'intval',
  'ifGarrisoned' => 'boolorintval',   // true is an allowed shortcut in some contexts
  'ifVisiting' => 'boolorintval',   // true is an allowed shortcut in some contexts
  'ifResource' => 'intval',
  'ifResourceReceive' => 'intval',
  'ifSkill' => 'intval',
  'ifSpell' => 'intval',
  'ifSpellSchool' => 'intval',
  'ifSpellLevel' => 'intval',
  'ifAggression' => 'intval',
  'ifContext' => 'intval',
  'ifContextAggression' => 'intval',
  'ifTerrain' => 'intval',
  'ifRiver' => 'intval',
  'ifRoad' => 'intval',
  'ifCombatCreature' => 'boolorintval',   // true is an allowed shortcut in some contexts
  'ifCombatParty' => 'strval',
  'ifCombat' => 'strval',
  'ifCreature' => 'intval',
  'ifCreatureLevel' => 'intval',
  'ifCreatureAlignment' => 'intval',
  'ifCreatureShooting' => 'intval', // not boolval: false = null in ObjectStore
  'ifCreatureUndead' => 'intval',
  'ifTargetCombatCreature' => 'boolorintval',   // true is an allowed shortcut in some contexts
  'ifTargetCreature' => 'intval',
  'ifTargetCreatureLevel' => 'intval',
  'ifTargetCreatureAlignment' => 'intval',
  'ifTargetCreatureUndead' => 'intval',
  'ifTargetObject' => 'boolorintval',   // true is an allowed shortcut in some contexts
  'ifTargetPlayer' => 'boolorintval',   // true is an allowed shortcut in some contexts
  'isTargetAlly' => 'boolval',
  'isTargetEnemy' => 'boolval',
  'isOpponent' => 'boolval',
  'isSupporter' => 'boolval',
  'isSupporterSamePlayer' => 'boolval',
  'isTargetAdjacent' => 'intval',
  'ifArtifact' => 'intval',
  'ifBuilding' => 'boolorintval',   // true is an allowed shortcut in some contexts
  'ifTavernHero' => 'intval',
  'ifHero' => 'intval',
  'ifGrantedMin' => 'intval',
  'ifGrantedMax' => 'intval',
  'encounterLabel' => 'strval',
]);

function write_artifactsID(array $options) {
  global $artifacts;
  extract($options, EXTR_SKIP);

  if ($targets and !in_array('artifacts', $targets)) {
    throw new Exception('artifacts and artifactsID targets must be processed together.');
  }

  Artifact::unrollKeys('cost', $constants['resources'], 'intval');

  $handles = fopenIdTXT($options, 'ARTRAITS.TXT');
  $artifacts = [];

  // 'S' evaluates to false - expected.
  $rarity = ['S' => '', 'T' => 'common', 'N' => 'minor', 'J' => 'major', 'R' => 'relic'];

  // Unfinished SoD artifacts with no effects or images.
  $ignoreArtifacts = [
    'diplomatSuit',
    'miredInNeutrality',
    'ironfistOfOgre',
  ];

  while ($line = readCSV($handles, ['Name'])) {
    $obj = new Artifact;
    $obj->idName = $obj::makeIdentifier(array_shift($line));
    $obj->name = array_shift($line);
    if (!in_array($obj->idName, $ignoreArtifacts)) {
      $obj->cost_gold = array_shift($line);
      $obj->description = removeHeading(array_pop($line));
      $obj->rarity = array_search($rarity[array_pop($line)], Artifact::rarity);
      // This assumes IDs of $artifactSlots match the order of columns in ARTRAITS.
      $obj->slots = array_keys(array_filter(array_reverse($line)));
      $artifacts[] = $obj;
    }
  }

  array_map('fclose', array_filter($handles));
  file_put_contents("$outPath/artifactsID.json", encodeJSON(Artifact::makeIdIndex($artifacts)));
}

function write_artifacts(array $options) {
  global $artifacts;
  global $globalStaticEffects;
  extract($options, EXTR_SKIP);

  if (!$artifacts) {
    throw new Exception('artifacts and artifactsID targets must be processed together.');
  }

  extract(require(__DIR__.'/databank-artifacts.php'), EXTR_SKIP);

  $textHandle = fopenTXT($options, 'ARTEVENT.TXT');
  $backpack = nameToID("$outPath/artifactSlots", 'backpack');

  foreach ($artifacts as $id => $obj) {
    in_array($obj->idName, $noBackpackOfArtifact) or $obj->slots[] = $backpack;
    if (in_array($obj->idName, $notTradableArtifact)) {
      $globalStaticEffects[] = H3Effect::fromShort(['artifactTrade', [array_search('const', H3Effect::operation), false], 'ifArtifact' => $id, 'source' => array_search('initial', H3Effect::source)], [], ['priority' => array_search('initial', H3Effect::priority)]);
    }
    $obj->encounterText = readCSV($textHandle, [], 0)[0];
    $obj->icon = $id;
    $obj->combat = $combatOfArtifact[$obj->idName] ?? null;
    empty($obj->combat['destroyArtifact']) or $obj->combat['destroyArtifact'] = $id;
    $obj->effects = H3Effect::fromShort(array_shift($effectsOfArtifact), ['ifObject'], ['priority' => array_search('artifact', H3Effect::priority), 'default' => ['source' => [array_search('artifact', H3Effect::source), $id]]]);
    entityOverrides($obj, $artifactOverrides[$obj->idName] ?? []);
  }

  fclose($textHandle);

  $chances = array_fill_keys(array_keys(array_filter($artifacts, function ($obj) use ($noChanceOfArtifact) { return !in_array($obj->idName, $noChanceOfArtifact); })), $constants['multiplier']);
  $globalStaticEffects[] = H3Effect::fromShort(['artifactChance', [array_search('const', H3Effect::operation), $chances], 'source' => array_search('initial', H3Effect::source)], [], ['priority' => array_search('initial', H3Effect::priority)]);

  $adve = array_column(csvFile($options, 'ADVEVENT.TXT', 0), 0);
  $spells = ObjectStore::fromFile("$outPath/spells.json");
  $spellIdNames = array_flip(json_decode(file_get_contents("$outPath/spellsID.json"), true));

  for ($spell = 0; $spell < $spells->x(); $spell++) {
    if (provided($id = $spells->atCoords($spell, 0, 0, 'scroll'))) {
      if ($id !== count($artifacts)) {
        throw new Exception('Non-sequential $scroll IDs.');
      }

      $name = $spells->atCoords($spell, 0, 0, 'name');
      $artifacts[] = $obj = clone $artifacts[1];
      // XXX=IC SoD shows "Spell Scroll" for all scrolls on ADVMAP and "<spell name>" in message boxes.
      $obj->name = "$name $obj->name";
      $obj->idName = $spellIdNames[$spell].ucfirst($obj->idName);
      // "[spell name]" is not localized in ARTRAITS.TXT.
      $obj->description = str_replace('[spell name]', $name, $obj->description);
      // SoD shows a different text than written in Spell Scroll's entry in ARTEVENT.TXT.
      $obj->encounterText = sprintf($adve[135], $name);
      $obj->spell = $spell;
      $effects = [['hero_spells', [$append, $spell], 'ifObject' => true]];
      $obj->effects = H3Effect::fromShort($effects, [], ['priority' => array_search('artifact', H3Effect::priority), 'default' => ['source' => [array_search('artifact', H3Effect::source), $id]]]);
    }
  }

  file_put_contents("$outPath/artifacts.json", encodeJSON(Artifact::from1D($artifacts)));
  // New artifacts (spell scrolls) added, update the index.
  file_put_contents("$outPath/artifactsID.json", encodeJSON(Artifact::makeIdIndex($artifacts)));
}

// Artifact is an object that can be (usually) equipped by a hero to provide (usually) positive effects: Vampire's Cowl, etc.
//
// Artifact->$id match SoD's as defined in ARTRAITS.TXT (after excluding first
// two rows). There are custom artifacts after the last standard artifact.
//
// h3m.txt redefines the following $id-s:
//   141 diplomatSuit -> Magic Wand (WoG)
//   142 miredInNeutrality -> Gold Tower Arrow (WoG)
//   143 ironfistOfOgre -> Monster's Power (WoG)
// + 144 Highlighted Slot (for internal game use)
// + 145 Artifact Lock (for internal game use)
// + 146-155 (Commander Artifacts) Axe of Smashing, Mithril Mail,
//           Sword of Sharpness, helmet of Immortality, Pendant of Sorcery,
//           Boots of Haste, Bow of Seeking, Dragon Eye Ring, Hardened Shield,
//           Slava's Ring of Power
// + 156-160 (WoG) Warlord's banner, Crimson Shield of Retribution,
//           Barbarian Lord's Axe of Ferocity, Dragonheart, Gate Key
// + 161-170 (Blank Artifacts) Blank Helmet/Sword/Shield/Horned Ring/Gemmed
//           Ring/Neck Broach/Armor/Surcoat/Boots/Horn
class Artifact extends StoredEntity {
  const rarity = [
    // 0/null - "S" ("Special"). Constant not included to discourage comparing
    // as v==consts.rarity.special because v can be null (which != 0). Test
    // with (!v) instead.
    1 => 'common',    // "T" ("Treasure")
    'minor',    // "N"
    'major',    // "J"
    'relic',    // "R"
  ];

  static $normalize = [
    'name' => 'strval',
    'cost',
    '*slots' => 'intval',
    'rarity' => 'intval',
    'description' => 'strval',
    'encounterText' => 'strval',
    'icon' => 'intval',
    'spell' => 'intval',
    'combat' => '',
    'effects' => '',
  ];

  static $unrolled = [];
  static $compact = ['effects' => 'H3Effect'];

  public $name;
  //public $cost_RESOURCE;
  public $slots;  // ArtifactSlot->$id; if backpack is missing then artifact can be worn but not put off; converse is also possible
  public $rarity;    // Artifact::rarity
  public $description;
  public $encounterText;
  public $icon;   // frame index of group 0 of ARTIFACT.DEF/ARTIFBON.DEF
  public $spell;  // Spell->$id for artifacts referenced in Spell->$scroll; only informational, mainly for in-game message boxes to show particular spell icon rather than generic scroll artifact's icon
  // Garrison entry to create if this artifact is worn when combat starts. Object {key: value} of Garrison schema (creature, count, destroyArtifact), plus 'x' (X or Y position depending on party placement). maxCombats defaults to 1, origin to 'artifact'.
  public $combat;
  // supports shortcuts (=== true) in $ifGarrisoned, $ifVisiting, $ifObject, $ifTargetObject, $ifTargetPlayer, $ifPlayer - set to hero
  // wearing the artifact, and hero's owner; also if $ifX/ifY/ifZ are all true - set to actionable spot of hero
  public $effects;
}

function write_artifactSlots(array $options) {
  extract($options, EXTR_SKIP);

  $artifactSlots = idListFile($options, 'ARTSLOTS.TXT', 'ArtifactSlot::makeIdentifier');

  // ARTSLOTS.TXT seems to have wrong order: in ARTRAITS.TXT Misc 5 is
  // after Misc 4, as expected. Having them properly ordered is more pretty anyway.
  if (end($artifactSlots)[1] === 'misc5') {
    array_splice($artifactSlots, 13, 0, [array_pop($artifactSlots)]);
  }

  foreach ($artifactSlots as &$ref) {
    $ref = new ArtifactSlot(array_combine(['name', 'idName'], $ref));
  }

  // Must be last (artifacts in AObject->$artifacts with n >= n of Backpack are
  // considered part of Backpack).
  // XXX=R localize $name
  $artifactSlots[] = new ArtifactSlot(['name' => 'Backpack']);

  unset($ref);
  file_put_contents("$outPath/artifactSlots.json", encodeJSON(ArtifactSlot::from1D($artifactSlots)));
  file_put_contents("$outPath/artifactSlotsID.json", encodeJSON(ArtifactSlot::makeIdIndex($artifactSlots)));
}

// Pieces of hero's body or party that may receive an artifact to make it "equipped" (effective): Torso, Head, etc.
//
// ArtifactSlot->$id *mismatch* SoD's as defined in ARTSLOTS.TXT.
class ArtifactSlot extends StoredEntity {
  static $normalize = [
    'name' => 'strval',
  ];

  public $name;
}

function write_heroes(array $options) {
  extract($options, EXTR_SKIP);
  extract(array_flip(H3Effect::operation));
  extract(require(__DIR__.'/databank-heroes.php'), EXTR_SKIP);

  $spellBook = [
    nameToID("$outPath/artifactSlots", 'spellBook') => new ObjectArtifact([
      'artifact' => nameToID("$outPath/artifacts", 'spellBook'),
    ]),
  ];

  $catapult = [
    nameToID("$outPath/artifactSlots", 'warMachine4') => new ObjectArtifact([
      'artifact' => nameToID("$outPath/artifacts", 'catapult'),
    ]),
  ];

  $specHandle = fopenTXT($options, 'HEROSPEC.TXT');
  fgets($specHandle);
  fgets($specHandle);

  $bioHandle = fopenTXT($options, 'HEROBIOS.TXT');
  $handles = fopenIdTXT($options, 'HOTRAITS.TXT');
  $heroes = [];

  while ($line = readCSV($handles, ['Name'])) {
    $idName = Hero::makeIdentifier(array_shift($line));
    $obj = new Hero(array_combine(columnsOf(Hero::class, 'garrison3'), $line));
    $obj->idName = $idName;

    switch ($obj->garrison2) {
      case 'Ballista':
        $obj->artifactSlot = nameToID("$outPath/artifactSlots", 'warMachine1');
        $obj->artifact     = nameToID("$outPath/artifacts", 'ballista');
      case 'FirstAidTent':
        if ($obj->artifact === null) {
          $obj->artifactSlot = nameToID("$outPath/artifactSlots", 'warMachine3');
          $obj->artifact     = nameToID("$outPath/artifacts", 'firstAidTent');
        }
        $obj->garrison2Min = $obj->garrison2Max = $obj->garrison2 = false;
    }

    // These columns are not localized in HOTRAITS.TXT.
    $obj->garrison1 = $nameToCreatureID[$obj->garrison1];
    $obj->garrison2 and $obj->garrison2 = $nameToCreatureID[$obj->garrison2];
    $obj->garrison3 and $obj->garrison3 = $nameToCreatureID[$obj->garrison3];

    if ($obj->idName === 'lordHaart' and $obj->garrison1 === nameToID("$outPath/creatures", 'pikeman')) {
      $obj->idName = 'lordHaartGood';
    }

    $obj->class = array_shift($classOfHero);
    $obj->gender = array_shift($genderOfHero);
    $obj->biography = readCSV($bioHandle, [], 0)[0];
    $obj->portrait = array_shift($portraitOfHero);
    $obj->combatImage = $combatImageOfHero["$obj->class $obj->gender"];

    $obj->specialty = array_shift($specEffectsOfHero);

    $skills = array_shift($skillsOfHero);
    $obj->skills = [['hero_skills', array_merge([$prepend], array_keys($skills)), true, 'stack' => array_search('classStats', H3Effect::stack)]];
    foreach ($skills as $skill => $mastery) {
      $obj->skills[] = ['skillMastery', $mastery, true, 'ifSkill' => $skill, 'stack' => array_search('classStats', H3Effect::stack)];
    }

    $obj->spells = $spellsOfHero[$obj->idName] ?? [];
    $obj->artifacts = $catapult;
    if ($obj->spells) {
      $obj->spells = [['hero_spells', array_merge([$append], $obj->spells), true, 'stack' => array_search('classStats', H3Effect::stack)]];
      $obj->artifacts += $spellBook;
    }

    list($obj->specName, $obj->specLongName, $obj->specDescription)
      = readCSV($specHandle, [], 0);

    $obj->specIcon = count($heroes);

    $spec = [$obj->specIcon, $obj->specName, $obj->specLongName, $obj->specDescription];
    $obj->specialty[] = ['hero_specialty', [$const, $spec], true];

    entityOverrides($obj, $heroOverrides[$obj->idName] ?? []);

    // XXX like with Creature->$effects, these 4 can be split into dynamic and static ($ifHero); this will allow faster map initialization since less Effects will be $dynamic (but will also increase the number of static ones, most of which won't be used, just like with Creature - not sure how problematic is that)
    foreach (['skills', 'spells', 'specialty', 'effects'] as $prop) {
      // $source is set by H3.Rules.
      $obj->$prop = H3Effect::fromShort($obj->$prop ?: [], ['ifObject'], ['priority' => array_search('hero', H3Effect::priority)]);
    }

    $heroes[] = $obj;
  }

  fclose($specHandle);
  fclose($bioHandle);
  array_map('fclose', array_filter($handles));
  file_put_contents("$outPath/heroes.json", encodeJSON(Hero::from1D($heroes)));
  file_put_contents("$outPath/heroesID.json", encodeJSON(Hero::makeIdIndex($heroes)));
}

// Identity (personality) of a hero. Player moves heroes around the adventure map and commands him in combats. Represented in-game as an AObject, as any other game object.
//
// Hero->$id match SoD's as defined in HOTRAITS.TXT (after excluding first
// two rows).
class Hero extends StoredEntity {
  // Warning: in SoD, genders are: 0=male, 1=female.
  const gender = [
    1 => 'male',
    'female',
  ];

  static $normalize = [
    'name' => 'strval',
    'garrison1Min' => 'intval',
    'garrison1Max' => 'intval',
    'garrison1' => 'intval',
    'garrison2Min' => 'intval',
    'garrison2Max' => 'intval',
    'garrison2' => 'intval',
    'garrison3Min' => 'intval',
    'garrison3Max' => 'intval',
    'garrison3' => 'intval',

    'artifactSlot' => 'intval',
    'artifact' => 'intval',
    'skills' => '',
    'artifacts' => '',
    'spells' => '',
    'effects' => '',
    'gender' => 'intval',
    'biography' => 'strval',
    'specName' => 'strval',
    'specLongName' => 'strval',
    'specDescription' => 'strval',
    'specIcon' => 'intval',
    'class' => 'intval',
    'specialty' => '',
    'portrait' => 'strval',
    'combatImage' => 'strval',
  ];

  static $compact = [
    'skills' => 'H3Effect',
    'artifacts' => 'ObjectArtifact',
    'spells' => 'H3Effect',
    'effects' => 'H3Effect',
    'specialty' => 'H3Effect',
  ];

  public $name;
  // Specify creatures in initial hero garrison.
  public $garrison1Min;
  public $garrison1Max;
  public $garrison1;    // Creature->$id
  public $garrison2Min;
  public $garrison2Max;
  public $garrison2;    // Creature->$id
  public $garrison3Min;
  public $garrison3Max;
  public $garrison3;    // Creature->$id

  // Replaces $artifacts[slot], if hero initializer function has randomly chosen to give this artifact to the new hero.
  public $artifactSlot; // ArtifactSlot->$id
  public $artifact;   // Artifact->$id
  // $skills/$spells are meant for providing initial set of skills/spells, not
  // act like a generic Effects array (use $effects or $specialty for that).
  public $skills; // supports shortcuts (=== true) as $effects
  public $artifacts;
  public $spells; // supports shortcuts (=== true) as $effects
  // supports shortcuts (=== true) in $ifGarrisoned, $ifVisiting, $ifObject, $ifTargetObject, $ifTargetPlayer, $ifPlayer, $whileObject - set to the hero and his owner
  //
  // This holds arbitrary hero-specific Effects that don't fit into $skills/$spells/$specialty. For example, can be used to override HeroClass-specific spellPower. It is also possible to create global (static) Effects with $ifHero selector for the same effect, except $effects are only added once a hero is created while static are always present, making them less optimal for very big number of Effects.
  public $effects;
  public $gender; // Hero::gender
  public $biography;
  // $spec... are not provided by Effects because $specialty Effects are
  // not provided by Effects either (they *are* Effects: hero_attack, hero_spells, etc.).
  //
  // It makes little sense to separate only $specName/etc., and separating
  // $specialty is of course impossible (Effects cannot and should not
  // provide Effects unless by GenericEncounter).
  //
  // To provide dynamic specialty including dynamic name, icon, etc. one can override H3.Rules.HeroSpecialty.
  public $specName;
  public $specLongName;
  public $specDescription;
  public $specIcon;   // frame index of group 0 of UN32.DEF/UN44.DEF
  public $class;  // HeroClass->$id
  // supports shortcuts (=== true) as $effects
  //
  // It's technically possible to provide $gender, $skills and others as one
  // combined Effects store (in $effects) but having them separated allows overriding part of hero's properties by map author
  // (e.g. specifying custom $skills while keeping default $spells).
  public $specialty;
  public $portrait;   // bitmap file name without prefix, like '000KN'
  public $combatImage;   // DEF file name, like 'CH010'; in SoD this is part of hero class but it makes sense to be hero-specific
}

function write_heroClasses(array $options) {
  extract($options, EXTR_SKIP);
  extract(json_decode(file_get_contents("$outPath/townsID.json"), true));

  // From HCTRAITS.TXT header.
  $skills = nameToID("$outPath/skills", ['pathfinding', 'archery', 'logistics', 'scouting', 'diplomacy', 'navigation', 'leadership', 'wisdom', 'mysticism', 'luck', 'ballistics', 'eagleEye', 'necromancy', 'estates', 'fireMagic', 'airMagic', 'waterMagic', 'earthMagic', 'scholar', 'tactics', 'artillery', 'learning', 'offense', 'armorer', 'intelligence', 'sorcery', 'resistance', 'firstAid']);

  // Determined empirically.
  $towns = [$castle, $castle, $rampart, $rampart, $tower, $tower,
            $inferno, $inferno, $necropolis, $necropolis, $dungeon, $dungeon,
            $stronghold, $stronghold, $fortress, $fortress, $conflux, $conflux];

  $handles = fopenIdTXT($options, 'HCTRAITS.TXT');
  $classes = [];

  while ($line = readCSV($handles, ['Name'])) {
    // In HCTRAITS.TXT these numbers expectedly sum up to 100, just not by rows (for a given town, all classes have 100 in total).
    // However, the difference between 6 and 5 (the only used values)
    // seems to be way less than it appears in the game (you will hardly see a hero with "chance 5") so we're adjusting 5% to 2.5% and 6 to 8%; given that all classes use exactly ten 6%-s and eight 5%-s, we still get a round number: 10*8+8*2.5.
    $line[] = array_map(function ($v) {
      return [5 => 2.5, 6 => 8][$v];
    }, array_splice($line, -9));

    $idName = HeroClass::makeIdentifier(array_shift($line));
    $skillChances = array_combine($skills, array_splice($line, 14, -1));
    $obj = new HeroClass(array_combine(columnsOf(HeroClass::class, '*townChances'), $line));
    $obj->idName = $idName;

    $effects = [];

    // In HCTRAITS.TXT these numbers expectedly sum up to 112.
    foreach ($skillChances as $skillID => $chance) {
      $chance = $chance / 112;
      if ($chance > 0) {
        $effects[] = ['hero_skillChance', (integer) ($chance * $constants['multiplier']), 'ifObject' => true, 'ifSkill' => $skillID];
      }
    }

    // $source is set by H3.Rules.
    $obj->effects = H3Effect::fromShort($effects, [], ['priority' => array_search('heroClass', H3Effect::priority)]);
    $obj->town = array_shift($towns);
    $classes[] = $obj;
  }

  array_map('fclose', array_filter($handles));
  file_put_contents("$outPath/heroClasses.json", encodeJSON(HeroClass::from1D($classes)));
  file_put_contents("$outPath/heroClassesID.json", encodeJSON(HeroClass::makeIdIndex($classes)));
}

// Occupation of a hero: Knight, Cleric, etc. Different hero identities may use the same occupation.
//
// HeroClass->$id match SoD's as defined in HCTRAITS.TXT (after excluding first
// three rows). They also match AClass->$subclass of objects with $class = 34.
class HeroClass extends StoredEntity {
  static $normalize = [
    'name' => 'strval',
    'aggression' => 'floatval',
    'attack' => 'intval',
    'defense' => 'intval',
    'spellPower' => 'intval',
    'knowledge' => 'intval',
    'chanceAttackL' => 'intval',
    'chanceDefenseL' => 'intval',
    'chanceSpellPowerL' => 'intval',
    'chanceKnowledgeL' => 'intval',
    'chanceAttackH' => 'intval',
    'chanceDefenseH' => 'intval',
    'chanceSpellPowerH' => 'intval',
    'chanceKnowledgeH' => 'intval',
    '*townChances' => 'floatval',

    'town' => 'intval',
    'effects' => '',
  ];

  static $compact = ['effects' => 'H3Effect'];

  public $name;
  public $aggression; // for AI
  // Initial values for primary skills.
  public $attack;
  public $defense;
  public $spellPower;
  public $knowledge;
  // Probability of gaining a specific primary skill on level up
  // (L = level ups to 2-9 levels, H = to 10+). 0=0%, 100=100%.
  // In HCTRAITS.TXT these numbers expectedly sum up to 100 (counting either all four L or all four H).
  public $chanceAttackL;
  public $chanceDefenseL;
  public $chanceSpellPowerL;
  public $chanceKnowledgeL;
  public $chanceAttackH;
  public $chanceDefenseH;
  public $chanceSpellPowerH;
  public $chanceKnowledgeH;
  // Probability of hero appearing in a town type's tavern (practically - in a player_town's pool).
  public $townChances;  // array Town->$id => 0-100%, may be fractional
  // "Race" - which town this class belongs to (e.g. Cleric - to Castle).
  public $town;   // Town->$id
  // supports shortcuts (=== true) in $ifGarrisoned, $ifVisiting, $ifObject, $ifTargetObject, $ifTargetPlayer, $ifPlayer, $whileObject - set to hero having
  // this class, and hero's owner
  public $effects;
}

function write_skills(array $options) {
  extract($options, EXTR_SKIP);
  extract(require(__DIR__.'/databank-skills.php'), EXTR_SKIP);

  Skill::unrollKeys('description', array_flip(Skill::mastery), 'strval');
  Skill::unrollKeys('effects', array_flip(Skill::mastery), '');

  $handles = fopenIdTXT($options, 'SSTRAITS.TXT');
  $skills = [];

  while ($line = readCSV($handles, ['Name'])) {
    $idName = Skill::makeIdentifier(array_shift($line));
    array_splice($line, 1, 0, [null]);    // $description_0
    $obj = new Skill(array_combine(columnsOf(Skill::class, 'description_expert'), $line));
    $obj->idName = $idName;
    $obj->description_basic = removeHeading($obj->description_basic);
    $obj->description_advanced = removeHeading($obj->description_advanced);
    $obj->description_expert = removeHeading($obj->description_expert);
    $priority = array_search('skill', H3Effect::priority);
    foreach (array_shift($effectsOfSkill) as $i => $effects) {
      $mastery = Skill::mastery[$i + 1];
      $obj->{"effects_$mastery"} = H3Effect::fromShort($effects, ['ifObject'], ['priority' => $priority, 'default' => ['source' => [array_search('skill', H3Effect::source), count($skills)]]]);
    }
    $skills[] = $obj;
  }

  array_map('fclose', array_filter($handles));
  file_put_contents("$outPath/skills.json", encodeJSON(Skill::from1D($skills)));
  file_put_contents("$outPath/skillsID.json", encodeJSON(Skill::makeIdIndex($skills)));
}

// Secondary skills (traits) of a hero that improve his performance: Archery, Tactics, etc.
//
// Skill->$id match SoD's as defined in SSTRAITS.TXT (after excluding first
// two rows).
class Skill extends StoredEntity {
  // Must be in order of strength (# of basic < # of advanced).
  const mastery = [
    // 0/null - no mastery (have no skill).
    1 => 'basic',
    'advanced',
    'expert',
  ];

  static $normalize = [
    'name' => 'strval',
    'description',

    'effects',
  ];

  static $unrolled = [];

  static $compact = [
    // Unrolled $effects.
    'effects_0' => 'H3Effect',
    'effects_basic' => 'H3Effect',
    'effects_advanced' => 'H3Effect',
    'effects_expert' => 'H3Effect',
  ];

  public $name;
  //public $description_0;
  //public $description_MASTERY;

  // There's technically also $effects_0 (because ::mastery starts with 1)
  // but it shouldn't be used - skills that a hero doesn't have never provide any Effects (just define them as static). This property exists to allow addressing $effects_MASTERY
  // as propertyIndex('effects') + mastery instead of mastery-1.
  //
  // supports shortcuts (=== true) in $ifGarrisoned, $ifVisiting, $ifObject, $ifTargetObject, $ifTargetPlayer, $ifPlayer - set to hero
  // with the skill, and hero's owner; also if $ifX/ifY/ifZ are all true - set to actionable spot of hero
  //public $effects_0;
  //public $effects_MASTERY;
}

function write_spells(array $options) {
  global $townSpellChances;
  global $globalStaticEffects;
  extract($options, EXTR_SKIP);

  Spell::unrollKeys('spellPoints', array_flip(Spell::mastery), 'intval');
  Spell::unrollKeys('skillEffect', array_flip(Spell::mastery), 'intval');
  Spell::unrollKeys('aiValue', array_flip(Spell::mastery), 'intval');
  Spell::unrollKeys('description', array_flip(Spell::mastery), 'strval');
  Spell::unrollKeys('effects', array_flip(Spell::mastery), '');

  $aliases = [
    'Prot. from Water' => 'protectionFromWater',
    'Prot. from Earth' => 'protectionFromEarth',
    "Titan's Lightning Bolt" => 'titanBolt',
    'Dispel Helpful Spells' => 'dispelHelpful',
  ];

  $handles = fopenIdTXT($options, 'SPTRAITS.TXT');
  $spells = $chances = [];

  while ($line = readCSV($handles, ['Name', 'Adventure Spells', 'Combat Spells', 'Creature Abilities'])) {
    $idName = array_shift($line);
    $chances[] = array_filter(array_splice($line, 16, 9));
    array_splice($line, 3, 0, [array_keys(array_filter(array_splice($line, 3, 4)))]);

    // Remove "Abbreviated Name" which is different from Name only in a few entries.
    array_splice($line, 1, 1);

    // Skip the attributes column as we manually assign relevant Spell
    // properties. SoD has these combinations:
    //
    // - ADV_SPELL
    // - COMBAT_SPELL
    // - COMBAT_SPELL|CREATURE_TARGET
    // - COMBAT_SPELL|CREATURE_TARGET_1
    // - COMBAT_SPELL|CREATURE_TARGET_2
    // - COMBAT_SPELL|CREATURE_TARGET_2|MIND_SPELL
    // - COMBAT_SPELL|CREATURE_TARGET|MIND_SPELL
    // - COMBAT_SPELL|LOCATION_TARGET
    // - COMBAT_SPELL|OBSTACLE_TARGET
    // - CREATURE_SPELL
    array_pop($line);

    $obj = new Spell(array_combine(columnsOf(Spell::class, 'description_expert'), $line));
    $obj->idName = $aliases[$idName] ?? $obj::makeIdentifier($idName);
    $obj->level or $obj->level = null;
    $spells[] = $obj;
  }

  // XXX localize
  $creatureSpells = [
    ['name' => 'Drain Hit Points', 'animation' => 'SP06_'],
    ['name' => 'Ice Ray'],
    ['name' => 'Resurrection - Demon'],
    ['name' => 'Death Blow', 'animation' => 'SP03_'],
  ];

  foreach ($creatureSpells as $props) {
    $spells[] = new Spell($props + [
      'context' => array_search('combat', Spell::context),
      'byCreature' => true,
      'targetCreature' => true,
      'aggression' => array_search('offense', Spell::aggression),
    ]);
  }

  array_map('fclose', array_filter($handles));
  file_put_contents("$outPath/spellsID.json", encodeJSON(Spell::makeIdIndex($spells)));

  extract(require(__DIR__.'/databank-spells.php'), EXTR_SKIP);

  $lastArtifact = max(json_decode(file_get_contents("$outPath/artifactsID.json"), true));
  // Used by towns.json.
  $townSpellChances = [];   // town 'type' => chance (0-100%)

  foreach ($spells as $id => $obj) {
    $obj->description_0 = removeHeading($obj->description_0 ?? '');
    $obj->description_basic = removeHeading($obj->description_basic ?? '');
    $obj->description_advanced = removeHeading($obj->description_advanced ?? '');
    $obj->description_expert = removeHeading($obj->description_expert ?? '');
    $obj->image = array_shift($imageOfSpell);
    // Most spells cancel other instances of themselves (do not stack).
    $obj->cancel = [$id];
    list($obj->castAnimationType, $obj->castAnimation) = array_shift($castAnimationOfSpell) ?: [] + [null, null];
    $obj->castSound = array_shift($castSoundOfSpell);
    entityOverrides($obj, array_shift($spellOverrides) ?: [] /*for $creatureSpells*/);

    $obj->byCreature or $obj->scroll = ++$lastArtifact;

    $effects = array_shift($effectsOfSpell) ?: [];
    is_array($effects[0][0] ?? null) or $effects = [$effects, $effects, $effects];
    $effects = array_combine(['basic', 'advanced', 'expert'], $effects);
    $effects[0] = $effects['basic'];
    foreach ($effects as $mastery => $effects) {
      $obj->{"effects_$mastery"} = H3Effect::fromShort($effects, ['ifCombatCreature'], ['priority' => array_search('combat', H3Effect::priority), 'default' => ['source' => [array_search('spell', H3Effect::source), $id]]]);
    }

    foreach (array_shift($chances) ?: [] as $townID => $chance) {
      // SPTRAITS.TXT lists creatures' spells as having chances in towns.
      // I assume it's in error because there are no images for such spells in
      // SPELLSCR.DEF and others.
      if (!$obj->byCreature) {
        $townSpellChances[$townID][$id] = $chance;
      }
    }
  }

  foreach ($mutuallyExclusive as $ids) {
    foreach ($ids as $id) {
      // Add each spell in the cancel group to every other spell's $cancel
      // but don't add the spell itself to its own $cancel in case it stacks with
      // itself (like Disrupting Ray).
      $spells[$id]->cancel = array_merge($spells[$id]->cancel ?: [], array_diff($ids, [$id]));
    }
  }

  file_put_contents("$outPath/spells.json", encodeJSON(Spell::from1D($spells)));

  $globalStaticEffects = array_merge($globalStaticEffects, H3Effect::fromShort($staticSpellEffects, [], ['priority' => array_search('initial', H3Effect::priority), 'default' => ['source' => array_search('initial', H3Effect::source)]]));
}

// "A Wizard Did It" class of action that a hero or creature may perform: Fireball, Summon Boat, etc.
//
// Spell->$id *mismatch* SoD's as defined in SPTRAITS.TXT.
class Spell extends StoredEntity {
  const context = [
    1 => 'map',
    'combat',
  ];

  const aggression = [
    // 0/null is 'general' - absence of a distinct characteristic.
    1 => 'defense',
    'offense',
  ];

  // Must be in order of strength (# of basic < # of advanced).
  const mastery = [
    // 0/null - no mastery (i.e. have spell but no Fire/Air/Water/Earth Magic skill).
    1 => 'basic',
    'advanced',
    'expert',
  ];

  const castAnimationType = [
    // 0/null - no or custom animation.

    // Animation is put on top of the targeted cell (Fireball) or creature (Slow).
    1 => 'overlay',
    // Like 'overlay' but on top of every cell or creature in AoE (Death Ripple).
    'overlayEvery',
    // Animation tiles over the entire combat map (Armageddon).
    'total',
    // Missile flying towards every target. $castAnimation = array, 0 - impact animation DEF, others - in-flight DEF. If 2 members, in-flight is the same for every angle (Disrupting Ray), else (Magic Arrow) must have 1+5 members alike to creature missiles with $missileAngles of [0, 27, 45, 72, 90] (negative angles are impossible in SoD as heroes stand above every other creature, but in HeroWO it's emulated by mirroring if needed).
    'missileEvery',
    // Bottom edge of the animation touches every target (Prayer). Top may be cropped by map's top border.
    'lightEvery',
    // Animation falling from the skies onto every target (Lightning Bolt). $castAnimation = array with 2 members like in 'missile'.
    'dropEvery',
  ];

  static $normalize = [
    'name' => 'strval',
    'level' => 'intval',
    '*schools' => 'intval',
    'spellPoints',
    'powerEffect' => 'intval',
    'skillEffect',
    'aiValue',
    'description',

    'context' => 'intval',
    'byCreature' => 'boolval',
    'mind' => 'boolval',
    'targetCreature' => 'boolval',
    'targetLocation' => 'boolval',
    'targetObstacle' => 'boolval',
    'aggression' => 'intval',
    '*cancel' => 'intval',
    'scroll' => 'intval',
    'animation' => 'strval',
    'image' => 'intval',
    'castAnimationType' => 'intval',
    'castAnimation' => '',
    'castSound' => 'strval',
    'effects',
  ];

  static $unrolled = [];

  static $compact = [
    // Unrolled $effects.
    'effects_0' => 'H3Effect',
    'effects_basic' => 'H3Effect',
    'effects_advanced' => 'H3Effect',
    'effects_expert' => 'H3Effect',
  ];

  public $name;
  public $level;  // mage guild's level where the spell appears in, 1-based; null/false/0 if special (usually so if $byCreature)
  // In SoD there are only two spells that belong to multiple schools - Visions and Magic Arrow (both have all 4 schools). We allow this for any spell. Effect->$ifSpellSchool is a single school; Calculator's _opt.ifSpellSchool is an array. When calculating with _opt.ifObject set, ifSpellSchool is reduced to one school - the school of one of secondary skills with highest mastery (such as Advanced Air Magic) and then $ifSpellSchool is directly compared with ifSpellSchool. When calculating with no ifObject, ifSpellSchool is kept as a list and for an Effect to match, that list must include its $ifSpellSchool.
  //
  // This means a hero's multi-school spell cannot have benefits of all schools, only of one (corresponding to the hero's skill with highest mastery). For example, if the hero has Expert B Magic and if the spell costs 5 points and inflicts 10 damage in school A and 10 points/5 damage in school B, the actual features would be cost 10, damage 5 because _opt.ifSpellSchool = [A, B] is reduced to [B] (because of Expert B Magic), not cost 5, damage 5 (each parameter being the minimum - "best" between A and B).
  //
  // This keeps the algorithm straightforward, assuming each next mastery tier provides more benefits across all spell parameters than previous tiers. Otherwise, determining which parameter value (cost, damage, etc.) is more "beneficial" may not be trivial.
  //
  // As mentioned, when calculating with no ifObject, _opt.ifSpellSchool matches if it includes Effect's $ifSpellSchool. This can produce unexpected results: imagine there are two Effects, both [$relative, 0.5], first with $ifSpellSchool = A, second with B. If _opt.ifSpellSchool = [A, B] then result would be combined [$relative, 0.0], i.e. the spell took in both Effects. If this is a good or bad implementation is currently unclear because in SoD only heroes can cast spells (i.e. ifObject is always set). This case might be revised in the future.
  public $schools;    // array of SpellSchool->$id or null/false/[] if special (usually if $byCreature)
  // N/B/A/E (0=N) - hero's mastery of the spell's school (none, basic, advanced, expert).
  // N is Addressed as propertyIndex('spellPoints') + 0.
  //public $spellPoints_0;
  //public $spellPoints_MASTERY;
  // Final value by default is calculated as $powerEffect * hero_spellPower +
  // $skillEffect_<hero's mastery>.
  public $powerEffect;
  //public $skillEffect_0;
  //public $skillEffect_MASTERY;
  //public $aiValue_0;
  //public $aiValue_MASTERY:
  //public $description_0;
  //public $description_MASTERY;

  public $context; // Spell::context; attributes: ADV_SPELL, COMBAT_SPELL
  public $byCreature;   // attribute: CREATURE_SPELL
  public $mind;   // attribute: MIND_SPELL
  public $targetCreature; // only if $combat; attribute: CREATURE_TARGET[_1|_2]
  public $targetLocation; // only if $combat; attribute: LOCATION_TARGET
  public $targetObstacle; // only if $combat; attribute: OBSTACLE_TARGET
  public $aggression;  // Spell::aggression
  // Used to implement non-stacking spells (most are such; such spell lists its ID here) and stacking ones (like Disrupting Ray, simply doesn't list itself here). It's also used for mutually exclusive spells (e.g. casting Bless removes Curse).
  //
  // All Spell Effects must have either $ifCombatCreature or $ifTargetCombatCreature set to the creature on which it is cast. When a spell is cast, it removes all Effects which have ($iCC or $iTCC) set to the new spell's target and have $source = [$spell, <any ID listed in $cancel>].
  //
  // This is only valid for some spells (mostly B/C-type).
  public $cancel;     // array of Spell->$id
  public $scroll;   // false, Artifact->$id of a spell scroll containing exactly this one spell; used by h3m2herowo.php to determine which artifact object to create from a SpellScroll object in .h3m
  public $animation;  // DEF name
  public $image;   // frame number in SPELLSCR (encountering a spell scroll), SPELLBON, SPELLINT (+1, Creature Info's bufs), SPELLS (spell book)
  public $castAnimationType;
  public $castAnimation;    // specific to $castAnimationType, usually DEF name
  public $castSound;
  // supports shortcuts (=== true) in $ifCombatCreature/$ifTargetCombatCreature (= spell's target) and $modifier (take spellEfficiency value; $priority will be changed); $source and $maxRounds are set if unset
  //
  // Unlike SoD, no mastery (0) may specify different Effects than Basic, although all classic spells have the two identical.
  //public $effects_0;
  //public $effects_MASTERY;
}

function write_spellSchools(array $options) {
  extract($options, EXTR_SKIP);

  // XXX localize
  $schools = [
    new SpellSchool([
      'name' => 'Earth',
      // Using hardcoded IDs to avoid circular dependency: spellSchools is
      // needed for creatures but creatures is needed for skills, which IDs we
      // use below. This is not a big problem given that Skill->$id match those
      // of SoD so they won't change, at least for standard SoD skills.
      //'skill' => nameToID("$outPath/skills", 'earthMagic'),
      'skill' => 17,
      'image' => 3,
      'bookTabImage' => 3,
      'masteryImage' => 'SPLEVE',
    ]),
    new SpellSchool([
      'name' => 'Water',
      //'skill' => nameToID("$outPath/skills", 'waterMagic'),
      'skill' => 16,
      'image' => 2,
      'bookTabImage' => 2,
      'masteryImage' => 'SPLEVW',
    ]),
    new SpellSchool([
      'name' => 'Fire',
      //'skill' => nameToID("$outPath/skills", 'fireMagic'),
      'skill' => 14,
      'image' => 1,
      'bookTabImage' => 1,
      'masteryImage' => 'SPLEVF',
    ]),
    new SpellSchool([
      'name' => 'Air',
      //'skill' => nameToID("$outPath/skills", 'airMagic'),
      'skill' => 15,
      'image' => 0,
      'bookTabImage' => 0,
      'masteryImage' => 'SPLEVA',
    ]),
  ];

  file_put_contents("$outPath/spellSchools.json", encodeJSON(SpellSchool::from1D($schools)));
  file_put_contents("$outPath/spellSchoolsID.json", encodeJSON(SpellSchool::makeIdIndex($schools)));
}

// Type of element every spell must belong to: Earth, Water, etc.
//
// SpellSchool->$id match SoD's as defined in SPTRAITS.TXT (columns 3-6).
class SpellSchool extends StoredEntity {
  static $normalize = [
    'name' => 'strval',
    'skill' => 'intval',
    'image' => 'intval',
    'bookTabImage' => 'intval',
    'masteryImage' => 'strval',
  ];

  public $name;
  public $skill;  // Skill->$id that increases efficiency of this school's spells
  public $image; // frame index of SCHOOLS.DEF
  public $bookTabImage; // frame index of SPELTAB.DEF where this school is selected
  public $masteryImage; // DEF name with 4 frames (0-3 none, basic, advanced, expert)
}

function write_towns(array $options) {
  global $townSpellChances;
  extract($options, EXTR_SKIP);

  if (!$townSpellChances) {
    throw new Exception('write_towns must be called after write_spells.');
  }

  $fort = [];
  $store = ObjectStore::fromFile("$outPath/classes.json");

  for ($id = 0; $id < $store->x(); $id++) {
    if ($store->atCoords($id, 0, 0, 'class') === 98) {
      $town = $store->atCoords($id, 0, 0, 'subclass');
      $fort[$town][] = $id;
    }
  }

  $portraitOfTown = [0, 2, 4, 6, 8, 10, 12, 14, 16];

  $backgroundOfTown = [
    'TBCSBACK',
    'TBRMBACK',
    'TBTWBACK',
    'TBINBACK',
    'TBNCBACK',
    'TBDNBACK',
    'TBSTBACK',
    'TBFRBACK',
    'TBELBACK',
  ];

  $musicOfTown = [
    'CSTLETOWN',
    'RAMPART',
    'TOWERTOWN',
    'INFERNOTOWN',
    'NECROTOWN',
    'DUNGEON',
    'STRONGHOLD',
    'FORTRESSTOWN',
    'ELEMTOWN',
  ];

  $resourcesOfTown = [
    [$constants['resources']['wood'], $constants['resources']['ore']],
    [$constants['resources']['crystal']],
    [$constants['resources']['gems']],
    [$constants['resources']['mercury']],
    [$constants['resources']['wood'], $constants['resources']['ore']],
    [$constants['resources']['sulfur']],
    [$constants['resources']['wood'], $constants['resources']['ore']],
    [$constants['resources']['wood'], $constants['resources']['ore']],
    [$constants['resources']['mercury']],   // Conflux
  ];

  $types = idListFile($options, 'TOWNTYPE.TXT', 'Town::makeIdentifier');
  $names = listFile($options, 'TOWNNAME.TXT');
  $towns = [];

  foreach ($types as $id => [$name, $idName]) {
    $effects = [];

    foreach ($townSpellChances[$id] as $spellID => $chance) {
      $effects[] = ['town_spellChance', (integer) ($chance / 100 * $constants['multiplier']), true, 'ifSpell' => $spellID];
    }

    $obj = new Town([
      'name' => $name,
      'idName' => $idName,
      'names' => array_splice($names, 0, 16),
      // $source is set by H3.Rules.
      'effects' => H3Effect::fromShort($effects, ['ifObject'], ['priority' => array_search('town', H3Effect::priority)]),
      'portrait' => array_shift($portraitOfTown),
      'background' => array_shift($backgroundOfTown),
      'music' => array_shift($musicOfTown),
      'resources' => array_shift($resourcesOfTown),
      'fortClass' => $fort[$id][0],
      'fortlessClass' => $fort[$id][1],
    ]);

    $towns[] = $obj;
  }

  file_put_contents("$outPath/towns.json", encodeJSON(Town::from1D($towns)));
  file_put_contents("$outPath/townsID.json", encodeJSON(Town::makeIdIndex($towns)));
}

// Particular type of homestead for hiring heroes and creatures, learning spells, etc. - Castle, Tower, Rampart, etc.
//
// Town->$id match SoD's as defined in TOWNTYPE.TXT.
class Town extends StoredEntity {
  static $normalize = [
    'name' => 'strval',
    '*names' => 'strval',
    'effects' => '',
    'portrait' => 'intval',
    'background' => 'strval',
    'music' => 'strval',
    '*resources' => 'intval',
    'fortClass' => 'intval',
    'fortlessClass' => 'intval',
  ];

  static $compact = ['effects' => 'H3Effect'];

  public $name;
  public $names;
  // supports shortcuts (=== true) in $ifGarrisoned, $ifVisiting, $ifObject, $ifTargetObject, $ifTargetPlayer, $ifPlayer, $whileObject - set to the town
  // and its owner
  public $effects;
  public $portrait;   // DEF frame number in ITPT, group 0; for custom towns frame is 18+this*4; see H3.Rules.TownPortrait
  public $background;   // bitmap file name
  public $music;
  public $resources;    // "native" town's constants.resource (matches the town's marketplace type); used when giving out starting player bonus
  public $fortClass;    // AClass->$id used when this Town has a Fort building or the Capitol
  public $fortlessClass;    // ...used when it has none
}

function write_creaturesID(array $options) {
  global $creatures;
  extract($options, EXTR_SKIP);

  if ($targets and !in_array('creatures', $targets)) {
    throw new Exception('creatures and creaturesID targets must be processed together.');
  }

  Creature::unrollKeys('cost', $constants['resources'], 'intval');

  $handles = fopenIdTXT($options, 'CRTRAITS.TXT');
  $creatures = [];

  while ($line = readCSV($handles, ['Name'])) {
    if ($line[0] === 'Singular') {
      // Russian version has an extra Plural2 column:
      // | Single from $idTxtPath | Single | Plural [| Plural2] | ...
      for ($plurals = 0; !strncmp($line[$plurals + 3], 'Plural', 6); $plurals++) ;
      continue;
    }
    // SoD has a blank line (55th) starting with 35 spaces.
    if (!strlen(trim($line[0]))) { continue; }
    $idName = Creature::makeIdentifier(array_shift($line));
    array_splice($line, 1, $plurals);
    array_pop($line);   // attributes, assigned directly
    $obj = new Creature(array_combine(columnsOf(Creature::class, 'abilityText'), $line));
    empty($obj->abilityText) and $obj->abilityText = null;
    $obj->idName = $idName;
    $creatures[] = $obj;
  }

  array_map('fclose', array_filter($handles));
  file_put_contents("$outPath/creaturesID.json", encodeJSON(Creature::makeIdIndex($creatures)));
}

function write_creatures(array $options) {
  global $creatures;
  global $globalStaticEffects;
  extract($options, EXTR_SKIP);

  if (!$creatures) {
    throw new Exception('creatures and creaturesID targets must be processed together.');
  }

  extract(require(__DIR__.'/databank-creatures.php'), EXTR_SKIP);

  foreach ($creatures as $id => $obj) {
    $obj->undead = array_search('living', Creature::undead);    // default value
    $obj->level = array_shift($levelOfCreature);
    $obj->town = array_shift($townOfCreature);
    $obj->background = $backgroundOfTown[$obj->town];
    $obj->terrain = array_shift($terrainOfCreature);
    $obj->alignment = array_shift($alignmentOfCreature);
    $obj->sound = array_shift($soundOfCreature);
    entityOverrides($obj, $creatureOverrides[$id] ?? []);

    $dynamic = $static = [];
    foreach ($effectsOfCreature[$id] ?? [] as $effect) {
      if (array_filter(array_intersect_key($effect, array_flip(['ifObject', 'ifGarrisoned', 'ifVisiting', 'ifPlayer', 'ifTargetObject', 'ifTargetPlayer', 'ifX', 'ifY', 'ifZ'])))) {
        $dynamic[] = $effect;
      } else {
        $static[] = $effect;
      }
    }
    if ($obj->undead === array_search('undead', Creature::undead)) {
      $dynamic[] = ['creature_morale', -1, 'ifObject' => true, 'ifCreatureUndead' => 0, 'stack' => array_search('undeadGarrison', H3Effect::stack)];
      $static[] = ['creature_morale', [$clamp, 0, 0], 'ifCreature' => $id];
    }
    foreach ($antipodeCreatures as $antipodes) {
      $found = false;
      foreach ($antipodes as $i => $ids) {
        if ($found = in_array($id, $ids)) { break; }
      }
      if ($found) {
        array_splice($antipodes, $i, 1);
        $antipodes = array_merge(...$antipodes);
        foreach ($antipodes as $creature) {
          // And damage bonus for this creature (and its upgraded forms) against
          // others.
          $static[] = ['creature_damageMin', 1.5, 'ifCreature' => $id, 'ifTargetCreature' => $creature];
          $static[] = ['creature_damageMax', 1.5, 'ifCreature' => $id, 'ifTargetCreature' => $creature];
          // And damage bonus for other creatures against this and its upgrades.
          $static[] = ['creature_damageMin', 1.5, 'ifCreature' => $creature, 'ifTargetCreature' => $id];
          $static[] = ['creature_damageMax', 1.5, 'ifCreature' => $creature, 'ifTargetCreature' => $id];
        }
      }
    }
    if ($obj->shooting and !in_array($id, $noMeleePenaltyCreatures)) {
      $static[] = ['creature_meleePenalty', 0.5, 'ifCreature' => $id];
    }
    if ($obj->piercing) {
      $static[] = ['creature_piercing', 1 - $obj->piercing / 100, 'ifCreature' => $id];
    }

    if ($obj->terrain !== null) {
      // XXX=C SoD seems to determine combat terrain based on other things, not only underlying terrain. For example, a lava near water has another combat background ("beach") and creatures native to lava (like Imps) don't get bonuses there. Not sure if HeroWO respects this, need to check type of tile generated on shores - maybe the editor changes it from lava to other, then we're good.
      $static[] = ['creature_attack', +1, 'ifTerrain' => $obj->terrain, 'ifContext' => array_search('combat', H3Effect::context), 'ifCreature' => $id];
      $static[] = ['creature_defense', +1, 'ifTerrain' => $obj->terrain, 'ifContext' => array_search('combat', H3Effect::context), 'ifCreature' => $id];
      $static[] = ['creature_speed', +1, 'ifTerrain' => $obj->terrain, 'ifContext' => array_search('combat', H3Effect::context), 'ifCreature' => $id];
    }

    $obj->effects = H3Effect::fromShort($dynamic, [], ['priority' => array_search('garrison', H3Effect::priority), 'default' => ['source' => [array_search('garrison', H3Effect::source), $id]]]);
    $obj->effectsTown = H3Effect::fromShort($townEffectsOfCreature[$id] ?? [], [], ['priority' => array_search('garrison', H3Effect::priority), 'default' => ['source' => [array_search('garrison', H3Effect::source), $id]]]);
    $obj->effectsHero = H3Effect::fromShort($heroEffectsOfCreature[$id] ?? [], [], ['priority' => array_search('garrison', H3Effect::priority), 'default' => ['source' => [array_search('garrison', H3Effect::source), $id]]]);
    $globalStaticEffects = array_merge($globalStaticEffects, H3Effect::fromShort($static, [], ['priority' => array_search('garrison', H3Effect::priority), 'default' => ['source' => [array_search('garrison', H3Effect::source), $id]]]));
  }

  file_put_contents("$outPath/creatures.json", encodeJSON(Creature::from1D($creatures)));
}

// Creatures comprise combat party of a hero, town or roaming monster company: Pikeman, Vampire, Phoenix, etc.
//
// Creature->$id match SoD's as defined in CRTRAITS.TXT (after excluding first
// two rows and all empty rows). There are custom creatures after the last standard creature.
class Creature extends StoredEntity {
  const alignment = [
    // null/0 - neutral
    1 => 'good',
    2 => 'evil',
  ];

  // bool = undead && !!(undead - 1)
  const undead = [
    // null/0 - unspecified/mechanical
    1 => 'living',
    2 => 'undead',
  ];

  const special = [
    // null/0 - regular combat creature
    1 => 'trench',
    'upperTower',
    'middleTower',
    'lowerTower',
    'gate',
    'upperWall',
    'midUpperWall',
    'midLowerWall',
    'lowerWall',

    'catapult',
    'ballista',
    'firstAidTent',
    'ammoCart',
  ];

  const damageGroup = [
    // null/0 - regular combat damage
    1 => 'wall',
    'invulnerable',
  ];

  static $normalize = [
    'nameSingular' => 'strval',
    'namePlural' => 'strval',
    'cost',
    'fightValue' => 'intval',
    'aiValue' => 'intval',
    'growth' => 'intval',
    'hordeGrowth' => 'intval',
    'hitPoints' => 'intval',
    'speed' => 'intval',
    'attack' => 'intval',
    'defense' => 'intval',
    'damageMin' => 'intval',
    'damageMax' => 'intval',
    'shots' => 'intval',
    'spells' => 'intval',
    'mapMin' => 'intval',
    'mapMax' => 'intval',
    'abilityText' => 'strval',

    'effects' => '',
    'effectsTown' => '',
    'effectsHero' => '',
    'level' => 'intval',
    'town' => 'intval',
    'alignment' => 'intval',
    'width' => 'intval',
    'height' => 'intval',
    '*passable' => 'boolval',
    'flying' => 'boolval',
    'regenerating' => 'boolval',
    'undead' => 'intval',
    'background' => 'strval',
    'terrain' => 'intval',
    'win' => 'boolval',
    'absolute' => 'boolval',
    'special' => 'intval',
    'sound' => 'strval',

    'shooting' => 'boolval',
    'shootingCloud' => 'intval',
    'jousting' => 'intval',
    'piercing' => 'intval',
    'damageGroup' => 'intval',
    'attackAndReturn' => 'boolval',
    'wallStrikes' => 'intval',
    'attackAround' => 'intval',
    'attackDepth' => 'intval',
    'retaliating' => 'intval',
    'enemyRetaliating' => 'boolval',
    'strikes' => 'intval',
    'criticalChance' => 'intval',
    'critical' => 'intval',
  ];

  static $unrolled = [];

  static $compact = [
    'effects' => 'H3Effect',
    'effectsTown' => 'H3Effect',
    'effectsHero' => 'H3Effect',
    'passable' => 'intval',
  ];

  public $nameSingular;
  public $namePlural;
  //public $cost_RESOURCE;
  public $fightValue;
  public $aiValue;
  public $growth;
  public $hordeGrowth;    // 0 for most creatures; unknown purpose XXX=C
  public $hitPoints;
  public $speed;
  public $attack;
  public $defense;
  public $damageMin;
  public $damageMax;
  public $shots;
  public $spells;   // some kind of counter that is > 0 for creatures able to cast spells
  public $mapMin;
  public $mapMax;
  public $abilityText;

  // supports shortcuts (=== true) in $ifGarrisoned, $ifVisiting, $ifObject, $ifTargetObject, $ifTargetPlayer, $ifPlayer - set to either hero
  // or town where this creature is garrisoned, and to its owner; also if $ifX/ifY/ifZ are all true - set to actionable spot of owner
  public $effects;
  // As $effects but only applied if part of town's or hero's garrison.
  public $effectsTown;
  public $effectsHero;
  public $level;     // 1+ or 0/null if not applicable
  public $town;     // null/false for neutral, 1+ for castle ID
  public $alignment;  // Creature::alignment; 0/null neutral
  public $width;    // attribute: DOUBLE_WIDE; integer (1+); null (=1)
  public $height;    // integer (1+); null (=1)
  public $passable;    // as CombatObstacle->$passable; false (= fully impassable)
  public $flying;    // attribute: FLYING_ARMY; bool, null (=false)
  public $regenerating;   // bool; heals HP before starts moving
  public $undead;   // attribute: IS_UNDEAD; ::undead
  public $background;   // bitmap file name
  public $terrain;   // AClass::terrain; native terrain (bonuses)
  public $win = true;   // combat party loses if its garrison is empty or composed of Creatures with $win = false
  public $absolute;  // damage ignores defense; see creature_absolute
  public $special;  // ::special
  public $sound;  // prefix for entries in audio.json

  // Attack-related properties.
  public $shooting;    // attribute: SHOOTING_ARMY; bool, null (=false)
  public $shootingCloud;  // null, integer (if shoots, affects target and creatures within this many cells around target)
  public $jousting;     // attribute: const_jousting; integer 1+ %, null (=0)
  public $piercing;   // 0-100 (%), reduction in target creature's Defense (Behemoth)
  public $damageGroup;  // ::damageGroup; each group has its own damage calculation formula; regular depends on $attack, $damageMax, etc.; an attacking creature may affect any $damageGroup (if it has certain properties set; e.g. $wallStrikes and $strikes for Cyclops) but remember there's a single $hitPoints property that is shared by all damage groups
  public $attackAndReturn; // bool; if moves and attacks, returns to original cell after attack
  public $wallStrikes;    // attribute: CATAPULT; integer (0+, 0 if cannot attack 'wall'); null (=0); if $shooting, attack is remote and reduces $shots (only in non-classic mode)
  public $attackAround;  // attribute: MULTI_HEADED; integer (distance everywhere around self), -1 (affect targets that are adjacent both to the attacker and the attacked), null (=0)
  public $attackDepth; // attribute: HAS_EXTENDED_ATTACK; integer (add this many extra cells to attack area; cannot be used if $attackAround is -1), null (=0)
  public $retaliating;    // integer (0+), null (=1), 9999 (unlimited)
    // XXX=R:ddd: set to 1 explicitly
  public $enemyRetaliating = true;    // attribute: const_free_attack; bool, null (=false)
  public $strikes;    // attribute: const_two_attacks; integer (0+, 0 if cannot attack regular damage group); null (=1)
  public $criticalChance;   // 0-100 (%), used for Ballista
  public $critical = 2.0;   // for Ballista

  // Attributes implemented using Effects:
  // - const_lowers_morale, const_raises_morale ($creature_morale)
  // - const_no_melee_penalty ($creature_meleePenalty)
  // - const_no_wall_penalty ($creature_shootPenalty)
  // - IMMUNE_TO_FIRE_SPELLS ($creature_spellImmune, $ifSpellSchool = $fire)
  // - IMMUNE_TO_MIND_SPELLS ($creature_spellImmune, $ifSpell = ...)
  //
  // Attributes unused due to unclear purpose:
  // - KING_1
  // - KING_2
  // - KING_3
  // - SIEGE_WEAPON
}

function write_creatureAnimations(array $options) {
  extract($options, EXTR_SKIP);
  extract(require(__DIR__.'/databank-creatureAnimations.php'), EXTR_SKIP);

  $animationToID = json_decode(file_get_contents("$outPath/animationsID.json"), true);
  $animations = ObjectStore::fromFile("$outPath/animations.json");

  $handle = fopenTXT($options, 'CRANIM.TXT');
  $creatureAnimations = [];

  while ($line = readCSV($handle, ['Time between fidgets'])) {
    array_pop($line);   // remove "Name"
    // No $missileAngles members in SoD's CRANIM.TXT have fractional part.
    $line[] = array_splice($line, 10, 12);
    $line[] = array_shift($defOfCreature);
    $line[] = $missileOfCreature[count($creatureAnimations)] ?? null;
    $obj = new CreatureAnimation(array_combine(columnsOf(CreatureAnimation::class), $line));
    $obj->fidgetInterval *= 1000;
    $obj->walkTime *= 1000;
    $obj->attackTime *= 1000;
    $obj->flightDistance *= 1000;
    if ($obj->missileImage) {
      $obj->missileFrame--;   // actual frame number is - 1
      $animationID = $animationToID[$obj->missileImage.'_0'];
      $frameCount = $animations->atCoords($animationID, 0, 0, 'frameCount');
      if (stripos(' PELFX PICEE PLCBOWX PMEDUSX PPLIZAX ', " $obj->missileImage ")) {
        // Fixing angles because there is no way the above-listed images correspond to the angles specified in CRANIM.TXT. Apparently they were all made from a single arrow template. If you place them on top of say SMBALX frames you'll see how different their angles are. SoD either doesn't use this file when determining the frame to use or does some correction on its data.
        $obj->missileAngles = [-90, -45, -23, -5, 0, 5, 23, 45, 90];
      } else {
        foreach ($obj->missileAngles as $frame => &$ref) {
          // Negating degrees to convert to regular top left corner based grid.
          $ref *= -1;
          if ($ref >= 90 or $frame >= $frameCount - 1) {
            $ref = 90;    // last frame is a match-all, if no others matched
            array_splice($obj->missileAngles, $frame + 1);
            break;
          }
        }
      }
      // These numbers originally reflect the missile's orientation (if you place various arrows on radial guides you'll see how perfectly they align with them at 90, 72, etc. except for PELFX and others from above). The engine compares them with the target angle exactly, e.g. a frame for angle -72 used for angles -89..-72. However, next frame (-45) isn't suited for angles closer to -72, such as -65 so we shift them to e.g. use frame -72 for -81..-58.
      foreach ($obj->missileAngles as $frame => &$ref) {
        if ($frame < $frameCount - 1) {
          $ref += round(($obj->missileAngles[$frame + 1] - $ref) / 2);
        }
      }
    } else {  // don't store useless values
      foreach ($obj::$normalize as $prop => $v) {
        strncmp('missile', $prop, 7) or $obj->$prop = null;
      }
    }
    $creatureAnimations[] = $obj;
  }

  // CRANIM.TXT is missing entry for Arrow Tower.
  $creatureAnimations[] = new CreatureAnimation;

  fclose($handle);
  unset($ref);
  file_put_contents("$outPath/creatureAnimations.json", encodeJSON(CreatureAnimation::from1D($creatureAnimations)));
  // There's no ID index because CreatureAnimation->$id == Creature->$id.
}

// Info about all animations in the DEF file of a single creature appearing in combat.
//
// CreatureAnimation->$id match SoD's as defined in CRANIM.TXT (after excluding first
// two rows and all empty rows). There are custom animations after the last standard animation.
class CreatureAnimation extends StoredEntity {
  static $normalize = [
    'fidgetInterval' => 'intval',
    'walkTime' => 'intval',
    'attackTime' => 'intval',
    'flightDistance' => 'intval',
    'missileTX' => 'intval',
    'missileTY' => 'intval',
    'missileX' => 'intval',
    'missileY' => 'intval',
    'missileBX' => 'intval',
    'missileBY' => 'intval',
    'textOffset' => 'intval',
    'missileFrame' => 'intval',
    '*missileAngles' => 'intval',
    'image' => 'strval',
    'missileImage' => 'strval',
  ];

  public $fidgetInterval; // all 1.00 (1000) in SoD
  public $walkTime; // varies from 0.50 to 1.55 (500..1550) in SoD
  public $attackTime; // all 1.00 (1000) in SoD
  public $flightDistance; // all 1.00 (1000) in SoD; unknown purpose XXX=C
  public $missileTX;   // (T)op (B)ottom (R)ight, X/Y = coords
  public $missileTY;
  public $missileX;
  public $missileY;
  public $missileBX;
  public $missileBY;
  public $textOffset; // all 0 in SoD
  public $missileFrame;    // in $image.def; only when shooting; in SoD, 0 for all melee and non-0 for all shooters
  // values from -90 to +90 inclusive (ascending order); index = frame number which is used when shooting angle is <= this value (target is to the right of the shooter); +90 is last valid value and therefore no frames past it will match; negative angles are for creature shooting upwards; when shooting leftwards, the image is mirrored
  //
  // SoD: count of 12; there are only two combinations: either 0 for all (Beholder/Evil Eye, Cyclops/King, Catapult) or [90 72 45 27 0 -27 -45 -72 -90 0 0 0] (all other shooters)
  public $missileAngles;
  public $image;
  public $missileImage;
}

function write_banks(array $options) {
  global $globalStaticEffects;
  global $globalLabeledEffects;
  extract($options, EXTR_SKIP);

  // Determined empirically.   (*) Having separate OBJECTS.TXT class and name.
  $bankClasses = [
    nameToID("$outPath/objects", 'creatureBank_0'),   // Cyclops Stockpile
    nameToID("$outPath/objects", 'creatureBank_1'),   // Dwarven Treasury
    nameToID("$outPath/objects", 'creatureBank_2'),   // Griffin Conservatory
    nameToID("$outPath/objects", 'creatureBank_3'),   // Imp Cache
    nameToID("$outPath/objects", 'creatureBank_4'),   // Medusa Stores
    nameToID("$outPath/objects", 'creatureBank_5'),   // Naga Bank
    nameToID("$outPath/objects", 'creatureBank_6'),   // Dragon Fly Hive
    nameToID("$outPath/objects", 'shipwreck'),        // * Shipwreck
    nameToID("$outPath/objects", 'derelictShip'),     // * Derelict Ship
    nameToID("$outPath/objects", 'crypt'),            // * Crypt
    nameToID("$outPath/objects", 'dragonUtopia'),     // * Dragon Utopia
  ];

  $nameToCreatureID = [
    'Angels' => 'angel', // 12
    'Black Dragons' => 'blackDragon', // 83
    'Cyclopes' => 'cyclops', // 94
    'Dragonflies' => 'dragonFly', // 105
    'Dwarves' => 'dwarf', // 16
    'Gold Dragons' => 'goldDragon', // 27
    'Green Dragons' => 'greenDragon', // 26
    'Griffins' => 'griffin', // 4
    'Imps' => 'imp', // 42
    'Medusae' => 'medusa', // 76
    'Nagas' => 'naga', // 38
    'None' => false,
    'Red Dragons' => 'redDragon', // 82
    'Skeletons' => 'skeleton', // 56
    'Vampires' => 'vampire', // 62
    'Water Elementals' => 'waterElemental', // 115
    'Wights' => 'wight', // 60
    'Wyverns' => 'wyvern', // 108
    'Zombies' => 'zombie', // 59
  ];

  Bank::unrollKeys('reward', $constants['resources'], 'intval');
  Bank::unrollKeys('artifacts', array_flip(Artifact::rarity), 'intval');

  $handles = fopenIdTXT($options, 'CRBANKS.TXT');
  $banks = $byLevel = [];

  while ($line = readCSV($handles, ['Adventure Object'])) {
    $s = array_shift($line) and $bankIdName = Bank::makeIdentifier($s);
    array_splice($line, 22, 0, [0]);  // $artifacts_special
    $obj = new Bank(array_combine(columnsOf(Bank::class, 'difficultyRatio'), $line));

    $obj->name or $obj->name = end($banks)->name;
    $obj->idName = $bankIdName.$obj->level;
    $obj->level--;
    $byLevel[$obj->name][] = $obj;
    $obj->classes = $bankClasses[0];
    $obj->level === 3 and array_shift($bankClasses);

    // These columns are not localized in CRBANKS.TXT.
    foreach (['garrison1', 'garrison2', 'garrison3', 'garrison4', 'join'] as $prop) {
      $idName = $nameToCreatureID[$obj->$prop];
      $obj->$prop = $idName ? nameToID("$outPath/creatures", $idName) : null;
    }

    $banks[] = $obj;
  }

  array_map('fclose', array_filter($handles));
  file_put_contents("$outPath/banks.json", encodeJSON(Bank::from1D($banks)));
  file_put_contents("$outPath/banksID.json", encodeJSON(Bank::makeIdIndex($banks)));

  $const = array_search('const', H3Effect::operation);
  $append = array_search('append', H3Effect::operation);
  $randomArray = array_search('randomArray', H3Effect::operation);
  $adve = array_column(csvFile($options, 'ADVEVENT.TXT', 0), 0);
  $creatures = ObjectStore::fromFile("$outPath/creatures.json");

  $artifacts = [];
  $store = ObjectStore::fromFile("$outPath/artifacts.json");
  for ($id = 0; $id < $store->x(); $id++) {
    $artifacts[Artifact::rarity[$store->atCoords($id, 0, 0, 'rarity')] ?? 'special'][] = $id;
  }

  foreach ($byLevel as $banks) {
    foreach (array_unique(array_merge(...array_column($banks, 'classes'))) as $class) {
      $effects = [];

      $effects[] = [
        'quest_chances',
        [$const, array_combine(array_column($banks, 'idName'), array_column($banks, 'chance'))],
      ];

      $effects[] = ['quest_placement', 'middle'];
      $effects[] = ['quest_fulfilled', [$const, false], 'ifGrantedMin' => 1];

      // Partly duplicates with write_classes().
      $globalStaticEffects = array_merge(
        $globalStaticEffects,
        H3Effect::fromShort($effects, [], ['priority' => array_search('mapObject', H3Effect::priority), 'default' => ['source' => array_search('initial', H3Effect::source), 'ifBonusObjectClass' => $class]])
      );

      foreach ($banks as $bank) {
        $labeled = [];

        $garrison = array_filter([
          $bank->garrison1 => $bank->garrison1Count,
          $bank->garrison2 => $bank->garrison2Count,
          $bank->garrison3 => $bank->garrison3Count,
          $bank->garrison4 => $bank->garrison4Count,
        ]);

        $labeled[] = ['quest_garrison', [$const, $garrison]];

        if ($bank->joinCount) {
          $labeled[] = ['bonus_creatures', [$append, $bank->join]];
          $labeled[] = ['bonus_creatureCount', $bank->joinCount, 'ifCreature' => $bank->join];
        }

        foreach ($bank as $prop => $value) {
          if (!$value) {
            // Continue.
          } elseif (!strncmp($prop, 'reward_', 7)) {
            $labeled[] = ['bonus_resource', $value, 'ifResource' => $constants['resources'][substr($prop, 7)], 'ifTargetPlayer' => -1];
          } elseif (!strncmp($prop, 'artifacts_', 10)) {
            $labeled[] = ['bonus_artifacts', array_merge([$randomArray, $value], $artifacts[substr($prop, 10)])];
          }
        }

        // Some bank-specific messages are defined in databank-objects.php.
        if (!in_array(rtrim($bank->idName, '0..9'), ['shipwreck', 'derelictShip', 'crypt', 'dragonUtopia'])) {
          $labeled[] = ['quest_message', [$const, [sprintf($adve[33].'`{Audio ROGUE`}', $bank->name)]]];
        }

        $creature = key($garrison);
        $level = $creatures->atCoords($creature, 0, 0, 'level');
        while (next($garrison) !== false) {
          if ($l = $creatures->atCoords(key($garrison), 0, 0, 'level') > $level) {
            $creature = key($garrison);
            $level = $l;
          }
        }
        $name = $creatures->atCoords($creature, 0, 0, $garrison[$creature] === 1 ? 'nameSingular' : 'namePlural');
        // No audio in this message (for any bank type) in SoD.
        $labeled[] = ['bonus_message', [$const, [sprintf($adve[34], $name, '`{Bonuses`}')."\n\n`{BonusesImages`}"]]];

        // Copied from write_classes().
        $globalLabeledEffects[$bank->idName] = H3Effect::fromShort($labeled, [], ['priority' => array_search('mapObject', H3Effect::priority), 'default' => ['ifBonusObject' => true]]);
      }
    }
  }
}

// Banks are adventure map objects that a hero can boldly rob of everything valuable (call it a reward). After defeating the guards, of course.
//
// Bank->$id match SoD's as defined in CRBANKS.TXT (after excluding first
// two rows).
class Bank extends StoredEntity {
  static $normalize = [
    'name' => 'strval',
    'level' => 'intval',
    'chance' => 'intval',
    'garrison1Count' => 'intval',
    'garrison1' => 'intval',
    'upgrade' => 'intval',
    'garrison2Count' => 'intval',
    'garrison2' => 'intval',
    'garrison3Count' => 'intval',
    'garrison3' => 'intval',
    'garrison4Count' => 'intval',
    'garrison4' => 'intval',
    'combatValue' => 'intval',
    'reward',
    'joinCount' => 'intval',
    'join' => 'intval',
    'artifacts',
    'overallValue' => 'intval',
    'rewardRatio' => 'intval',
    'difficultyRatio' => 'intval',

    '*classes' => 'intval',
  ];

  static $unrolled = [];

  public $name;
  public $level;  // 0-based
  public $chance; // 0-100 (%)
  // Guards.
  public $garrison1Count;
  public $garrison1;  // Creature->$id
  public $upgrade;  // 0-100 (%)   // XXX=C some kind of chance
  public $garrison2Count;
  public $garrison2;  // Creature->$id
  public $garrison3Count;
  public $garrison3;  // Creature->$id
  public $garrison4Count;
  public $garrison4;  // Creature->$id
  public $combatValue;  // approximate count of equivalent Imps
  // Rewards.
  //public $reward_RESOURCE;
  public $joinCount;
  public $join;   // Creature->$id
  // Count of artifacts of specific Artifact->$rarity.
  //public $artifacts_0;
  //public $artifacts_RARITY;
  public $overallValue;
  public $rewardRatio;  // "Reward / Difficulty"
  public $difficultyRatio;  // 0-100 (%) - "Difficult / Easiest"

  public $classes;    // array of AClass->$id that represent this bank on ADVMAP (multiple banks may have this the same; usually same type of bank but different $level has same $classes)
}

function write_buildings(array $options) {
  extract($options, EXTR_SKIP);

  Building::unrollKeys('cost', $constants['resources'], 'intval');

  $neut = csvFile($options, 'BLDGNEUT.TXT', 0);
  $spec = csvFile($options, 'BLDGSPEC.TXT', 0);
  $dwel = csvFile($options, 'DWELLING.TXT', 0);

  $buildings = require(__DIR__.'/databank-buildings.php');
  $nameToID = array_keys($buildings);
  $objects = [];

  foreach ($buildings as $idName => $building) {
    $building += compact('idName');

    foreach (['require', 'upgrade', 'ifU'] as $prop) {
      if (isset($building[$prop])) {
        foreach ($building[$prop] as &$ref) {
          $ref = array_search($name = $ref, $nameToID);
          if ($ref === false) {
            throw new Exception("Cannot resolve building '$name'.");
          }
        }
      }
    }

    $effects = $building['effects'] ?? [];
    if (isset($building['produce'])) {
      $effects[] = ['hireAvailable', array_merge([array_search('append', H3Effect::operation)], $building['produce']), 'ifBonusObject' => true, 'ifBuilding' => array_search($idName, $nameToID)];

      if (count($building['produce']) === 2) {
        list($from, $to) = $building['produce'];
        // Allow upgrading creatures part of the town's garrison or part of a garrisoned or visiting hero's garrison.
        $effects[] = ['creature_upgradeCan', [array_search('append', H3Effect::operation), $to], 'ifObject' => true, 'ifCreature' => $from];
        $effects[] = ['creature_upgradeCan', [array_search('append', H3Effect::operation), $to], 'ifGarrisoned' => true, 'ifCreature' => $from];
        $effects[] = ['creature_upgradeCan', [array_search('append', H3Effect::operation), $to], 'ifVisiting' => true, 'ifCreature' => $from];
      }
    }

    $objects[] = $obj = new Building;
    // $source is set by H3.Rules.
    $building['effects'] = H3Effect::fromShort($effects, ['ifObject'], ['priority' => array_search('building', H3Effect::priority)]);
    entityOverrides($obj, $building);
  }

  unset($ref);
  file_put_contents("$outPath/buildings.json", encodeJSON(Building::from1D($objects)));
  file_put_contents("$outPath/buildingsID.json", encodeJSON(Building::makeIdIndex($objects)));

  $producers = [];
  $allTowns = json_decode(file_get_contents("$outPath/townsID.json"));
  foreach ($objects as $building) {
    foreach ($building->produce ?? [] as $creature) {
      $towns = !provided($building->town) ? $allTowns : $building->town;
      foreach ($towns as $town) {
        $producers[$town][$building->id][] = $creature;
      }
    }
  }
  file_put_contents("$outPath/producers.json", encodeJSON($producers));
}

// Construct that can be erected in a town: dwelling, Marketplace, etc.
class Building extends StoredEntity {
  const blacksmith = [
    1 => 'ballista',
    'firstAidTent',
    'ammoCart',
  ];

  static $normalize = [
    'name' => 'strval',
    'description' => 'strval',
    'descriptionU' => 'strval',
    'cost',
    '*produce' => 'intval',
    '*require' => 'intval',
    '*upgrade' => 'intval',
    '*town' => 'intval',
    'image' => '',
    'imageU' => '',
    '*ifU' => 'intval',
    'effects' => '',

    'descriptionA' => 'strval',
    'descriptionB' => 'strval',
    'descriptionM' => 'strval',
    'descriptionT' => 'strval',
    '*townTypes' => 'intval',
  ];

  static $unrolled = [];

  static $compact = [
    'effects' => 'H3Effect',
    'image' => 'BuildingImage',
    'imageU' => 'BuildingImage',
  ];

  public $name;
  public $description;
  // Shown in the town screen for structures that boost production of another
  // structure, in case that other one was upgraded (e.g. $description is for
  // Griffins while $descriptionU - for Royal Griffins).
  public $descriptionU;
  //public $cost_RESOURCE;
  // array of creature IDs; all share the same available count; must be in order
  // of creature strength (upgraded versions in the end) because last creature is
  // shown as this building's "face" in GrowthBuildingList and FortBuildingList
  public $produce;    // array of Creature->$id; only informational
  // array of building IDs
  public $require;
  // array of building IDs
  //
  // IDs of Building-s must go in order from non-upgraded to upgraded versions;
  // this is relied upon in Rules.TownHallBuildings.
  public $upgrade;
  // array of town IDs; false if any can build, [] if can't be built by player;
  // affects only Hall window, doesn't prevent from appearing in Townscape;
  // if $town is [] then $image can be set or unset; if $town lists a particular
  // town then there must be an entry for that town in $image; if $town is false
  // then $image must contain entries for all Town->$id-s
  public $town;
  // null if isn't listed in Hall and doesn't appear in Townscape
  public $image;
  public $imageU;
  // if any of these buildings is built then must use descriptionU/imageU
  public $ifU;
  // supports shortcuts (=== true) in $ifGarrisoned, $ifVisiting, $ifObject, $ifTargetObject, $ifTargetPlayer, $ifPlayer, $ifBuilding, $ifBonusObject - set to town and its owner; also if $ifX/ifY/ifZ are all true - set to actionable spot of town
  public $effects;

  // Fields used by some building types.
  public $descriptionA;
  public $descriptionB;
  public $descriptionM;
  public $descriptionT;
  public $townTypes;  // array town ID => ::blacksmith

  function schema() {
    $i = 0;
    return [
      'name' => $i++,
      'description' => $i++,
      'descriptionU' => $i++,
      'cost' => $i,
        'cost_wood' => $i++,
        'cost_mercury' => $i++,
        'cost_ore' => $i++,
        'cost_sulfur' => $i++,
        'cost_crystal' => $i++,
        'cost_gems' => $i++,
        'cost_gold' => $i++,
      'produce' => $i++,
      'require' => $i++,
      'upgrade' => $i++,
      'town' => $i++,
      'image' => $i++,
      'imageU' => $i++,
      'ifU' => $i++,
      'effects' => $i++,
      // Blacksmith.
      'descriptionA' => $i,
      'descriptionB' => $i + 1,
      'descriptionM' => $i + 2,
      'descriptionT' => $i + 3,
      'townTypes' => $i + 4,
    ];
  }
}

// Info about visual presentation of a town's Building.
class BuildingImage extends StoredEntity {
  static $normalize = [
    '*hallImage' => '',
    'scapeImage' => 'strval',
    'scapeOutline' => 'strval',
    '*scapeShapes' => 'strval',
    '*scapeHoles' => 'strval',
    'scapeX' => 'intval',
    'scapeY' => 'intval',
    'scapeZ' => 'intval',
    'icon' => 'strval',
  ];

  // array of [def, group, frame]; null if isn't listed in Hall
  public $hallImage;
  // DEF file name (may be animated or not); null if never appears on the townscape
  public $scapeImage;
  // bitmap file name
  public $scapeOutline;
  // arrays of strings, each describing polygon points like "x1 y1 x2 y2 ...";
  // order doesn't matter since user interaction with any of these has the same effect (hover/click on the "building")
  public $scapeShapes;
  // same but describes interior holes inside exterior contours; all holes overlay
  // all $scapeShapes polygons;
  // these points are considered not part of the shape even though they are within
  // $scapeShapes polygons
  public $scapeHoles;
  public $scapeX;
  public $scapeY;
  // positive Z-index relative to other Building-s; may duplicate for buildings
  // that are guaranteed to never appear on the same screen
  // range is 1..99 (inclusive); in particular, 100 is assumed to be next unused index by CSS and JS
  public $scapeZ;
  public $icon;   // bitmap file name
}

function write_combat(array $options) {
  extract($options, EXTR_SKIP);
  extract(require(__DIR__.'/databank-combat.php'), EXTR_SKIP);

  foreach ($obstacles as &$ref) {
    $ref = new CombatObstacle(array_combine(columnsOf(CombatObstacle::class, '*passable'), $ref));
    // XXX+C which OB* obstacles can be removed with the spell in SoD?
    $ref->removable === null and $ref->removable = !strncasecmp($ref->image, 'OB', 2);
    $ref->passable = str_split($ref->passable);
    entityOverrides($ref, $obstacleOverrides[$ref->image] ?? []);

    if (count($ref->passable) !== $ref->width * $ref->height) {
      throw new Exception("Bad width/height/passable of CombatObstacle $ref->image.");
    }
  }

  unset($ref);
  file_put_contents("$outPath/combatObstacles.json", encodeJSON(CombatObstacle::from1D($obstacles)));

  foreach ($backgrounds as &$ref) {
    $ref = new CombatBackground(array_combine(columnsOf(CombatBackground::class), $ref));

    foreach ($ref->obstacles as &$ref) {
      $ref = new CombatBackgroundObstacle(array_combine(columnsOf(CombatBackgroundObstacle::class), $ref));
    }
  }

  unset($ref);
  file_put_contents("$outPath/combatBackgrounds.json", encodeJSON(CombatBackground::from1D($backgrounds)));
}

// Parameters of a single impassable object placed over a battlefield to make every new combat more unique.
//
// This represents a single OB*.DEF or OB*.BMP.
//
// SoD is using a hexagonal combat grid, unlike square grid in ADVMAP:
//      /\ /\ / .
//     |  |  |
//    / \/ \/ \ .
//   |  |  |
//    \ /\ /\ / .
//     |  |  |
//    / \/ \/ \ .
//     .  .  .
// This makes addressing things using (X:Y) less intuitive but still workable
// because the field itself is rectangular, with each odd row shifted 1/2 to the left.
// Therefore objects are treated in a rectangular manner just like on the adventure map,
// except their top left corner is assumed to always belong to an even row,
// making their shape a trapezium or rhombus (depending on its height).
// A 3x3 object that would be a square on ADVMAP
// will look like this in combat (# - cell filled by the object):
//      /\ /\ /\ /\ /
//     |  |##|##|##|            _____        _____        _____
//    / \/ \/ \/ \/ \          /_____\      /     \      /     \
//   |  |##|##|##|            trapezium     \_____/      \     /
//    \ /\ /\ /\ /\ /                       rhombus      /     \
//     |  |##|##|##|                                     \     /
//    / \/ \/ \/ \/ \                                      ...
// If the above object had each left cell passable and other cells impassable,
// its passability mask when serialized into an array would look like so:
//    $passable = [true, false, false,  true, false, false,  true, false, false]
//                 ------ row 1 -----   ------ row 2 -----   ------ row 3 -----
class CombatObstacle extends StoredEntity {
  const imageType = ['bmp', 'def'];

  const countGroup = [
    'man1', // main tower
    'mlip', // trench outline
    'tpwl',
    'arch', // gate decoration
    'wa2',  // segment between mid/lower walls
    'wa5',
    'tw2',  // used in place of the functional upper tower (Citadel)
    'tw1',  // same for lower

    'small',
    'large',
  ];

  const backgroundGroup = [
    'castle',
    'rampart',
    'tower',
    'inferno',
    'necropolis',
    'dungeon',
    'stronghold',
    'fortress',
    'conflux',

    'groundy',
    'dirty',
    'beach',
    'boat',
    'dirt',
    'desert',
    'grassy',
    'grass',
    'cloverField',
    'evilFog',
    'fieryFields',
    'favorableWinds',
    'holyGround',
    'lucidPools',
    'magicClouds',
    'rocklands',
    'lava',
    'rough',
    'snow',
    'subterranean',
    'swamp',
  ];

  static $normalize = [
    'image' => 'strval',
    'imageType' => 'intval',
    'countGroup' => 'intval',
    'backgroundGroup' => 'intval',
    'offsetX' => 'intval',
    'offsetY' => 'intval',
    'width' => 'intval',
    'height' => 'intval',
    '*passable' => 'boolval',
    'removable' => 'boolval',
    'x' => 'intval',
    'y' => 'intval',
  ];

  static $compact = [
    'passable' => 'intval',
  ];

  public $image;
  public $imageType;
  public $countGroup;
  public $backgroundGroup;
  public $offsetX;  // in pixels
  public $offsetY;
  public $width;    // in cells
  public $height;
  public $passable; // similar to AObject/AClass->$passable but allows only array/string
  public $removable;   // can be targeted by Remove Obstacle spell
  public $x;    // $x and $y must be set together; if set, obstacle is always placed at these coords (unless they're occupied) and this placing is done before placing ones with unset $x/$y (which are put in random positions) but after placing creatures
  public $y;
}

// Potential set of background and other combat settings used depending on various factors, such as near water or mountain.
class CombatBackground extends StoredEntity {
  static $normalize = [
    'name' => 'strval',
    'image' => 'strval',
    '*ifOn' => 'boolorintval',
    '*ifNear' => 'boolorintval',
    'ifNearDistance' => 'intval',
    '*ifVehicle' => 'intval',
    '*ifFortification' => 'intval',
    '*ifFortifications' => 'intval',
    'priority' => 'intval',
    'obstacles' => '',
  ];

  static $compact = [
    'obstacles' => 'CombatBackgroundObstacle',
  ];

  public $name;
  public $image;
  // Conditions below are (cond1_val1 OR cond1_val2 OR ...) AND (cond2_val1 OR ...),
  // i.e. for every non-false property at least one of its values must match.
  public $ifOn;  // array of pairs: AClass->$id, AObject->$subclass (or false for any); matches when hero is standing on actionable spot (or on any if fully passable)
  public $ifNear;  // ditto
  public $ifNearDistance;  // only if $ifNear is non-empty; max number of cells between any $ifNear object and combat's spot (checks solid object's box, including passabile cells); combat's spot itself is unchecked (use $ifOn)
  public $ifVehicle;  // AObject->$vehicle; if negative then only attacked party must have this (value is two's complement: ~v), else all parties
  public $ifFortification;  // array of Effect::fortification, any one of which must be present in any party's fortifications
  public $ifFortifications;  // as $ifFortification but all of these at once must be present in any one party; must not have duplicates
  public $priority;   // if multiple backgrounds are eligible for a combat, one with the higher priority wins
  public $obstacles;
}

// Parameters for group of impassable objects placed over the battlefield.
//
// Normally, SoD has two such groups per background: one with one large obstacle and another with several small obstacles.
//
// After determining combat's CombatBackground, the engine gets its $obstacles. For every member, it creates a list of CombatObstacle-s whose $countGroup is the same as this object's $countGroup, and $backgroundGroup is listed in this object's $backgroundGroups, and then tries to create N (N = random $min..$max) random members from that list. Fewer may be actually placed depending on available free cells.
class CombatBackgroundObstacle extends StoredObject {
  static $normalize = [
    'countGroup' => 'intval',
    '*backgroundGroups' => 'intval',
    'min' => 'intval',
    'max' => 'intval',
  ];

  public $countGroup;   // CombatObstacle->$countGroup
  public $backgroundGroups;   // CombatObstacle->$backgroundGroup, $min..$max picked randomly from this common pool
  public $min;
  public $max;
}

// Individual message commenting on combat events: strike, spell cast, etc.
//
// This isn't used by PHP code but exists to create schema and constants for combats generated on run-time.
class CombatLog extends StoredObject {
  const type = [
    'newRound',
    'spell',
    'wait',
    'defend',
    'attack',
    'luckGood',
    //'luckBad',    // no such effect in SoD
    'moraleGood',
    'moraleBad',
    'regenerating',
    'spellEvade',
    'spellCast',    // message format as in type=attack
    'spellSummon',
    'critical',
  ];

  static $normalize = [
    'type' => 'intval',
    '*message' => '',
    'party' => 'intval',
  ];

  public $type;
  public $message;    // ['foo % %', 123, 'bar']
  public $party;      // optional initiator, _parentKey in parties
}

// --- Functions ---

// Returns a handle for $txtPath/$file with transparent convertion from $charset
// set up.
function fopenTXT(array $options, $file) {
  $handle = fopen("$options[txtPath]/$file", 'rb');
  stream_filter_append($handle, "convert.iconv.$options[charset].utf-8");
  return $handle;
}

// Opens a pair of text files: localized and English. If input data is not
// localized (no -ti), first member is the English file and second is null.
function fopenIdTXT(array $options, $file) {
  return [
    fopenTXT($options, $file),
    $options['idTxtPath'] ? fopen("$options[idTxtPath]/$file", 'rb') : null,
  ];
}

// Use this to read SoD's TXT files that have at least 2 columns and may have
// junk lines (i.e. ones with 0 or 1 columns or headers). A line that starts with
// empty cell (see e.g. ARTRAITS.TXT) is always considered a header.
//
// Default $minLength of 2 returns only lines with at least 2 columns.
// $minLength of 1+ returns non-empty lines, with first column having non-empty
// value and also not part of $headers.
// $minLength of 0 returns empty lines and doesn't check first column's content.
//
// If $handle is an array, result will always have one extra member. This allows
// reading two files in parallel, putting first column from $handle[1] in front
// of $handle[0]'s columns. If $handle[1] is null, that member is the same as
// $handle[0]'s first column.
function readCSV($handle, array $headers = [], $minLength = 2, $trim = true) {
  while (false !== $line = fgetcsv(((array) $handle)[0], 0, "\t")) {
    $english = isset($handle[1]) ? fgetcsv($handle[1], 0, "\t") : null;
    if (count($line) >= $minLength and
        (!$minLength or (strlen($line[0] ?? '') and !in_array($line[0], $headers)))) {
      is_array($handle) and array_unshift($line, $english[0] ?? $line[0]);
      return $trim ? array_map('trim', $line) : $line;
    }
  }
}

// Runs readCSV() on the entire file and returns its parsed content.
function csvFile(array $options, $file, $minLength = 1, $trim = true) {
  $res = [];
  $handle = fopenTXT($options, $file);
  while ($line = readCSV($handle, [], $minLength, $trim)) { $res[] = $line; }
  fclose($handle);
  return $res;
}

// Returns cleaned lines of a simple (non-CSV) text file.
function listFile(array $options, $file) {
  $handle = fopenTXT($options, $file);
  $lines = explode("\n", stream_get_contents($handle));
  fclose($handle);
  // Behaviour equals file()'s.
  end($lines) === '' and array_pop($lines);
  return array_map('trim', $lines);
}

// Returns an array where each member holds two lines: from localized and
// English $file-s. If no -ti was given, both lines are the same.
function idListFile(array $options, $file, $makeIdentifier = null) {
  $localized = $english = listFile($options, $file);

  if ($options['idTxtPath']) {
    $english = array_map('trim', file("$options[idTxtPath]/$file", FILE_IGNORE_NEW_LINES));
  }

  $makeIdentifier and $english = array_map($makeIdentifier, $english);
  return array_map(null, $localized, $english);
}

function removeHeading($str) {
  return preg_replace('/^\\{[^}]+\\}\\s*(\\r?\\n)+/u', '', $str);
}

// Converts common SoD texts to HeroWO's MessageBox markup: quotes ``, normalizes EOL, replaces {Header} with ``## Header and adds $append.
function toMarkup($str, $append = null) {
  $str = preg_replace(
    ['/`/u', '/\r/', '/^\\{\\s*(.+)\}\\s*(\\n+|\\z)/um'],
    ['``', '', "`## \\1\n\n"],
    $str
  );

  $append === '' and $append = '`{BonusesImages`}';
  $append === null or $str .= "\n\n$append";
  return $str;
}

// Returns ID of a databank $index entity (e.g. a creature) given its idName, failing if none found.
function nameToID($index, $name) {
  if (is_array($name)) {
    return array_map(function ($n) use ($index) { return nameToID($index, $n); }, $name);
  } else {
    static $cached = [];
    $ref = &$cached[$index];
    $ref or $ref = json_decode(file_get_contents("{$index}ID.json"));
    if (!isset($ref->$name)) {
      throw new Exception("Cannot resolve '$name' in ".basename($index));
    }
    return $ref->$name;
  }
}

// Given $overrides = ['prop' => 'value'], assigns values to $obj's properties, with trivial sanity checks.
function entityOverrides(StoredEntity $obj, array $overrides) {
  foreach ($overrides as $prop => $value) {
    // Typical $overrides' definition is large so look out for possible
    // typos and mistakes.
    if (!property_exists(get_class($obj), $prop) and
        // Not unrolled.
        !isset($obj::$normalize[$prop])) {
      throw new Exception("Overriding unknown ".get_class($obj)." property \$$prop.");
    }
    $obj->$prop = $value;
  }
}

// Returns a slice of StoredObject::$normalize's keys converted to that object's property names.
//
// Used to assign data from SoD CSV .txt files; $upTo is the last $class' property present in the file (to ensure number of file's columns and count of returned properties match).
function columnsOf($class, $upTo = null) {
  $cols = array_keys($class::$normalize);
  if ($upTo) {
    $i = array_search($upTo, $cols);
    if ($i === false) {
      throw new Exception("$class has no column: $upTo");
    }
    $cols = array_slice($cols, 0, $i + 1);
  }
  return str_replace('*', '', $cols);
}

// Creates a bonus_effects Effect entry with the modifier embedding $effects - short form of Effect(s).
//
// Only supports $const, $append/$prepend and $randomArray (expects separate arrays of Effects in 2+ indexes).
//
// Doesn't support leading $label-s (GenericEncounter shortcut).
function bonus_effects(array $effect) {
  $embed = function (array $effects) {
    $effects = H3Effect::fromShort($effects, ['ifObject']);
    // Taken from StoredObject->normalize();
    $options = ['class' => H3Effect::class, 'padding' => true];
    return ObjectStore::from1D($effects, $options)
      ->jsonSerialize()['layers'][0];
  };
  array_unshift($effect, 'bonus_effects');
  $ref = &$effect[1];
  if ($ref[0] === array_search('const', H3Effect::operation)) {
    $ref[1] = $embed($ref[1]);
  } else {
    $random = H3Effect::operation[$ref[0]] === 'randomArray';
    $ref = array_merge(array_splice($ref, 0, 1 + $random), $random ? array_map($embed, $ref) : $embed($ref));
  }
  return $effect;
};

count(get_included_files()) < 3 /*core.php*/ and databankTakeOver($argv);
