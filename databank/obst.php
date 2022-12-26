#!/bin/env php
<?php
// This script is standalone, independent from other HeroWO scripts on purpose
// to allow cross-checking ObjectStore implementations.

set_error_handler(function ($severity, $msg, $file, $line) {
  throw new ErrorException($msg, 0, $severity, $file, $line);
}, -1);

array_shift($argv);
$jsonFile = $mapProp = $drawMap = $saveJSON = $saveSub = $csvProps = null;
$showSchema = $hideFalse = $matchString = $index = $atAll = null;
$jsonKey = [];
$csvDelimiter = ',';
$ellipsize = true;
$at = [];

while (null !== $arg = array_shift($argv)) {
  if ($arg[0] === '-' and $arg !== '-') {
    $canTakeNext = ($argv and strncmp($argv[0], '-', 1));
    switch ($arg) {
      case '-h':
        $jsonFile = null;
        break 2;
      case '-at':
        $at[] = array_shift($argv);
        break;
      case '-a':
        $atAll = true;
        break;
      case '-f':
        $ellipsize = false;
        break;
      case '-ma':
        $showSchema = true;
        break;
      case '-m':
      case '-M':
        $drawMap = $arg === '-m';
        break;
      case '-mp':
        $mapProp = array_shift($argv);
        break;
      case '-i':
      case '-ii':
        $index = ($canTakeNext ? explode(',', array_shift($argv)) : []) +
                 ['', 80, 2, 1];
        $index[4] = $arg === '-ii';
        break;
      case '-j':
        $saveJSON = array_shift($argv);
        break;
      case '-js':
        $saveSub = true;
        break;
      case '-k':
        $jsonKey = explode('.', array_shift($argv));
        break;
      case '-s':
        $atAll = true;
        $matchString = array_shift($argv);
        break;
      case '-t':
        $hideFalse = true;
        break;
      case '-c':
        $atAll = true;
        $arg = $canTakeNext ? array_shift($argv) : '';
        if (preg_match('/^[^\w.]/', $arg)) {
          $csvDelimiter = $arg[0];
          $arg = substr($arg, 1);
        }
        $csvProps = strlen($arg) ? array_map('trim', explode(',', $arg)) : true;
        break;
      default:
        if (((string) (int) $arg) === $arg) {
          $at[] = $arg;   // -at -N
        } else {
          throw new Exception("Invalid -option: $arg.");
        }
    }
  } elseif (!$jsonFile) {
    $jsonFile = $arg;
  } else {
    $at[] = $arg;
  }
}

foreach ($at as &$ref) {
  $ref = array_pad(array_map('intval', preg_split('/[^\d-]/', $ref)), 3, 0);
}

if (!is_file($jsonFile) and $jsonFile !== '-') {
  echo <<<HELP
Usage: obst.php [-options] (store.json|-) [[-]at[ at...]]
Pass '-' to read stdin

Options:
  -h              show this help
  -at X[,Y[,Z]]   show object; can give multiple times; can follow file name
  -at -N          same but address by |N|; auto-adjusts if N points to property
  -a              in absence of -at, show all objects
  -f              output values or malformed input in full, even if long;
                  normal or -c mode; use with -k to extract parts of big JSON
  -ma             show info (sche-ma, counts, etc.); default if no -at -a -j
  -m or -M        do draw (-m) or hide (-M) map; default depends on dimensions
  -mp PROP        use this property in drawing map;  . empty, # truthy, + falsy
  -i [[=]F,L,M,P] output name/ID index from <store>ID.json or treat stdin as
                  one; (=) sort by ID, not name; (F)ilter names by prefix;
                  (L)ine length (80), (M) between columns (2), (P) before ID (1)
  -ii [=]F[,...]  as -i but on single match act as -at
  -k SU.B.KE.Y    pretend store.json consists of data under this key
  -t              hide properties with false values, in normal or -j mode
  -s SUBSTRING    skip rows if not in stringified, in normal -j -c; implies -a
  -j FILE.JSON    save all objects as an easy to parse JSON
  -js             used with -j: attempt to decode sub-stores
  -c [;][P,P...]  output CSV with P columns; special: .n .l .x .y .z .i .i1
                  .line; ';' enables Excel mode; implies -a if no -at

Note on -js:
  Store JSON lacks some information needed to reliably process sub-stores:
  it has sub-stores' schemas but no other parameters like strideX or whether
  it's layered or not. Additionally, if a sub-store is part of a union,
  there is no way to know which property of the union is used in a concrete
  object. -js treats all sub-store properties which have arrays value as
  using the (only) sub-store property in the union, non-layered, 1D, with
  strideX = array length / sub-schema length. Errors during decoding
  result in that value being left intact, but not all conditions raise errors.

Note on -t:
  Two special store values exist: null ("no object here") and false ("unset
  property" or "property with the value of false"). For some schemas, the latter
  may occupy the majority of output, making it hard to examine visually.
  -t compacts the output, at the expense of missing such properties.
  While -s skips objects, -t skips properties (object parts).
HELP;
  exit(1);
}

restart:
$source = file_get_contents($jsonFile === '-' ? 'php://stdin'
  : ($index ? preg_replace('/(\.json)?$/ui', 'ID\0', $jsonFile, 1) : $jsonFile));
$json = json_decode($source);
$error = json_last_error() !== JSON_ERROR_NONE;

if (!$index and !$error) {
  foreach ($jsonKey as $key) {
    if (!is_array($json) and !is_object($json)) {
      fprintf(STDERR, 'Trying to descend (%s) into %s%s', $key, gettype($json), PHP_EOL);
      exit(6);
    }

    try {
      $json = is_array($json) ? $json[$key] : $json->$key;
    } catch (Throwable $e) {
      $keys = array_keys((array) $json);
      sort($keys);
      fprintf(STDERR, 'No key %s in %s; have: %s%s', $key, gettype($json), join(', ', $keys), PHP_EOL);
      exit(7);
    }
  }
}

if ($error or (!$index and
     (!isset($json->strideX) or !isset($json->strideY) or !isset($json->strideZ) or
      !isset($json->schema) or !isset($json->layers)))) {
  echo substr($error ? $source : json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), 0, $ellipsize ? 1000 : PHP_INT_MAX), PHP_EOL;
  fwrite(STDERR, '---'.PHP_EOL);
  fprintf(STDERR, 'Error: %s%s', $error ? 'malformed JSON: '.json_last_error_msg() : 'supplied JSON is not an ObjectStore', PHP_EOL);
  exit(2);
}

if ($index) {
  list($prefix, $maxColumn, $margin, $padding, $atIfSingle) = $index;
  if ($sortByID = !strncmp($prefix, '=', 1)) {
    $prefix = substr($prefix, 1);
  }
  if (strlen($prefix)) {
    foreach ($json as $name => $id) {
      if (strncasecmp($name, $prefix, strlen($prefix))) { unset($json->$name); }
    }
    switch (count((array) $json)) {
      case 0:
        fprintf(STDERR, 'No names match prefix: %s%s', $prefix, PHP_EOL);
        exit(3);
      case 1:
        if ($atIfSingle) {
          $index = null;
          $at[] = [reset($json), 0, 0];
          goto restart;
        }
    }
  }
  $json = (array) $json;
  $sortByID ? asort($json) : ksort($json, SORT_FLAG_CASE | SORT_NATURAL);
  $longestKey = max(array_map('strlen', array_keys($json)));
  $longestValue = strlen(max($json));
  $longest = $longestKey + $padding + $longestValue;
  $columns = floor($maxColumn / $longest);
  $columns = floor(($maxColumn - $margin * ($columns - 1)) / $longest) ?: 1;
  $json = array_chunk($json, ceil(count($json) / $columns), true);
  foreach ($json[0] as $v) {
    foreach ($json as $i => &$ref) {
      echo str_pad(key($ref), $longestKey), str_repeat(' ', $padding);
      echo str_pad(array_shift($ref), $longestValue, ' ', STR_PAD_LEFT);
      if (isset($json[$i + 1])) {
        echo str_repeat(' ', $margin);
      }
    }
    echo PHP_EOL;
  }
  exit;
}

$skipObject = function (array $object) use ($matchString) {
  if ($matchString !== null and
      stripos(var_export($object, true), $matchString) === false) {
    return true;
  }
};

$csvProps and ob_start();
$at or $atAll or $saveJSON or $showSchema = true;

if ($showSchema) {
  echo 'Schema:', PHP_EOL;
  echoSchema($json->schema, (array) ($json->sub ?? []));
}

if (!$json->strideX) {
  fwrite(STDERR, 'Empty store!'.PHP_EOL);
  exit(4);
}

list($schemaLength, $schema, $paddingCount) = parseSchema($json->schema);

if (!$schemaLength) {
  fwrite(STDERR, 'Empty schema!'.PHP_EOL);
  exit(5);
}

$fullLength = $schemaLength * $json->strideX * $json->strideY * $json->strideZ;

if ($showSchema) {
  printf('Stride X/Y/Z        = %d %d %d%s',
    $json->strideX, $json->strideY, $json->strideZ, PHP_EOL);
  printf('Item count          = %d%s', array_sum(array_map('count', $json->layers)), PHP_EOL);
  printf('Layer count         = %d%s', count($json->layers), PHP_EOL);

  $expected = array_fill(0, count($json->layers), $fullLength);
  if ($expected !== array_map('count', $json->layers)) {
    printf('Trimmed layers      = full: %s  stored (%d%%): %s%s',
      $fullLength,
      array_sum(array_map('count', $json->layers)) / $fullLength / count($json->layers) * 100,
      join(' ', array_map('count', $json->layers)),
      PHP_EOL);
  }

  $emptyCount = $filledCount = 0;
  $filledOnLayer = array_fill(0, count($json->layers), 0);

  foreach ($json->layers as $l => $layer) {
    for ($n = 0; $n < count($layer); $n += $schemaLength) {
      ${isset($layer[$n]) ? 'filledCount' : 'emptyCount'}++;
      isset($layer[$n]) and $filledOnLayer[$l]++;
    }
  }

  $allCount = $emptyCount + $filledCount;

  printf('Object count        = %d%s', $filledCount, PHP_EOL);
  printf('Padding items       = %d (%d%%)%s', $paddingCount * $filledCount, $paddingCount / $schemaLength * 100, PHP_EOL);
  printf('Empty cells         = %d (%d%%)%s', $emptyCount, $allCount ? $emptyCount / $allCount * 100 : 0, PHP_EOL);
  if (count($json->layers) > 1) {
    printf('Objects on layer    = %s%s', join(' ', $filledOnLayer), PHP_EOL);
  }
}

if ($saveJSON !== null) {
  $converted = unpackObjects(
    $json->schema, $saveSub ? (array) ($json->sub ?? []) : [],
    $json->strideX, $json->strideY, $json->strideZ, $json->layers,
    compact('hideFalse', 'skipObject')
  );
  file_put_contents($saveJSON, json_encode($converted, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
  echo PHP_EOL;
  echo "Saved objects to ", realpath($saveJSON), PHP_EOL;
}

if ($drawMap === null ? $json->strideX + $json->strideY + $json->strideZ <= 200 : $drawMap) {
  for ($n = 0; $n < $fullLength; $n += $schemaLength) {
    if ($n % ($s = $json->strideY * $json->strideX * $schemaLength) == 0) {
      echo PHP_EOL;
      echo str_pad(' Z = '.($n / $s).' ', $json->strideX + 4, ' ', STR_PAD_BOTH), PHP_EOL;
      echo '    ', str_pad('', $json->strideX, '0123456789');
    }
    if ($n % ($s = $json->strideX * $schemaLength) == 0) {
      printf('%s% 3d ', PHP_EOL, $n / $s % $json->strideY);
    }
    $value = 0;
    foreach ($json->layers as $layer) {
      $cur = $layer[$n + ($mapProp === null ? 0 : $json->schema->$mapProp)] ?? /*if trimmed*/ null;
      $value = max($value, isset($cur) ? !!$cur + 1 : 0);
    }
    echo '.+#'[$value];
  }
  echo PHP_EOL;
}

if ($csvProps) {
  if ($csvProps === true) {
    $csvProps = ['.n', '.l', '.x', '.y', '.z', '.i', '.line'];

    foreach ($json->schema as $prop => $i) {
      strncmp($prop, '_padding', 8) and $csvProps[] = $prop;
    }
  }

  // Echo UTF-8 BOM, to drive Excel off ANSI.
  $csvDelimiter === ';' and fprintf(STDOUT, "\xEF\xBB\xBF");
  fputcsv(STDOUT, $csvProps, $csvDelimiter);
}

if ($atAll and !$at) {
  for ($n = 0; $n < count($json->layers[0]); $n += $schemaLength) {
    isset($json->layers[0][$n]) and $at[] = [-$n, 0, 0];
  }
}

$index = 0;

foreach ($at as [$x, $y, $z]) {
  if ($x < 0) {
    $n = -$x - -$x % $schemaLength;
    $rem = $n / $schemaLength;
    $x = $rem % $json->strideX;
    $rem = ($rem - $x) / $json->strideX;
    $y = $rem % $json->strideY;
    $z = ($rem - $y) / $json->strideY;
  } else {
    $n = $schemaLength * ($x + $y * $json->strideX + $z * $json->strideY * $json->strideX);
  }

  $line = '?';

  if (!$jsonKey) {
    // {                  +1
    //   "schema": {      +1
    //     ...              + count($json->schema)
    //   },               +1
    //   "sub": optional, +#
    //   "strideX": #,    +1
    //   "strideY": #,    +1
    //   "strideZ": #,    +1
    //   "layers": [      +1
    //     [              +1
    $line = 1 /*1-based line numbers*/ + 8 +
            (isset($json->sub) ? substr_count(json_encode($json->sub, JSON_PRETTY_PRINT), "\n") + 1 : 0) +
            count((array) $json->schema) + $n;
  }

  $echoHeader = function () use (&$echoHeader, $json, $x, $y, $z, $n, $line) {
    $echoHeader = function () {};

    // Line number is only correct if the input is using the fixed format, i.e.
    // order of fields (schema, strideX/Y) and PHP's pretty printing.
    printf('%sObjects at (%d:%d:%d), n = %d, line = %s:%s',
      PHP_EOL, $x, $y, $z, $n, $line, PHP_EOL);
  };

  foreach ($json->layers as $l => $layer) {
    if ($csvProps and
        !$skipObject(array_slice($layer, $n, $schemaLength))) {
      $thisProps = [];

      foreach ($csvProps as $prop) {
        switch ($prop) {
          case '.i1':   // 1-based ".i"
            $index or $index++;
          case '.i':
            $value = $index++;
            break;
          default:
            $value = $prop[0] === '.'
              ? ${substr($prop, 1)}
              : $layer[$n + $json->schema->$prop];
        }
        $thisProps[] = is_scalar($value) ? $value : var_export($value, true);
      }

      fputcsv(STDOUT, $thisProps, $csvDelimiter);
    }

    foreach ($schema as $i => $props) {
      $value = $layer[$n + $i] ?? null; // can be missing even for in-bounds n if the layer was trimmed

      if ($value === null) {
        if (!$l) {
          $echoHeader();
          echo '   ', $n >= $fullLength ? 'Out of bounds!' : '(none)', PHP_EOL;
        }
        break 2;
      }

      if (!$i) {
        if ($skipObject(array_slice($layer, $n, $schemaLength))) {
          continue 2;
        }

        $echoHeader();

        if ($l) {
          printf('(Layer %d, line = %s)%s',
            $l + 1,
            // ],         +1
            // [          +1
            is_int($line) ? $line + $l * (count($layer) + 2) : $line,
            PHP_EOL);
        }
      }

      if ($value === false and $hideFalse) {
        continue;
      }

      $export = var_export($value, true);
      for ($count = $pos = -1;
           $ellipsize and false !== $pos = strpos($export, "\n", $pos + 1);
           $count++) {
        // 1 line after "=" + 10 lines of output + "[remaining...]"
        if ($count > 8) {
          $count = substr_count($export, "\n", $pos);
          $export = substr($export, 0, $pos)."\n\t[remaining $count lines omitted in absence of -f]";
          break;
        }
      }

      printf('  % 2d. %-20s = %s%s',
        $i,
        join(' or ', $schema[$i]),
        str_replace("\n", PHP_EOL.'      ', $export),
        PHP_EOL
      );
    }
  }
}

if ($at and array_filter((array) ($json->sub ?? []))) {
  echo PHP_EOL;
  echo 'Tip: use -js to examine properties in sub-stores', PHP_EOL;
}

$csvProps and ob_end_clean();

function parseSchema($originalSchema) {
  $originalSchema = (array) $originalSchema;

  if (!$originalSchema) {   // empty schema, meant for appendSchema()
    return [0, [], 0];
  }

  $schemaLength = max($originalSchema) + 1;
  $schema = array_fill(0, $schemaLength, []);
  $paddingCount = 0;

  foreach ($originalSchema as $prop => $i) {
    if (strncmp($prop, '_padding', 8)) {
      $schema[$i][] = $prop;
    } else {
      $paddingCount++;
      array_pop($schema);
    }
  }

  return [$schemaLength, $schema, $paddingCount];
}

function echoSchema($schema, array $subSchemas, $indent = '') {
  list($schemaLength, $schema, $paddingCount) = parseSchema($schema);

  for ($i = 0; $i < $schemaLength - $paddingCount; $i++) {
    if (empty($schema[$i])) {
      echo $indent, "Schema has a gap at $i!", PHP_EOL;
      continue;
    }

    printf('%s  %1s%1s% 2d. %s%s',
      $indent,
      isset($subSchemas[$i]) ? (array) $subSchemas[$i] ? '*' : '#' : '',
      empty($subSchemas[$i + $schemaLength]) ? '' : '+',
      $i,
      join(', ', $schema[$i]),
      PHP_EOL);
  }

  if ($paddingCount) {
    printf('%s        + %s padding propert%s%s',
      $indent, $paddingCount, $paddingCount === 1 ? 'y' : 'ies',
      PHP_EOL);
  }

  echo PHP_EOL;

  printf('%sObject entry length = %d%s', $indent, $schemaLength, PHP_EOL);

  $exp = log10($schemaLength) / log10(2);
  if (floor($exp) === $exp) {
    printf('%s** Power of 2       = %s%s',
      $indent,
      !$exp ? 'single property' : '2^'.$exp,
      PHP_EOL);
  }

  echo PHP_EOL;

  foreach ($subSchemas as $i => $subSchema) {
    if (!isset($subSchema)) {
      continue;
    } elseif ($i < $schemaLength) {
      $subSchema = (array) $subSchema;
      $ind = "$indent  ";
      printf('%sSchema of %sstore in %s%s%s',
        $ind,
        str_repeat('sub-', strlen($ind) / 2),
        join(' or ', $schema[$i]),
        $subSchema ? ':' : ' is empty!'.PHP_EOL,
        PHP_EOL);
      $subSchema and echoSchema($subSchema, (array) ($subSchemas[$schemaLength + $i] ?? []), $ind);
    } elseif (!isset($subSchemas[$i - $schemaLength])) {
      echo $indent, "Sub-schema for $i is allocated but $i is not a sub-store!", PHP_EOL, PHP_EOL;
    }
  }
}

function unpackObjects($schema, array $subSchemas,
    $strideX, $strideY, $strideZ, array $layers, array $options = []) {
  list($schemaLength, $schema, $paddingCount) = parseSchema($schema);
  $keys = array_map(function ($a) { return join('_', $a); }, $schema);
  // [z => [y => [x => [obj1, obj2, ...]]]]
  // objN = [prop1 => v, prop2_orprop3 => v, ...]
  $converted = [];
  for ($z = 0; $z < $strideZ; $z++) {
    for ($y = 0; $y < $strideY; $y++) {
      for ($x = 0; $x < $strideX; $x++) {
        $n = $schemaLength * ($x + $y * $strideX + $z * $strideY * $strideX);
        for ($l = 0; $n < count($layers[$l] ?? []); $l++) {
          $object = array_slice($layers[$l], $n, $schemaLength);
          if ($options['skipObject']($object)) {
            continue;
          }
          foreach ($object as $i => &$ref) {
            $sub = $subSchemas[$i] ?? null;
            if (!$sub) {
              continue;
            } elseif (!$ref) {
              $ref = [];
            } else {
              try {
                $subX = count($ref) / parseSchema($sub)[0];
                if (fmod($subX, 1.0) !== 0.0) {
                  throw new Exception("layer length ".count($ref)." is not even to schema length");
                }
                $ref = unpackObjects(
                  $sub,
                  (array) ($subSchemas[$i + $schemaLength] ?? []),
                  $subX, 1, 1,
                  [$ref],   // assuming 1D, non-layered
                  $options
                );
              } catch (Throwable $e) {
                printf("Unable to decode sub-store %d:%d:%d:%s, leaving raw: %s%s",
                  $x, $y, $z,
                  $keys[$i], trim($e->getMessage()), PHP_EOL);
              }
            }
          }
          if (isset($object[0])) {
            $ref = &$converted[$z][$y][$x][$l];
            $ref = array_combine($keys, array_slice($object, 0, $schemaLength - $paddingCount));
            if (!empty($options['hideFalse'])) {
              $ref = array_filter($ref, function ($v) { return $v !== false; });
            }
          }
        }
      }
    }
  }
  return $converted;
}
