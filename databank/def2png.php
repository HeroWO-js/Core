<?php
require __DIR__.'/core.php';

array_shift($argv);
$hdlPath = $outPath = $palFile = $bmpPath = '';
$defType = [];
$defName = '~^~';
$verbose = false;
$phase1 = $phase2 = $special = true;
$wait = null;   // true (always), false (upon error)
$parallel = [1, 1];

while (null !== $arg = array_shift($argv)) {
  if ($arg[0] === '-') {
    switch ($arg) {
      case '-p':
        $palFile = array_shift($argv);
        break;
      case '-b':
        $bmpPath = array_shift($argv);
        break;
      case '-t':
        if (preg_match('/^(\\$4)?(\\d)$/', array_shift($argv), $match)) {
          $defType[] = (int) $match[2];
        }
        break;
      case '-n':
        $defName = '~'.array_shift($argv).'~i';
        break;
      case '-v':
        $verbose = true;
        break;
      case '-q':
        $phase1 = false;
        break;
      case '-s':
        $special = false;
        break;
      case '-m':
        $parallel = array_map('intval', explode('/', array_shift($argv)));
        if (!$parallel[0] or !$parallel[1]) {
          throw new Exception("Invalid -m: N and M must be positive.");
        }
        break;
      case '-k':
      case '-K':
        $wait = $arg === 'K';
        break;
      default:
        throw new Exception("Invalid -option: $arg.");
    }
  } elseif (!$hdlPath) {
    $hdlPath = $arg;
  } elseif (!$outPath) {
    $outPath = $arg;
  } else {
    throw new Exception("Superfluous positional argument: $arg");
  }
}

if (!file_exists($hdlPath) or !$outPath) {
  echo "Usage: def2png.php [-options] DEFs/ output/", PHP_EOL;
  echo "Usage: def2png.php [-options] DEFs/CH01/CH01.HDL output/", PHP_EOL;
  echo PHP_EOL;
  echo "Options (all optional):", PHP_EOL;
  echo "  -p PLAYERS.PAL  from H3bitmap.lod; enables recoloring", PHP_EOL;
  echo "  -b BMP-PNGs/    produced by bmp2png.php; generates special siege creatures", PHP_EOL;
  echo "  -s              disable special processing for some DEFs", PHP_EOL;
  echo PHP_EOL;
  echo "Options for first syntax (all optional):", PHP_EOL;
  echo "  -t TYPE         process only DEFs of type (numeric or $4N); multiple -t ok", PHP_EOL;
  echo "  -n REGEXP       process only DEFs with file names matching ~REGEXP~i", PHP_EOL;
  echo "  -v              output names of files being processed", PHP_EOL;
  echo "  -q              for HDLs having texture.json only generate CSS, not images", PHP_EOL;
  echo "  -m N/M          parallel mode: start with Nth file, then N+M, N+M*2, etc.", PHP_EOL;
  echo "  -k -K           wait for input upon completion, only if due to error (-K)", PHP_EOL;
  echo PHP_EOL;
  echo "Use MMArchive or ResEdit2 to obtain DEF/MSK files from LOD.", PHP_EOL;
  echo PHP_EOL;
  echo 'Use DefPreview to obtain files from DEF: first do "Extract all for DefTool"', PHP_EOL;
  echo 'then do "Extract Picture(s)" on top to override the folder with new BMP.', PHP_EOL;
  echo 'This is required for recoloring because the first command loses palettes.', PHP_EOL;
  echo PHP_EOL;
  echo 'For proper convertion of creature images (type $42) each HDL must be', PHP_EOL;
  echo 'accompanied with H3L in new format. Use DefPreview to obtain it.', PHP_EOL;
  echo PHP_EOL;
  echo 'Use the AutoHotKey script provided by Workbench\'s update.php to automate these operations in DefPreview.', PHP_EOL;
  exit(1);
}

$pal = $palFile ? parsePlayersPAL($palFile) : null;

$buttonSelectors = [
  '*' => ['normal', 'pressed', 'disabled', 'hover'],
  'CODEFAUL' => ['pressed', 'normal'],
  'SOLOAD'   => ['pressed', 'normal'],
  'SOMAIN'   => ['pressed', 'normal'],
  'SOQUIT'   => ['pressed', 'normal'],
  'SORETRN'  => ['pressed', 'normal'],
  'SORSTRT'  => ['pressed', 'normal'],
  'SOSAVE'   => ['pressed', 'normal'],
  'SYSOB10'  => ['normal', 'pressed', 'hover'],
  'SYSOB11'  => ['normal', 'pressed', 'hover'],
  'SYSOB12'  => ['normal', 'pressed', 'hover'],
  'SYSOB13'  => ['normal', 'pressed', 'hover'],
  'SYSOPB1'  => ['normal', 'pressed', 'hover'],
  'SYSOPB2'  => ['normal', 'pressed', 'hover'],
  'SYSOPB3'  => ['normal', 'pressed', 'hover'],
  'SYSOPB4'  => ['normal', 'pressed', 'hover'],
  'SYSOPB5'  => ['normal', 'pressed', 'hover'],
  'SYSOPB6'  => ['normal', 'pressed', 'hover'],
  'SYSOPB7'  => ['normal', 'pressed', 'hover'],
  'SYSOPB8'  => ['normal', 'pressed', 'hover'],
  'SYSOPB9'  => ['normal', 'pressed', 'hover'],
  'SYSOPCHK' => ['normal', 'hover'],
];

$options = compact('pal', 'bmpPath', 'defType', 'special', 'buttonSelectors');

register_shutdown_function(function () use ($wait) {
  if (isset($wait) and ($wait or error_get_last())) {
    echo PHP_EOL;
    error_get_last() and print('Terminated due to an error'.PHP_EOL);
    echo 'Press Enter to close this window', PHP_EOL;
    fgets(STDIN);
  }
});

if (is_dir($hdlPath)) {
  is_dir($outPath) or mkdir($outPath);
  $files = scandir($hdlPath);
  $hdls = $creatureFiles = [];
  $creatureBox = null;

  for ($index = $parallel[0] - 1; isset($files[$index]); $index += $parallel[1]) {
    $file = $files[$index];
    $path = "$hdlPath/$file/$file.hdl";

    if (is_file($path) and preg_match($defName, $file)) {
      if (intdiv($index, $parallel[0]) % 10 == 0) {
        echo $index, " / ", count($files), PHP_EOL;
      }

      if ($verbose) {
        echo $path, PHP_EOL;
      }

      if (!$phase1 and is_file($textureFile = "$outPath/$file/texture.json")) {
        $hdl = json_decode(file_get_contents($textureFile), true);
      } else {
        $hdl = processHDL($path, "$outPath/$file", $options);
        if (!$hdl) { continue; }
      }

      $hdls[$file] = $hdl;

      foreach ($hdl['derived'] ?? [] as $derived) {
        $hdls[$derived] = json_decode(file_get_contents("$outPath/$derived/texture.json"), true);
      }

      if ($hdl['type'] === 2) {   // $42 Creature
        if (empty($hdl['h3l'])) {
          static $warned3;
          if (!$warned3) {
            $warned3 = true;
            fprintf(STDERR, "Warning: no H3L found, type $42 groups will be incorrect%s",
              PHP_EOL);
          }
        }

        foreach ($hdl['boxes'] as $gn => $boxes) {
          $creatureBox = combineRect($boxes[''], $creatureBox);
          foreach ($boxes as $fn => $box) {
            $fn === '' or $creatureFiles[] = "$outPath/$file/$gn-$fn.png";
          }
        }
      }
    }
  }

/*
  if ($creatureBox) {
    echo 'Cropping ', count($creatureFiles), ' Creature ($42) frames to ',
         formatBox($creatureBox), PHP_EOL;

    $creatureBox[2] -= $creatureBox[0];
    $creatureBox[3] -= $creatureBox[1];
    $creatureBox = array_combine(['x', 'y', 'width', 'height'], $creatureBox);

    foreach ($creatureFiles as $file) {
      $uncropped = dirname($file).'/u'.basename($file);
      is_file($uncropped) or copy($file, $uncropped);
      $im = imagecreatefrompng($uncropped);
      try {
        enableImageTransparency($im);
        $cropped = imagecrop($im, $creatureBox);
        try {
          imagepng($cropped, $file);
        } finally {
          imagedestroy($cropped);
        }
      } finally {
        imagedestroy($im);
      }
    }
  }
*/

  if ($phase2) {
    echo "Post-processing ", count($hdls), " HDLs", PHP_EOL;

    foreach ($hdls as $file => $hdl) {
      if (!$defType or in_array($hdl['type'], $defType)) {
        postProcessHDL($hdl, "$outPath/$file", $options);
      }
    }
  }
} else {
  $hdl = processHDL($hdlPath, $outPath, ['defType' => []] + $options);
  postProcessHDL($hdl, $outPath, $options);

  if (!empty($hdl['derived'])) {
    echo "Derived:", PHP_EOL;

    foreach ($hdl['derived'] as $derived) {
      echo "  $derived", PHP_EOL;
      $derived = json_decode(file_get_contents("$outPath/$derived/texture.json"), true);
      postProcessHDL($derived, $outPath, $options);
    }
  }

  $formatFiles = function (array $groups) {
    echo " (", count($groups), "):", PHP_EOL;
    foreach ($groups as $n => $files) {
      echo "  $n (", count($files), "). ", join(', ', $files), PHP_EOL;
    }
  };

  echo $hdl['name'], PHP_EOL;
  echo "Type: $hdl[type]", PHP_EOL;
  echo "With H3L: ", empty($hdl['h3l']) ? ('no'.$hdl['type'] === 2 ? ' (!)' : '') : 'yes', PHP_EOL;
  echo "With shadow: ", $hdl['withShadow'] ? 'yes' : 'no', PHP_EOL;
  echo "Groups", $formatFiles($hdl['groups']);
  $colors = function (array $a) {
    return array_map(function ($c, $n) {
      return sprintf('#%06X %s', $c, $n);
    }, $a, array_keys($a));
  };
  echo "Colors: ", join(', ', $colors($hdl['colors'])), PHP_EOL;
  echo PHP_EOL;
  if ($hdl['withShadow']) {
    echo "Shadows", $formatFiles($hdl['shadows']);
    echo "Colors: ", join(', ', $colors($hdl['shadowColors'])), PHP_EOL;
    echo PHP_EOL;
  }
  if ($hdl['playerColors']) {
    echo "Player colors: ", join(', ', array_map('dechex', $hdl['playerColors'])), PHP_EOL;
  }
  foreach ($hdl['baseFrames'] ?? [] as $gn => $frame) {
    echo "Frames of group $gn are using GIF-like overlay on top of frame $frame", PHP_EOL;
  }
  foreach ($hdl['boxes'] as $gn => $boxes) {
    echo "Box of group $gn: ", formatBox($boxes['']), PHP_EOL;
    foreach ($boxes as $fn => $box) {
      if ($fn !== '') {
        echo "       frame $fn: ", formatBox($box), PHP_EOL;
      }
    }
  }
  foreach ($hdl['recolor'] ?? [] as $gn => $files) {
    echo "Recolored frames in group $fn: ";
    echo join(' ', array_keys($files));
    echo ' (', max(array_map('count', $files)), ' players max)', PHP_EOL;
  }
  $vars = max(array_map('count', array_merge([], ...$hdl['variations']))) - 1;
  echo "Max variations: ", $vars, PHP_EOL;
  if ($vars) {
    foreach ($hdl['variations'] as $gn => $files) {
      foreach ($files as $fn => $vars) {
        echo "       group $gn frame $fn:", PHP_EOL;
        foreach (array_filter($vars) as $prefix => $features) {
          echo "       ", "    $prefix: ", join(', ', $features), PHP_EOL;
        }
      }
    }
  }
}

function formatBox(array $box) {
  return sprintf('%d:%d:%d:%d = x%d y%d w%d h%d',
    $box[0], $box[1], $box[2], $box[3],
    $box[0], $box[1], $box[2] - $box[0], $box[3] - $box[1]);
}

function processHDL($hdlPath, $outPath, array $options = []) {
  extract($options, EXTR_SKIP);
  $hdl = parseHDL(parseINI(file_get_contents($hdlPath)));

  if ($defType && !in_array($hdl['type'], $defType)) {
    return;
  }

  addCustom($hdlPath, $hdl, $pal);
  is_dir($outPath) or mkdir($outPath);

  foreach ($hdl['groups'] as $gn => $files) {
    foreach ($files as $fn => $file) {
      $file = dirname($hdlPath)."/$file";
      list($w, $h) = getimagesize($file) ?: [];
      $shadow = $hdl['withShadow'] ? dirname($hdlPath).'/'.$hdl['shadows'][$gn][$fn] : null;

      static $warned4;
      if (!$shadow and in_array($hdl['type'], [2, 3, 4, 9]) and !$warned4) {
        $warned4 = true;
        // The Extract All for DefTool command of DefPreview >1.0.0 doesn't
        // create the Shadow directory and sets ShadowType=0 if No Shadow &
        // Selection is checked. See Workbench's update.php.
        //
        // In SoD, no DEFs of 0/5/6/7 Type include shadow while all DEFs of
        // 2/3/4/9 Type include Shadow.
        fprintf(STDERR, "Warning: HDL type $4%d (%s) doesn't include Shadow; ensure you use exactly DefPreview 1.0.0, not later versions%s",
          $hdl['type'], basename($hdlPath), PHP_EOL);
      }

      // Each frame in DEF can produce multiple images in PNG, each varied by:
      // - special colors on shadow: selection...
      // - special colors on foreground: flagColor
      //   (flagColor can appear on shadow too but we ignore it given foreground
      //   always overlays it)
      // - PLAYERS.PAL colors on foreground
      $shadows = !$shadow ? [] : processImages(
        $w, $h, $shadow,
        // Shadows have black area where the original image is located. It's
        // not clear if this color is special (transparent) or not. We just
        // put the original image on top of it.
        $hdl['shadowColors'] /*+ [0 => 'transparent']*/,
        'selection',
        // Determined empirically.
        [[null], [0xFFFF00, 'activeTurn'], [0x00FFFF, 'hover']],
        $tbox
      );

      $palettes = $hdl['recolor'][$gn][$fn] ?? [];
      $palettes and $palettes = array_intersect_key($pal, array_flip($palettes));

      if ($palettes) {
        $foregrounds = [];
        $im = imagecreatefrombmp($file);

        foreach (array_merge([[$im]], recolorImage($palettes, [$im])) as $item) {
          $unmasked = processImages($w, $h, $item[0], $hdl['colors'], '', [], $tbox)[0];
          $foregrounds[] = array_merge($item, array_slice($unmasked, 1));
        }
      } else {
        $foregrounds = processImages(
          $w, $h, $file,
          $hdl['colors'],
          'flagColor',
          // Determined empirically.
          [
            [0x848484],
            [0xFF0000, 'redOwner'],
            [0x3152FF, 'blueOwner'],
            [0x9C7352, 'tanOwner'],
            [0x429429, 'greenOwner'],
            [0xFF8400, 'orangeOwner'],
            [0x8C29A5, 'purpleOwner'],
            [0x089CA5, 'tealOwner'],
            [0xC67B8C, 'pinkOwner'],
          ],
          $tbox
        );
      }

      if (!$shadows) {
        $combined = $foregrounds;
      } else {
        $combined = [];

        foreach ($foregrounds as $fg) {
          foreach ($shadows as $shadow) {
            $merged = imageclone(array_shift($shadow));
            imagecopy($merged, $fg[0], 0, 0, 0, 0, $w, $h);
            $combined[] = array_merge([$merged], array_slice($fg, 1), $shadow);
          }
        }

        array_map('imagedestroy', array_column($foregrounds, 0));
        array_map('imagedestroy', array_column($shadows, 0));
      }

      $hdl['boxes'][$gn][$fn] = $tbox;
      //$tbox[2] -= $tbox[0];
      //$tbox[3] -= $tbox[1];
      //$cropped = imagecrop($im, $tbox);

      foreach ($combined as $item) {
        // Possible features, in this order:
        // - player colors, for recoloring: red blue tan green orange purple
        //   teal pink (neutral has no feature)
        // - player colors, for object owner: as for recoloring + 'Owner'
        //   (this is also used for -s(pecial) combining of hero/boat + flags
        // - outline: activeTurn, hover
        // Example: pink-redOwner-hover-GN-FN.PNG
        $im = array_shift($item);
        $prefix = $item ? join('-', $item).'-' : '';
        $hdl['enlarge'] and $im = imageresize($im, $hdl['enlarge'][0], $hdl['enlarge'][1]);
        imagepng($im, "$outPath/$prefix$gn-$fn.png");
        imagedestroy($im);
        // There is always at least one variations entry: "" => [] - the
        // "default" variation. It's often but not necessary matches the
        // original frame in DEF - for example, if flagColor is set then
        // neutral's color is used instead of the original special color (yellow).
        //
        // $prefix is never falsy for non-default variation (because it has at
        // least '-'). Features should not be numeric, to avoid confusion with
        // $gn/$fn. Order of features must be stable (but not necessary
        // alphabetic). All variations have the same dimensions.
        $hdl['variations'][$gn][$fn][$prefix] = $item;
      }
    }

    $combined = null;
    foreach ($hdl['boxes'][$gn] as $box) {
      $combined = combineRect($box, $combined);
    }
    $hdl['boxes'][$gn][''] = $combined;
  }

  if ($special) {
    $players = ['red', 'blue', 'tan', 'green', 'orange', 'purple', 'teal', 'pink'];

    // To simplify the implementation, combine hero/boat images with flags.
    // This is possible because still hero/boat groups (not moving) have 1 frame
    // (they are not animated) while moving groups have the same number of frames
    // that flag animations are (so they are in sync). We add frames to still
    // groups, combining the still hero/boat frame with each flag frame. Frames of
    // moving groups are simply combined with the corresponding flag frames.
    //
    // Results are variations on the default version, with a single feature:
    // <color>Owner.
    if (preg_match('/^A(H\\d\\d_(E)?|B(\\d\\d)_)()$/i', $hdl['name'], $match)) {
      // AB01_  -> ABF01#  # = L G ...  ABF01L
      // AH??_E -> AF0#E   # = 0 1 ...  AF03E
      $mergeFlag = $match[3]
        ? ["ABF$match[3]", 'LGRDBPWK', '']
        : ["AF0", '01234567', $match[2] ?? ''];

      foreach (str_split($mergeFlag[1]) as $color) {
        $feature = array_shift($players).'Owner';
        $flagFile = $mergeFlag[0].$color.$mergeFlag[2];
        $flagPath = dirname($hdlPath)."/../$flagFile/$flagFile.hdl";

        if (is_file($flagPath)) {
          $flagHDL = processHDL($flagPath, "$outPath/../$flagFile", $options);

          foreach ($flagHDL['groups'] as $gn => $flagFiles) {
            foreach ($flagFiles as $fn => $v) {
              try {
                $flag = imagecreatefrompng("$outPath/../$flagFile/$gn-$fn.png");
              } catch (Throwable $e) {
                // On Windows with 5+ parallel processes this reading routinely
                // fails, probably due to file system buffer nuances. As there's
                // no way to flush them from PHP, we just wait and retry.
                sleep(1);
                $flag = imagecreatefrompng("$outPath/../$flagFile/$gn-$fn.png");
              }
              $hero = imagecreatefrompng("$outPath/$gn-".($gn <= 4 ? 0 : $fn).".png");
              enableImageTransparency($hero);
              imagecopy($hero, $flag, 0, 0, 0, 0, $w, $h);
              imagepng($hero, "$outPath/$feature-$gn-$fn.png");
              imagedestroy($hero);
              imagedestroy($flag);
              $hdl['variations'][$gn][$fn]["$feature-"] = [$feature];
            }

            if ($gn <= 4) {   // still group, add frames
              $hdl['groups'][$gn] = $flagFiles;
              $hdl['shadows'][$gn] = $flagHDL['shadows'][$gn];

              // There is no flag animation for the neutral player and lacking animation for still groups, the final (varied) groups are also still, only for the neutral. However, JS code expects all hero variations to have the same set of frames so pad groups using the still frame in case neutral hero ends up visible in the UI for some reason.
              for ($fn = 1; !$players and $fn < count($flagFiles); $fn++) {
                copy("$outPath/$gn-0.png", "$outPath/$gn-$fn.png");
              }
            }
          }
        }
      }
    }

    // Animations.txt, "$43 DEF with flagColor".
    $imitateFlagColor = [
      'avgair0',
      'avgelem0',
      'avgerth0',
      'avgfire0',
      'avgwatr0',
      'avxamsw',
      'avxamds',
      'avxamgr',
      'avxamlv',
      'avxamro',
      'avxamsn',
      'avxamsu',
      'avgnoll',    // not part of OBJECTS.TXT - unused?
    ];

    if (in_array(strtolower($hdl['name']), $imitateFlagColor)) {
      foreach ($players as $player) {
        $feature = "{$player}Owner";
        foreach ($hdl['groups'] as $gn => $files) {
          foreach ($files as $fn => $file) {
            copy("$outPath/$gn-$fn.png", "$outPath/$feature-$gn-$fn.png");
            $hdl['variations'][$gn][$fn]["$feature-"] = [$feature];
          }
        }
      }
    }

    if (preg_match('/^_SG\\w\\w(WA[1346]|DRW|MOAT)$/i', $hdl['name'])) {
      foreach ($hdl['groups'] as $gn => $files) {
        foreach ($hdl['variations'][$gn] as $fn => $file) {
          foreach ($file as $prefix => $features) {
            $im = imagecreatefrompng("$outPath/$prefix$gn-$fn.png");
            enableImageTransparency($im);
            // Regular creatures in SoD face right by default.
            imageflip($im, IMG_FLIP_HORIZONTAL);
            imagepng($im, "$outPath/$prefix$gn-$fn.png");
            imagedestroy($im);
          }
        }
      }
    }

    static $siegeCreatures = [
      'clcbow' => [
        'SGCSTW2' => [227, 222, 238, 231],  // upper
        'SGCSMAN' => [203, 195, 225, 228],  // main
        'SGCSTW1' => [234, 220, 234, 229],  // lower
      ],
      'celf' => [
        'SGRMTW2' => [224, 217, 225, 228],  // upper
        'SGRMMAN' => [195, 216, 239, 226],  // main
        'SGRMTW1' => [223, 215, 226, 227],  // lower
      ],
      'cmage' => [
        'SGTWTW2' => [234, 211, 238, 218],  // upper
        'SGTWMAN' => [227, 164, 235, 208],  // main
        'SGTWTW1' => [237, 205, 237, 208],  // lower
      ],
      'cgog' => [
        'SGINTW2' => [228, 214, 228, 222],  // upper
        'SGINMAN' => [219, 216, 237, 222],  // main
        'SGINTW1' => [226, 216, 226, 225],  // lower
      ],
      'clich' => [
        'SGNCTW2' => [222, 203, 222, 212],  // upper
        'SGNCMAN' => [229,  66, 231, 218],  // main
        'SGNCTW1' => [221, 209, 224, 220],  // lower
      ],
      'cmedus' => [
        'SGDNTW2' => [184, 202, 190, 208],  // upper
        'SGDNMAN' => [162, 212, 190, 218],  // main
        'SGDNTW1' => [191, 202, 191, 206],  // lower
      ],
      'corc' => [
        'SGSTTW2' => [226, 217, 227, 218],  // upper
        'SGSTMAN' => [200, 213, 218, 216],  // main
        'SGSTTW1' => [225, 218, 225, 221],  // lower
      ],
      'cpliza' => [
        'SGFRTW2' => [222, 209, 227, 218],  // upper
        'SGFRMAN' => [180, 215, 221, 226],  // main
        'SGFRTW1' => [227, 197, 227, 218],  // lower
      ],
      'cstorm' => [
        'SGELTW2' => [235, 190, 235, 202],  // upper
        'SGELMAN' => [207, 201, 234, 213],  // main
        'SGELTW1' => [226, 197, 226, 210],  // lower
      ],
    ];

    $siegeGroups = [1, 2, 3, 5, 14, 15, 16];

    if ($bmpPath and $siege = $siegeCreatures[strtolower($hdl['name'])] ?? null) {
      foreach ($siege as $bmp => [$underX, $underY, $overX, $overY]) {
        $siegePath = "$outPath/../_$bmp";
        is_dir($siegePath) or mkdir($siegePath);

        foreach ($siegeGroups as $gn) {
          $death = $gn === 5;
          $death and $destroyed = imagetrim(imagecreatefrompng("$bmpPath/{$bmp}2.png"));
          $under = imagetrim(imagecreatefrompng("$bmpPath/{$bmp}1.png"));
          $over  = imagetrim(imagecreatefrompng("$bmpPath/{$bmp}C.png"));

          foreach ($hdl['variations'][$gn] as $fn => $file) {
            foreach ($file as $prefix => $features) {
              $creature = imagecreatefrompng("$outPath/$prefix$gn-$fn.png");
              enableImageTransparency($creature);
              imageflip($creature, IMG_FLIP_HORIZONTAL);
              $w = max(imagesx($creature), $underX + imagesx($under), $overX + imagesx($over));
              $h = max(imagesy($creature), $underY + imagesy($under), $overY + imagesy($over));
              $merged = newTransparentImage($w, $h);
              if ($death and $fn === count($hdl['variations'][$gn]) - 1) {
                // All SG*2.bmp/SG*1.bmp pairs have the same dimensions in SoD
                // except SGCSTW21/SGCSTW22 (the latter is shorter). This means $under's X/Y suits $destroyed.
                imagecopy($merged, $destroyed, $underX, $underY, 0, 0, imagesx($destroyed), imagesy($destroyed));
              } else {
                imagecopy($merged, $under, $underX, $underY, 0, 0, imagesx($under), imagesy($under));
                imagecopy($merged, $creature, 0, 0, 0, 0, imagesx($creature), imagesy($creature));
                imagecopy($merged, $over, $overX, $overY, 0, 0, imagesx($over), imagesy($over));
              }
              imagedestroy($creature);
              // Regular creatures in SoD face right by default.
              imageflip($merged, IMG_FLIP_HORIZONTAL);
              imagepng($merged, "$siegePath/$prefix$gn-$fn.png");
              imagedestroy($merged);
            }
          }

          $death and imagedestroy($destroyed);
          imagedestroy($under);
          imagedestroy($over);
        }

        $shdl = $hdl;
        $hdl['derived'][] = $shdl['name'] = "_$bmp";
        unset($shdl['h3l']);
        unset($shdl['boxes']);
        foreach (['groups', 'shadows', /*'boxes',*/ 'variations'] as $k) {
          $shdl[$k] = array_intersect_key($shdl[$k], array_flip($siegeGroups));
        }
        file_put_contents("$siegePath/texture.json", encodeJSON($shdl));
      }
    }

    // XXX CROGUE.DEF is the only DEF missing turnRight. Since it has turnLeft,
    // can add mirrored turnRight.
  }

  file_put_contents("$outPath/texture.json", encodeJSON($hdl));
  return $hdl;
}

// Removes transparent pixels near edges.
function imagetrim($im) {
  // imagecropauto() doesn't work reliably. For example, it doesn't crop SGRMTW2C.png.
  //$im2 = imagecropauto($im);

  $tbox = null;
  $w = imagesx($im);
  $h = imagesy($im);
  for ($x = $w; $x--; ) {
    for ($y = $h; $y--; ) {
      if (imagecolorat($im, $x, $y) >> 24 !== 127) {
        $tbox = combineRect([$x, $y, $x + 1, $y + 1], $tbox);
      }
    }
  }

  $im2 = imagecrop($im, ['x' => $tbox[0], 'y' => $tbox[1], 'width' => $tbox[2] - $tbox[0], 'height' => $tbox[3] - $tbox[1]]);
  imagedestroy($im);
  return $im2;
}

// Returns new image with larger dimensions.
function imageresize($im, $width, $height) {
  list($w, $h) = [imagesx($im), imagesy($im)];
  $res = newTransparentImage($w + $width, $h + $height);
  imagecopy($res, $im, 0, 0, 0, 0, $w, $h);
  imagedestroy($im);
  return $res;
}

function processImages($w, $h, $file, array $specialColors,
    $variableKey, array $variableColors, &$tbox) {
  isset($specialColors[$variableKey]) or $variableColors = [[null]];
  $ims = [];

  foreach ($variableColors as $features) {
    $variableColor = array_shift($features);
    // resource in PHP < 8, GdImage in 8+.
    $im = is_string($file) ? imagecreatefrombmp($file) : $file;
    $ims[] = array_merge([$im], (array) $features);
    $special = array_flip(array_filter($specialColors));
    list($uw, $uh, , $tbox2, $hadVariable) = unmaskBMP($im, $special, $variableColor);
    $tbox = combineRect($tbox2, $tbox);

    if ($uw !== $w or $uh !== $h) {
      throw new Exception("Width/height of $file mismatches dimensions of the first file in group.");
    }

    // Special color (e.g. flagColor) didn't exist anywhere in the bitmap;
    // disable variability.
    if (!$hadVariable) {
      return [[$im]];
    }
  }

  return $ims;
}

function recolorImage(array $playerPalettes, array $item) {
  $res = [];
  $im = array_shift($item);

  foreach ($playerPalettes as $feature => $pal) {
    $recolored = recolorBMP($pal, imageclone($im));
    $res[] = array_merge([$recolored], $item, [$feature]);
  }

  return $res;
}

// This cannot change $hdl.
function postProcessHDL(array $hdl, $outPath, array $options = []) {
  extract($options, EXTR_SKIP);   // $pal, $special

  $animations = $buttons = $defs = '';
  $id = strtoupper($hdl['name']);

  // For in-between iterations (unlike animation-delay). 0 disables, for now.
  $delay = 0 / $hdl['interval'];

  foreach ($hdl['groups'] as $gn => $files) {
    $count = count($files);
    list($w, $h) = getimagesize("$outPath/$gn-0.png") ?: [];

    // Animations.
    if ($count > 1) {
      $countA = $count + $delay;

      // Allow animations to consist partly or fully of recolored frames.
      // If an animation has even one such frame, create a separate @keyframes
      // for it.
      $uniqueVariations = [];
      foreach ($hdl['variations'][$gn] as $vars) {
        $uniqueVariations += $vars;
      }

      // Images of all animation frames have the same size.
      $countV = count($uniqueVariations);
      foreach ($uniqueVariations as $prefix => $features) {
        $comma = --$countV ? ',' : ' {';
        $animations .=
          // Adding selector for the player-varied animation in case there is
          // no $uniqueVariations on ($features minus [player]).
          playerSelector($features, $pal, " .Hh3-anim_id_$id-#$gn,\n").
          ".Hh3-anim_id_$id-$prefix$gn$comma\n";
      }
      $duration = $countA * $hdl['interval'];
      // Combat-related in upper-case.
      $type = 'S_Cohtci_H'[$hdl['type']];
      // animation-duration must be controlled by user (game options dialog).
      // This is facilitated by a time multiplier on body (or other parent) but:
      // * IE doesn't support var() so first animation-duration is a fallback
      //   for it.
      // * Gecko FF <57 (pre-Quantum) doesn't support calc() in
      //   animation-duration (https://bugzilla.mozilla.org/show_bug.cgi?id=1350857)
      //   but in a strange way: if var() appears inside calc() then such a
      //   value is no longer marked invalid and therefore preceding declaration
      //   (without calc()) is not used - computed animation-duration is just set to 0s.
      //   It's not marked invalid even if calc() has unknown functions (like
      //   env()) or plain wrong syntax. As such, Firefox must be prevented from
      //   evaluating calc() at all; for this we include fallback duration as
      //   --Hd by default, and ask the client code to override it to 'unset'
      //   after detecting a supported browser version (see Entry.Browser.js and
      //   .Hanim_var).
      $animations .=
          "  --Hd: {$duration}ms;\n".
          "  animation-duration: {$duration}ms;\n".
          "  animation-duration: var(--Hd, calc(var(--H$type, 1) * {$duration}ms));\n".
          "  animation-timing-function: step-end;\n".
          "  width: {$w}px;\n".
          "  height: {$h}px;\n".
          "}\n";

      foreach ($uniqueVariations as $prefix => $features) {
        $keyframes = [];

        foreach ($files as $fn => $file) {
          // If a $file doesn't have a recolored version, use normal version
          // for that frame.
          $pp = isset($hdl['variations'][$gn][$fn][$prefix]) ? $prefix : '';
          if ($hdl['type'] === 6) {   // CRSPELL.DEF
            $style = "cursor: url($pp$gn-$fn.png), pointer";
          } else {
            $style = "background-image: url($pp$gn-$fn.png)";
            if (null !== ($frame = $hdl['baseFrames'][$gn] ?? null) and $frame !== $fn) {
              $pp = isset($hdl['variations'][$gn][$frame][$prefix]) ? $prefix : '';
              $style .= ", url($pp$gn-$frame.png)";
            }
          }
          $step = $fn / $countA * 100;
          $keyframes[] = "  $step% { $style; }\n";
          if ($fn === $countA - 1) {
            // Last keyframe must be 100% for animation-fill-mode: forwards
            // to work (else it displays nothing after playing last non-100% frame).
            $keyframes[] = "  to { $style; }\n";
          }
        }

        $animations .=
          playerSelector($features, $pal, " .Hh3-anim_id_$id-#$gn,\n").
          ".Hh3-anim_id_$id-$prefix$gn {\n".
          "  animation-name: Hh3-anim_id_$id-$prefix$gn;\n".
          "}\n".
          "@keyframes Hh3-anim_id_$id-$prefix$gn {\n".
          join($keyframes).
          "}\n";
      }
    }

    // Buttons.
    $uniqueVariations = [];
    // Count variations in first 4 frames (= count($selectors)).
    foreach (array_slice($hdl['variations'][$gn], 0, 4) as $vars) {
      $uniqueVariations += $vars;
    }
    $playerClass = function ($prefix, $playerSelector = true) use ($id, $gn) {
      return ($playerSelector ? ' ' : '').".Hh3-btn_id_$id".
        ($gn ? "-$prefix$gn" : ($prefix ? '-'.trim($prefix, '-') : '')).
        ($playerSelector ? ",\n" : '');
    };
    $countV = count($uniqueVariations);
    foreach ($uniqueVariations as $prefix => $features) {
      $comma = --$countV ? ',' : ' {';
      $buttons .=
            playerSelector($features, $pal, $playerClass).
            $playerClass($prefix, false)."$comma\n";
    }
    // Images for all button states (within one $gn) have the same size.
    $buttons .=
      "  width: {$w}px;\n".
      "  height: {$h}px;\n".
      "}\n";
    foreach ($uniqueVariations as $prefix => $features) {
      $classPrefix = $playerClass($prefix, false);
      $selectors = $buttonSelectors[strtoupper($hdl['name'])] ?? $buttonSelectors['*'];
      foreach ($files as $fn => $file) {
        if ($selector = array_shift($selectors)) {
          switch ($selector) {
            case 'normal': $selector = '^'; break;
            case 'pressed': $selector = '^:active:hover:not(.Hh3-btn_dis):not(.Hh3-btn_act_no)'; break;
            case 'disabled': $selector = '^.Hh3-btn_dis'; break;
            case 'hover': $selector = '^.Hh3-btn_cur, ^.Hh3-btn_hov:hover'; break;
          }
          if ($var = playerSelector($features, $pal, $playerClass)) {
            $buttons .= str_replace('^', substr($var, 0, -2), $selector).",\n";
          }
          $buttons .=
            str_replace('^', $classPrefix, $selector)." {\n".
            "  background-image: url($prefix$gn-$fn.png);\n".
            "}\n";
        }
      }
    }

    // Individual DEF frames.
    foreach ($files as $fn => $file) {
      foreach ($hdl['variations'][$gn][$fn] as $prefix => $features) {
        $selectors = [".Hh3-def_frame_$id-$prefix$gn-$fn"];
        // Some groups of DEFs mix animations and static images (e.g. town screen
        // buildings - TBCSHALL vs TBDNDW_2). To save the client from having to
        // determine which is which, let it refer to static DEFs (only) by
        // animation class.
        if ($asAnimation = ($count === 1 and !$fn)) {
          array_unshift($selectors, ".Hh3-anim_id_$id-$prefix$gn");
        }
        if (playerSelector($features, $pal)) {
          if ($asAnimation) {
            $selectors[] = playerSelector($features, $pal, ".Hh3-anim_id_$id-#$gn");
          }
          $selectors[] = playerSelector($features, $pal, " .Hh3-def_frame_$id-#$gn-$fn");
        }
        $defs .=
          join(",\n", $selectors)." {\n".
          "  background-image: url($prefix$gn-$fn.png);\n".
          "  width: {$w}px;\n".
          "  height: {$h}px;\n".
          "}\n";
      }
    }
  }

  $animations and file_put_contents("$outPath/animation.css", $animations);
  $buttons and file_put_contents("$outPath/button.css", $buttons);
  $defs and file_put_contents("$outPath/def.css", $defs);

  return $hdl;
}

function playerSelector(array $features, $pal, $append = '') {
  if ($player = array_intersect($features, array_keys((array) $pal))) {
    $prefix = join('-', array_diff($features, $player));
    count($features) > 1 and $prefix .= '-';
    return ".Hrecolor_$player[0]".(($append instanceof Closure)
      ? $append($prefix) : str_replace('#', $prefix, $append));
  }
}

// Returns associative array with key/values from [Data] section of an .ini file.
//
// Throws on bad format.
function parseINI($str) {
  list(, $data) = preg_split('/^\\[Data\\]\\s*$/mu', $str, 2);
  preg_match_all('/^([^=]+)=(.*)$/mu', $data, $matches);
  return array_combine(array_map('trim', $matches[1]), array_map('trim', $matches[2]));
}

// Returns normalized data obtained from DefPreview's .hdl file's [Data] section produced by "Extract All for DefTool" command.
function parseHDL(array $ini) {
  extract($ini, EXTR_PREFIX_ALL, 'i');

  if (!in_array($ini['Shadow Type'], ['0', '2'])) {
    throw new Exception("HDL Shadow Type {$ini['Shadow Type']} not supported.");
  }
  if (!$ini['Groups Number']) {
    throw new Exception("HDL has no Groups.");
  }

  $type = (int) $i_Type;
  $withShadow = $ini['Shadow Type'] === '2';
  $groups = $shadows = [];

  for ($n = 0; $n < $ini['Groups Number']; $n++) {
    // XXX=R DefPreview 1.0.0 stores groups sequentially while 1.2.1 properly indexes them, resulting in gaps (that we skip over here). For 1.2.1, we could skip reading H3L but hopefully we'll move from DefPreview to some console tool in a future rather than fixing this.
    while (!isset(${"i_Group$n"})) { $n++; }
    $groups[] = explode('|', rtrim(${"i_Group$n"}, '|'));
    $shadows[] = $withShadow ? explode('|', rtrim(${"i_Shadow$n"}, '|')) : null;
    if ($withShadow and count(end($groups)) !== count(end($shadows))) {
      throw new Exception("HDL Groups$n/Shadow$n have different lengths.");
    }
  }

  // Animations.txt.
  $specialColorsByType = [
    0 => ['transparent'],
    1 => ['transparent', 'faintShadow', 'lightShadow', 'mediumShadow', 'deepShadow', 'selection', 'selectionDeepShadow', 'selectionFaintShadow'],
    2 => ['transparent', 'faintShadow', 4 => 'deepShadow', 'selection', 'selectionDeepShadow', 'selectionFaintShadow'],
    3 => ['transparent', 'faintShadow', 4 => 'deepShadow', 'flagColor'],
    4 => ['transparent', 'faintShadow', 4 => 'deepShadow', 'flagColor'],
    5 => ['transparent', 'faintShadow', 'lightShadow', 'mediumShadow', 'deepShadow'],
    6 => ['transparent'],
    7 => ['transparent', 'faintShadow', 4 => 'deepShadow'],
    8 => ['transparent', 'faintShadow', 'lightShadow', 'mediumShadow', 'deepShadow', 'selection', 'selectionDeepShadow', 'selectionFaintShadow'],
    9 => ['transparent', 'faintShadow', 4 => 'deepShadow'],
  ];

  // DefPreview doesn't enable all special colors actually used in a frame
  // when it exports HDL so ignoring HDL's ColorChecks and using empirically
  // determined values (Animations.txt).
  //
  // For example, ADAG.DEF has no shadow frames and yet its main frames have
  // areas filled with shadowColors['deepShadow']; both DefPreview and SoD
  // 3 treat it as a shadow even though this color is unchecked (0) in HDL's
  // ShadowColorsBox.ColorChecks.
  //$checks = array_map('boolval', explode('|', $ini["$name.ColorChecks"]));

  // Animations.txt. Some colors were excluded after manually checking
  // frames where they appear (e.g. shadows in $47).
  $checks = [
    0 => ['c:transparent', 's:transparent'],
    2 => ['c:transparent', 's:transparent', 's:faintShadow', 's:deepShadow', 's:selection', 's:selectionDeepShadow', 's:selectionFaintShadow'],
    3 => ['c:transparent', 's:transparent', 's:faintShadow', 's:deepShadow', 'c:flagColor', 's:flagColor'],
    // Not treating flagColor specially for $44. SoD treats it as transparent
    // but it appears it was meant for being drawn as is (e.g. compare AH05/AH06
    // normal frames 0-5, both have yellowish pixel on top of the pole).
    4 => ['c:transparent', 's:transparent', 's:faintShadow', 's:deepShadow'],
    5 => ['c:transparent', 's:transparent', 'c:deepShadow' /*ADAG.DEF*/,
          // TSHRE.DEF
          'c:lightShadow', 'c:mediumShadow'],
    6 => ['c:transparent', 's:transparent'],
    7 => ['c:transparent', 's:transparent'],
    9 => ['c:transparent', 's:transparent', 's:faintShadow', 's:deepShadow'],
  ];

  foreach (['ColorsBox' => 'colors', 'ShadowColorsBox' => 'shadowColors'] as $name => $var) {
    foreach (explode('|', rtrim($ini["$name.Colors"], '|')) as $n => $color) {
      $key = $specialColorsByType[$type][$n] ?? '';
      if ($key and in_array("$var[0]:$key", $checks[$type])) {
        $$var[$key] = hex2color($color);
      }
    }
  }

  $playerColors = empty($ini['ColorsBox.PlayerColors']) ? null
    : array_map('hex2color', explode('|', rtrim($ini['ColorsBox.PlayerColors'], '|')));

  // Ignoring 'Generate Selection', it's always 0.
  return compact(
    'type',
    // XXX+C According to h3m-The-Corpus.txt, if last number in OBJECTS.TXT is not 0 then shadow should not be drawn. def2png.php doesn't process OBJECTS.TXT and it seems that DEF shadows of all such objects don't stick out anyway.
    'withShadow',   // boolean indicating if shadows are used
    'groups',       // array of file names
    'shadows',      // ditto, useless if !$withShadow
    'colors',       // array of numeric color values (e.g. 0xFFFF for cyan)
    'shadowColors', // ditto, useless if !$withShadow
    'playerColors'  // ditto, can be null
  );
}

// Further normalizes .hdl data, in particular adds animation group numbers obtained from DefPreview's .h3l file produced by "Export Defmaker DefList" command.
function addCustom($hdlPath, array &$hdl, array $pal = null) {
  $h3lPath = preg_replace('/(\\.hdl)?$/i', '.h3l', $hdlPath, 1);

  if (is_file($h3lPath)) {
    $boolval = function ($s) { return strcasecmp($s, 'false') !== 0; };

    $keys = [
      'frameType' => 'intval',        // point 1 in DefMaker's help
        // 0 = "buttons, backgrounds, monsters"
        // 1 = "roads, shadows - disabled"
        // 2 = "map object"
        // 3 = "terrain"
      'defType' => 'intval',          // point 2 in DefMaker's help
        // maps to DefPreview type: 0=$49, 1=$48, ..., 9=$40
      'fileName' => 'strval',         // point 10 in DefMaker's help
      'createShadow' => $boolval,     // point 17 in DefMaker's help
      'createBorder' => $boolval,     // point 19 in DefMaker's help
      'isCrop' => $boolval,           // point 18 in DefMaker's help
      'cropWidth' => 'intval',
      'cropHeight' => 'intval',
      'fileNameMask' => 'strval',     // point 12 in DefMaker's help
      'monsterType' => 'intval',      // point 15 in DefMaker's help
        // 0 = "Zealot"
        // 2 = "Sharpshooter"
        // 3 = "Titan"
        // 4 = "Ghost"
        // 5 = "Wrigh"
        // 7 = "Golem"
        // 8 = "Devil"
        // 9 = "Unicorn"
        // 10 = "Crusader"
        // 12 = "Green Dragon"
        // 14 = "Custom" - always 14 unless defType is 7 ($42)
      'checkPalette' => $boolval,     // point 14 in DefMaker's help
      'isOffsetX' => $boolval,
      'isOffsetY' => $boolval,
      'offsetX' => 'intval',          // "Auto" if !isOffsetX, else int
      'offsetY' => 'intval',          // ditto
    ];

    $pending = $groupKeys = [];

    foreach (file($h3lPath, FILE_IGNORE_NEW_LINES) as $i => $line) {
      if (!$i and !is_numeric($line)) {
        static $warned1;
        if (!$warned1) {
          $warned1 = true;
          // This format just lists files within groups, without proper group
          // numbers.
          fprintf(STDERR, "Warning: ignored old-format H3L: %s (there may be more)%s",
            $h3lPath, PHP_EOL);
        }
        break;
      }

      if (key($keys) !== null) {
        $hdl['h3l'][key($keys)] = current($keys)($line);
        next($keys);
      } elseif (preg_match('/^(.+)  (\\d+)\\+$/', $line, $match)) {
        list(, $line, $group) = $match;
        $hdl['h3l']['groups'][$group] = array_merge($pending, [$line]);
        $groupKeys[] = $group;
        $pending = [];
      } else {
        $pending[] = $line;
      }
    }

    if ($pending) {
      throw new Exception("Invalid format of H3L.");
    }

    if ($groupKeys) {
      // Take group numbers from H3L.
      $hdl['groups']  = array_combine($groupKeys, $hdl['groups']);
      $hdl['shadows'] = array_combine($groupKeys, $hdl['shadows']);
    }
  }

  if ($pal) {
    foreach ($hdl['groups'] as $gn => $files) {
      foreach ($files as $fn => $file) {
        $file = dirname($hdlPath)."/$file";
        $im = imagecreatefrombmp($file);
        try {
          if (imageistruecolor($im)) {
            static $warned2;
            if (!$warned2) {
              $warned2 = true;
              fprintf(STDERR, "Warning: not recoloring non-palette based BMP: %s (there may be more)%s",
                $file, PHP_EOL);
            }
            continue;
          }
          if (isRecolorableBMP($pal['blue'], $im)) {
            $hdl['recolor'][$gn][$fn] = array_keys($pal);
          }
        } finally {
          imagedestroy($im);
        }
      }
    }
  }

  // Might have random char case.
  $hdl['name'] = basename($hdlPath, strrchr($hdlPath, '.'));

  switch (strtoupper($hdl['name'])) {
    case 'TBCSBOAT':
    case 'TBCSDOCK':
      // Frame 0 seems to be never used.
      array_shift($hdl['groups'][0]);
      break;

    // Determined empirically by using DefPreview.
    // Only checked these files:
    // - TBCS*.DEF
    // - TBRM*.DEF
    case 'TBCSHAL2':  // Castle
    case 'TBCSHAL3':
    case 'TBCSHAL4':
    case 'TBCSHALL':
    case 'TBCSDW_5':
    case 'TBCSMAG3':
    case 'TBCSMAG4':
    case 'TBCSSPEC':
    case 'TBCSUP_5':
    case 'TBRMDW_0':  // Rampart
    case 'TBRMDW_3':
    case 'TBRMDW_6':
    case 'TBRMEXT0':
    case 'TBRMSPEC':
    case 'TBRMUP_0':
    case 'TBRMUP_3':
    case 'TBRMUP_6':
    case 'TBTWBLAK':  // Tower
    case 'TBTWDW_0':
    case 'TBTWDW_2':
    case 'TBTWUP_0':
    case 'TBTWUP_2':
    case 'TBINBLAK':  // Inferno
    case 'TBINCAS2':
    case 'TBINCAS3':
    case 'TBINCSTL':
    case 'TBINDW_0':
    case 'TBINDW_1':
    case 'TBINEXT1':
    case 'TBINHRD1':
    case 'TBINHRD2':
    case 'TBINMAG2':
    case 'TBINMAG3':
    case 'TBINMAG4':
    case 'TBINMAG5':
    case 'TBINMAGE':
    case 'TBINUP_0':
    case 'TBINUP_1':
    case 'TBNCBLAK':  // Necropolis
    case 'TBNCBOAT':
    case 'TBNCDOCK':
    case 'TBNCEXT0':
    case 'TBNCHOLY':
    case 'TBNCSPEC':
    case 'TBDNDW_6':  // Dungeon
    case 'TBDNEXT1':
    case 'TBDNUP_6':
    case 'TBSTDW_6':  // Stronghold
    case 'TBSTHAL2':
    case 'TBSTHAL3':
    case 'TBSTHAL4':
    case 'TBSTHALL':
    case 'TBSTHOLY':
    case 'TBSTSPEC':
    case 'TBSTUP_5':
    case 'TBSTUP_6':
    case 'TBFRBOAT':  // Fortress
    case 'TBFRCAS3':
    case 'TBFRDW_6':
    case 'TBFRMAG3':
    case 'TBFRTVRN':
    case 'TBFRUP_4':
    case 'TBFRUP_6':
    case 'TBELBLAK':  // Conflux
    case 'TBELBOAT':
    case 'TBELDW_0':
    case 'TBELDW_3':
    case 'TBELDW_4':
    case 'TBELDW_5':
    case 'TBELHRD1':
    case 'TBELHRD2':
    case 'TBELUP_0':
    case 'TBELUP_3':
    case 'TBELUP_4':
    case 'TBELUP_5':
      // DefPreview's INI doesn't provide any insight about this property.
      // DefPreview itself plays these animations incorrectly (i.e. raw).
      $hdl['baseFrames'][0] = 0;
  }

  // Animations.txt.
  $noFlag = [
    'advmwind',   // not ownable (windmill)
    'ah05_e',     // heroes have separate flags
    'ah16_e',
    'ah17_e',
    'ava0037',    // not ownable (artifact)
    'avgfire0',   // no flag area (Fire Elemental dwelling)
    'avlautr0',   // not ownable (obstacle)
    'avlautr1',
    'avlautr2',
    'avlautr3',
    'avlautr4',
    'avlautr5',
    'avlautr6',
    'avlautr7',
    'avsfntn0',   // not ownable (fountain)
    'default',    // dummy
  ];

  if (in_array(strtolower($hdl['name']), $noFlag)) {
    unset($hdl['colors']['flagColor']);
    unset($hdl['shadowColors']['flagColor']);
  }

  // Determined empirically.
  // XXX validate speed against real in-game animations
  $intervals = [0 => 90, 2 => 90];
  $hdl['interval'] = $intervals[$hdl['type']] ?? 180;

  // HeroWO's ADVMAP 'monster' (AClass->$type) objects are not 2x2 but 3x3 in order for $guarded to work properly (see AClass->$adjusted). We know all $43 AVW*.DEF are 'monster-s in SoD.
  $hdl['enlarge'] = ($hdl['type'] === 3 and !strncasecmp($hdl['name'], 'AVW', 3)) ? [32, 32] : null;
}

// Converts Delphi-style $BBGGRR or regular RRGGBB color string to an integer.
// For example, cyan ($FFFF00 = 00FFFF) = 0x00FFFF.
function hex2color($str) {
  $color = hex2bin(ltrim($str, '$'));
  return ($str[0] === '$' ? unpack('V', "$color\0") : unpack('N', "\0$color"))[1];
}
