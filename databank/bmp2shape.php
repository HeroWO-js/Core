<?php
require __DIR__.'/core.php';

$bmpPath = $geojsonPath = $outPath = $visualPath = '';
$mask = 'TZ*.BMP';

array_shift($argv);

while (null !== $arg = array_shift($argv)) {
  if ($arg[0] === '-') {
    switch ($arg) {
      case '-b':
        $bmpPath = array_shift($argv);
        break;
      case '-g':
        $geojsonPath = array_shift($argv);
        break;
      case '-o':
        $outPath = array_shift($argv);
        break;
      case '-m':
        $mask = array_shift($argv);
        break;
      case '-v':
        $visualPath = array_shift($argv);
        break;
      default:
        throw new Exception("Invalid -option: $arg.");
    }
  } else {
    throw new Exception("Invalid argument: $arg.");
  }
}

$dir = is_dir($bmpPath);
$geojsonPath or $geojsonPath = $bmpPath;

if (!file_exists($bmpPath) or ($dir and (!is_dir($geojsonPath) or !$outPath))) {
  echo 'Usage: bmp2shape.php -b BMPs/ [-g GEOJSONs/] -o output.json [-m *mask.b?p] [-v visualize/]', PHP_EOL;
  echo 'Usage: bmp2shape.php -b BMPs/TZFAIDA.bmp [-g GEOJSONs/TZFAIDA.geojson] [-v visualize.png]', PHP_EOL;
  echo PHP_EOL;
  echo 'Source files can be either BMP or PNG (after bmp2png.php).', PHP_EOL;
  echo 'All paths (-b -g -o -v) may be the same directory.', PHP_EOL;
  echo '-g defaults to -b. -m defaults to TZ*.BMP.', PHP_EOL;
  echo 'Only X.bmp that have matching X.geojson or X.bmp.geojson in -g are processed.', PHP_EOL;
  echo 'Generate .geojson using potrace: http://potrace.sourceforge.net', PHP_EOL;
  echo PHP_EOL;
  echo '    potrace -b geojson X.bmp -o X.geojson -u 1', PHP_EOL;
  echo PHP_EOL;
  echo '    for %i in (*.bmp) do potrace -b geojson %i -o %i.geojson -u 1', PHP_EOL;
  echo PHP_EOL;
  echo '    for i in *.bmp; do potrace -b geojson "$i" -o "$i".geojson -u 1; done', PHP_EOL;
  echo PHP_EOL;
  echo '-u is not required but saves space in data files. potrace\'s default', PHP_EOL;
  echo 'of 1 fractional digit makes <map> unnoticeably more accurate to the user.', PHP_EOL;
  exit(1);
}

if ($dir) {
  $files = scandir($bmpPath, SCANDIR_SORT_NONE);
  $css = [];

  foreach ($files as $i => $file) {
    if (fnmatch($mask, $file, FNM_NOESCAPE | FNM_PATHNAME | FNM_CASEFOLD)) {
      $json = findGeojson($geojsonPath, $file);

      if ($json) {
        $base = basename($file, strrchr($file, '.'));
        $json = json_decode(file_get_contents($json), true);
        $data = parseGeojson($json, "$bmpPath/$file");

        list($w, $h) = getimagesize("$bmpPath/$file") ?: [];
        $res[strtolower($base)] = [
          'width' => $w,
          'height' => $h,
          'polygons' => $data,
        ];

        if ($visualPath) {
          visualizeTo("$visualPath/$base.png", "$bmpPath/$file", $data);
        }
      }
    }
  }

  file_put_contents($outPath, encodeJSON($res));
} else {
  if (!$geojsonPath) {
    $geojsonPath = findGeojson(dirname($bmpPath), basename($bmpPath));
  }

  if (!$geojsonPath) {
    echo "Cannot locate the .geojson for $bmpPath", PHP_EOL;
    exit(2);
  }

  $json = json_decode(file_get_contents($geojsonPath), true);
  $res = parseGeojson($json, $bmpPath);
  $visualPath and visualizeTo($visualPath, $bmpPath, $res);

  foreach ($res as $i => $coords) {
    printf('Exterior %d (%d):%s', $i + 1, count($coords[0]) / 2, PHP_EOL);
    echo PHP_EOL;
    echo join(' ', $coords[0]), PHP_EOL;

    $int = array_slice($coords, 1);

    if ($int) {
      echo PHP_EOL;
      printf('Holes in exterior %d (%d):%s', $i + 1, count($int), PHP_EOL);

      foreach ($int as $coords) {
        echo PHP_EOL;
        echo join(' ', $coords), PHP_EOL;
      }
    }

    echo PHP_EOL;
  }
}

function findGeojson($path, $file) {
  $json = "$path/$file.geojson";
  is_file($json) or $json = "$path/".basename($file, strrchr($file, '.')).".geojson";
  return is_file($json) ? $json : null;
}

// Give $bmpFile if coords must be flipped vertically.
function parseGeojson(array $data, $bmpFile = null) {
  list($w, $h) = $bmpFile ? (getimagesize($bmpFile) ?: []) : [0, 0];
  $w = 0;   // don't flip horizontally

  if (($type = $data['type'] ?? '') !== 'FeatureCollection') {
    throw new Exception("Unrecognized Geojson type: $type");
  }

  $res = [];

  foreach ($data['features'] as $exteriorIndex => $feature) {
    if (($type = $feature['type'] ?? '') !== 'Feature') {
      throw new Exception("Unrecognized Geojson feature: $type");
    }
    if (($type = $feature['geometry']['type'] ?? '') !== 'Polygon') {
      throw new Exception("Unrecognized Geojson geometry: $type");
    }

    // https://datatracker.ietf.org/doc/html/rfc7946#section-3.1.6
    // "For Polygons with more than one of these rings, the first MUST be
    //  the exterior ring, and any others MUST be interior rings."
    foreach ($feature['geometry']['coordinates'] as $i => $coords) {
      $ref = &$res[$exteriorIndex][];

      // potrace contour is such that its bottom and right edges are on the outside
      // of the shape while top and left are inside. In other words, if right or bottom
      // edge's pixel is at (X;Y) then potrace will specify it as (X+1;Y+1)
      // but will specify (X;Y) for left and top edges. Therefore $x/$y can equal
      // to $w/$h (which they normally should not). We don't normalize this here
      // because this is very minor offset that the player will hardly recognize.
      //
      // Also, potrace flips the image vertically which, given the above, can
      // result in negative X/Y (-1 at minimum). This too works fine with <map>.
      //
      // Memo: potrace ensures that last coord closes the path but <map> would
      // do that automatically anyway.
      foreach ($coords as [$x, $y]) {
        $w and $x = $w - $x;
        $h and $y = $h - $y;
        $ref[] = round($x);
        $ref[] = round($y);
      }
    }
  }

  return $res;
}

function visualizeTo($outPath, $bmpPath, array $parsed) {
  $im = call_user_func('imagecreatefrom'.strtolower(substr(strrchr($bmpPath, '.'), 1)), $bmpPath);

  // Discard all but 2 colors and make them uniform (white for the shape, gray
  // for background).
  imagepalettetotruecolor($im);
  imagetruecolortopalette($im, false, 2);
  $color = imagecolorsforindex($im, 1);
  $bk = ($color['red'] < 10) and ($color['green'] > 250) and ($color['blue'] > 250);  // cyan
  imagecolorset($im,  $bk, 192, 192, 192);
  imagecolorset($im, !$bk, 255, 255, 255);
  imagepalettetotruecolor($im);

  foreach ($parsed as $ei => $coords) {
    foreach ($coords as $ci => $c) {
      $color = !$ci
        ? imagecolorallocate($im, 255 - $ei * 80, 0, 0)   // exterior
        : imagecolorallocate($im, 0, 100 + $ci % 2 * 50, 100 + ($ci + 1) % 2 * 50);

      for ($i = 0; isset($c[$i]); $i += 2) {
        imagesetpixel($im, $c[$i], $c[$i + 1], $color);
      }
    }
  }

  imagepng($im, $outPath);
}
