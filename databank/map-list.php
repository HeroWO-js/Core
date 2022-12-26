<?php
// This script was meant to pack headers of individual Map's into an ObjectStore (Maps.js) for efficiency. However, this data is currently provided as an array over SSE by api.php, with incremental updates when maps change.
//
// This and Maps.js remain in case they become useful in the future. However, this script must be brought up to date with existing code before it can be used.

require __DIR__.'/core.php';

list(, $mapsPath, $outPath) = $argv + ['', '', ''];

if (!is_dir($mapsPath)) {
  echo "Usage: map-list.php converted/ maps.json", PHP_EOL;
  exit(1);
}

$constants = json_decode(file_get_contents("databank/constants.json"), true);
MapPlayer::unrollKeys('resources', $constants['resources'], 'intval');
//$encodeJsonFlags &= ~JSON_PRETTY_PRINT;

$maps = $victory = $loss = $players = [];

foreach (scandir($mapsPath, SCANDIR_SORT_NONE) as $file) {
  if (is_file($file = "$mapsPath/$file/map.json")) {
    $map = new Map(json_decode(file_get_contents($file), true));

    if ($map->format !== $map::FORMAT_VERSION) {
      fwrite(STDERR, "Ignored map of wrong format ($map->format): $file".PHP_EOL);
    } else {
      $maps[] = $map;
      $victory[] = array_map(function ($a) { return new MapVictory($a); }, $map->victory);
      $loss[]    = array_map(function ($a) { return new MapLoss($a); }, $map->loss);
      $players[] = array_map(function ($a) { return new MapPlayer($a); }, $map->players);
    }
  }
}

$store = ObjectStore::from1D($maps);
$store->format = Map::FORMAT_VERSION;

foreach (['victory' => 'MapVictory', 'loss' => 'MapLoss', 'players' => 'MapPlayer'] as $prop => $class) {
  $store->$prop = ObjectStore::from1D($$prop, $class);
}

file_put_contents($outPath, encodeJSON($store));