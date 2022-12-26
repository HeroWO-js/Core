<?php
require __DIR__.'/core.php';

list(, $defPath) = $argv + ['', ''];
$ignore = array_slice($argv, 2);

if (!file_exists($defPath)) {
  echo 'Usage: find-special.php DEFs/ [ignore [ig...]]', PHP_EOL;
  echo 'Usage: find-special.php AVMABMG/', PHP_EOL;
  echo 'Determines which special colors are used in all DEF frames.', PHP_EOL;
  echo 'In the first form input is a folder with subfolders of *.HDL, BMP images', PHP_EOL;
  echo 'and optional Shadow subsubfolder with BMPs (as produced by DefPreview).', PHP_EOL;
  echo 'In the second it\'s such a folder directly.', PHP_EOL;
  echo 'ignore sets special color names to not check. If given, DEFs with no', PHP_EOL;
  echo 'colors outside of this list are not printed.', PHP_EOL;
  exit(1);
}

if ($info = getInfo($defPath)) {
  $colors = processDEF($defPath, $info[2], $info[1]);
  echo "Type: $4$info[0]", PHP_EOL;
  echo "Images: ", count($info[2]), PHP_EOL;
  foreach ($info[1] as $key => $c) {
    $frames = array_merge([], ...array_column($colors, $key));
    echo "$key:\t ", $frames ? 'yes' : 'no';
    if ($frames) {
      echo empty($colors[1][$key]) ? ' (F)' : (empty($colors[0][$key]) ? ' (S)' : '');
    }
    echo "\t #", sprintf('%06X', $c);
    if ($frames) {
      count($frames) > 3 and array_splice($frames, 3, PHP_INT_MAX, '...');
      echo "\t ", join(', ', $frames);
    }
    echo PHP_EOL;
  }
  echo '(F) = found in foreground frames only   (S) = in shadow only', PHP_EOL;
} else {
  foreach (scandir($defPath) as $file) {
    if ($info = getInfo("$defPath/$file")) {
      $colors = processDEF("$defPath/$file", $info[2],
        array_diff_key($info[1], array_flip($ignore)));
      if ($ignore and !array_filter($colors)) {
        continue;
      }
      echo "$file\t $4$info[0]  ";
      foreach ($info[1] as $name => $c) {
        $fg = !empty($colors[0][$name]);
        $shadow = !empty($colors[1][$name]);
        if ($fg or $shadow) {
          echo $name, !$fg ? '(S)' : '', !$shadow ? '(F)' : '', ' ';
        }
      }
      echo PHP_EOL;
    }
  }
}

function getInfo($path) {
  if (is_file($file = "$path/".basename($path).'.hdl') and
      preg_match_all('/^(Type|(Group|Shadow)\d+|(Shadow)?ColorsBox\.Colors)=(.+)$/m',
        file_get_contents($file), $matches)) {
    $colors = $frames = [];

    foreach ($matches[4] as $value) {
      $list = explode('|', $value = rtrim($value, "| \r"));
      if (is_numeric($value)) {
        $type = $value;
      } elseif ($list[0][0] === '$') {
        foreach ($list as $i => &$ref) {
          $c = unpack('V', hex2bin(substr($ref, 1))."\0");
          $colors[$i] = $c[1];
        }
      } else {
        $frames = array_merge($frames, $list);
      }
    }

    // Animations.txt.
    $colorKeys = ['transparent', 'faintShadow', 'lightShadow', 'mediumShadow', 'deepShadow', 'selection', 'selectionDeepShadow', 'selectionFaintShadow'];
    return [(int) $type, array_combine($colorKeys, $colors), $frames];
  }
}

function processDEF($path, array $files, array $colors) {
  $fore = $shadow = [];

  foreach ($files as $file) {
    $im = imagecreatefrombmp("$path/$file");
    try {
      foreach (findColors($im, array_flip($colors)) as $c) {
        ${strpbrk($file, '\\/') ? 'shadow' : 'fore'}[$c][] = $file;
      }
    } finally {
      imagedestroy($im);
    }
  }

  return [$fore, $shadow];
}

function findColors($im, array $colors) {
  imagepalettetotruecolor($im);
  $found = [];

  // Can't just iterate over the palette because it can contain unused colors.
  for ($x = imagesx($im); $x--; ) {
    for ($y = imagesy($im); $y--; ) {
      if ($type = $colors[imagecolorat($im, $x, $y)] ?? null) {
        $found[$type] = true;
      }
    }
  }

  return array_keys($found);
}
