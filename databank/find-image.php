<?php
require __DIR__.'/core.php';

array_shift($argv);
$findMinWidth = $findMinHeight = $fuzzy = 0;
$copyToDir = '';
$clean = false;
$indexPath = true;
$paths = [];

while (null !== $arg = array_shift($argv)) {
  if ($arg[0] === '-') {
    switch ($arg) {
      case '-w':
        $findMinWidth = (int) array_shift($argv);
        break;
      case '-h':
        $findMinHeight = (int) array_shift($argv);
        break;
      case '-f':
        $fuzzy = (int) array_shift($argv);
        break;
      case '-c':
        $copyToDir = array_shift($argv);
        break;
      case '-C':
        $clean = true;
        break;
      case '-x':
      case '-X':
        $indexPath = $arg === '-x';
        break;
      default:
        throw new Exception("Invalid -option: $arg.");
    }
  } elseif (preg_match('/^(\d+)([x*])(\d+)(\2(\d+))?$/', $arg, $match)) {
    list(, $findMinWidth, , $findMinHeight, , $fuzzy) = $match + [0, 0, 0, 0, 0, 0];
  } elseif (((string) (int) $arg) === $arg) {
    !$findMinWidth ? $findMinWidth = (int) $arg
      : (!$findMinHeight ? $findMinHeight = (int) $arg
          : $fuzzy = (int) $arg);
  } else {
    $paths[] = $arg;
  }
}

$findMaxWidth  = $findMinWidth  + $fuzzy;
$findMaxHeight = $findMinHeight + $fuzzy;
$findMinWidth  -= $fuzzy;
$findMinHeight -= $fuzzy;

if (!$paths) {
  echo "Usage: find-image.php -options images/ more/ ...", PHP_EOL;
  echo PHP_EOL;
  echo "-w -h -f can be also given as positional arguments in any order:", PHP_EOL;
  echo "  WxH[xF] or W*H[*F] equals to -w W -h H [-f F]", PHP_EOL;
  echo "  or as separate arguments: W [...] H [...] F", PHP_EOL;
  echo PHP_EOL;
  echo "Options (all optional):", PHP_EOL;
  echo "  -c PATH         copy found images to", PHP_EOL;
  echo "  -C              remove *.png from -c", PHP_EOL;
  echo "  -w N            exact image width", PHP_EOL;
  echo "  -h N            exact image height", PHP_EOL;
  echo "  -f N            fuzzy; allow up to this difference in -w/-h", PHP_EOL;
  echo "  -x -X           do/don't use index; defaults to system temp", PHP_EOL;
  exit(1);
}

$indexPath === true and $indexPath = sys_get_temp_dir().'/find-image.txt';
try {
  $index = unserialize(file_get_contents($indexPath));
} catch (Throwable $e) {
  $index = [];
}

if ($copyToDir) {
  is_dir($copyToDir) or mkdir($copyToDir);

  if ($clean) {
    foreach (scandir($copyToDir, SCANDIR_SORT_NONE) as $file) {
      if (!strcasecmp(strrchr($file, '.'), '.png')) {
        unlink("$copyToDir/$file");
      }
    }
  }
}

$checkedCount = $foundCount = 0;

foreach ($paths as $path) {
  $path = realpath($path);    // so that $index entries work regardless of CWD
  $ref = &$index[$path];
  if ($ref) {
    foreach ($ref as $a) { check(...$a); }
  } else {
    findIn($path, $ref);
  }
}

fprintf(STDERR, "Found %s images among %s in %.1fs. w%d-%d h%d-%d%s",
  number_format($foundCount),
  number_format($checkedCount),
  microtime(true) - $_SERVER['REQUEST_TIME'],
  $findMinWidth, $findMaxWidth, $findMinHeight, $findMaxHeight,
  PHP_EOL);

if ($indexPath) {
  try {
    file_put_contents($indexPath, serialize($index));
  } catch (Throwable $e) {
    $indexPath and fwrite(STDERR, "Cannot write index to $indexPath".PHP_EOL);
  }
}

function findIn($path, &$index) {
  foreach (scandir($path) as $file) {
    $full = $path.DIRECTORY_SEPARATOR.$file;
    if ($file === '.' or $file === '..') {
      continue;
    } elseif (is_dir($full)) {
      findIn($full, $index);
    } else {
      list($w, $h) = getimagesize($full);
      $a = $index[] = [$full, $w, $h];
      check(...$a);
    }
  }
}

function check($path, $w, $h) {
  global $findMinWidth, $findMinHeight, $findMaxWidth, $findMaxHeight, $copyToDir, $checkedCount, $foundCount;
  $checkedCount++;
  if ($w >= $findMinWidth and $h >= $findMinHeight and
      $w <= $findMaxWidth and $h <= $findMaxHeight) {
    echo ++$foundCount, "\t $path", PHP_EOL;
    if ($copyToDir) {
      $name = basename($path);    // .../foo.bmp
      if (preg_match('/^\d+-\d+(\.\w+)$/', $name, $match)) {  // .../foo.def/1-3.png
        $name = basename(dirname($path))."-$name";
      }
      return copy($path, "$copyToDir/$foundCount-$name");
    }
  }
}
