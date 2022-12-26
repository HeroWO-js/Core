<?php
require __DIR__.'/core.php';

// Members here are in order of appearance in Group0 so that it's possible to
// address them given either DefPreview's file names or def2png.php's numeric
// group-frame file name notation.
$cradvntr = [
  'cursra00.cur' => 'TL',
  'cursra10.cur' => 'M',
  'cursra11.cur' => 'M',
  'cursra48.cur' => 'M',
  'cursra20.cur' => 'M',
  'cursra28.cur' => 'TL',
  'cursra32.cur' => 'M',
  'cursra40.cur' => 'M',
  'cursra44.cur' => 'M',
  'cursra24.cur' => 'M',
  'cursra21.cur' => 'M',
  'cursra29.cur' => 'TL',
  'cursra33.cur' => 'M',
  'cursra41.cur' => 'M',
  'cursra45.cur' => 'M',
  'cursra25.cur' => 'M',
  'cursra22.cur' => 'M',
  'cursra30.cur' => 'TL',
  'cursra34.cur' => 'M',
  'cursra42.cur' => 'M',
  'cursra46.cur' => 'M',
  'cursra26.cur' => 'M',
  'cursra23.cur' => 'M',
  'cursra31.cur' => 'TL',
  'cursra35.cur' => 'M',
  'cursra43.cur' => 'M',
  'cursra47.cur' => 'M',
  'cursra27.cur' => 'M',
  'cursra36.cur' => 'M',
  'cursra37.cur' => 'M',
  'cursra38.cur' => 'M',
  'cursra39.cur' => 'M',
  'cursra01.cur' => 'T',
  'cursra02.cur' => 'TR',
  'cursra03.cur' => 'R',
  'cursra04.cur' => 'BR',
  'cursra05.cur' => 'B',
  'cursra06.cur' => 'BL',
  'cursra07.cur' => 'L',
  'cursra08.cur' => 'TL',
  null,   // CursrA00.bmp duplicates in Group0
  'cursra49.cur' => 'M',
  'cursra50.cur' => 'M',
];

$crcombat = [
  'crcom006.cur' => 'M',
  'crcom009.cur' => 'M',
  'crcom012.cur' => 'M',
  'crcom023.cur' => 'TR',
  'crcom028.cur' => 'M',
  'crcom003.cur' => 'M',
  'crcom000.cur' => 'TL',
  'crcom016.cur' => 'TR',
  'crcom017.cur' => 'R',
  'crcom018.cur' => 'BR',
  'crcom020.cur' => 'BL',
  'crcom021.cur' => 'L',
  'crcom022.cur' => 'TL',
  'crcom015.cur' => 'T',
  'crcom019.cur' => 'B',
  'crcom026.cur' => 'M',
  'crcom034.cur' => 'M',
  'crcom031.cur' => 'M',
  'crcom032.cur' => 'M',
  'crcom033.cur' => 'M',
];

$crdeflt = [
  'cursrd00.cur' => 'TL',
  'cursrd01.cur' => 'TL',
  'cursrd02.cur' => 'M',
];

list(, $curPath, $hotspot) = $argv + ['', '', ''];

if (!file_exists($curPath)) {
  echo 'Usage: cur-hotspot.php CURs/ [position]', PHP_EOL;
  echo 'Usage: cur-hotspot.php CRADVNTR/CursrA20.cur [position]', PHP_EOL;
  echo "Allowed positions: [T|B][L|R] (top/bottom + left/right:", PHP_EOL;
  echo "BL = bottom left corner), M (middle), X*Y XxY XXY X:Y", PHP_EOL;
  echo "(pixels: 16*16, 16x16, 16X16, 16:16).", PHP_EOL;
  echo "If not given, position is determined automatically for", PHP_EOL;
  echo "members of SoD's CRADVNTR.DEF, CRCOMBAT.DEF and CRDEFLT.DEF.", PHP_EOL;
  echo "Use this Photoshop plugin to convert any image to CUR:", PHP_EOL;
  echo "http://www.telegraphics.com.au/sw/#icoformat", PHP_EOL;
  exit(1);
}

if (is_dir($curPath)) {
  foreach (scandir($curPath) as $file) {
    if (!strcasecmp(strrchr($file, '.'), '.cur')) {
      $h = fopen("$curPath/$file", 'r+b');
      try {
        $cursors = parseCUR($h);
        foreach ($cursors as $i => $cursor) {
          if ($cursor['width'] !== $cursor['height'] or
              fmod(log($cursor['width'], 2), 1) or
              fmod(log($cursor['height'], 2), 1)) {
            echo "Warning: non-standard size $cursor[width]*$cursor[height] of cursor ", $i + 1, " in $file", PHP_EOL;
          }
          $pos = hotspotPosition($hotspot, $cursor, "$curPath/$file");
          if ($cursor['hotspotX'] !== $pos[0] or $cursor['hotspotY'] !== $pos[1]) {
            patchCUR($h, $i, $pos[0], $pos[1]);
          }
        }
      } finally {
        fclose($h);
      }
    }
  }
} else {
  $h = fopen($curPath, 'r+b');
  try {
    $cursors = parseCUR($h);
    echo "Count of cursors in CUR: ", count($cursors), PHP_EOL;
    foreach ($cursors as $i => $cursor) {
      echo "Cursor ", $i + 1, ":", PHP_EOL;
      echo "  colors=$cursor[colorCount] w=$cursor[width] h=$cursor[height] hotspot=$cursor[hotspotX]:$cursor[hotspotY]";
      $pos = hotspotPosition($hotspot, $cursor, $curPath);
      if ($cursor['hotspotX'] !== $pos[0] or $cursor['hotspotY'] !== $pos[1]) {
        echo " -> $pos[0]:$pos[1]";
        patchCUR($h, $i, $pos[0], $pos[1]);
      }
      echo PHP_EOL;
    }
  } finally {
    fclose($h);
  }
}

// Parses header of a Windows .cur file.
//
// https://en.wikipedia.org/wiki/ICO_(file_format)#Icon_resource_structure
function parseCUR($handle) {
  // ICONDIR
  list(, $reserved, $type, $count) = unpack('v3', fread($handle, 6));
  if ($reserved !== 0 or $type !== 2) {
    throw new Exception(sprintf("Not a CUR: %04x/%04x.", $reserved, $type));
  }

  $res = [];

  while ($count--) {
    // ICONDIRENTRY
    list($width, $height, $colorCount, $reserved, $hotspotX, $hotspotY,
         $length, $offset) = array_values(unpack('C4a/v2b/V2c', fread($handle, 4+8+16)));

    if ($reserved !== 0) {
      throw new Exception(sprintf("Not a CUR: %04x/%04x.", $reserved));
    }

    $res[] = compact('width', 'height', 'colorCount', 'hotspotX', 'hotspotY',
                     'length', 'offset');
  }

  return $res;
}

// Modifies hotspot coordinates of the $index'th cursor in a Windows .cur file.
function patchCUR($handle, $index, $hotspotX, $hotspotY) {
  fseek($handle, 6 + $index * (4+8+16) + 4, SEEK_SET);
  fwrite($handle, pack('v2', $hotspotX, $hotspotY));
}

// Converts shorthand $hotspot position like "tl" ("top left") to coordinates.
function hotspotPosition($hotspot, array $cursor, $path) {
  global $cradvntr, $crcombat, $crdeflt;

  if (!$hotspot) {
    $name = strtolower(basename($path));
    isset($cradvntr[$name]) and $hotspot = $cradvntr[$name];
    isset($crcombat[$name]) and $hotspot = $crcombat[$name];
    isset($crdeflt[$name])  and $hotspot = $crdeflt[$name];
    if (!$hotspot and preg_match('~(^|[\\\\/])(cradvntr|crcombat|crdeflt)[\\\\/]0-(\d+)\.cur$~i', $path, $match)) {
      // Numeric def2png.php name.
      $hotspot = array_values(${strtolower($match[2])})[$match[3]];
    }
  }

  if (!$hotspot) {
    echo "Hotspot position not provided and unable to determine it automatically for:", PHP_EOL;
    echo $path, PHP_EOL;
    exit(2);
  }

  if (!preg_match('/^((([TB]?)([LR]?))|(M)|(\d+)[x*:](\d+))()$/i', $hotspot, $match)) {
    throw new Exception("Invalid hotspot position: $hotspot");
  }

  list(, , $isTBLR, $tb, $lr, $isMiddle, $x, $y) = $match;
  extract($cursor, EXTR_PREFIX_ALL, 'c');

  if ($isTBLR) {
    switch (strtolower($tb.$lr)) {
      case 'tl':    return [0, 0];
      case 'tr':    return [$c_width - 1, 0];
      case 'bl':    return [0, $c_height - 1];
      case 'br':    return [$c_width - 1, $c_height - 1];
      case 't':     return [((int) ($c_width / 2)), 0];
      case 'b':     return [((int) ($c_width / 2)), $c_height - 1];
      case 'l':     return [0, ((int) ($c_height / 2))];
      case 'r':     return [$c_width - 1, ((int) ($c_height / 2))];
    }
  } elseif ($isMiddle) {
    return [((int) ($c_width / 2)), ((int) ($c_height / 2))];
  } elseif ($x < 0 or $x >= $c_width-- or $y < 0 or $y >= $c_height--) {
    throw new Exception("Hotspot position ($x:$y) is out of bounds ($c_width:$c_height).");
  } else {
    return [(int) $x, (int) $y];
  }
}