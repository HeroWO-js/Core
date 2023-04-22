<?php
extract(array_flip(H3Effect::fortification), EXTR_PREFIX_ALL, 'f');
extract(array_flip(CombatObstacle::imageType));
extract(array_flip(CombatObstacle::countGroup), EXTR_PREFIX_ALL, 'c');
extract(array_flip(CombatObstacle::backgroundGroup), EXTR_PREFIX_ALL, 'g');
extract($towns = json_decode(file_get_contents("$outPath/townsID.json"), true), EXTR_PREFIX_ALL, 'w');
extract(json_decode(file_get_contents("$outPath/terrainsID.json"), true), EXTR_PREFIX_ALL, 't');
extract(json_decode(file_get_contents("$outPath/objectsID.json"), true), EXTR_PREFIX_ALL, 'o');

$ship = array_search('ship', AObject::vehicle);

$siegeOverrides = [
  'SGCSMAN1' => ['offsetX' => 640, 'offsetY' => 72],
  'SGCSMLIP' => ['offsetX' => -29, 'offsetY' => -6],
  'SGCSTPWL' => ['offsetX' => -8, 'offsetY' => -37],
  'SGCSARCH' => ['offsetX' => 1, 'offsetY' => -16],
  'SGCSWA2'  => ['offsetX' => -8, 'offsetY' => -75],
  'SGCSWA5'  => ['offsetX' => -31, 'offsetY' => -91],
  // In SoD it's shifted a bit farther to the right but it looks more like a glitch.
  'SGCSTW21' => ['offsetX' => 7, 'offsetY' => -51],
  'SGCSTW11' => ['offsetX' => -6, 'offsetY' => -6],

  'SGRMMAN1' => ['offsetX' => 644, 'offsetY' => 103],
  // In SoD this (erroneously?) has lower Z than the upper tower, which seems to be half-transparent. Same in some other towns.
  'SGRMTPWL' => ['offsetX' => 0, 'offsetY' => -40, 'image' => 'SGRMTPW1'],
  'SGRMARCH' => ['offsetX' => -16, 'offsetY' => -34],
  'SGRMWA2'  => ['offsetX' => -10, 'offsetY' => -58],
  'SGRMWA5'  => ['offsetX' => -28, 'offsetY' => -67],
  'SGRMTW21' => ['offsetX' => 1, 'offsetY' => -55],
  'SGRMTW11' => ['offsetX' => -14, 'offsetY' => 5],

  'SGTWMAN1' => ['offsetX' => 646, 'offsetY' => 62],
  'SGTWTPWL' => ['offsetX' => 7, 'offsetY' => -29],
  'SGTWARCH' => ['offsetX' => -5, 'offsetY' => -67],
  'SGTWWA2'  => ['offsetX' => -3, 'offsetY' => -57],
  'SGTWWA5'  => ['offsetX' => -6, 'offsetY' => -91],
  'SGTWTW21' => ['offsetX' => 16, 'offsetY' => -50],
  'SGTWTW11' => ['offsetX' => -16, 'offsetY' => 10],

  'SGINMAN1' => ['offsetX' => 650, 'offsetY' => 93],
  'SGINMLIP' => ['offsetX' => -29, 'offsetY' => -18],
  'SGINTPWL' => ['offsetX' => -2, 'offsetY' => -34],
  'SGINARCH' => ['offsetX' => 1, 'offsetY' => -33],
  'SGINWA2'  => ['offsetX' => 2, 'offsetY' => -46],
  'SGINWA5'  => ['offsetX' => -18, 'offsetY' => -78],
  'SGINTW21' => ['offsetX' => 5, 'offsetY' => -59],
  'SGINTW11' => ['offsetX' => -13, 'offsetY' => 8],

  'SGNCMAN1' => ['offsetX' => 650, 'offsetY' => 78],
  'SGNCTPWL' => ['offsetX' => -4, 'offsetY' => -28, 'image' => 'SGNCTPW1'],
  'SGNCARCH' => ['offsetX' => -2, 'offsetY' => -14],
  'SGNCWA2'  => ['offsetX' => -11, 'offsetY' => -50],
  'SGNCWA5'  => ['offsetX' => -16, 'offsetY' => -73],
  'SGNCTW21' => ['offsetX' => -3, 'offsetY' => -60],
  'SGNCTW11' => ['offsetX' => -16, 'offsetY' => 6],

  'SGDNMAN1' => ['offsetX' => 652, 'offsetY' => 76],
  'SGDNMLIP' => ['offsetX' => -149, 'offsetY' => 8],
  'SGDNTPWL' => ['offsetX' => 0, 'offsetY' => -36, 'image' => 'SGDNTPW1'],
  'SGDNARCH' => ['offsetX' => -5, 'offsetY' => -90],
  'SGDNWA2'  => ['offsetX' => 2, 'offsetY' => -117],
  'SGDNWA5'  => ['offsetX' => -26, 'offsetY' => -117],
  'SGDNTW21' => ['offsetX' => 1, 'offsetY' => -71],
  'SGDNTW11' => ['offsetX' => -8, 'offsetY' => -11],

  'SGSTMAN1' => ['offsetX' => 651, 'offsetY' => 82],
  'SGSTTPWL' => ['offsetX' => 9, 'offsetY' => -24, 'image' => 'SGSTTPW1'],
  'SGSTARCH' => ['offsetX' => 2, 'offsetY' => -19],
  'SGSTWA2'  => ['offsetX' => -9, 'offsetY' => -42],
  'SGSTWA5'  => ['offsetX' => -21, 'offsetY' => -63],
  'SGSTTW21' => ['offsetX' => 4, 'offsetY' => -56],
  'SGSTTW11' => ['offsetX' => -22, 'offsetY' => 2],

  'SGFRMAN1' => ['offsetX' => 641, 'offsetY' => 92],
  'SGFRMLIP' => ['offsetX' => -56, 'offsetY' => -16],
  'SGFRTPWL' => ['offsetX' => -9, 'offsetY' => -24],
  'SGFRARCH' => ['offsetX' => 7, 'offsetY' => -18],
  'SGFRWA2'  => ['offsetX' => 2, 'offsetY' => -40],
  'SGFRWA5'  => ['offsetX' => -12, 'offsetY' => -40],
  'SGFRTW21' => ['offsetX' => -16, 'offsetY' => -59],
  'SGFRTW11' => ['offsetX' => -9, 'offsetY' => -1],

  'SGELMAN1' => ['offsetX' => 656, 'offsetY' => 73],
  'SGELMLIP' => ['offsetX' => -25, 'offsetY' => -6],
  'SGELTPWL' => ['offsetX' => -8, 'offsetY' => -36],
  'SGELARCH' => ['offsetX' => 10, 'offsetY' => -22],
  'SGELWA2'  => ['offsetX' => -11, 'offsetY' => -76],
  'SGELWA5'  => ['offsetX' => -30, 'offsetY' => -73],
  'SGELTW21' => ['offsetX' => 12, 'offsetY' => -58],
  'SGELTW11' => ['offsetX' => 0, 'offsetY' => -1],
];

$siegeObstacles = [];
$short = ['CS', 'RM', 'TW', 'IN', 'NC', 'DN', 'ST', 'FR', 'EL'];

foreach ($towns as $town => $id) {
  $s = $short[$id];
  if (!in_array($town, ['tower', 'rampart', 'necropolis', 'stronghold'])) {
    $siegeObstacles[] = ["SG{$s}MLIP", $bmp, $c_mlip, ${"g_$town"}, 0, 0, 1, 1, '1'];
    $siegeOverrides["SG{$s}MLIP"] = ($siegeOverrides["SG{$s}MLIP"] ?? []) + ['x' => 8, 'y' => 0];
  }
  if ($town !== 'tower') {
    // XXX=I:twm:
    //$siegeObstacles[] = ["SG{$s}MOAT", $bmp, $c_moat, ${"g_$town"}, 0, 0, 1, 1, '1'];
    //$siegeOverrides["SG{$s}MOAT"] = ['x' => 8, 'y' => 0];
  }
  $siegeObstacles[] = ["SG{$s}MAN1", $bmp, $c_man1, ${"g_$town"}, 0, 0, 1, 1, '1'];
  $siegeObstacles[] = ["SG{$s}TPWL", $bmp, $c_tpwl, ${"g_$town"}, 0, 0, 1, 1, '1'];
  $siegeObstacles[] = ["SG{$s}ARCH", $bmp, $c_arch, ${"g_$town"}, 0, 0, 1, 3, '010'];
  $siegeObstacles[] = ["SG{$s}WA2",  $bmp, $c_wa2,  ${"g_$town"}, 0, 0, 2, 2, '01'.'10'];
  $siegeObstacles[] = ["SG{$s}WA5",  $bmp, $c_wa5,  ${"g_$town"}, 0, 0, 1, 1, '0'];
  $siegeObstacles[] = ["SG{$s}TW11", $bmp, $c_tw1,  ${"g_$town"}, 0, 0, 1, 1, '1'];
  $siegeObstacles[] = ["SG{$s}TW21", $bmp, $c_tw2,  ${"g_$town"}, 0, 0, 1, 1, '0'];
  $siegeOverrides["SG{$s}MAN1"] = ($siegeOverrides["SG{$s}MAN1"] ?? []) + ['x' => 0, 'y' => 0];
  $siegeOverrides["SG{$s}TPWL"] = ($siegeOverrides["SG{$s}TPWL"] ?? []) + ['x' => 12, 'y' => 0];
  $siegeOverrides["SG{$s}ARCH"] = ($siegeOverrides["SG{$s}ARCH"] ?? []) + ['x' => 9,  'y' => 4];
  $siegeOverrides["SG{$s}WA2"]  = ($siegeOverrides["SG{$s}WA2"]  ?? []) + ['x' => 10, 'y' => 8];
  $siegeOverrides["SG{$s}WA5"]  = ($siegeOverrides["SG{$s}WA5"]  ?? []) + ['x' => 10, 'y' => 2];
  $siegeOverrides["SG{$s}TW11"] = ($siegeOverrides["SG{$s}TW11"] ?? []) + ['x' => 12, 'y' => 10];
  $siegeOverrides["SG{$s}TW21"] = ($siegeOverrides["SG{$s}TW21"] ?? []) + ['x' => 11, 'y' => 0];
}

$on = function ($subclass, ...$classes) {
  $classes = array_merge(...(is_array($subclass) ? func_get_args() : $classes));
  is_array($subclass) and $subclass = false;
  for ($i = 0; $i < count($classes); $i++) {
    array_splice($classes, ++$i, 0, $subclass);
  }
  return $classes;
};

$countGroups = [$c_tpwl, $c_arch, $c_wa2, $c_wa5];
$cbs = function ($town) use ($countGroups) {
  foreach ($countGroups as &$ref) {
    $ref = [$ref, [$town], 1, 1];
  }
  return $countGroups;
};

$obs = function (...$groups) use ($c_small, $c_large) {
  return [[$c_small, $groups, 1, 3], [$c_large, $groups, 0, 1]];
};

$fort = [$f_gate, $f_gate2, $f_gate3];

return [
  // Determined empirically. See Images.txt.
  //
  // XXX++C,ID Must be rechecked and remaining OB* filled in.
  'obstacles' => array_merge($siegeObstacles, [
    ['OBBDT01', $def, $c_small, $g_beach, -29, 0,    3,  2, '111'.'000'],
    ['OBBHL02', $bmp, $c_large, $g_beach, 0,   28,   11, 2, '10000000010'.'00000000000'],

    ['OBSNL01', $bmp, $c_large, $g_snow, -40,  0,    10, 3, '1111000011'.'1100011100'.'0001111111'],
    ['OBSNL14', $bmp, $c_large, $g_snow, -5,   -5,   4,  7, '0000'.'1011'.'0011'.'0011'.'0011'.'1011'.'0011'],
    ['OBSNS01', $def, $c_small, $g_snow, 0,    0,    3,  1, '000'],
    ['OBSNS02', $def, $c_small, $g_snow, -41,  0,    4,  1, '0000'],
    ['OBSNS03', $def, $c_small, $g_snow, 0,    0,    2,  3, '10'.'01'.'01'],
    ['OBSNS04', $def, $c_small, $g_snow, 0,    0,    3,  1, '000'],
    ['OBSNS05', $def, $c_small, $g_snow, 0,    0,    2,  1, '10'],
    ['OBSNS06', $def, $c_small, $g_snow, 0,    0,    2,  2, '11'.'10'],
    ['OBSNS07', $def, $c_small, $g_snow, 0,    0,    2,  1, '00'],
    ['OBSNS08', $def, $c_small, $g_snow, 10,   -40,  3,  1, '000'],
    ['OBSNS09', $def, $c_small, $g_snow, 9,    23,   7,  3, '0000011'.'0000001'.'1000000'],
    ['OBSNS10', $def, $c_small, $g_snow, -15,  -30,  4,  4, '0001'.'0011'.'0001'.'0000'],
  ]),

  'obstacleOverrides' => $siegeOverrides + [
  ],

  // Determined empirically. See Images.txt.
  'backgrounds' => [
    // XXX localize
    // Siege backgrounds.
    ['Castle',        'SGCSBACK', $on($w_castle,     $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_castle)],
    ['Rampart',       'SGRMBACK', $on($w_rampart,    $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_rampart)],
    ['Tower',         'SGTWBACK', $on($w_tower,      $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_tower)],
    ['Inferno',       'SGINBACK', $on($w_inferno,    $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_inferno)],
    ['Necropolis',    'SGNCBACK', $on($w_necropolis, $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_necropolis)],
    ['Dungeon',       'SGDNBACK', $on($w_dungeon,    $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_dungeon)],
    ['Stronghold',    'SGSTBACK', $on($w_stronghold, $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_stronghold)],
    ['Fortress',      'SGFRBACK', $on($w_fortress,   $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_fortress)],
    ['Conflux',       'SGELBACK', $on($w_conflux,    $o_town, $o_randomTown), false, 0, false, $fort, false, 11, $cbs($g_conflux)],
    // Generic catch-all.
    ['Somewhere Dark','CMBKLAVA', false,                 false,             0, false,   false, false, 0, $obs($g_lava)],
    ['Beach',         'CMBKBCH',  false,                 $on([$t_water]),   0, false,   false, false, 4, $obs($g_groundy, $g_beach)],
    ['Boarding',      'CMBKBOAT', false,                 false,             0, [$ship], false, false, 10,$obs($g_boat)],
    ['Clover Field',  'CMBKCF',   $on($o_cloverField),   false,             0, false,   false, false, 5, $obs($g_cloverField)],
    ['Cursed Ground', 'CMBKCUR',  $on($o_cursedGround),  false,             0, false,   false, false, 5, $obs($g_rough, $g_dirt)],
    ['Deck',          'CMBKDECK', false,                 false,             0, [~$ship],false, false, 10,$obs($g_boat)],
    ['Desert',        'CMBKDES',  $on([$t_desert]),      false,             0, false,   false, false, 1, $obs($g_groundy, $g_dirty, $g_desert)],
    ['Dead Dirt',     'CMBKDRDD', $on([$t_dirt]),        $on($o_deadVegetation),2,false,false, false, 3, $obs($g_groundy, $g_dirty, $g_dirt)],
    ['Dirt Mountain', 'CMBKDRMT', $on([$t_dirt]),        $on($o_mountain),  2, false,   false, false, 2, $obs($g_groundy, $g_dirty, $g_dirt)],
    ['Dirt',          'CMBKDRTR', $on([$t_dirt]),        false,             0, false,   false, false, 1, $obs($g_groundy, $g_dirty, $g_dirt)],
    ['Evil Fog',      'CMBKEF',   $on($o_evilFog),       false,             0, false,   false, false, 5, $obs($g_evilFog)],
    ['Fiery Fields',  'CMBKFF',   $on($o_fieryFields),   false,             0, false,   false, false, 5, $obs($g_fieryFields)],
    ['Favorable Winds', 'CMBKFW', $on($o_favorableWinds),false,             0, false,   false, false, 5, $obs($g_favorableWinds)],
    ['Grass Mountain','CMBKGRMT', $on([$t_grass]),       $on($o_mountain),  2, false,   false, false, 2, $obs($g_grassy, $g_grass)],
    ['Grass',         'CMBKGRTR', $on([$t_grass]),       false,             0, false,   false, false, 1, $obs($g_grassy, $g_grass)],
    ['Holy Ground',   'CMBKHG',   $on($o_holyGround),    false,             0, false,   false, false, 5, $obs($g_holyGround)],
    ['Lava',          'CMBKLAVA', $on([$t_lava]),        false,             0, false,   false, false, 1, $obs($g_lava)],
    ['Lucid Pools',   'CMBKLP',   $on($o_lucidPools),    false,             0, false,   false, false, 5, $obs($g_lucidPools)],
    ['Magic Plains',  'CMBKMAG',  $on($o_magicPlains),   false,             0, false,   false, false, 5, $obs($g_grassy, $g_grass)],
    ['Magic Clouds',  'CMBKMC',   $on($o_magicClouds),   false,             0, false,   false, false, 5, $obs($g_magicClouds)],
    ['Rough',         'CMBKRGH',  $on([$t_rough]),       false,             0, false,   false, false, 1, $obs($g_groundy, $g_rough)],
    ['Rocklands',     'CMBKRK',   $on($o_rocklands),     false,             0, false,   false, false, 5, $obs($g_rocklands)],
    ['Snow Mountain', 'CMBKSNMT', $on([$t_snow]),        $on($o_mountain),  2, false,   false, false, 2, $obs($g_snow)],
    ['Snow',          'CMBKSNTR', $on([$t_snow]),        false,             0, false,   false, false, 1, $obs($g_snow)],
    ['Subterranean',  'CMBKSUB',  $on([$t_subterranean]),false,             0, false,   false, false, 1, $obs($g_groundy, $g_subterranean)],
    ['Swamp',         'CMBKSWMP', $on([$t_swamp]),       false,             0, false,   false, false, 1, $obs($g_grassy, $g_swamp)],
  ],
];