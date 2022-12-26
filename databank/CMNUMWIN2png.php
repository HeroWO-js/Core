<?php
require __DIR__.'/core.php';

list(, $bmpPath, $outPath, $samplePath) = $argv + ['', '', '', ''];

if (!file_exists($bmpPath) or !$outPath) {
  echo 'Usage: CMNUMWIN2png.php BMPs/CMNUMWIN.bmp output/ [samples/]', PHP_EOL;
  echo 'Creates palette-based variations from stock gray CMNUMWIN.bmp.', PHP_EOL;
  echo 'samples/ contains user-created colored CMNUMWIN variations', PHP_EOL;
  echo '(usually from a screenshot). Defects in points not used for', PHP_EOL;
  echo 'color sampling are allowed.', PHP_EOL;
  exit(1);
}

$variations = [
  'gray' => [
    10 => 0xB5B5B5,
    11 => 0x6B6B6B,
    12 => 0x737373,
    13 => 0x7B7B7B,
    15 => 0x8C8C8C,
    16 => 0x949494,
    18 => 0xA5A5A5,
    19 => 0xADADAD,
    22 => 0xC6C6C6,
    23 => 0xCECECE,
    24 => 0xD6D6D6,
    25 => 0xDEDEDE,
    27 => 0xC0C0C0,
    247 => 0xA0A0A4,
    248 => 0x808080,
  ],
  'purple' => [
    10 => 0x6B20B5,
    11 => 0x391463,
    12 => 0x42146B,
    13 => 0x4A1873,
    15 => 0x52188C,
    16 => 0x521C94,
    18 => 0x6320A5,
    19 => 0x6320AD,
    22 => 0x7324C6,
    23 => 0x7B28CE,
    24 => 0x7B28D6,
    25 => 0x8428DE,
    27 => 0x7324BD,
    247 => 0x63209C,
    248 => 0x4A187B,
  ],
  'green' => [
    10 => 0x21B621,
    11 => 0x106910,
    12 => 0x107110,
    13 => 0x187918,
    15 => 0x188E18,
    16 => 0x189618,
    18 => 0x21A621,
    19 => 0x21AE21,
    22 => 0x21C721,
    23 => 0x29CF29,
    24 => 0x29D729,
    25 => 0x29DF29,
    27 => 0x21C321,
    247 => 0x21A221,
    248 => 0x188218,
  ],
  'yellow' => [
    10 => 0xB5B621,
    11 => 0x636910,
    12 => 0x6B7110,
    13 => 0x737910,
    15 => 0x8C8E18,
    16 => 0x949618,
    18 => 0xA5A621,
    19 => 0xADAE21,
    22 => 0xC6C721,
    23 => 0xCECF29,
    24 => 0xD6D729,
    25 => 0xDEDF29,
    27 => 0xBDC321,
    247 => 0x9CA218,
    248 => 0x7B8218,
  ],
  'red' => [
    10 => 0xB52021,
    11 => 0x6B1410,
    12 => 0x731410,
    13 => 0x7B1810,
    15 => 0x8C1818,
    16 => 0x941C18,
    18 => 0xA52021,
    19 => 0xAD2021,
    22 => 0xC62421,
    23 => 0xCE2829,
    24 => 0xD62829,
    25 => 0xDE2829,
    27 => 0xC62421,
    247 => 0xA52018,
    248 => 0x841818,
  ],

  // HeroWO-specific variants not found in SoD.
  'purple-cyan' => [
    10 => 0x2078B5,
    11 => 0x144663,
    12 => 0x14456B,
    13 => 0x184A73,
    15 => 0x185D8C,
    16 => 0x1C6994,
    18 => 0x206FA5,
    19 => 0x2078AD,
    22 => 0x2487C6,
    23 => 0x288BCE,
    24 => 0x2893D6,
    25 => 0x2893DE,
    27 => 0x247CBD,
    247 => 0x20659C,
    248 => 0x18527B,
  ],
  'purple-violet' => [
    10 => 0x9A20B5,
    11 => 0x521463,
    12 => 0x5D146B,
    13 => 0x671873,
    15 => 0x77188C,
    16 => 0x781C94,
    18 => 0x8D20A5,
    19 => 0x8F20AD,
    22 => 0xA624C6,
    23 => 0xB028CE,
    24 => 0xB228D6,
    25 => 0xBD28DE,
    27 => 0xA324BD,
    247 => 0x8A209C,
    248 => 0x69187B,
  ],
];

$original = [
   10 => [0xB5B5B5,   10, 9],
         [0x6B6B6B,   1, 3],
         [0x737373,   2, 3],
         [0x7B7B7B,   3, 3],
  //0x848484,   - unused
   15 => [0x8C8C8C,   5, 3],
         [0x949494,   6, 3],
  //0x9C9C9C,
   18 => [0xA5A5A5,   8, 9],
         [0xADADAD,   9, 9],
  //0xB5B5B5,
  //0xBDBDBD,
   22 => [0xC6C6C6,   12, 9],
         [0xCECECE,   13, 9],
         [0xD6D6D6,   14, 9],
         [0xDEDEDE,   15, 9],
  // ...
   27 => [0xC0C0C0,   11, 9],
  // ...
  247 => [0xA0A0A4,   7, 9],
         [0x808080,   4, 3],
];

$bmp = imagecreatefrombmp($bmpPath);

if ($samplePath) {
  foreach (scandir($samplePath) as $file) {
    $base = basename($file, '.png');

    if ($file !== $base) {
      echo $base, PHP_EOL;
      $im = imagecreatefrompng("$samplePath/$file");
      imagepalettetotruecolor($im);

      foreach ($original as $index => [, $x, $y]) {
        $color = imagecolorat($im, $x, $y);
        imagecolorset($bmp, $index, $color >> 16 & 0xFF, $color >> 8 & 0xFF, $color & 0xFF);
        printf('%d => 0x%06X,%s', $index, $color, PHP_EOL);
      }

      imagedestroy($im);
      // Noticed something strange: GD saves the original CMNUMWIN.bmp as a BMP
      // in a wrong way (something's off with pixels on the right side). Try it:
      //   $bmp = imagecreatefrombmp('CMNUMWIN.BMP');
      //   imagebmp($bmp, 'foo.bmp');
      // Luckily we only need PNG here, but be warned.
      imagepng($bmp, "$outPath/$base.png");
    }
  }
} else {
  foreach ($variations as $base => $colors) {
    foreach ($colors as $index => $color) {
      imagecolorset($bmp, $index, $color >> 16 & 0xFF, $color >> 8 & 0xFF, $color & 0xFF);
    }

    imagepng($bmp, "$outPath/$base.png");
  }
}

imagedestroy($bmp);
