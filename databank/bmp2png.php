<?php
require __DIR__.'/core.php';

list(, $bmpPath, $outPath) = $argv + ['', '', ''];

fprintf(STDERR, "*** Make sure you do not use ResEdit2 to export BMPs. Use MMArchive ***".PHP_EOL);

if (!file_exists($bmpPath) or !$outPath) {
  echo 'Usage: bmp2png.php BMPs/ output/', PHP_EOL;
  echo 'Usage: bmp2png.php BMPs/ADVMAP.bmp output.png', PHP_EOL;
  echo 'First syntax also writes output/bitmap.css and', PHP_EOL;
  echo 'applies PLAYERS.PAL, if that file exists in BMPs.', PHP_EOL;
  exit(1);
}

if (is_dir($bmpPath)) {
  is_dir($outPath) or mkdir($outPath);

  $palFile = "$bmpPath/PLAYERS.PAL";
  if (is_file($palFile)) {
    $pal = parsePlayersPAL($palFile);

    echo 'PLAYERS.PAL:', PHP_EOL;
    $names = ['red', 'blue', 'tan', 'green', 'orange', 'purple', 'teal', 'pink'];

    foreach ($pal as $player => $colors) {
      echo PHP_EOL;
      printf('    Player %d (%s%s): ',
        array_search($player, $names) + 1,
        ucfirst($player),
        $player === 'blue' ? ', RECOLORING MARKER' : '');
      foreach ($colors as [$r, $g, $b]) {
        printf('#%02X%02X%02X ', $r, $g, $b);
      }
      echo PHP_EOL;
    }

    echo PHP_EOL;
  } else {
    $pal = null;
  }

  $files = scandir($bmpPath, SCANDIR_SORT_NONE);
  $css = '';

  foreach ($files as $i => $file) {
    if (!strcasecmp(strrchr($file, '.'), '.bmp')) {
      if ($i % 50 == 0) { echo ++$i, " / ", count($files), PHP_EOL; }
      $id = substr($file, 0, -4);

      $ims = [];
      // Default (non-recolored) image is still produced for use in scenarios
      // requiring no specific player version.
      $ims[$id] = $im = imagecreatefrombmp("$bmpPath/$file");

      if ($pal and isRecolorableBMP($pal['blue'], $im)) {
        foreach ($pal as $player => $colors) {
          $ims["$id-$player"] = recolorBMP($colors, imageclone($im));
          $css .= ".Hrecolor_$player .Hh3-bmp_id_$id {\n".
                  "  background-image: url($id-$player.png);\n".
                  "}\n";
        }
      }

      foreach ($ims as $id => $im) {
        list($w, $h) = processBMP($im, "$outPath/$id.png");
        imagedestroy($im);

        $css .= ".Hh3-bmp_id_$id {\n".
                "  background-image: url($id.png);\n".
                "  width: {$w}px;\n".
                "  height: {$h}px;\n".
                "}\n";
      }

      $css .= "\n";
    }
  }

  file_put_contents("$outPath/bitmap.css", $css);
} else {
  processBMP(imagecreatefrombmp($bmpPath), $outPath);
}

function processBMP($im, $outPath) {
  list($w, $h, $transparent) = unmaskBMP($im, [0x00FFFF => 'transparent']);
  imagepng($im, $outPath);
  return [$w, $h];
}
