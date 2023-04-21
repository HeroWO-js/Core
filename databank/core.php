<?php
// Collection of base library classes and utility functions used for
// databank generation and file transformations (images, etc.).

error_reporting(-1);
ignore_user_abort(false);
setlocale(LC_ALL, 'en_US.UTF-8');
mb_internal_encoding('UTF-8');
date_default_timezone_set('UTC');

set_error_handler(function ($severity, $msg, $file, $line) {
  throw new ErrorException($msg, 0, $severity, $file, $line);
}, -1);

global $encodeJsonFlags;
// JSON_PRESERVE_ZERO_FRACTION preserves floats as floats which is required for
// serializing staticEffects.json in databank.php (float-fix).
$encodeJsonFlags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION;

function encodeJSON($data, $flags = null) {
  global $encodeJsonFlags;
  return json_encode($data, $flags === null ? $encodeJsonFlags : $flags);
}

// Checks if a value coming from ObjectStore is a filled one, i.e. not indicating
// "no object" (null) or "no property value" (false). Indidentally, false can
// also stand for "have value, the false" but it's a known ObjectStore limitation.
function provided($v) {
  return $v !== null and $v !== false;
}

// Returns array of coordinates of every point within $radius of (x0;y0).
function circle($x0, $y0, $radius, $maxX, $maxY) {
  $radius = (int) $radius;
  $res = [];

  for ($dx = -$radius; $dx <= $radius; $dx++) {
    for ($dy = -$radius; $dy <= $radius; $dy++) {
      if (0 <= $x = $x0 + $dx and
          0 <= $y = $y0 + $dy and
          $x <= $maxX and
          $y <= $maxY and
          $dx ** 2 + $dy ** 2 <= $radius ** 2) {
        $res[] = [$x, $y, $dx, $dy];
      }
    }
  }

  return $res;
}

// Returns a new GD image with properly enabled alpha-channel.
function newTransparentImage($width, $height) {
  $im = imagecreatetruecolor($width, $height);
  enableImageTransparency($im);
  // By default the image starts with a black opaque background.
  imagefill($im, 0, 0, imagecolorallocatealpha($im, 0, 0, 0, 127));
  return $im;
}

// Does 4chan-level magic to properly enable alpha-channel on GD $im.
function enableImageTransparency($im) {
  imagealphablending($im, true);
  // By default the PNG gets transparent pixels replaced with black on save.
  imagesavealpha($im, true);
  return $im;
}

// Returns a copy of $im.
function imageclone($im) {
  $clone = imagecrop($im, ['x' => 0, 'y' => 0, 'width' => imagesx($im), 'height' => imagesy($im)]);
  // imagecrop() used to preserve original image's transparency settings and
  // palette but it no longer does so since PHP 8.
  imagepalettecopy($clone, $im);
  return enableImageTransparency($clone);
}

// Changes pixels of $im having special DEF color values (like adventure map object's shadow or active creature's outline).
//
// If $selection is unset, 'selection...' members in $specialColor are made
// transparent ('selection') or equal to non-'selection...'
// ('selectionDeepShadow', etc.), else they all are replaced with this color.
// This is for Spritedef and creature images ($41 and $42).
//
// For adventure objects ($43), $selection is used for 'flagColor' and works
// the same.
function unmaskBMP($im, array $specialColors, $selection = null) {
  imagepalettetotruecolor($im);
  $transparent = imagecolorallocatealpha($im, 0, 0, 0, 127);
  // With the default alpha blending, imagesetpixel(..., $transparent) will
  // have no effect since GD would overlay the transparent pixel instead of
  // replacing the underlying pixel with that transparent pixel.
  imagealphablending($im, false);
  $shadows = [
    'faintShadow'   => 91,  // 72%
    'lightShadow'   => 82,  // 64%
    'mediumShadow'  => 72,  // 57%
    'deepShadow'    => 62,  // 49%
  ];
  $hadSelection = false;
  $tbox = null;   // x1 y1 x2 y2
  $w = imagesx($im);
  $h = imagesy($im);
  for ($x = $w; $x--; ) {
    for ($y = $h; $y--; ) {
      $rgb = imagecolorat($im, $x, $y);
      $spec = $specialColors[$rgb] ?? null;
      switch ($spec) {
        case 'transparent':
          imagesetpixel($im, $x, $y, $transparent);
          continue 2;
        case 'flagColor':
        case 'selection':
          $spec = 'selection'.'transparent';
        case 'selectionDeepShadow':
        case 'selectionFaintShadow':
          $spec = isset($selection) ? 'selection' : lcfirst(substr($spec, 9));
          $hadSelection = true;
        case 'faintShadow':
        case 'lightShadow':
        case 'mediumShadow':
        case 'deepShadow':
          $color = $$spec ?? imagecolorallocatealpha($im, 0, 0, 0, $shadows[$spec]);
          imagesetpixel($im, $x, $y, $color);
          break;
      }
      // x2/y2 are not included, i.e. they are the closest transparent pixels.
      $tbox = combineRect([$x, $y, $x + 1, $y + 1], $tbox);
    }
  }
  // Returned $transparent can be used to compare with imagecolorat().
  // For cyan (#00FFFF) it equals 0x7F000000.
  return [$w, $h, $transparent, $tbox, $hadSelection];
}

// Returns [x0, y0, y1, y1] coordinates of a rectangle encompassing both given rectangles.
function combineRect(array $r1, array $r2 = null) {
  if ($r2) {
    $r1[0] > $r2[0] and $r1[0] = $r2[0];
    $r1[1] > $r2[1] and $r1[1] = $r2[1];
    $r1[2] < $r2[2] and $r1[2] = $r2[2];
    $r1[3] < $r2[3] and $r1[3] = $r2[3];
  }
  return $r1;
}

// Returns array of [R, G, B] colors defined by palette $file.
//
// This is of course not a general-purpose parser, it works with SoD PALs only.
function parsePAL($file) {
  $h = fopen($file, 'rb');
  $dword = function () use ($h) {
    return unpack('V', fread($h, 4))[1];
  };
  try {
    if (fread($h, 4) !== 'RIFF') {
      throw new Exception('Invalid PAL magic.');
    }
    $length = $dword();
    while (!feof($h) and ftell($h) < $length) {
      if (fread($h, 8) !== 'PAL data') {
        fseek($h, $dword(), SEEK_CUR);
      } else {
        $chunkLength = $dword();
        list(, $version, $colorCount) = unpack('v2', fread($h, 4));
        if ($version !== 0x300) {
          throw new Exception('Invalid "PAL data" chunk version.');
        }
        $colors = [];
        while (0 <= $chunkLength -= 4 and $colorCount--) {
          list(, $r, $g, $b, $a) = unpack('C4', fread($h, 4));
          if ($a) {
            throw new Exception('Invalid RGBQUAD.');
          }
          $colors[] = [$r, $g, $b];
        }
        if ($colorCount !== -1) {
          throw new Exception('Insufficient number of RGBQUADs.');
        }
        return $colors;
      }
    }
    throw new Exception('Found no "PAL data" chunk.');
  } finally {
    fclose($h);
  }
}

// Returns colors grouped by player. When presenting game UI for user playing for specific color (e.g. Tan player), certain bitmaps must have certain colors replaced with colors from that player's group (e.g. blues with tans).
//
// Returns a hash 'player name' => array of [R, G, B]. Names are well-known and
// match SoD's PLCOLORS.TXT.
function parsePlayersPAL($file) {
  static $names = ['red', 'blue', 'tan', 'green', 'orange', 'purple', 'teal', 'pink'];
  $pal = parsePAL($file);
  if (count($pal) !== 256) {
    throw new Exception('PLAYERS.PAL must contain 256 colors, not '.count($pal).'.');
  }
  $pal = array_chunk($pal, 32);
  foreach ($pal as &$ref) {
    $ref = array_combine(range(256 - 32, 255), $ref);
  }
  return array_combine($names, $pal);
}

// Tells if the $im bitmap is one that needs some colors replaced with player's colors when used in game UI.
//
// SoD is using Blue's colors in BMPs and we can use this fact to identify
// images in need of recoloring.
function isRecolorableBMP(array $palColors, $im) {
  if (imagecolorstotal($im) === 256) {
    foreach ($palColors as $i => $color) {
      $color = array_combine(['red', 'green', 'blue'], $color) + ['alpha' => 0];
      if (imagecolorsforindex($im, $i) !== $color) {
        return false;
      }
    }
    return true;
  }
}

// Replaces special colors in $im bitmap with player's colors.
function recolorBMP(array $palColors, $im) {
  foreach ($palColors as $i => [$r, $g, $b]) {
    imagecolorset($im, $i, $r, $g, $b);
  }
  return $im;
}

// Initializes classes in core.php by using data (like types of in-game resources) that must be obtained elsewhere.
//
// Only call once per process.
function unrollStores(array $options) {
  extract($options, EXTR_SKIP);

  MapPlayer::unrollKeys('resources', $constants['resources'], 'intval');
  AObject::$compact['artifacts']['strideX'] = max($artifactSlotsID) + 1;
  AObject::$compact['available']['strideX'] = max($buildingsID) + 1;

  $print = fopen('php://temp', 'w+');

  autoSchema(AObject::class, [
    'print' => $print,
    'allTypes' => AObject::type,
    'unroll' => [
      //'resources_RESOURCE' => $constants['resources'],
    ],
  ]);

  rewind($print);
  AObject::$autoSchemaPrint = stream_get_contents($print);
  fclose($print);
}

// PHP version of ObjectStore.js. Limited reading capabilities, mostly oriented at writing new stores.
class ObjectStore implements JsonSerializable {
  protected $schema;
  protected $sub;
  protected $strideX;
  protected $strideY;
  protected $strideZ;
  protected $layers;

  // Creates a new one-dimensional store from an array of StoredObject's.
  //
  // Strides: X = count($objects), Y = 1, Z = 1.
  // $objects = array (X) of (StoredObject or array (L) of StoredObject).
  // from1D([2 => $o1, 4 => $o2, 6 => $o3])
  //   //=> [ [null, null, $o1..., null, $o2..., null, $o3...] ]
  // from1D([1 => [$o1], 3 => [$o2, $o3]])
  //   //=> [ [null, $o1..., null, $o2...], [null, null, null, $o3...] ]
  static function from1D(array $objects, $options = []) {
    is_object($options) and $options = get_class($options);
    is_string($options) and $options = ['class' => $options];
    if (($options['strideY'] ?? 0) > 1) {
      throw new Exception("from1D() received strideY > 1.");
    }
    return static::from2D([$objects], $options);
  }

  // Creates a new two-dimensional store from an array of StoredObject's.
  //
  // Strides: X = count(first($objects)), Y = count($objects), Z = 1.
  // $objects = array (Y) of arrays (X) of (StoredObject or array (L) of
  // StoredObject).
  // from2D([1 => [2 => [$o1]], 3 => [4 => [$o2, $o3]]])
  //   //=> [ [null, $o1..., null, $o2...], [null, null, null, $o3...] ]
  static function from2D(array $objects, array $options = []) {
    if (($options['strideZ'] ?? 0) > 1) {
      throw new Exception("from2D() received strideZ > 1.");
    }
    return static::from3D([$objects], $options);
  }

  // Creates a new three-dimensional store from an array of StoredObject's.
  //
  //> objects
  //> options array
  //  `> schema
  //  `> subSchemas
  //  `> class `- used to determine `'schema (if missing) and `'subSchemas
  //     (if missing)
  //  `> strideX `- minimal X coord; if `'$objects has a key that is greater
  //     than this option then that key is used
  //  `> strideY
  //  `> strideZ
  //  `> layerCount `- note that keeping this at 0 while `'strideX is not 0
  //     means result will be at least `'strideX if there is at least one object;
  //     if there isn't then result will be `[[]`]; to ensure it's never empty
  //     set both `'layerCount and `'strideX
  //  `> padding null auto-detect`, integer
  //  `> trimLayers bool`, int 1 `- if `'1, optimize layers[1+] by removing no-object entries
  //     (`'null) from the end of array, if `'true does this for all layers
  //
  // Strides: X = count(first(first($objects))), Y = count(first($objects)),
  // Z = count($objects).
  // $objects = array (Z) of arrays (Y) of arrays (X) of (StoredObject or
  // array (L) of StoredObject).
  //
  // Keys of Z/Y/X arrays must be non-negative numbers and may have gaps, i.e.
  // may be of different dimensions (final strides are determined from max Z/Y/X).
  // Keys of L arrays must be sequential numbers starting from 0
  // (=== array_values()). All 4 arrays can have members in
  // any order (for foreach) as long as these key requirements are met.
  //
  // Members of the X array must be either arrays of StoredObject (then multiple
  // objects may be located in the same cell, L >= 1) or single StoredObject
  // (then L = 1).
  // All StoredObject-s must have the same schema().
  //
  // $objects can contain no objects - this creates an empty store
  // using $options. If the store is gauranteed to be non-empty
  // then $options can be omitted to determine stride, schema, etc. automatically.
  //
  // Note: this will call normalize() which will mutate all objects.
  static function from3D(array $objects, array $options = []) {
    extract($options + [
      'schema' => null,
      'subSchemas' => null,
      'class' => null,
      'strideX' => 0,
      'strideY' => 0,
      'strideZ' => 0,
      'layerCount' => 0,
      'padding' => null,
      'trimLayers' => true,
    ], EXTR_SKIP);

    // Determine array dimensions (strides) and object schema.
    foreach ($objects as $z => $ys) {
      $strideZ <= $z and $strideZ = $z + 1;
      foreach ($ys as $y => $xs) {
        $strideY <= $y and $strideY = $y + 1;
        foreach ($xs as $x => $layerObjects) {
          $strideX <= $x and $strideX = $x + 1;
          if ($z < 0 or $y < 0 or $x < 0) {
            throw new Exception('ObjectStore keys must be non-negative numbers.');
          }
          // Convert array-less L-s L => StoredObject into L => [StoredObject].
          if (!is_array($layerObjects)) {
            $layerObjects = $objects[$z][$y][$x] = [$objects[$z][$y][$x]];
          }
          $layerCount < count($layerObjects) and $layerCount = count($layerObjects);
          if ($class === null and $layerObjects) {
            $class = get_class($layerObjects[0]);
          }
        }
      }
    }

    // Imagine calling from1D([], Some::class); $strideX retains default value
    // such as 0 because all $layerObjects are empty and $strideX is not assigned.
    // However, assignment for $strideY/Z happens outside of $layerObjects loop.
    // To avoid confusing ObjectStore parsers with strideY/Z being non-0
    // in an empty store, forcefully set them to 0.
    if (!$strideX) {
      $strideY = $strideZ = 0;
    }

    if ($padding === null) {
      $padding = (!$strideX or ($strideY === 1 and $strideZ === 1));
    }

    $schema or $schema = (new $class)->schema();
    $propCount = static::padSchema($schema, $padding);
    $subSchemas or $subSchemas = (new $class)->subSchemas($padding);

    if (!$propCount and $layerCount) {
      throw new Exception('ObjectStore schema can be empty only if there are no objects.');
    }

    $layers = array_fill(0, $layerCount,
      array_fill(0, $strideZ * $strideY * $strideX * $propCount, null));

    foreach ($objects as $z => $ys) {
      foreach ($ys as $y => $xs) {
        foreach ($xs as $x => $layerObjects) {
          foreach ($layerObjects as $l => $obj) {
            $n = $propCount * ($x + $y * $strideX + $z * $strideY * $strideX);
            $obj->normalize(true)
              ->serializeTo($layers[$l], $n, $schema);
          }
        }
      }
    }

    // Trimming all but the first layer is always safe
    // because ObjectStore.js adjusts lengths for all but the first layer early in
    // constructor.
    if ($trimLayers) {
      foreach ($layers as $l => &$ref) {
        if ($trimLayers === true or $l > 0) {
          for ($n = count($ref) - 1; $n >= 0 and $ref[$n] === null; $n -= $propCount) ;
          array_splice($ref, $n + 1);
        }
      }
    }

    return new static($schema, $strideX, $strideY, $strideZ, $layers, $subSchemas);
  }

  // Unserializes store data into an instance of this class.
  static function from(array $props) {
    return new static($props['schema'],
                      $props['strideX'], $props['strideY'], $props['strideZ'],
                      $props['layers'], $props['sub'] ?? []);
  }

  // Unserializes store data read from a JSON file into an instance of this class.
  static function fromFile($path) {
    return static::from(json_decode(file_get_contents($path), true));
  }

  // Adds _padding... keys to $schema so that it has at least $count members.
  //
  // If $count is true, uses the nearest power-of-two number to enable optimizations in ObjectStore.js.
  static function padSchema(array &$schema, $count = true) {
    if ($schema) {
      $propCount = max($schema) + 1;
      if ($count === true) {
        for ($count = 0; $propCount > pow(2, $count); $count++) ;
      }
      while ($propCount < pow(2, $count)) {
        $schema["_padding$propCount"] = $propCount++;
      }
      return $propCount;
    }
  }

  function __construct(array $schema, $strideX, $strideY, $strideZ, array $layers, array $subSchemas = []) {
    $this->schema = $schema;
    $this->strideX = $strideX;
    $this->strideY = $strideY;
    $this->strideZ = $strideZ;
    $this->layers = $layers;
    $this->sub = $subSchemas;
  }

  // Returns data that can be put into a JSON file and read back by any ObjectStore implementation.
  #[\ReturnTypeWillChange]
  function jsonSerialize() {
    // Schema must be always an object but json_encode() serializes empty arrays as arrays (since it doesn't know they are associative). We can't use JSON_FORCE_OBJECT because it's global and because most of the time empty arrays are, well, arrays.
    //
    // This is especially a problem with JavaScript: if you unserialize such data,
    // give it to ObjectStore, call adjustSchema(), then serialize it back -
    // you will get {"schema": []} because JSON.stringify(array) only considers
    // numeric keys:
    //   var a = JSON.parse('[]'); a.prop = 1; JSON.stringify(a);
    //     //=> '[]'
    //   var a = JSON.parse('{}'); a.prop = 1; JSON.stringify(a);
    //     //=> '{"prop":1}'
    $schema = $this->schema ?: new stdClass;
    $sub = array_replace(array_fill(0, max(array_keys($this->sub) ?: [-1]) + 1, null), $this->sub);
    // Expose protected properties and add any user-set ones.
    return compact('schema', 'sub') + get_object_vars($this);
  }

  // Determines position of property's value relative to start of object data in the store's layer.
  function propertyIndex($prop) {
    return is_int($prop) ? $prop : $this->schema[$prop];
  }

  // Returns the schema this store is using.
  function schema() {
    return $this->schema;
  }

  // Returns the schema of a sub-store in this store.
  function subSchema($prop) {
    return $this->sub[$this->propertyIndex($prop)];
  }

  // Returns maximum value for X index in this store plus 1.
  function x() {
    return $this->strideX;
  }

  // Returns maximum value for Y index in this store plus 1.
  function y() {
    return $this->strideY;
  }

  // Returns maximum value for Z index in this store plus 1.
  function z() {
    return $this->strideZ;
  }

  // Returns value of the property of the object at given coordinates and level.
  function atCoords($x, $y, $z, $prop, $l = 0) {
    return $l >= count($this->layers) ? null
      : $this->layers[$l][$this->toContiguous($x, $y, $z, $prop)];
  }

  // Modifies a property's value of the object at given coordinates.
  function setAtCoords($x, $y, $z, $l, $prop, $value) {
    if ($value === null) {
      throw new Exception('Properties cannot have null/undefined values.');
    }
    $n = $this->toContiguous($x, $y, $z, $prop);
    if (!isset($this->layers[$l][$n])) {
      throw new Exception('n is out of bounds or has no object.');
    }
    $this->layers[$l][$n] = $value;
    return $this;
  }

  // Converts coordinates into a contiguous number according to this store's
  // configuration.
  function toContiguous($x, $y, $z, $prop) {
    return ($z * $this->strideX * $this->strideY + $y * $this->strideX + $x)
           * (max($this->schema) + 1) + $this->propertyIndex($prop);
  }

  // Returns an array in schema() format representing a complete object located at given contiguous number.
  function objectAtContiguous($n, $l = 0) {
    return $l >= count($this->layers) ? null
      : array_slice($this->layers[$l], $n, max($this->schema) + 1);
  }

  // Creates a new object in a 1D store.
  function append(StoredObject $entity) {
    if ($this->strideY !== 1 or $this->strideZ !== 1) {
      throw new Exception('Trying to append() to a non-1D ObjectStore.');
    }

    $n = $this->toContiguous($this->strideX++, 0, 0, 0);

    $entity->normalize(true)
      ->serializeTo($this->layers[0], $n, $this->schema);

    return $this->strideX - 1;
  }
}

// Represents a single object residing in an ObjectStore in compact form.
//
// JavaScript's ObjectRepresentation is somewhat equivalent to this class. However, this one is oriented at writing new stores, implementing normalization rules and other features.
#[AllowDynamicProperties]
abstract class StoredObject implements JsonSerializable {
  // Idempotent transformations applied to properties of this object before their values are put into ObjectStore's layer.
  //
  // Format: ( '[*]prop' => ('' | 'func' | Closure) ) | 'unrollProp'
  //
  // Normalization happens before $compact'ing.
  //
  // Functions must be idempotent (don't use 'bin2hex', 'base64_encode', etc.).
  // '*' marks an array property. Non-idempotent convertion must be done in
  // the overridden normalize() or using $compact.
  // If '', value is serialized unchanged.
  //
  // 'unrollProp' if a placeholder for later unroll() call. Classes with such
  // properties must declare "static $unrolled = [];" to avoid sharing it
  // with other classes because of inheritance. Unrolling one dimension of a 2D or 3D store is possible (see Skill->$effects_MASTERY for an example).
  static $normalize = [];

  // Internal property identifying "pseudo-sub-stores" whose data is directly part of layer values rather than a nested array.
  static $unrolled = [];

  // Irreversible transformations applied to properties of this object before their values are put into ObjectStore's layer.
  //
  // Defines ways to convert certain array properties to string. Key is property name,
  // value is either absent, empty (join all values together, inserting null into gaps), a function
  // to give to array_map() or a class name or [options] to create a sub-store.
  // Absent value calls compact_PROP() or, if none, joins members using a space.
  //
  // A sub-store prop must be an array of StoredObject-s given to from1D(). Result is non-layered. If prop must have specific dimensions then [options] array must be used instead of only 'class'. $normalize should have 'prop' => ''. Sub-stores are defined here rather than in $normalize because the latter must be idempotent and there's no way to determine if an array of null-s is an already serialized sub-store or a to-be-serialized $objects with no members. As a consequence, when serializing a StoredObject directly (not part of an ObjectStore), sub-stores are kept unserialized along with other non-compacted properties.
  //
  // As usual, a sub-store null/false property is not normalized or compacted.
  // This works as expected for sub-stores with no minimal strideX but if it
  // must have some minimal length (like artifacts) then the property must be
  // set to an array (even if an empty one). This is because sub-stores can be
  // part of a union and two properties of one union cannot both have values simultaneously, so we
  // cannot make sub-store properties default to anything or they would clash with
  // other union members. We could implement defaulting for sub-stores that are
  // not union members but for uniformity and discipline this is not done.
  //
  // Example to demonstrate a need for specific dimensions: consider two sub-stores: of Effect-s and of ObjectArtifact-s.
  // First is a simple list of objects where X is a unique ID, manipulated with
  // append() but not addAtContiguous(). Second is an "associative" array where X is slot identifier
  // (artifactSlotsID.json) and append() is not used (it's not possible to
  // create new artifact slots on run-time) - instead, artifacts are put to specific slots using addAtContiguous() (but never to an already occupied slot) and removed using removeAtContiguous(). This means the sub-store must have preallocated strideX = max(slotID) + 1 even if there are no artifacts in the last slot by the time such StoredObject is serialized (see the comment in Effect::makeIndexes() for details).
  // As a result, first's $normalize entry is 'prop' => 'Effect' and second's
  // is 'prop' => ['class' => 'ObjectArtifact', 'strideX' => max(slotID) + 1].
  // Or, if the client manually pads artifact properties of all serialized objects to max slotID,
  // it can be 'prop' => 'ObjectArtifact'.
  static $compact = [];

  // Creates a "pseudo-sub-store" whose data is directly part of layer values rather than a nested array. Configuration is defined by sub-store's "pseudo-$schema".
  //
  //> key str `- key-less entry in static::$normalize
  //> schema array 'prop' => pos `- in `#schema() format but without unions, indicating positions of
  //  ObjectStore properties on the layer; is sorted; if there are gaps in values,
  //  placeholders are added resulting in "$key_num" => $type
  //> type `- any value supported in static::$normalize; if starts with `'* then creates an array
  //
  //?`[
  //    class My extends StoredObject {
  //      static $normalize = [
  //        'first' => 'intval',
  //        'unrollMe',
  //        'last' => 'intval',
  //      ];
  //
  //      static $unrolled = [];
  //    }
  //
  //    class MyEmbedded extends StoredObject {
  //      static $normalize = [
  //        'wood' => 'floatval',
  //        'gold' => 'floatval',
  //      ];
  //
  //      static $unrolled = [];
  //
  //      function schema() {
  //        return [
  //          'gold' => 2,
  //          'wood' => 0,
  //        ];
  //      }
  //    }
  //
  //    My::unrollKeys('unrollMe', (new MyEmbedded)->schema(), 'floatval');
  //
  //    // Or, if schema is coming from constants, as is often the case:
  //    $resourceTypes = ['gold' => 2, 'wood' => 0];
  //    My::unrollKeys('unrollMe', $resourceTypes, 'floatval');
  //
  //    // Above is equivalent to:
  //    class My extends StoredObject {
  //      static $normalize = [
  //        'first' => 'intval',
  //        // unrollKeys() sorts $schema so note that wood comes before gold:
  //        'unrollMe_wood' => 'floatval',
  //        // Note the gap:
  //        'unrollMe_1' => 'floatval',
  //        'unrollMe_gold' => 'floatval',
  //        'last' => 'intval',
  //      ];
  //
  //      static $unrolled = [];
  //    }
  // `]
  static function unrollKeys($key, array $schema, $type) {
    $schema = array_flip($schema) + range(0, max($schema));
    ksort($schema, SORT_NUMERIC);
    $normalize = array_fill_keys($schema, ltrim($type, '*'));
    static::unroll($key, $normalize, !strncmp($type, '*', 1));
  }

  // Creates a "pseudo-sub-store" whose data is directly part of layer values rather than a nested array.
  //
  // Sub-stores are good when many objects have different sub-store lengths
  // because it reduces gaps in the main store (but creates extra run-time
  // objects in form of arrays and potential sub-ObjectStore instances).
  // However, if most objects are known to have nearly the same length then
  // integrating sub-store data directly is more efficient.
  //
  // For example,
  // hero's artifacts is a highly variable list (most heroes will have none but
  // rare can have a dozen and more) so it makes sense creating a sub-store.
  // But a building's cost is different: all buildings cost at least one resource,
  // many cost more
  // and there are at most 7 resources; thus the cost can be part of the main
  // store and it will waste at most 6 slots per building (usually 4-5).
  // Such cost would be accessed by propertyIndex('unrolled $key') +
  // constants['gold'] or by propertyIndex('unrolled $key_gold').
  // The unrolled $key is not stored as a separate value (slot) but it's part of
  // inherited schema() and points to the first property in $normalize as if it was a union.
  //
  // Note: inherited `#schema() includes the $key alias but if overridden,
  // it must include it as well as all new $normalize entries ("key_foo").
  //
  // One possible disadvantage of this approach is that ochange for $key is fired
  // when only $normalize[0] changes (since both are essentially aliases), not
  // when any other $normalize changes.
  //
  // Note: if unrolling a sub-store, $compact must be updated manually:
  //[
  //    class My extends StoredObject {
  //      static $normalize = [
  //        'unrollMe',
  //      ];
  //
  //      static $unrolled = [];
  //
  //      static $compact = [
  //        'unrollMe_a' => 'MyEmbedded',
  //        'unrollMe_b' => 'MyEmbedded',
  //      ];
  //    }
  //
  //    My::unroll('unrollMe', ['a' => '', 'b' => '']);
  //]
  //
  //> key str `- key-less entry in static::$normalize
  //> normalize array `- inserted into static::$normalize in place of $key,
  //  prefixed with "key_"
  //
  //?`[
  //    class My extends StoredObject {
  //      static $normalize = [
  //        'first' => 'intval',
  //        'unrollMe',
  //        'last' => 'intval',
  //      ];
  //
  //      static $unrolled = [];
  //    }
  //
  //    My::unroll('unrollMe', ['a' => 'strval', 'b' => 'boolval']);
  //
  //    // Above is equivalent to:
  //    class My extends StoredObject {
  //      static $normalize = [
  //        'first' => 'intval',
  //        'unrollMe_a' => 'strval',
  //        'unrollMe_b' => 'boolval',
  //        'last' => 'intval',
  //      ];
  //
  //      static $unrolled = [];
  //    }
  // `]
  static function unroll($key, array $normalize, $array = false) {
    if (isset(static::$unrolled[$key])) {
      throw new Exception("\$key $key already unroll()'ed.");
    }
    foreach (array_values(static::$normalize) as $i => $value) {
      if ($value === $key) {
        $func = function ($s) use ($array, $key) {
          return ($array ? '*' : '').$key."_$s";
        };
        static::$normalize = array_merge(
          array_slice(static::$normalize, 0, $i),
          array_combine(array_map($func, array_keys($normalize)), $normalize),
          array_slice(static::$normalize, $i + 1)
        );
        foreach (static::$unrolled as &$ref) {
          $ref > $i and $ref += count($normalize) - 1;
        }
        static::$unrolled[$key] = $i;
        return;
      }
    }
    throw new Exception("Unknown \$key $key to unroll().");
  }

  function __construct(array $props = []) {
    foreach ($props as $prop => $value) {
      $this->$prop = $value;
    }
  }

  // Returns the schema; a store of this object must have exactly the same schema.
  function schema() {
    return static::$unrolled + array_flip(str_replace('*', '', array_keys(static::$normalize)));
  }

  // Returns the schema of a sub-store; a store of this object must have exactly the same schema for the same sub-store property.
  function subSchemas($padding) {
    $schema = $this->schema();
    $padding and ObjectStore::padSchema($schema);
    $propCount = $schema ? max($schema) + 1 : 0;
    $subSchemas = [];

    foreach (static::$compact as $prop => $options) {
      if (!is_int($prop) /*not compact_$prop()*/ and
          (is_array($options) or (is_string($options) and class_exists($options)))) {
        if (isset($subSchemas[$schema[$prop]])) {
          // ...because we're using property's index as key in sub (ObjectStore.js), if two
          // sub-stores have the same index (= part of the same union) we wouldn't
          // know which is which. This should not be too complex but may also concern hooks in `#RPC.
          // We don't need subs in unions yet.
          throw new Exception("A union may only contain one sub-store (cannot place \$$prop).");
        }

        $options = $this->expandSubOptions($options);
        $subSchema = (new $options['class'])->schema();
        ObjectStore::padSchema($subSchema, $options['padding']);
        // See the comment in ObjectStore::jsonSerialize() regarding stdClass.
        $subSchemas[$schema[$prop]] = $subSchema ?: new stdClass;
        $subSchemas[$propCount + $schema[$prop]] = (new $options['class'])->subSchemas($options['padding']);
      }
    }

    return $subSchemas;
  }

  // Returns options used to serialize sub-store data of one of this object's sub-store properties before putting the values into ObjectStore's layer.
  protected function expandSubOptions($options) {
    is_array($options) or $options = ['class' => $options];
    // Must match from3D()'s default for padding, which is currently
    // null and because sub-stores are always 1D for now, this means it's true.
    // Matching default makes sub-store's schema to match the main store's
    // (allowing addAtContiguous()/append(), like with embedded Effects).
    return $options + [
      'padding' => true,
      'trimLayers' => 1,
      'layerCount' => empty($options['strideX']) ? 0 : 1,
    ];
  }

  // Returns normalized data ready for serialization not into a store.
  //
  // This is called when json_encode()'ing a StoredObject directly, not as part
  // of an ObjectStore. For example, when writing map.json.
  #[\ReturnTypeWillChange]
  function jsonSerialize() {
    return $this->normalize();
  }

  // Mutates properties of $this according to rules in ::$normalize and, optionally, ::$compact.
  //
  // If $compact is given, may return a clone of $this (and mutate $this nevertheless).
  function normalize($compact = false) {
    $obj = $this;

    foreach (static::$normalize as $prop => $func) {
      if (is_int($prop)) {
        throw new Exception("Property $func was not unrolled.");
      }
      $isArray = $prop[0] === '*';
      $isArray and $prop = substr($prop, 1);
      if (!property_exists($obj, $prop)) {
        $obj->$prop = null;   // unrolled and serialized to JSON, like MapPlayer
      } elseif (!$func) {
        continue;
      } elseif ($isArray) {
        $obj->$prop and $obj->$prop = array_map($func, $obj->$prop);
      } else {
        isset($obj->$prop) and $obj->$prop = $func($obj->$prop);
      }
    }

    if ($compact and static::$compact) {
      // Avoid unneeded cloning if there's nothing to compact.
      $obj = clone $this;
      foreach (static::$compact as $prop => $func) {
        $noValue = is_int($prop) and $prop = $func;
        if (!$noValue and (is_array($func) or (is_string($func) and class_exists($func)))) {
          if (is_array($obj->$prop)) {
            $layers = ObjectStore::from1D($obj->$prop, $this->expandSubOptions($func))
              ->jsonSerialize()['layers'];
            if (count($layers) > 1) {
              throw new Exception('$compact only supports non-layered sub-stores for now.');
            } else {
              $obj->$prop = $layers[0] ?? [];
            }
          }
          if (!$obj->$prop) {
            // Empty store. Could leave [] but null/false is better since it doesn't
            // create new objects on run-time.
            //
            // Note that non-empty store without objects (like [null, null, null]) is still an array to preserve the correct strideX, as with ObjectArtifact.
            $obj->$prop = null;
          }
        } elseif ($obj->$prop and !is_string($obj->$prop)) {
          if ($noValue) {
            $obj->$prop = method_exists($this, "compact_$prop")
              ? $this->{"compact_$prop"}($obj->$prop)
              : join(' ', $obj->$prop);
          } else {
            $gapless = $obj->$prop + array_fill(0, max(array_keys($obj->$prop)) + 1, null);
            ksort($gapless);
            $obj->$prop = join(array_map($func ?: 'strval', $gapless));
          }
        }
      }
    }

    return $obj;
  }

  // Called by normalize() if no special rule is defined in ::$compact['foo'].
  // Returns the value to be serialized.
  //abstract function compact_foo(array $value);

  // Puts properties of $this into an ObjectStore's $layer, usually as part of store serialization.
  //
  // $this must be already normalized.
  //
  // Ensures $layer contains exactly max($schema)+1 entries and that none is
  // null.
  //
  // Writes to $layer in arbitrary order if $zeroOut is unset. Usually $layer is prefilled so it's
  // okay but if not, you should ksort() it.
  function serializeTo(array &$layer, $n = 0, array $schema = null, $zeroOut = true) {
    $schema === null and $schema = $this->schema();
    $propCount = max($schema) + 1;
    asort($schema, SORT_NUMERIC);

    if (array_values(array_unique($schema)) !== range(0, $propCount - 1)) {
      // Most likely indicates a mistake in manually calculated $i in schema().
      throw new Exception("Schema of ".get_class($this)." has gaps: ".join(' ', array_unique($schema)));
    }

    // Zeroing before writing non-null properties below so that array remains sequential which is important for serializing:
    //
    // $a = [];
    // $a[1] = 123;
    // for (...) { isset($a[$i]) or $a[$i] = false; }
    // echo json_encode($a);
    //   //=> {"1": 123, "0": false, "2": false, ...}
    //   // rather than [false, 123, false, ...]
    for ($index = 0; $zeroOut and $index < $propCount; $index++) {
      // For JavaScript and PHP alike false is a good drop-in
      // replacement for null thanks to type juggling.
      $layer[$n + $index] = false;
    }

    foreach ($schema as $prop => $index) {
      // Of all properties located at the same index (union) only zero or one
      // is expected to have a non-null value.
      isset($this->$prop) and $layer[$n + $index] = $this->$prop;
    }

    return $layer;
  }
}

// Represents a single object with an ID and name residing in an ObjectStore in compact form.
//
// While StoredObject is an abstract bag of key/values, StoredEntity is slightly
// more concrete: it assigns identifiers to each object (hence the name "entity"):
//
// - $id - unique numeric identifier; assigned automatically from entity's index
//   in the store when using StoredEntity::from1D()
// - $idName - optional human-readable string version of $id, also unique;
//   normalized using makeIdentifier() if unset and if there's a set $name property
// - $name - usually present in subclasses, for showing to the end user;
//   not used for addressing but affects autogenerated $idName (if so make sure
//   $name is unique)
//
// Entities are always addressed by $id and this is operation very fast. However, sometimes
// string $idName is desired: first, they don't change and second, they are easier
// for humans to work with (e.g. in databank entries). In this case use
// makeIdIndex() to create an $idName => $id mapping and write it to a file near the store's
// .json file (e.g. to fooStoreID.json).
//
// $id and $idName don't have to be part of the schema. It's possible to only
// use $idName when creating the index. It's also fine to omit $id from the store
// given the fact it's the same as the object's $x coordinate.
//
// On the game engine side, entities are usually part of a databank while objects
// are part of the run-time game state. There is some overlap between them:
// for example, both hero AObject's and Hero StoredEntity have $specType, but
// entities are blueprints that don't change at all while objects do change.
// This means a particular hero AObject's $specType can change in response to
// game actions but this doesn't affect $specType in new hero objects (that are
// created based on the "blueprint"). Properties that are not expected to change
// (like chances of gaining a specific skill) are only part of entity.
abstract class StoredEntity extends StoredObject {
  public $id;
  public $idName;

  // Creates a hash of StoredEntity->$idName => $id from array of StoredEntity-s.
  //
  // Will call normalize() which will mutate $objects.
  // This is usually okay since it will be done in an idempotent way.
  static function makeIdIndex(array $objects) {
    $index = [];
    foreach ($objects as $id => $obj) {
      $name = $obj->normalize()->idName;
      if (isset($index[$name])) {
        throw new Exception("Duplicate \$idName: $name");
      }
      $index[$name] = $id;  // $obj->id is unuavailable before from1D()
    }
    return $index;
  }

  // Assigns $id to each entity in the array and creates a new one-dimensional store.
  static function from1D(array $objects, $options = []) {
    foreach ($objects as $id => $obj) { $obj->id = $id; }
    return ObjectStore::from1D($objects, $options);
  }

  // Generates a string of [a-z0-9_] from a human-readable $str, used as default $idName values.
  //
  // Example: Titan's Lightning Bolt -> titanLightningBolt.
  static function makeIdentifier($str) {
    return lcfirst(preg_replace("/'s |\b(the|a)\b|\W/ui", '', ucwords($str)));
  }

  // Sets $idName to an automatic value (makeIdentifier()) if $name is set.
  function normalize($compact = false) {
    $obj = parent::normalize(...func_get_args());
    if (!strlen($obj->idName ?? '') and strlen($obj->name ?? '')) {
      $obj->idName = static::makeIdentifier($obj->name);
    }
    return $obj;
  }
}

// Represents a single object with just a single field in schema residing in an ObjectStore.
class StoredValue extends StoredObject {
  public $v;
  protected $name = 'v';

  function __construct($v = null, $name = null) {
    parent::__construct(compact('v'));
    isset($name) and $this->name = $name;
  }

  function schema() {
    return [$this->name => 0];
  }

  function normalize($compact = false) {
    $obj = parent::normalize(...func_get_args());
    $obj->{$this->name} = $obj->v;
    return $obj;
  }
}

// Represents a single object with a single integer field in schema residing in an ObjectStore.
//
// This is used to create indexes of adventure map objects. For example: by-owner index: player ID ($x) => object IDs ($v).
class StoredNumber extends StoredValue {
  static $normalize = [
    'v' => 'intval',
  ];

  protected $name = 'id';
}

// Packs run-time map data into JSON files that can be loaded by HeroWO game client.
class MapBuilder {
  public $map;            // will be mutated
  public $objects = [];   // will be mutated
  public $effects = [];   // will be mutated
  public $labeledEffects = [];  // will be mutated
  // Format: hash 'bank-file' => hash ID => StoredObject or null to unset.
  //
  // StoredObject must have $baseObject set to array with serialized data of existing databank entity ID (that is being overridden). StoredObject's non-null properties after normalization are placed on top of $baseObject, and the result is written to map.
  public $databankOverrides = []; // will be mutated

  public $outputPath;
  public $debugFiles = false;
  // These are only used if $debugFiles is set.
  public $originalIDs;  // hash .h3m ID => AObject->$id
  public $classes;  // ObjectStore of databank/classes.json

  public $filesWritten;

  function write() {
    $this->filesWritten = [];

    $options3D = AObject::options3D($this->objects);
    if ($options3D['strideX'] !== $this->map->width or
        $options3D['strideY'] !== $this->map->height or
        $options3D['strideZ'] !== $this->map->levels) {
      throw new Exception(sprintf("Map dimensions (%d;%d;%d) mismatch object coordinates (%d;%d;%d).",
        $this->map->width, $this->map->height, $this->map->levels,
        $options3D['strideX'], $options3D['strideY'], $options3D['strideZ']
      ));
    }

    $options = ['players' => $this->map->players];
    foreach (AObject::makeIndexes($this->objects, $options) as $name => $index) {
      $this->filesWritten[] = $this->writeFile("$name.json", encodeJSON($index));
    }

    foreach (Effect::makeIndexes($this->effects, $this->objects) as $name => $index) {
      $this->filesWritten[] = $this->writeFile("$name.json", encodeJSON($index));
    }

    foreach (array_merge($this->map->victory, $this->map->loss) as $obj) {
      $obj->_key = $this->map->sequentialKey++;
    }
    $this->map->databank = $this->map->constants['version'];
    $this->filesWritten[] = $this->writeFile('map.json', encodeJSON($this->map));
    // Write last, because from1D() may mutate $objects causing problems in
    // makeIndexes().
    $this->filesWritten[] = $this->writeFile('objects.json', encodeJSON(ObjectStore::from1D($this->objects)));

    $this->filesWritten[] = $this->writeFile('eLabel.json', encodeJSON(array_map(function (array $effects) {
      // Taken from StoredObject->normalize();
      $options = ['class' => Effect::class, 'padding' => true];
      $layers = ObjectStore::from1D($effects, $options)
        ->jsonSerialize()['layers'];
      // Labeled Effects may be "empty", e.g. a no-op quest_choices.
      return $layers[0] ?? [];
    }, $this->labeledEffects)));
    // Write last, same reason as above.
    $this->filesWritten[] = $this->writeFile('effects.json', encodeJSON(ObjectStore::from1D($this->effects, Effect::class)));

    // Current map convertors never create active combats and transitions so no need to support this here.
    $this->filesWritten[] = $this->writeFile('combats.json', '[]');
    $this->filesWritten[] = $this->writeFile('transitions.json', '[]');
    // Shroud pre-generation is not supported as it depends on good hunk of game logic. If H3.Rules finds no shroud.json, it generates one on start.
    //$this->filesWritten[] = $this->writeFile('shroud.json', '{}');

    // {z: {y: {x: null | {prop: v, ...}}}}
    foreach ($this->databankOverrides as $file => $overrides) {
      $store = [];

      foreach ($overrides as $entityID => $entity) {
        $ref = &$store[0 /*z*/][0 /*y*/][$entityID /*x*/];
        if ($entity) {    // else leave $ref at null to unset the entity
          $ref = $entity->baseObject;
          $entity->normalize(true)
            ->serializeTo($ref, 0, null, false);
        }
      }

      $store and $this->filesWritten[] = $this->writeFile("databank/$file.json", encodeJSON($store));
    }

    // Hashing in this form is useless. First, client must be able to validate
    // the hash but if it obtains the map as combined.json, there is no way to
    // calculate it because the original files' content is unknown (at least its settings
    // like pretty printing and indentation are unknown). Second, it only makes
    // sense until the game is started from such a map because then $hash starts
    // referring to the original map's hash, and there is no way even in theory to validate that
    // $hash of the saved game's map file wasn't changed. At best server may generate
    // files with a signature but having client do crypto for validation is probably too much.
    //
    // Given all this, $id alone is sufficient since it's also trust-based.
    //
    // For databank, role of constants[version] is essentially the same as of Map->$id.
    //$hash = hash_init('sha1');
    //sort($this->filesWritten);
    //foreach ($this->filesWritten as $file) {
    //  hash_update_file($hash, "$this->outputPath/$file");
    //}
    //$this->map->hash = hash_final($hash);
    $this->filesWritten[] = $this->writeFile('map.json', encodeJSON($this->map));

    $this->writeCombined();
    $this->debugFiles and $this->writeDebugFiles();
  }

  function writeCombined() {
    global $encodeJsonFlags;
    $combined = [];

    foreach ($this->filesWritten as $file) {
      $combined[$file] = json_decode(file_get_contents("$this->outputPath/$file"));
    }

    // No pretty print as the whole point of combined.json is small size.
    $this->writeFile('combined.json', encodeJSON($combined, $encodeJsonFlags & ~JSON_PRETTY_PRINT));
  }

  function writeDebugFiles() {
    if (AObject::$autoSchemaPrint) {
      $this->writeFile('objects-schema.txt', AObject::$autoSchemaPrint);
    }

    if ($this->originalIDs) {
      $this->writeFile('objectsID.json', encodeJSON((object) $this->originalIDs));
    }

    $names = [];
    $name = $this->map->constants['effect']['target']['name'];

    foreach ($this->effects as $effect) {
      if ($effect->target === $name) {
        $names[$effect->ifObject] = $effect->modifier;
      }
    }

    $owned = [];    // type => player => array of AObject

    foreach ($this->objects as $obj) {
      switch ($type = AObject::type[$obj->type]) {
        default:
          $owned[$type][$obj->owner][] = $obj;
        case 'terrain';
        case 'river';
        case 'road';
      }
    }

    ksort($owned);
    $str = '';

    foreach ($owned as $type => $byPlayer) {
      $str .= ucfirst($type)."s\n\n";

      foreach ($byPlayer as $player => $objects) {
        foreach ($objects as $obj) {
          $name = $names[$obj->id] ??
            ($this->classes ?
              '('.$this->classes->atCoords($obj->class, 0, 0, 'name').')' : '');

          $str .= sprintf('%04d  %3d:%-3d:%d  P%d - %s%s',
            $obj->id, $obj->x, $obj->y, $obj->z, $player, $name, "\n");
        }
      }

      $str .= "\n";
    }

    $this->writeFile('objects.txt', $str);
  }

  // Writes chunk of map data to underlying storage (as a file by default).
  //
  // $name may start with 'databank/'.
  function writeFile($name, $data) {
    if (!strncmp($name, $subdir = 'databank/', 9)) {
      is_dir($subdir = "$this->outputPath/$subdir") or mkdir($subdir);
    }
    file_put_contents("$this->outputPath/$name", $data);
    return $name;
  }
}

// Root for data of a playable map. Equivalent to Map.js' Map class.
class Map extends StoredObject {
  const FORMAT_VERSION = 1;
  // Matches SoD's (.h3m).
  const difficulty = ['easy', 'normal', 'hard', 'expert', 'impossible'];

  const bonus = [
    'none',
    'growth',
    // delta = float (x.y) or non-zero int (x, +x, -x).
    'horde',    // [Creature->$id, delta [, $id, delta [, ...]]]
    'plague',   // delta
  ];

  static $normalize = [
    'id' => 'strval',
    'revision' => 'intval',
    '*modules' => 'strval',
    'databank' => 'strval',
    'width' => 'intval',
    'height' => 'intval',
    'levels' => 'intval',
    '*margin' => 'intval',
    'origin' => 'strval',
    'difficulty' => 'intval',
    'title' => 'strval',
    'description' => 'strval',
    'date' => 'boolorintval',
    'random' => '',
    '*initialHeroExperiences' => 'intval',
    'sequentialKey' => 'intval',
    'difficultyMode' => 'intval',
    'turnLength' => 'intval',
    'confirming' => 'boolval',
    'pin' => 'strval',
    'private' => 'boolval',
    'finished' => 'boolval',
    'bonus' => 'strval',
  ];

  static $compact = ['modules'];

  // When putting Map into an ObjectStore,
  // $format is not stored since all Map-s part of the same ObjectStore are
  // expected to have the same format (stored separately).
  public $format = self::FORMAT_VERSION;    // version of data in the map file
  public $id;   // unique map identifier, used to determine if two maps are the "same"; set by this class' constructor
  public $revision = 1; // map author's version number; two maps with the same `'id and `'revision are essentially identical while different `'revision indicates two different versions of the "same" map
  public $modules;    // module names (`[Foo.Bar`]), relative or absolute URIs (`[./map-module.js`], `[/module.js`], `[//module.js`])
  public $databank; // value of 'version' from constants.json; used to ensure an external databank is the one this map was built against
  public $width;    // map's width in cells
  public $height;   // map's height in cells
  public $levels;   // number of levels (Z, at least 1) where 0th level is overground and 1st is underground; more levels may exist (not in SoD)
  public $margin = [0, 0, 0, 0];  // left, top, right, bottom (X, Y, X, Y) - number of cells on each side that the player shouldn't interact with

  public $origin;   // identifier of the game: 'RoE', 'SoD', 'WoG', 'HotA', etc.
  public $difficulty;   // Map::difficulty; in SoD this technically stands for difficulty the map should be played at when integrated into a campaign; some authors may use it to indicate the map's perceived difficulty though; see https://forum.df2.ru/index.php?showtopic=28170&pid=778267&st=4320#entry778267 for related discussion
  public $title;    // short map name
  public $description;    // extended map description
  public $date = false;   // 0-based in-game date; false = not initialized
  public $random = false;   // float 0...1, different for every new game but preserved across save and load; false = not initialized
  // XXX H3 subsystem
  public $initialHeroExperiences = [];   // hash Hero->$id => int experience; if missing then default
  public $sequentialKey = 0;   // internal
  public $difficultyMode;   // Map::difficulty; user's selected choice after starting a new game
  public $turnLength;   // 0/null/false = unlimited; number of seconds each player has to finish his turn
  public $confirming;   // see MapPlayer->$confirmed
  public $pin;
  public $private;    // used in the lobby; if true, game is not listed in SSE's lobbyStats and player must know the PIN to connect
  public $finished = false;   // set to true once $won of all MapPlayer-s (except neutral) become non-false; nothing can be done by players anymore if set
  public $bonus;  // non-empty string in worldBonusChances format; ''/null/false if never picked yet

  // These fields are set when storing a single map to avoid
  // creating new files or ObjectStore-s, treating them as part of map "header" (part of map list and put into replay file's first line).
  public $victory = [];
  public $loss = [];
  public $players = [];   // includes neutral player
  // Map.js needs certain core (non-H3) constants to function. Easiest is to
  // assign databank's constants here but some space can be saved by removing
  // unused values (if they're known). However, some modules wrongly access H3-specific constants as map.constants so that needs to be fixed first (XXX=R).
  public $constants;

  function __construct(array $props = []) {
    $this->id = substr(preg_replace('/\W/', '', base64_encode(random_bytes(40))), 0, 32);
    parent::__construct($props);
  }
}

// Playable map player. Equivalent to Map.js' Map.Player class.
//
// Since MapVictory, MapLoss and MapPlayer can be either serialized as is or
// as part of an ObjectStore, using null in property values is prohibited (but
// paired with an alias is okay: null/0, null/false). Using false alone is
// possible but avoided in order to not require any default value setting.
// Though in some cases a default must be set, as is with $town whose falsy value of 0
// (a Town->$id) is not the same as false; setting a default is seen better
// than allowing an alias null/false and requiring checks (v == null || v === false) all over the place.
class MapPlayer extends StoredObject {
  // XXX H3 subsystem
  const bonus = [
    // false = random all
    'artifact',
    'gold',
    'resource',
  ];

  static $normalize = [
    'player' => 'intval',
    'team' => 'intval',
    'maxLevel' => 'intval',
    '*controllers' => '',
    'controller' => 'intval',
    'homeless' => 'boolorintval',
    '*towns' => 'intval',
    'town' => 'boolorintval',
    'startingTown' => 'intval',
    'startingHero' => 'intval',
    'startingHeroClasses' => '',
    'heroes' => '',
    'nextHero' => 'intval',
    'bonus' => 'boolorintval',
    'bonusGiven' => 'boolval',
    'resources',
    'connected' => 'boolval',
    'interactive' => 'boolval',
    'won' => 'boolorintval',
    'host' => 'boolval',
    '*availableHeroes' => 'intval',
    'confirmed' => 'boolval',
    'handicap' => 'floatval',
    'label' => 'strval',
  ];

  static $unrolled = [];

  public $player;   // Player->$id
  public $team;     // defaults to $player; like player 0, team 0 is reserved, don't use
  public $maxLevel;  // 0/null/false unlimited    XXX=I
  // This can be extended later to provide detailed controller settings. For example: several AI "profiles" (with "agressive" and other AI-related tweaks), all of which the player can pick from the Start Game screen normally.
  public $controllers;  // non-empty array of objects with at least 'type' key ('human', 'ai' or custom supported by a module); H3's 'ai' also supports 'behavior' key (allows one of h3m2json.php's Player::$behaviors, implies 'random' if 'behavior' key is missing)
  public $controller = 0;   // index of the actual controller used in a particular game session
  public $homeless = false;   // set to 0 immediately after losing last town (but hero(es) remaining), to false after winning first town, incremented upon every change of Map->$date; player loses all heroes when this becomes 7, which typically satisfies one of MapLoss
  // Alignments player is allowed to pick before starting game. It affects $startingTown only if that town is random.
  public $towns;    // null/false any random (force "Random" choice in UI), else array of Town->$id
  public $town = false;   // false random, Town->$id; never false after game is configured
  public $startingTown; // AObject->$id (possibly non-existent if game was already started), 0/null/false if none; this is set by map author and may be used by run-time scripts
  public $startingHero; // as $startingTown
  // If $startingHero references a random hero then this must be array of Hero->$id for user to choose from in Advanced Options (unless it has just one member) or null/false (force "None" choice visually but assign random identity on game start). If array, is additionally filtered by player's alignment (since it's not known beforehand and may be any of MapPlayer->$towns).
  //
  // If $startingHero references a normal hero, this must be his Hero->$id (force it in Advanced Options) or null/false (force "None" choice visually but don't change identity).
  //
  // If $startingHero is null/false, this must be null/false. Same if hero could not be initialized (random pool is empty).
  public $startingHeroClasses;
  public $heroes;   // decides identity of non-initialized random hero objects; null/false = []; array of null (random) and/or Hero->$id, missing member = null; on run-time _initializeObjects() sets every null member to actually used Hero->$id; always at least [null] after game is configured
  public $nextHero = 0;   // index in $heroes; count of random heroes initialized so far
  public $bonus = false;    // false random, ::bonus; never false after game is configured
  public $bonusGiven;
  //public $resources_RESOURCE;
  public $connected;    // if online or not (temporary or permanently); only guaranteed meaningful for human players
  public $interactive;  // if can control the world (e.g. because it's the player's turn)
  public $won = false;  // false; 0/1/2 loss/victory/both (XXX=RH to const?)
  public $host;   // if can call admin commands in this game
  public $availableHeroes;    // array of AObject->$id; used internally by H3.Rules - must not be used by others (manipulate using tavernHeroes Effects instead)
  public $confirmed;  // used when starting a new game (Map's confirming is set)
  public $handicap;   // null/false = 0; float, possibly negative: $handicap = % added to every building and creature costs and removed from every hero's creature health
  public $label;    // player's name shown in the menu

  function normalize($compact = false) {
    $obj = parent::normalize(...func_get_args());
    isset($obj->team) or $obj->team = $obj->player;
    return $obj;
  }
}

// Conditions for player to win a map. Equivalent to Map.js' Map.Victory class.
//
// Multiple win conditions per map work as OR.
class MapVictory extends StoredObject {
  const type = [
    'defeat',   // must be 0, used as the default for $type
    'ownArtifact',
    'ownCreatures',
    'ownResources',
    'ownTown',
    'ownDwelling',
    'ownMine',
  ];

  const townHall = [1 => 'town', 'city', 'capitol'];
  const townCastle = [1 => 'fort', 'citadel', 'castle'];

  static $normalize = [
    '_key' => 'intval',
    '*achieved' => 'intval',
    'impossible' => 'boolval',
    'type' => 'intval',
    'allowAI' => 'boolval',
    'artifact' => 'intval',
    'unit' => 'intval',
    'unitCount' => 'intval',
    'resource' => 'intval',
    'resourceCount' => 'intval',
    'object' => 'intval',
    'objectType' => 'intval',
    'townHall' => 'intval',
    'townCastle' => 'intval',
    'townGrail' => 'boolval',
  ];

  public $_key;   // SequentialKeys
  // 'ownArtifact' - $artifact, $object (0/null/false to just own, else town ID to
  //                 transport to)
  // 'ownCreatures' - $unit, $unitCount
  // 'ownResources' - $resource, $resourceCount
  // 'ownTown' - $object (must be a town, 0/null/false means "any town matching
  //             conditions"), $townHall, $townCastle, $townGrail (all 3 must be met);
  //             one of $town... must be set, if not then use 'defeat'
  // 'defeat' - $object (must be a hero, monster, gates, etc., if 0/null/false
  //            then defeat all enemies); this type somewhat overlaps with ownTown
  //            given defeating a town's garrison (usually) gives you the ownership
  // 'ownDwelling' - $object (0/null/false for all on map)
  // 'ownMine' - $object (0/null/false for all on map)
  //
  // For all types where $object is used, $objectType holds a hint for the
  // client so it can determine which condition it is (e.g. own hero or town)
  // without having to load the store with map objects. It's a hint only and must not
  // be used when loading a map in full, and must match the actual AObject->$type (once map is loaded $type cannot change so $objectType cannot change if $object doesn't change).
  public $achieved;  // null/false if not fulfilled yet, else array of MapPlayer->$player (empty if fulfilled but by unspecified player)
  public $impossible;   // true if $object was removed, etc.
  public $type = 0; // MapVictory::type
  public $allowAI = true;    // if AI can reach this condition
  public $artifact;   // Artifact->$id
  public $unit;   // Creature->$id
  public $unitCount;
  public $resource;   // resource ID
  public $resourceCount;
  public $object;
  public $objectType;   // AObject::type
  public $townHall;     // 0/null/false any, ::townHall
  public $townCastle;   // 0/null/false any, ::townCastle
  public $townGrail;

  function schema() {
    $i = 0;
    return [
      'achieved' => $i++,
      'impossible' => $i++,
      'type' => $i++,
      'allowAI' => $i++,
      'object' => $i++,   // used in several unions
      'objectType' => $i++,
      // Union: $type = ownArtifact.
      'artifact' => $i,
      // Union: $type = ownCreatures.
      'unit' => $i, 'unitCount' => $i + 1,
      // Union: $type = ownResources.
      'resource' => $i, 'resourceCount' => $i + 1,
      // Union: $type = ownTown.
      'townHall' => $i, 'townCastle' => $i + 1, 'townGrail' => $i + 2,
    ];
  }
}

// Conditions for player to lose a map. Equivalent to Map.js' Map.Loss class.
//
// Multiple lose conditions per map work as OR.
//
// Probably not much sense in omitting regular loss (losing all towns and heroes).
class MapLoss extends StoredObject {
  // 'lose' must be 0, used as the default for $type.
  const type = ['lose', 'days'];

  static $normalize = [
    '_key' => 'intval',
    '*achieved' => 'intval',
    'impossible' => 'boolval',
    'type' => 'intval',
    'object' => 'intval',
    'objectType' => 'intval',
    'time' => 'intval',
  ];

  public $_key;   // SequentialKeys
  // 'lose' - $object (if 0/null/false then lose all towns and heroes);
  //          per-player; if $object is set, must be any ownable, and only
  //          applies to its initial $owner (or first non-neutral $owner once captured)
  // 'days' - $time (lose when Map->$date becomes this); for all players
  public $achieved;   // as MapVictory
  public $impossible;
  public $type = 0;   // MapLoss::type
  public $object;
  public $objectType; // AObject::type
  public $time;   // in-game days

  function schema() {
    $i = 0;
    return [
      'achieved' => $i++,
      'impossible' => $i++,
      'type' => $i++,
      // Union: $type = defeat.
      'object' => $i,
      'objectType' => $i + 1,
      // Union: $type = days.
      'time' => $i,
    ];
  }
}

// Object in index overlaying the map holding passability info about every tile.
//
// Represented by Map.js' Map.Indexed.byPassable property.
class Passable extends StoredObject {
  const type = [
    1 => 'ground',
    'water',
  ];

  static $normalize = [
    // First 4 are used in AObject->$passableType; putting them in this order
    // ($type and $terrain exist for map W*H object entries, $river/$road much
    // fewer but still numerous) and on the top to minimize gaps in that property.
    'type' => 'intval',
    'terrain' => 'intval',
    'river' => 'intval',
    'road' => 'intval',
    'impassable' => 'intval',
    'actionable' => 'intval',
    'actionableNH' => 'intval',
    //'guarded' => 'intval',
  ];

  public $type;         // Passable::type
  // The following assume there are never more than 1 type of terrain (river,
  // road) AObject at given coordinates.
  public $terrain;  // AClass::terrain, false if none (should only happen for cells within Map->$margin)
  public $river;    // AClass::river, false if none
  public $road;     // AClass::road, false if none
  public $impassable;   // counter excluding hidden objects (displayOrder < 0)
  public $actionable;   // counter (ditto)
  public $actionableNH;   // as $actionable but excludes objects that can be reached from top (a pathfinder/H3.PathCost feature)
  // This is not implemented due to complicated update logic in Map.Indexed (would depend on both bySpot and byPassable and also on nearby spots).
  //public $guarded;   // counter (guarded.guarded only)
}

// Object in index overlaying the map holding list of objects on top of every tile (regardless of object's passability/actionability).
//
// Represented by Map.js' Map.Indexed.bySpot property.
//
// Includes hidden objects (displayOrder < 0).
class SpotObject extends StoredObject {
  // Warning: use === in JavaScript to compare since consts...impassable (0) is == passable (false).
  //
  // XXX=R fix this and other similar consts to count from 1?
  const actionable = [
    // false => 'passable',
    'impassable',
    'actionable',
  ];

  const guarded = [
    // false => 'free',
    'terrain',    // unguarded - a monster is nearby but it's on another terrain
    'guarded',
  ];

  static $normalize = [
    'id' => 'intval',
    'type' => 'intval',
    'displayOrder' => 'intval',
    'actionable' => 'intval',
    'guarded' => 'intval',
    '*corner' => 'boolval',
  ];

  static $compact = ['corner' => 'intval'];

  public $id;
  public $type;   // AObject->$type of $id
  public $displayOrder;   // ditto
  public $actionable; // ::actionable; there may be multiple impassables and/or multiple actionables in one spot (e.g. when Hero is standing on Windmill)
  // \ ^ /
  // < M >    'monster' AObject guards its own spot and 8 adjacent tiles
  // / v \    of the same Passable->$type as $type of AObject's $actionable spot
  public $guarded;  // ::guarded

  // 0---1    like order in CSS' border-radius
  // |   |
  // 3---2    an 1x1 object will have $corner = [true, true, true, true] ('1111')
  public $corner;
}

// Object in index overlaying the map telling how every tile should appear on the mini-map.
//
// Represented by Map.js' Map.Indexed.miniMap property.
class MiniMapTile extends StoredObject {
  // The order must match mini-map display order: heroes overlay structures which
  // overlay impassable obstacles which in turn overlay passable terrain.
  //
  // Multiple objects of a given ::type may occupy a cell; mini-map will choose the highest ::type but which object of that type it will choose is unspecified.
  const type = [
    'passable',
    'impassable',
    'ownable',    // structure that can be owned
    'movable',    // hero whose actionable spot overlays ownable's (like town's)
  ];

  static $normalize = [
    'type' => 'intval',
    'terrain' => 'intval',
    'owner' => 'intval',
  ];

  public $type;     // MiniMapTile::type
  public $terrain;  // used if $type is im/passable; if ownable not used
  public $owner;    // used if $type is ownable/movable; 0 = unowned (neutral)

  function schema() {
    $i = 0;
    return [
      'type' => $i++,
      // Union: $type is im/passable.
      'terrain' => $i,
      // Union: $type is ownable/movable.
      'owner' => $i,
    ];
  }
}

// Stores modifiers affecting every part of gameplay in such a way that a particular affector may be easily added and removed, with great flexibility as to what it affects.
//
// HeroWO object properties are not all stored in one place. AObject instance contains "rigid" data that must be manipulated in a very specific way, mainly that affecting the adventure map: coordinates, passability, etc. Data relating to gameplay (attack value, skill set, etc.) is evaluated on run-time by means of Calculator and Effect instances; such a data piece is called "target".
//
// Effects are persistent bits that affect a particular target; they can be very numerous (thousands) and a separate ObjectStore (a part of map dataset) holds all their collective data. This is "cold" data.
//
// One Effect may affect multiple in-game entities (e.g. "all" "enemy" "heroes"). A condition is called a "selector". While many conditions can be specified using Effect properties, advanced conditions may be implemented in code.
//
// Calculator-s are transient, created on demand objects - regular Sqimitives (making them much easier to work with); they combine all Effects affecting their target into final value (e.g. taking all bonuses and handicaps to determine a hero's spell power). One Calculator only works with one in-game entity (e.g. "spell power" of "object #1234"). This is "hot" data.
//
//   Calculator <= Target 1 <= Effect 1
//         \             \\ <= Effect 2
//          \             \ <= ...
//           \
//            \ <= Target 2 <= Effect 1
//                       \\ <= Effect 3
//                        \ <= ...
//
// Example:
//
//   Calculator [hero's luck] <= Target [Fiona] <= Effect [4-Leaf Clover] +1
//                         +2  =                <= Effect [Fountain Of Fortune] +1
//
// This structure is similar to but more complex than Objects and their ObjectRepresentation-s that simply provide more convenient access to the same data in the ObjectStore. While there may be tens of thousands of Objects and Effects on a large 144x144 map, the engine expects hundreds of ObjectRepresentation-s and Calculator-s at most because they represent "hot" data that the player is actively interacting with (such as when viewing a town's screen) and this is always a small subset of all data on the map. This allows "hot" data representation use more resources to make it more pleasant to work with in code.
//
//## Serialized vs dynamic
// Some Effects (like a hero's skill set) are simple and they are serialized along with map data; others ("dynamic") depend on the gameplay state and so they are initialized every time a map is loaded or a condition is met. Doing the same work over and over might sound suboptimal but code usually sets up listeners to various world objects to manage such Effects so we'd still have to set up those listeners even if we could somehow skip adding the associated Effects.
//
// In the end, almost the entire gameplay is defined as a (huge) set of Effects with relevant conditions: "when hero class is #123, set attack to 2", "when creature is #456, set growth to 14", etc. Fundamental rules (not specific to map and game session) are coming from static databank Effects.
//
//## Conventions
// Because all Effects are part of the same ObjectStore, that store's schema should include properties used by all Effect targets, possibly in unions. Below in this file and databank.php, all properties are declared as a disorganized list but every Effect target has an explanation of properties that it actually uses. Wrong combinations of properties provoke undefined behaviour.
//
// Effect targets are identified by numbers rather than strings for space and performance reasons; like with other entities, these numbers are only constant within a given combation of databank and map versions. By convention, their symbolic names usually follow this format: "objectType_targetName", for example: "hero_attack".
//
// Names of selectors that act in addendum to others (such as $isAlly which changes the meaning of $ifPlayer) start with "is" rather than "if".
//
//## Recurring values
// Targets represent dynamically updated values in response to game events -
// for example, creature's Speed depends on the type of terrain the combat is taking place on.
// However, some values like hero's action points are "recurring", i.e. an
// initial (current) value is obtained from Effects once or regularly (e.g. on daybreak),
// stored separately and not updated even if those Effects change. For example,
// if player gives a hero an artifact that increases his movement points, this
// doesn't take effect until next day (when recurring value is recalculated).
// Stored values can be changed by game events (like the act of movement) but
// Effects do not facilitate it because such changes are one-shot (compare
// daily kingdom's income and finding a treasure chest).
//
//## Chance values
// Targets calculate absolute values whereever possible, to allow usage of both
// absolute (`'delta, e.g. -1, +5) and proportional (`'relative, e.g. 25%, 150%) adjustments. However, some values
// are "chances" by nature (for example, probability of gaining a specific skill
// on a level-up). They are marked with "%" in this file and databank.php. The caller calculates them by querying all potential targets
// (e.g. chances for all possible level-up skills using `'$ifSkill), discarding candidates with "chance values" of 0 and remembering
// others, summing values together, throwing a dice and
// seeing which candidate's range falls within that value.
//
// This means calculated
// values are not percentages (where 0 is 0% and 100 is 100%) but rather weight
// values (if two candidates return 100 then both have 50% chance, but if three
// candidates return 100 then all three have 33.3(3)% chance). This allows using the same Effects for calculating chances for all candidates (e.g. attack, defense, spell power and knowledge) as well as for their subset (e.g. attack and defense only). By convention
// and for human friendliness 0 and 100 are seen as minimal and maximum weight ranges.
//
// For example, assume we have 3 candidates: A = 4, B = 2, C = 2. Total: 4+2+2=8.
// Chances: A = 50%, B = C = 25%. Ranges for throwing a dice: min 0, max 8-1:
// A = min..min+value-1 = 0..3, B = A..A+value-1 = 4..5, C = 6..7.
//
//## Modifiers
// Dynamic Effects by the help of code may arbitrarily affect the value being calculated but many standard "modifier" functions exist for common cases. Full form of a modifier is an array of this format: `[operation type, type-specific options...`]. Non-array space-efficient type-specific short forms exist.
//
// Effect's priority determines the order of applying modifiers of multiple Effects affecting the same target. Effects with the same priority (e.g. two `'const with default priority) provoke undefined behaviour unless their modifier type specifies certain merging rules (as `'relative does, for example).
//
// Effect's stack value provides isolation: only the highest-priority members are applied, others are ignored. For example, if having one or more Undead creatures lowers morale of the garrison by 1, each Undead creature may have an Effect with the same stack so that only one of them is applied (morale += -1), not all (-1 * count(Undead)). After determining which priority is highest for a stack, all Effects with this priority are evaluated together with other stacks (and non-stacks).
//
// Universal operations:
//
//> databank `- replaces value with one from a databank ObjectStore, takes keyProp, store, storeProp, subProp, default - Effect property by which storeProp in store is looked up, with optional Effect property which value is added to storeProp's index (use for unrolled sub-store), and optional default used when read value is `[=== false`] (`'false by default); `[['databank', $ifCreature, 'creatures', $creatureSchema['cost'], $ifResource, 1]`]
//> randomArray `- same-priority work as expected; takes `[count, ...potential`]; every time the modifier is evaluated generates a single value (if `'count is falsy) or works like `'append given an array with `'count members in random order (or less, if `'potential has smaller length; works for array modifiers)
//> randomSign `- replaces value with a random string from randomSigns Effects, persistent by ifBonusObject; works (const) for string and array
//> custom `- calls non-standard operation, takes at least one parameter - operation name; while Effect->$modify is a Closure and can't be serialized, this operation is defined in external code; `[['custom', 'foo', 1.23]`]
//
// Number modifier operations:
//
//> const `- replaces value with integer; `[['const', 123]`]
//> delta `- adjusts by number; same-priority are summed as expected; `[['delta', -3]`]
//> heroSpec `- special operation used in hero specialties; Effect must have a set $ifObject (a hero); takes `[mul, [after level|0]`], roungly equals to `[['delta', max(0, mul * (hero_level - after_level))]`] if `'mul is integer, else to `[['relative', 1 + mul * (hero_level - after_level)]`] (negative `'mul reduces by %, positive increases; float-fix applies); `[['heroSpec', 1, 3]`]
//> spellSpec `- similar to `'heroSpec but takes no parameters; Effect must have a set $ifObject (a hero) and $ifCreature; gives efficiency bonus if cast on low-level creatures
//> heroSpecSkill `- takes `[mul, $skillID, baseNone, baseBasic, baseAdvanced, baseExpert`], evaluates to `[['delta', base * (1 + mul * hero_level)]`]; `[['heroSpecSkill', 0.05, $mysticism, 2, 3, 4]`] - given Expert skill mastery: `[4 * (1 + 0.05 * hero_level)`]
//> countAlignments `- takes `[starting, [groups]`], counts different Creature->$alignment-s in $ifObject's garrison and evaluates to `[['delta', starting - count]`]; `'groups is a hash of Town->$id => group (towns of the same `'group count as 1; `'group must be >1); `[['countAlignments', +1, [$castle => 1, $rampart => 1]]`]
//> relative `- adjusts by percent (1.0 = 100%); sums same-priority together; `[['relative', 0.5]`]
//
//  Summing algorithm: sum all percentages (each minus 1), add 1 and multiply by base value. Example: value=100, apply=0.5 (reduce by 50%), apply=1.75 (increase by 75%): ((0.5-1)+(1.75-1)+1)*100 = 125 (result). But if priorities were different: value=100, apply=0.5 (lower priority so applied first): ((0.5-1)+1)*100 = 50 (intermediate result), then apply=1.75: ((1.75-1)+1)*50 = 87.5 (result).
//> clamp `- adjusts by range; same-priority work as expected; `[['clamp', [min|null], [max|null]]`] where members can be reversed (`[max, min`], max <> min) to use min if `[value > min && value <= max`]
//> random `- takes `[[min,] max, [mul]`]; same-priority are summed as expected; every time the modifier is evaluated adjusts value (as `'delta) by a random number in range `'min..`'max (inclusive) or 0..`'max or `'max..0 (if `'max is negative) multiplied by `'mul (1 if missing)
//
// Short number modifiers:
//
//> integer `- `'delta; 0 is useful in combination with stack to no-op a numeric Effect
//> float 0 or positive `- `'relative; float-fix applies
//> float negative with 0 fraction `- positive `'const; float-fix applies
// XXX=R make float short modifier use two's complement (will allow zero const)
//
// Float-fix note: even though PHP and JSON have distinct types for representing integer and
// float values, JavaScript does not (Number.isInteger(1.0) === true). To work around
// this, if a float has 0 fraction then it's increased by 0.0001 - this is too
// little to have any affect on final values but enough to recognize it as float.
//
// Note: in PHP, do not use round()/floor()/etc. to specify short integer modifier (`'delta) because they take float and return float. Use `[(integer)`] instead:
//[
//    // Wrong: $modifier is a float, thus considered relative, not delta.
//    $effects[] = ['hero_skillChance', round($chance / 112)];
//    // Correct:
//    $effects[] = ['hero_skillChance', (integer) round($chance / 112)];
//    // Also correct:
//    $effects[] = ['hero_skillChance', (integer) ($chance / 112)];
//]
//
// Array modifier operations:
//
//> const `- replaces value; `[['const', [$gold => 123]]`]
//> override `- associative, values are modifiers or `'null (to remove the key); full modifiers' key 0 being initial value in case the key is undefined; short modifiers' initial value is assumed to be `'0; `[['override', [$artifacts => [[], 'append', 123], $creatures => null]]`]
//> prepend `- as `'append
//> append `- indexed, adds constant values; `[['append', 1, 3, 5]`]
//> diff `- indexed, keeps original order; `[['diff', $armageddon]`]
//> intersect `- indexed, keeps original order; if empty (`[['intersect']`]) then result is empty; `[['intersect', $bless, $precision]`]
//
// Short array modifiers:
//
//> array `- when there is no key 0 or its value is not integer/PHP or number/JS (i.e. not an operation), assume `'override; in JS this short modifier can be either an `'Array or `'Object; `[[$gold => -123.0]`]
//
// Note: in PHP, `[['a', 0 => 'b']`] silently equates to `[['b']`].
//
// String modifier operations:
//
//> const `- replaces value; `[['const', 'foo']`]
//> prepend
//> append `- `[['append', '\n\nfoo']`]
//
// Short string modifiers:
//
//> string `- `'const
//
// Bool modifier operations:
//
//> const `- replaces value; `[['const', true]`]
//> check `- same-priority work as expected; if the condition matches, replaces current value with `'true if it's `'undefined (i.e. `'check is the first modifier to run) or truthy, in other cases replaces value with `'false; takes criterion and criterion-specific value(s); without arguments assumes `'true (allows creating a series of "AND" Effects); criteria:
//  `> value false `- always just sets value to `'false; unlike `[[$const, false]`], adds an entry to questChecks, along with an optional label
//  `> numeric hero property tests `- level (1-based), attack/defense/spellPower/knowledge
//  `> numeric player property tests `- resources_RESOURCE (e.g. resource_gold)
//  `> numeric garrison test `- value is Creature->$id, min defaults to 1
//  `> spellPointsMax `- used for Magic Spring/Well; value is optional min and max, both default to 1 and are multipliers of hero's normal SP (knowledge * 10); true if current hero's SP is >= min and < max
//  `> quest `- used for `'quest_fulfilled by default; value enables tests, set of: `'S: if there are no Effects with $source of $ifBonusObject whose selectors match the $ifObject (encounterer hero), `'O: if $ifBonusObject's owner is different from hero's
//  `> defeat `- value is AObject->$id that must not exist
//  `> artifact `- value is Artifact->$id that must be present in AObject->$artifacts
//  `> skill `- values are Skill->$id, min mastery (any if missing, 1 by default; 0 if don't have), max (optional)
//  `> skillCount `- values are min, max (optional)
//  Numeric tests compare subject >= value and take optional maxValue to also compare subject <= maxValue, adjusted by quest_requirement.
//
// Short bool modifiers:
//
//> true `- `'const
//> false `- not applicable, treated as "`'$modifier is unset"; use the full `'const form
//
// Thanks to type juggling, some unusual modifiers or arguments produce useful effects. For example, `[-1`] or `[$const, -1`] inverts the value; `[$random, 1`] has 50% chance of keeping value unchanged and 50% of making it `'true; `[$random, -1`] - of keeping value or inverting it; `[$randomArray, null, true, false`] sets value to `'true/`'false at 50%/50% chance.
class Effect extends StoredObject {
  // Explanation about data that deliberately was not made into Effect targets:
  // - hero artifacts (slots and backpack) - user manages them freely
  //   (by dragging) and this hardly works if Effects dictate availability of
  //   artifacts and their position
  // - hero garrison - same reason
  // - hero resting - this is purely an UI state, it doesn't affect the gameplay
  // - hero formation, tactics - these have limited effect on the game
  // - hero vehicle - changing vehicles typically requires some action and
  //   custom side effects so can't just happen on the fly (like it happens with spellPower, for example)
  // - town's garrisoned/visiting heroes - similar, they have side effects
  //   (the hero must be "physically" moved, changing these properties alone is not
  //   enough)
  // - hero level - derived from hero's experience
  // - hero experience - should not be able to grow "down" but Effects could make it change in
  //   random ways; still, Effects can influence its growth rate
  // - hero/town owner - too much relies on this to allow it be calculated on
  //   the fly
  // - id, class, mirrorX, x, miniMap, actionable, etc. - these are core values;
  //   making them Effect would require spreading gameplay rules over the entire
  //   engine (we try to contain them only within H3.Rules and keep DOM.Map
  //   independent, for example)
  // - creature alignment, level, shooting, undead - they are used in selectors and it
  //   simplifies the code if they cannot change (i.e. can be taken from the immutable
  //   databank)
  // - creature town, width - generally seems to be a bad idea
  //   due to possible side effects
  // - quest proposal, message - these are typically specific to particular
  //   object instance on map; unlike bonus_message, they are shown even before
  //   quest_chances so there's little sense in affecting them with Effects
  // - random... - evaluated before starting the game when there is little room
  //   for enthopy and therefore for Effects
  const target = [
    'canCombat',
    'creature_abilityText',
    'creature_aiValue',
    'creature_attack',
    'creature_attackAndReturn',
    'creature_attackAround',
    'creature_attackDepth',
    'creature_wallDamage',
    'creature_cost',
    'creature_costUpgrade',
    'creature_upgradeCan',
    'creature_damageMax',
    'creature_damageMin',
    'creature_defense',
    'creature_enemyRetaliating',
    'creature_fightValue',
    'creature_flying',
    'creature_growth',
    'creature_join',
    'creature_hitPoints',
    'creature_hordeGrowth',
    'creature_jousting',
    'creature_shootingCloud',
    'creature_luck',
    'creature_mapMax',
    'creature_mapMin',
    'creature_meleePenalty',
    'creature_morale',
    'creature_piercing',
    'creature_reanimate',
    'creature_reanimateAs',
    'creature_regenerating',
    'creature_retaliating',
    'creature_shootBlocked',
    'creature_shootPenalty',
    'creature_shots',
    'creature_speed',
    'creature_moveDistance',
    'creature_spellEvade',
    'creature_spellImmune',
    'creature_dispelImmune',
    'creature_spells',
    'creature_strikes',
    'creature_whirlpoolPenalty',
    'creature_queue',
    'garrisonSee',
    'grows',
    'hero_actionCost',
    'hero_actionPoints',
    'hero_attack',
    'hero_attackChance',
    'hero_biography',
    'hero_defense',
    'hero_defenseChance',
    'hero_embarkCost',
    'hero_experienceGain',
    'hero_garrisonConvert',
    'hero_gender',
    'hero_knowledge',
    'hero_knowledgeChance',
    'hero_skillChance',
    'hero_skills',
    'hero_spellPoints',
    'hero_spellPointsDaily',
    'hero_spellPower',
    'hero_spellPowerChance',
    'hero_spells',
    'hero_walkImpassable',
    'hero_walkTerrain',
    'hero_stopTerrain',
    'hero_specialty',
    'hireAvailable',
    'hireFree',
    'income',
    'name',
    'portrait',
    'combatImage',
    'randomRumors',
    'randomSigns',
    'retreatCan',
    'skillMastery',
    'spellCost',
    'spellDuration',
    'spellEfficiency',
    'spellGlobal',
    'spellLearn',
    'spellMastery',
    'surrenderCan',
    'surrenderCost',
    'tacticsDistance',
    'town_buildingCost',
    'town_buildings',
    'town_canBuild',
    'town_hasBuilt',
    'heroChance',
    'town_spellChance',
    'town_spells',
    'town_spellCount',
    'town_spellCountable',
    'tradeRate',
    'tavernRumor',
    'tavernCost',
    'tavernHeroes',
    'player_town',
    'spellAround',
    'spellAroundEye',
    'combatCasts',
    'creature_critical',
    'creature_criticalChance',
    'creature_canControl',
    'spellTradeTake',
    'spellTradeGive',
    'artifactTrade',
    'artifactChance',
    'quest_requirement',
    'garrison_reinforce',
    'garrison_reduce',
    'bonus_effects',
    'bonus_message',
    'quest_message',
    'bonus_resource',
    'bonus_creatures',
    'bonus_creatureCount',
    'bonus_experience',
    'bonus_artifacts',
    'bonus_actionPoints',
    'bonus_spellPoints',
    'bonus_buildings',
    'bonus_build',
    'bonus_available',
    'bonus_availableCount',
    'quest_fulfilled',
    'quest_remove',
    'quest_removeAudio',
    'quest_granted',
    'hero_shroud',
    'town_shroud',
    'ownable_shroud',
    'bonus_shroud',
    'bonus_shroudTerrain',
    'bonus_shroudRiver',
    'bonus_shroudRoad',
    'quest_placement',
    'shroud',
    'quest_reset',
    'quest_chances',
    'quest_choices',
    'quest_garrison',
    'shipCost',
    'fortifications',
    'creature_absolute',
    'creature_wallStrikes',
    'creature_hitChance',
    'artifactCost',
    'worldBonusChances',
  ];

  const priority = [
    +15 => 'highest',
    // +15..0 - user effects.
    -1  => 'default',  // default priority for 'relative' operations, and also combined heroSpec/spellSpec
    -2  => 'combat',
    -3  => 'mapSpecific',  // h3m2herowo.php
    // Below are databank Effects.
    -4  => 'artifact',
    -5  => 'skill',
    -6  => 'building',
    -7  => 'town',
    -8  => 'garrison',
    -9  => 'hero',
    -10 => 'heroClass',
    -11 => 'mapObject',
    -12 => 'ground',
    -13 => 'initial',
    -14 => 'defaults', // initial value for Effect target, usually $const or $databank
    -15 => 'lowest',
  ];

  const stack = [
    'undeadGarrison',
    'mixedAlignments',
    'dispelImmune',
    'classStats',
    'quest',
    'garrisonSee',
    'terrain',
    'resource',
  ];

  const source = [
    // Initial Effect->$target's value like 0 or empty array.
    //
    // XXX confusing to name priority 'defaults'/'initial' but source 'initial'/'initialize'
    'initial',
    // Object initialization, e.g. initial $name assignment.
    'initialize',
    'encounter',  // $source = [<const>, AObject->$id]
    'spot',
    'skill',    // $source = [<const>, Skill->$id]
    'spell',    // $source = [<const>, Spell->$id]
    'artifact',    // $source = [<const>, Artifact->$id]
    'town',     // $source = [<const>, AObject->$id]
    'hero',     // $source = [<const>, AObject->$id]
    'mageGuild',     // $source = [<const>, level 1+]
    'level',  // Effects of hero gaining levels because of experience
    'garrison', // $source = [<const>, Creature->$id]
    'stance',   // Effect of Defend command in combat
    'trade',  // Scholar skill; spellTradeGive/spellTradeTake
    // Static spell Effects (spell features) limiting who can be targeted (defense - only friends, offense - only foes, immune - "natural" Creature immunity).
    'spellDefense',
    'spellOffense',
    'spellImmune',
    'quest_granted', // internally used by H3.Rules; [<const>, $id]
    'handicap',   // MapPlayer->$handicap
  ];

  const operation = [
    'databank',
    'randomSign',
    'custom',
    'const',
    'check',
    'delta',
    'heroSpec',
    'spellSpec',
    'heroSpecSkill',
    'countAlignments',
    'random',
    'relative',
    'clamp',
    'prepend',
    'append',
    'randomArray',
    'override',
    'diff',
    'intersect',
  ];

  const targetIndex = [
    'any',
    'object',
    'spot',
  ];

  const timedIndex = ['maxDays', 'maxCombats', 'maxRounds', 'ifDateMax'];

  static $normalize = [
    'test' => '',
    'ifObject' => 'boolorintval',   // true is an allowed shortcut in some contexts
    'ifObjectType' => 'intval',
    'ifPlayer' => 'boolorintval',   // true is an allowed shortcut in some contexts
    'ifPlayerController' => 'strval',
    'isAlly' => 'boolval',
    'isEnemy' => 'boolval',
    'ifVehicle' => 'intval',
    'ifX' => 'boolorintval',   // true is an allowed shortcut in some contexts
    'ifY' => 'boolorintval',
    'ifZ' => 'boolorintval',
    'ifRadius' => 'intval',
    'ifDateMin' => 'intval',
    'ifDateMax' => 'intval',
    'ifDateDay' => 'intval',
    'ifDateWeek' => 'intval',
    'ifDateMonth' => 'intval',
    'ifWorldBonus' => 'intval',
    'maxDays' => 'intval',
    'maxCombats' => 'intval',
    'maxRounds' => 'intval',

    'target' => 'intval',
    'dynamic' => 'boolval',
    'source' => '',    // int or array
    'whileObject' => 'boolorintval',    // true is an allowed shortcut in some contexts
    'whileOwned' => 'boolorintval',    // true is an allowed shortcut in some contexts
    'whileOwnedPlayer' => 'boolorintval',    // true is an allowed shortcut in some contexts
    'priority' => 'intval',
    'stack' => '',  // can be int or array of int

    'modify' => '',
    'modifier' => '',
    'label' => 'strval',
  ];

  // Creates an Effect object from a convenient array-based definition.
  //
  //[
  // H3Effect::fromShort(
  //   ['hero_spells', [$append, 123], true, 'ifPlayer' => true],
  //   ['ifObject'], ['placeholders' => ['ifObject' => 456, 'ifPlayer' => 789]]
  // );
  // // Same as:
  // new H3Effect([
  //   'target' => $hero_spells,
  //   'modifier' => [$append, 123],
  //   'ifObject' => 456,
  //   'ifPlayer' => 789,
  //   'priority' => 30,
  // ])
  //[
  static function fromShort(array $effect, array $positional = [], array $options = []) {
    // XXX how does compact work with string labels in front of bonus_effects? fromShort() returns an Effect object so it should be converted to flat store and then leading "labels" prepended to it

    if (!$effect or is_array(reset($effect))) {
      $args = func_get_args();
      return array_map(function ($effect) use ($args) {
        $args[0] = $effect;
        return static::fromShort(...$args);
      }, $effect);
    }

    foreach (array_merge(['target', 'modifier'], $positional) as $i => $prop) {
      array_key_exists($i, $effect) and $effect[$prop] = $effect[$i];
    }

    if (is_string($effect['target'])) {
      $effect['target'] = array_search($old = $effect['target'], static::target);
      if ($effect['target'] === false) {
        throw new Exception("Unknown Effect target: $old");
      }
    }

    if (isset($effect['modifier'])) {
      $floatFix = function (&$v) {
        if (is_float($v) and fmod($v, 1.0) === 0.0) {
          $v += 0.0001 * ($v < 0 ? -1 : +1);
        }
      };

      if (is_array($effect['modifier'])) {
        $operation = is_int($effect['modifier'][0] ?? null)
          ? static::operation[$effect['modifier'][0]] : 'override';
        if ($operation === 'heroSpec') {
          $floatFix($effect['modifier'][1]);
        }
      } else {
        switch (gettype($effect['modifier'])) {
          case 'integer':
            $operation = 'delta';
            break;
          case 'double':
            $floatFix($effect['modifier']);
            if ($effect['modifier'] >= 0) {
              $operation = 'relative';
              break;
            }
          case 'boolean':
          case 'string':
            $operation = 'const';
            break;
        }
      }

      // $options['priority'] is used by databank generators to specify how
      // effects of a particular entity (e.g. hero class) relate to others (e.g.
      // to artifacts). Imagine a hero has Necromancy skill and Vampire's Cowl
      // artifact: both work like ['relative', 1.10] and resulting rate should be
      // 120%. However, if they had different priorities then result would be
      // 121%: artifact's 10% boost is not added to 10% but is multiplied with it
      // (1.10 * 1.10). Thus we assume a convention when all 'relative' modifiers
      // have the same priority, namely +1 (to allow the user create Effects
      // with the default priority of 0). In constrast, other modifiers like 'const'
      // do use entity-specified priority (e.g. if an artifact changes reanimation
      // creature from Necromancy's Skeletons to Wights using ['const', $wight]).
      if (null !== ($priority = $options['priority'] ?? null)) {
        if ($operation === 'relative' or $operation === 'spellSpec' or ($operation === 'heroSpec' and is_float($effect['modifier'][1]))) {
          $priority = array_search('default', static::priority);
          // heroSpec/spellSpec must combine with 'relative' when mul is float. For example,
          // hero specialty in Sorcery adds 5% to magic damage, which is added
          // to other bonuses, e.g. secondary skill (Sorcery) and artifacts.
          // Resulting calculation should be damage*(all+bonuses) rather than
          // damage*bonus1*bonus2*etc.
          $operation = 'relative';
        }
        if ($operation === 'randomArray') {
          $operation = $effect['modifier'][1] ? 'append' : 'const';
        } elseif ($operation === 'random') {
          $operation = 'delta';
        }
        $effect += compact('priority');
      }

      if (empty($options['keepPriorities']) and   // makes fromShort() idempotent
          isset($effect['priority'])) {
        $hi = array_search('highest', static::priority);
        $lo = array_search('lowest', static::priority);
        if ($effect['priority'] > $hi or $effect['priority'] < $lo) {
          throw new Exception('Effect\'s priority is outside of the operation\'s range.');
        }
        $range = abs($hi) + abs($lo);
        if (fmod($range / 2, 1.0) !== 0.0) {
          throw new Exception('Effect\'s priority range must be even.');
        }
        $effect['priority'] += array_search($operation, static::operation) * $range + $range / 2;
      }
    }

    foreach ($options['placeholders'] ?? [] as $prop => $value) {
      $effect[$prop] === true and $effect[$prop] = $value;
    }

    return new static($effect + ($options['default'] ?? []));
  }

  // Creates indexes from the set of Effect-s that game client needs to load a map.
  //
  // $objects are needed to determine map dimensions for $bySpot (3D).
  // Wrong dimensions will cause run-time problems in ObjectStore when adding
  // a new object at coords in unallocated space. Example:
  //    012
  //   +---+    Here, only X=0/1 and Y=0 have events; without options3D(),
  // 0 |ee |    $bySpot would be [y0 => [x0, x1]] instead of
  // 1 |   |    [y0 => [x0, x1, null], y1 => [null, null, null]]
  //   +---+    and store.addAtCoords(x0, y1, ...) would fail because
  //            y1 exceeds rangeY (which is 1).
  //
  // This doesn't return 'eLabel' (byLabel) because such Effects don't have to
  // be listed in $effects and even if they are, they must not be expanded yet.
  // The caller must create such a store manually using Effect::fromShort() and from1D().
  static function makeIndexes(array $effects, array $objects) {
    extract(array_flip(static::targetIndex), EXTR_SKIP);

    $schema = (new static)->schema();
    $schema = ObjectStore::padSchema($schema);
    $objectOptions = AObject::options3D($objects);
    $byTarget = $byTimed = $byObject = $bySpot = $byEncounter = [];

    foreach ($effects as $i => $effect) {
      $n = $schema * $i;

      $byTarget[$any][$effect->target][] = new StoredNumber($n);

      // Reserve special meaning for $ifObject === 0.
      // null/false mean
      // "any value", 0 can be special for some targets (given that
      // AObject->$id is positive), e.g. when there is no game object associated with a performed action (defending a town without a hero).
      if (is_int($effect->ifObject)) {
        $byObject[$effect->ifObject][] = new StoredNumber($n);
      } else {
        $byTarget[$object][$effect->target][] = new StoredNumber($n);
      }

      if (provided($effect->ifX) and provided($effect->ifY) and provided($effect->ifZ)) {
        $coords = circle($effect->ifX, $effect->$ifY, $effect->ifRadius,
          $objectOptions['strideX'] - 1, $objectOptions['strideY'] - 1);

        foreach ($coords as [$x, $y]) {
          $bySpot[$effect->ifZ][$y][$x][] = new StoredNumber($n);
        }
      } else {
        $byTarget[$spot][$effect->target][] = new StoredNumber($n);
      }

      if (($effect->source[0] ?? null) === array_search('encounter', static::source)) {
        $byEncounter[$effect->source[1]][] = $n;
      }

      foreach (static::timedIndex as $i => $prop) {
        provided($effect->$prop) and $byTimed[$i][] = new StoredNumber($n);
      }
    }

    return [
      'eTarget'   => ObjectStore::from2D($byTarget, [
        'class'   => StoredNumber::class,
        // XXX since 2D cannot grow, dimensions must be determined right now,
        //     but this prevents JS modules from using custom target identifiers;
        //     same with other stores here and in AObject::makeIndexes()
        'strideX' => max(array_keys(static::target)) + 1,
        'strideY' => max(array_keys(static::targetIndex)) + 1,
      ]),
      'eSpot'     => ObjectStore::from3D($bySpot, [
        'class'   => StoredNumber::class,
      ] + $objectOptions),
      'eTimed'    => ObjectStore::from1D($byTimed, [
        'class'   => StoredNumber::class,
        'strideX' => max(array_keys(static::timedIndex)) + 1,
      ]),
      'eObject'   => ObjectStore::from1D($byObject, [
        'class'   => StoredNumber::class,
        'strideX' => max(array_column($objects, 'id')) + 1,
      ]),
      'eEncounter'=> ObjectStore::from1D($byEncounter, [
        'class'   => StoredNumber::class,
        'strideX' => max(array_column($objects, 'id')) + 1,
      ]),
    ];
  }

  // Conditions

  // `'null/`'false selector is untested (matches any value). For boolean selectors (e.g. `'$ifCreatureUndead),
  // given that `'false stands for "no property value" in `'ObjectStore
  // and "untested selector" in Effect, the value is usually converted to integer so `'true/`'false become `'1/`'0.
  //
  // If any Effect's selector is testing `'AObject ID ($ifObject, $ifTargetObject, etc.) and that object is
  // removed - the Effect is automatically removed from the store.

  // Custom selector callback. See $modify for details.
  //= function
  public $test;

  //= int AObject->$id
  public $ifObject;

  //= int AObject::type
  public $ifObjectType;

  //= int Player->$id
  public $ifPlayer;

  //= str 'type' key of Player->$controllers[Player->$controller] `- `'human, `'ai, etc.
  public $ifPlayerController;

  // These must be set only if `'$ifPlayer is set, and both of `'$isAlly/`'$isEnemy cannot be set together.
  // If one is set, Effect only matches for players allied/enemies with
  // `'$ifPlayer. Never matches for `'$ifPlayer himself.
  //
  // Logically following is that if Effect's both $ifPlayer and $ifObject are set, and also any of $isAlly/$isEnemy is set then it matches when $ifObject's currently owning player (which is _opt.ifPlayer) is ally/enemy with $ifPlayer. Without $ifObject it'd match any object owned by $ifPlayer. Without $ifPlayer (and $isAlly/$isEnemy) it'd match for any player that owns $ifObject, while without $is... only it'd match if exactly $ifPlayer owns $ifObject.
  public $isAlly;
  public $isEnemy;

  //= int AObject::vehicle
  public $ifVehicle;

  //= int coordinate of $ifObject `- zero, one or more may be set
  public $ifX;
  public $ifY;
  public $ifZ;
  //= int positive, inclusive`, null single spot `- if set, all 3 of $ifX/Y/Z must be set
  public $ifRadius;

  // Selectors matching in-game date. If $ifDateMin == $ifDateMax, the Effect only matches on that single day.
  public $ifDateMin;  //= int 0-based
  public $ifDateMax;
  public $ifDateDay;  //= int 1-based (1 = Monday)
  public $ifDateWeek; //= int 1-based
  public $ifDateMonth;  //= int 1-based (1 = January)

  public $ifWorldBonus;  //= Map::bonus, matching the part before ',' in Map->$bonus (none/0 if bonus was never picked yet)

  // Specify automatic removal rules (removed
  // as soon as any non-`'null value drops to 0). Values are decremented at
  // the end of event (e.g. end of day or combat), making them inclusive.
  //
  // For example,
  // $maxCombats = 1 makes the Effect last up to and including next combat.
  //
  // $maxDays is global. $maxCombats requires that $ifObject is set (the Effect is removed when that object has ended its Nth combat). $maxRounds requires $ifCombat.
  //
  //= int 1+
  public $maxDays;
  public $maxCombats;
  public $maxRounds;

  // Properties

  public $target; // integer 0+

  // Whether the effect can be serialized (false/null) or must be re-initialized
  // for every game session (true).
  public $dynamic;

  // Free-form identification of what and why this Effect was added.
  //
  // For example, gaining new skill upon a level-up may either add new hero_skills Effect or change $modifier of an existing Effect with the suitable $source.
  //= integer Effect::source`, array [Effect::source, extra...]
  public $source;

  // Auto-remove this Effect if this object is removed.
  //= int AObject->$id
  public $whileObject;

  // Auto-remove this Effect when AObject->$owner of $whileOwned ceases to be $whileOwnedPlayer. If this condition is already false when the Effect is created, it is still added and exists until next $owner change of this object - then the engine checks the condition and possibly removes this Effect.
  //
  // If $whileOwnedPlayer is set, $whileOwned must be also set. If $whileOwnedPlayer is 0, the Effect ceases when any player (not the neutral) owns the object. If it's unset, the Effect ceases when $owner becomes 0 (unowned).
  //
  // Note that this is "while", not "if". If the object changes the owner back, the Effect is not reinstated.
  //
  // $whileOwned and $encounterLabel (quest_reset) are similar but different. $whileOwned allows watching arbitrary object, not necessary the encountered one. quest_reset allows flexibly undoing the Effects (some or all, based on a condition, etc.).
  //
  // quest_reset is in turn similar to $ifGrantedMin/$ifGrantedMax. However, the latter do not remove Effects so if $owner or granted counter changes, such Effects may match again.
  //= int AObject->$id
  public $whileOwned;
  //= int 0+ Player->$id`, null any non-neutral player
  public $whileOwnedPlayer;

  // Affects application of this Effect ($modify, $modifier, etc.),
  // but not testing ($test, $if...).
  //
  // Lower priority is applied first (first -1 (`'const), then `'0 (default), then `'+1 (user), etc.).
  //
  // When creating a new Effect,
  // for targets using `'$modifier and with set `'$modifier, if this is `'null/0
  // then `'$modifier's
  // operation type's default is set, else that default is adjusted by this integer
  // delta (because defaults depend on volatile ::operations indexes). In other cases (e.g. using
  // only `'$modify) `'null equals 0.
  public $priority;

  // Effect's group of application. Unlike with `'$priority, only one Effect out of the same stack affects the value.
  //= array of [::stack, 0+ priority in stack]`, int = ::stack, 0 priority`, null no group
  public $stack;

  // Custom result alteration callback. Only allowed on the JavaScript side for `'$dynamic Effects in single-player mode (mostly for testing).
  // Can only rely on constant data (such as on databank
  // properties) as it cannot trigger `'update() of related Calculator-s. In production,
  // use `'custom operation type or register a new one, and extend Calculator.Effect
  // to do the actual calculation (see how it's done in H3.Rules).
  //= function
  public $modify;

  // Result alteration descriptor in full or short modifier form
  // suitable for $target's value type.
  public $modifier;

  // If non-null, when this Effect is added, its `'$modifier is stored in a global table (prior to expanding shortcuts in Effect's properties) under this key. This has various uses, e.g. in `'quest_chances.
  //
  // Such Effect may be later copied by a `'bonus_effects which has `'$modifier set to this string value (see its shortcuts).
  //
  // If two Effects have the same `'$label then the last added takes place in the table. This may lead to hard to predict consequences or be conversely useful.
  //
  // Global table stores entries forever so use `'$label sparingly.
  public $label;
}

// Returns a boolean if $v is one, else casts it to integer.
//
// Used in StoredObject::$normalize for properties that may be either boolean or integer.
function boolorintval($v) {
  return is_bool($v) ? $v : (integer) $v;
}

// Returns an integer if $v is one, else casts it to string. Used in StoredObject::$normalize.
function intorstrval($v) {
  return is_int($v) ? $v : (string) $v;
}

// Returns null if $v is one, else casts it to integer. Used in StoredObject::$normalize.
function intornullval($v) {
  return $v === null ? null : (integer) $v;
}

// Artifact equipped on a hero or held in its backpack.
// Used as sub-store object of AObject->$artifacts.
class ObjectArtifact extends StoredObject {
  static $normalize = [
    'artifact' => 'intval',
  ];

  public $artifact;
}

// Creature in the party of a hero, town, roaming monster, etc. Equivalent to Map.js' Map.Combat.Creature class.
//
// Used as sub-store object of AObject->$garrison.
//
// Run-time combat units are created from these objects and then receive extra properties (see Map.Combat.Creature).
class Garrison extends StoredObject {
  const origin = [
    'artifact',   // $origin = [<const>, Artifact->$id]
    'spell',      // $origin = [<const>, Spell->$id]
    'fortification',  // $origin = [<const>, Effect::fortification]
  ];

  static $normalize = [
    'creature' => 'intval',
    'count' => 'intval',
    'maxCombats' => 'intval',
    'destroyArtifact' => 'intval',
    'origin' => 'intval',
  ];

  public $creature;   // Creature->$id; must not be false - empty slots must not have any Garrison entry
  public $count;

  // Properties used during a combat that must persist across combats.
  public $maxCombats;   // garrison member removed after this many combats have ended
  public $destroyArtifact;   // Artifact->$id to destroy in garrison's owner (hero) if this creature is killed (e.g. Ammo Cart); usually result of Artifact->$combat
  public $origin;  // ::origin; false - regular garrison origin
}

// Segment in provisional hero's travel route along adventure map.
//
// Used as sub-store object of AObject->$route.
class Route extends StoredObject {
  static $normalize = [
    'x' => 'intval',
    'y' => 'intval',
    'z' => 'intval',
    'direction' => 'intval',
    'cost' => 'intval',
  ];

  public $x;
  public $y;
  public $z;
  // Frame number in group 0 of ADAG.DEF (in the 1st set, the green one).
  public $direction;
  public $cost;   // in $actionPoints
}

// Entry in custom data store associated with a single map AObject, for properties that are not part of AObject's normal schema.
//
// Used as sub-store object of AObject->$extra. See that property's description for details.
class Extra extends StoredObject {
  static $normalize = [];
}

// Automatically generates optimal `'schema() and `'$normalize entries from Chemdoc-like comments above each own property of `'$class.
//
//> class str like `[Foo\Bar`] `- must declare `[static $autoSchema;`] and return `'$autoSchema's value from `'schema()
//> options
//  `> allTypes array of str `- mandatory; determines what `'* stands for
//  `> unroll hash of 'prop' => schema `- value as given to `'unrollKeys();
//     keys that don't correspond to actually defined properties are ignored
//  `> print handle `- enables debug output
//
// Every property that should be included into the schema must be preceded by a comment of this form:
//[
//  /**
//   ...
//  */
//  public $prop;
//]
// Unlike regular comments (`[//`] and `[/* */`]), PHP treats `'/** as a "doc comment" and allows accessing it via reflection.
//
// ` `#autoSchema() groups all properties by their "object type", which is an arbitrary value determining the object layout. For example, `'AObject holds data of objects placed on adventure map; "river", "hero", "artifact" are some "object types" for this class, each with their own type-specific properties.
//
// This function examines every line in the comment, recognizing two line types:
//* Starting with four spaces and `'``#-$ - directive to copy declaration of another property (which name follows). Only recognized if no `'``> lines were seen. Stops comment processing. Recursive copying is allowed.
//  `* As a special case, the entire comment may be one-line of form `[/** ``#-$prop */`].
//* Starting with four spaces and `'``> - declaration of new object type. Starts with the type's name (e.g. `'hero) or special `[*`] (means "all unlisted types"), ends on `[``-`]. In between are value type declarations separated by `[``,`], with syntax explained below. Declaration without types is assumed to have the type of `'false (unused slot) and is excluded from special `[*`].
//* Starting with seven spaces - wrapped continuation of last `'``> line, unless it was already terminated by `[``-`].
//
// Lines with four spaces but not matching any pattern above are ignored (if there was no `'``> seen yet) or stop comment processing.
//
// There may be multiple `'``> lines with the same object type if the type is further split into subtypes (for example, `'hero is the type but a property may have different sets of value types for regular heroes and random heroes). Currently (XXX=I) typesets of all object type's lines are internally merged into one so it doesn't make a difference, but in the future the schema generation algorithm may be improved to account for subtypes and generate more compact schemas. For example, if regular hero uses property `'$A but not `'$B while random hero uses `'$B but not `'$A - current algorithm allocates separate slots for `'hero object type for both `'$A and `'$B, instead of placing them on the same slot.
//
// Value type syntax (spaces are significant):
//[
//  `> otype vtypes[ `-,,,]
//  otype  = *|<identifier>
//  vtypes = ditto|vtsub|vtval
//  vtsub  = [non-layered ](1D|2D|3D) sub-store
//  vtval  = vtype[/vtype[/...]][ ,,,][`, vtval...]
//  vtype  = [varray ]vt
//  varray = array of|hash of [... ]=>
//]
// In natural language, each value type is one of:
//* Special string '`ditto - repeats entire value typeset of the preceding object type declaration, i.e. previous `'``> line.
//* Sub-store - starts with optional `[non-layered`] followed by dimension and `[sub-store`]. The property must be listed in `'$compact.
//* Regular value - starts with optional `[array of`] followed by one or more scalar types (separated by `[/`]). May also start with `[hash of`] followed by arbitrary string until `[=>`] followed by scalar type(s).
//
// Wrapping is allowed only on `',,, parts above, and after `[``,`]. For example, `[array of int\npoints`] is allowed but `[array of\nint points`] is not.
//
// Duplicate value types per one object type are ignored and may be used in different object subtypes or with different descriptions for clarity.
//
// Valid scalar types (`'vt):
//> null `- only valid in array/hash properties since `#ObjectStore doesn't allow `'null/`'undefined values
//> int `- integer (without floating point)
//> str `- string
//> bool `- boolean (`'true or `'false)
//> mixed `- no particular type, the value may be anything
//
// Special scalar types (`'vt):
//> true `- same as specifying `'bool
//> false `- for array/hash properties is the same as `'bool; for others means no value is accepted (if it's the only value type for a given object type then the property is assumed unused by that object type)
//> small integer `- same as `'int but conveys the meaning of exactly zero (`'0), one (`'1) or minus one (`'-1) or any non-negative (`[0+`]) or positive (`[1+`]) integer
//
// Examples:
//[
//  class MyObject extends StoredObject {
//    static $autoSchema;
//
//    /**
//      `> quest false allow humans and AI alike`, 0 allow humans only`,
//         1/true allow AI `- restricts potential benefactors of the quest
//      `> event ditto
//      `> hero mixed internal use
//    */
//    public $allowAI;
//
//    /**
//      `#-$allowAI
//    */
//    public $allowController;
//
//    // Equivalent:
//    /** `#-$allowAI */
//    public $allowController;
//
//    /**
//      `> hero hash of Slot->$id => int Artifact->$id `- equipped artifacts
//      `> quest array of int Artifact->$id`, true random
//    */
//    public $artifacts;
//
//    /**
//      `> * non-layered 2D sub-store `- `'true = impassable interactive spot
//    */
//    public $actionable;
//
//    /**
//      > * int
//      Becomes 2 properties: $resources_wood and $resources_gold.
//    */
//    public $resources_RESOURCE;
//
//    function schema() {
//      return static::$autoSchema;
//    }
//  }
//
//  autoSchema(MyClass::class, [
//    'allTypes' => ['quest', 'event', 'hero'],
//    'resources_RESOURCE' => ['wood' => 0, 'gold' => 1],
//  ]);
//]
function autoSchema($class, array $options) {
  extract($options + [
    'allTypes' => null,
    'unroll' => [],
    'print' => false,   // handle (STDERR, etc.)
  ], EXTR_SKIP);

  $varray = 'array\\sof\\s|hash\\sof\\s.*?=>\\s';
  $vtype = 'null|int|str|bool|true|false|mixed|-1|[01]\\+?';
  $re = "
    /
      ^
      (?<vtypes>
        (?<array>$varray)?
        ($vtype)(\\/($vtype))*
      | (non-layered\\s)?(?<store>[123]D)\\ssub-store
      | ditto
      )
      (\\s|`|$)
    /ux";

  $pending = $props = [];

  foreach (get_class_vars($class) as $prop => $value) {
    $prop = new ReflectionProperty($class, $prop);

    if ($prop->class === $class and !$prop->isStatic()) {
      $comment = substr($prop->getDocComment(), 3, -2);
      strrchr($comment, "\n") or $comment = "    ".trim($comment);

      $types = $lastOType = $skipping = null;

      foreach (explode("\n", $comment) as $line) {
        $line = preg_replace('/^ {4}/u', '', rtrim($line), 1, $count);
        if (!$count) {
          continue;
        }

        if ($lastOType === null and !strncmp($line, '`#-$', 4)) {
          $pending[$prop->name] = substr($line, 4);
          continue 2;
        }

        if (!strncmp($line, '`> ', 3)) {
          strtok($line, ' ');
          $lastOType = strtok(' ');
          if ($lastOType !== '*' and !in_array($lastOType, $allTypes)) {
            throw new Exception("Unknown object type '$lastOType' in $class->\$$prop->name: $line");
          }
          // Add a unique suffix in case of multiple value typesets per object type.
          isset($types[$lastOType]) and $lastOType .= '.'.count($types);
          $line = ltrim(strtok(''));
          $skipping = false;
          // otype line with no types nor "`-", assume vtypes of 'false'.
          strlen($line) or $types[$lastOType][] = ['type' => null];
        } elseif ($lastOType === null) {       // no `> found yet
          continue;
        } elseif (!preg_match('/^   \S/u', $line)) { // not a continuation of `>
          break;
        } else {
          $line = substr($line, 3);   // continuation of `>, remove indentation
        }

        while (strlen($line)) {
          if ($skipping) {
            if (!preg_match('/(`,|`-)(.*)$/u', $line, $match) or $match[1] === '`-') {
              continue 2;
            } else {
              $line = ltrim($match[2]);
              $skipping = false;
            }
          }

          if (!$skipping and strlen($line)) {
            if (!preg_match($re, $line, $match)) {
              throw new Exception("Cannot extract value type from $class->\$$prop->name: $line");
            }

            $vtypes = preg_replace("/^$varray/u", '', $match['vtypes']);

            foreach (explode('/', $vtypes) as $type) {
              switch ($type) {
                case 'null':
                  if (empty($match['array'])) {
                    // ObjectStore doesn't allow null/undefined values.
                    throw new Exception("Null value type is only allowed if part of array; $class->\$$prop->name: $line");
                  }
                  break;
                case 'false':
                  // "false" on its own means the value essentially is never used.
                  if (empty($match['array'])) {
                    $type = null;
                    break;
                  }
                case 'true':
                  $type = 'bool';
                  break;
                default:
                  is_numeric(trim($type, '-+')) and $type = 'int';
              }

              $types[$lastOType][] = [
                'array' => strtok($match['array'] ?? '', ' '),
                'type' => $type,
                'store' => $match['store'] ?? '',
              ];
            }

            $line = substr($line, strlen($match[0]));
            $skipping = true;
          }
        }
      }

      if ($lastOType === null or !$types) {
        throw new Exception("No object types defined for $class->\$$prop->name.");
      }

      $props[$prop->name] = $types;
    }
  }

  foreach ($props as $prop => &$ref) {
    $prev = null;

    $index = array_search('*', array_keys($ref));
    if ($index !== false) {
      $ref = array_slice($ref, 0, $index, true) +
             array_fill_keys(array_diff($allTypes, array_keys($ref)), $ref['*']) +
             array_slice($ref, $index + 1, null, true);
    }

    foreach ($ref as $otype => $vtypes) {
      if ($vtypes[0]['type'] === 'ditto') {
        if (count($vtypes) > 1) {
          throw new Exception("'ditto' of $otype may not be combined with other value types: $class->\$$prop.");
        } elseif (!isset($prev)) {
          throw new Exception("No object type defined before 'ditto' of $otype in $class->\$$prop.");
        } else {
          $ref[$otype] = $vtypes = $prev;
        }
      }

      // Remove 'false' vt-s, won't need them anymore.
      $prev = $ref[$otype] =
        array_filter($vtypes, function ($t) { return isset($t['type']); });

      // If it so happened that an otype only consisted of 'false', it's the
      // same as "not listed" (slot isn't unused) so remove it.
      if (!$prev) {
        unset($ref[$otype]);
      }
    }
  }

  $resolve = function ($prop) use ($props, $pending, &$resolve) {
    if (isset($props[$prop])) {
      return $props[$prop];
    } elseif (isset($pending[$prop])) {
      $prop2 = $pending[$prop];
      unset($pending[$prop]);   // detect circular reference
      return $resolve($prop2);
    } else {
      throw new Exception("`#-\$$prop is undefined.");
    }
  };
  foreach ($pending as $into => $from) {
    $props[$into] = $resolve($from);
  }

  foreach ($props as $prop => $types) {
    $types = array_merge(...array_values($types));

    if ($subs = array_filter(array_column($types, 'store')) and
        !isset($class::$compact[$prop])) {
      throw new Exception("No $subs[0] sub-store entry for \$$prop in $class::\$compact.");
    }

    $unique = array_unique(array_column($types, 'array'));
    $array = count($unique) === 1 ? ($unique[0] ? '*' : '') : null;

    if (isset($array)) {
      $unique = array_unique(array_column($types, 'type'));
      sort($unique);

      $vtype = [
        'bool'      => 'boolval',
        'int'       => 'intval',
        'str'       => 'strval',
        'bool int'  => 'boolorintval',
        'int null'  => 'intornullval',
        'int str'   => 'intorstrval',
      ][join(' ', $unique)] ?? '';
    } else {
      $vtype = '';
    }

    if ($schema = $unroll[$prop] ?? []) {
      foreach ($schema as $name => $value) {
        $class::$normalize[$array.strtok($prop, '_')."_$name"] = $vtype;
      }
    } else {
      $class::$normalize[$array.$prop] = $vtype;
    }

    //$props[$prop]['normalizeArray'] = $array;
    //$props[$prop]['normalizeFunction'] = $vtype;
  }

  if ($print) {
    foreach ($props as $prop => $types) {
      fprintf($print, "$%s:\n", $prop);

      foreach ($types as $otype => $vtypes) {
        foreach ($vtypes as $vtype) {
          fprintf($print, "    %5s  %s%-6s - %s\n",
            $vtype['array'],
            $vtype['array'] ? '*' : ' ',
            $vtype['type'],
            $otype);
        }
      }

      //fprintf($print, "  '%s%s' => '%s',\n", $info['normalizeArray'] ? '*' : '', $prop, $info['normalizeFunction']);

      //$vtype = $class::$normalize[$key = "*$prop"] ?? $class::$normalize[$key = $prop];
      //fprintf($print, "'%s' => '%s',\n", $key, $vtype);
      //fprintf($print, "\n");
    }

    fprintf($print, "\n%s", var_export($class::$normalize, true));
    fprintf($print, "\n\n");
  }

  $subProps = [];

  // hash 'prop' => array of unique sorted 'otype' with stripped '.index'
  foreach ($props as $prop => &$ref) {
    if (array_filter(array_column(array_merge(...array_values($ref)), 'store'))) {
      $subProps[$prop] = true;
    }
    $ref = array_unique(array_map(function ($s) { return strtok($s, '.'); }, array_keys($ref)));
    sort($ref);
  }

  uksort($props, function ($a, $b) use ($props, $unroll) {
    // Put properties requiring most slots (unrolled length) first.
    // This improves slot allocation by reducing fragmentation.
    return max($unroll[$b] ?? [0]) - max($unroll[$a] ?? [0]) ?:
          // Prioritize properties used by most types for better data locality.
           (count($props[$b]) - count($props[$a])) ?:
           strcmp($props[$a][0], $props[$b][0]) ?:  // compare first types' names
           strcmp($a, $b);    // finally, compare property names
  });

  $usedIndexes = array_fill_keys($allTypes, []);

  foreach ($props as $prop => $otypes) {
    $length = max($unroll[$prop] ?? [0]);

    $used = array_merge(...array_values(array_intersect_key($usedIndexes, array_flip($otypes))));
    for ($i = 0; ; $i++) {
      if (!array_intersect($used, $range = range($i, $i + $length)) and
          // Don't place two sub-stores into one slot due to current ObjectStore limitation (see subSchemas()).
          (empty($subProps[$prop]) or !array_intersect_key($subProps, array_flip($range)))) {
        break;
      }
    }

    foreach ($otypes as $otype) {
      array_push($usedIndexes[$otype], ...$range);
    }

    empty($subProps[$prop]) or $subProps += array_fill_keys($range, true);

    $schema = $unroll[$prop] ?? [];
    $base = $schema ? strtok($prop, '_') : $prop;

    if ($schema and isset($class::$autoSchema[$base])) {
      throw new Exception("Regular \$$prop property conflicts with to-be unrolled \$$base.");
    }

    $class::$autoSchema[$base] = $i;

    foreach ($schema as $name => $value) {
      $class::$autoSchema[$base."_$name"] = $i + $value;
    }
  }

  if ($print) {
    foreach ($class::$autoSchema as $prop => $i) {
      $ownProp = $prop;

      if ($base = strtok($prop, '_')) {
        foreach ($unroll as $key => $schema) {
          if (strtok($key, '_') === $base) {
            $ownProp = $key;
            break;
          }
        }
      }

      fprintf($print, "  %-25s => %2d,  // %s\n",
        "'$prop'",
        $i,
        count($props[$ownProp]) === count($allTypes) ? '*' : join(' ', $props[$ownProp]));
    }

    fprintf($print, "\n");
    fprintf($print, "schema length = %d; lengths by object type:\n", max($class::$autoSchema) + 1);

    $lengths = [];
    foreach ($usedIndexes as $otype => $indexes) {
      $lengths[$indexes ? max(array_keys($indexes)) + 1 : 0][] = $otype;
    }
    ksort($lengths);
    foreach ($lengths as $length => $otypes) {
      sort($otypes);
      fprintf($print, "  %d = %s\n", $length, join(' ', $otypes));
    }
  }
}

// ` `#AObject is a central store for every object placed on the adventure map
// (even invisible, such as visiting heroes). It is a big bag of properties,
// many of which are applicable only to some object kinds. Applicability is
// determined by object's `#$type (`'terrain, `'hero, etc.) where `[*`] means
// "all types" (or "all other types" in case `[*`] is not the only listed type). If a type is not listed for a property, it may be put into a union with another property.
class AObject extends StoredObject {
  const vehicle = ['horse', 'ship'];
  const formation = ['spread', 'grouped'];

  const type = [
    'other',
    // These are collectively called "ground".
    'terrain', 'river', 'road',
    // These are collectively called "objects" ("other" is also an "object").
    'town', 'monster', 'hero', 'artifact', 'treasure',
    'mine', 'dwelling', 'boat', 'quest', 'event', 'garrison',
    'teleport',
  ];

  // Since the length of $initialized equals value of the max used constant for a given object type,
  // put random and garrison in the beginning as they are used by most object
  // types (and GenericEncounter).
  const initialized = [
    // Used by H3.Rules whenever new object is created (or on game start), by $type and SoD object class:
    //> artifact `- randomArtifact, randomTreasureArtifact, randomMinorArtifact,
    //  randomMajorArtifact, randomRelic
    //> treasure `- randomResource
    //> monster `- with unset $subclass (random monster)
    //> town `- with unset $subclass (random town)
    //> hero `- randomHero, heroPlaceholder
    //> dwelling `- randomDwelling, randomDwellingByLevel, randomDwellingByTown
    //
    // Also used by GenericEncounter on encounter to determine if quest_chances needs to be examined.
    //
    // Set by h3m2herowo.php.
    //
    // XXX=I refugeeCamp - must reset each Monday
    'random',
    'owner',  // GenericEncounter, if ownable
    'garrison', // hero, monster, GenericEncounter; set by h3m2herowo.php
    'name',  // town, hero, quest; set by h3m2herowo.php
    'buildings', // town; set by h3m2herowo.php
    'portrait', // hero, town; set by h3m2herowo.php
    'experience', // hero, initialized together with $level (if this flag is set, $level is initialized); set by h3m2herowo.php
    'stats', // hero; set by h3m2herowo.php
    'artifacts', // hero; set by h3m2herowo.php
    'biography', // hero; set by h3m2herowo.php
    'combatImage', // hero
    'gender', // hero; set by h3m2herowo.php
    'message', // quest; also handles $completion and $progress
  ];

  static $autoSchema;
  static $autoSchemaPrint;

  static $compact = [
    'texture',
    'animation',
    'passable',
    'actionable',
    'initialized' => 'intval',
    'extra' => 'Extra',
    // The client must set 'strideX' to max artifact slot ID + 1.
    'artifacts' => ['class' => 'ObjectArtifact'],
    'garrison' => 'Garrison',
    'route' => 'Route',
    // The client must set 'strideX' to max Building ID + 1 for towns,
    // to 1 for dwellings, to XXX=I for heroes.
    'available' => ['class' => 'StoredNumber'],
  ];

  // Universal properties.

  /**
    `> * int 1+ `- unique among other `#AObject-s within a given map
    `#ro
    Cannot change after object creation.
  */
  public $id;
  /**
    `> * int AClass->$id
    `#-ro
    This is only informational, somewhat meaningful during map initialiation. Later, AClass' properties may get out of sync with AObject's since object properties may be changed at will. For example, an initialized random hero retains the original `'$class but not `'$texture.

    This value is not SoD's class/subclass (as defined
    in last 3rd/4th columns in OBJECTS.TXT/HEROES.TXT). To determine them,
    query the databank.
  */
  public $class;
  /**
    `> hero int Hero->$id `- regular hero
    `> other int AObject->$id `- prison; $id points to neutral off-map hero
    `> hero int`, false prior to game start `- random hero
    `> hero int Hero->$id (`#$powerRating is unset)`, false (else) `- placeholder hero
    `> town int Town->$id `- regular town
    `> town int`, false prior to game start `- random town
    `> monster int Creature->$id
    `> monster int`, false prior to game start `- random monster
    `> terrain int Animation->$group
    `> river ditto
    `> road ditto
    `> treasure int constants.resources `- resource
    `> treasure int`, false prior to game start `- randomResource
    `> mine int constants.resources `- regular mine
    `> mine int`, false prior to first capture `- abandoned mine
    `> * false
    Can and does change after object creation (such as when replacing
    random town objects at the start of a new game).

    XXX=R $subclass turned out to be a "union in itself" property, i.e. multiple type-dependent properties combined into one slot under the same name. It may be worth breaking it into different properties, each with a proper name (like "heroID" for prison or "animationGroup" for terrain).
  */
  public $subclass;
  /**
    `> * int `#::type the kind of `#$class `- matches AClass->$type
    `#-ro
  */
  public $type;
  // XXX=R replace mirrorX/mirrorY with $mirror array, $compact'ed like $passable: [true, false] = '10'; $mirror[0] is x, [1] is y, or with a bitfield
  /**
    `> * bool `- whether the object should be flipped on adventure map
  */
  public $mirrorX;
  /** `#-$mirrorX */
  public $mirrorY;
  /**
    `> * str`, false transparent `- identifier of the image to draw on adventure map;
       to read, remove commas; to write, split on commas, modify and join back; listed in `'$compact

    Sample value of `#$texture: `[Hh3-def_frame_,SNOWTL,-,,0,-,17`].

    Such a form allows
    changing individual components without knowledge of how all components are
    generated and yet storing the array "stringified" is more efficient than storing as an array given this property
    rarely changes.

    H3 encodes CSS class(es) for ADVMAP. Indexes:
    0. 'Hh3-def_frame_'
    1. AClass->$name
    2. '-'
    3. Features in order, each ending on '-' such as 'tanOwner-activeTurn-'
    4. Group number
    5. '-'
    6. Frame number

    XXX=RH make these indexes consts (same for $animation)
  */
  public $texture;
  /**
    `> * int number of tiles, not pixels `- size of `#$texture image on adventure map
  */
  public $width;
  /** `#-$width */
  public $height;
  /**
    `> * int number of tiles, not pixels `- coordinate of `#$texture image's top left corner measured from adventure map's top left corner
  */
  public $x;
  /** `#-$x */
  public $y;
  /**
    `> * int ground level `- in SoD maps, 0 for overworld objects and 1 for underworld objects
  */
  public $z;
  /**
    `> * int `- z-index specifying how overlapping objects are rendered on adventure map; negative for invisible objects (e.g. used for garrisoned hero and buried grail)
  */
  public $displayOrder;
  /**
    `> * int `- tells how the object is rendered on mini-map:
       `> 0 for "ownable" objects
       `> -2 for "movable" objects `- overlay ownable
       `> -1 for impassable terrain obstacles `- impassable terrain's color depends on the underlying passable tile's `#$miniMap type
       `> > 0 for passable terrain `- value is dictated by CSS
    `#-ro
    Updater of Map.Index doesn't support changes in this property.
  */
  public $miniMap;
  /**
    `> * array of int/null `- type of passability created on adventure map by this object

    Key is a `'propertyIndex in `#Passable (one of: `'type, `'terrain, `'river, `'road).

    Value is that property's value or `'null if not provided (not `'false!).

    Must only address properties that are not part of unions (this is an
   `[AObject::makeIndexes()`] limitation).
  */
  public $passableType;
  /**
    `> * array of mixed in $texture format`, false if not animated or if $texture is false `- identifier of the animation
       displayed on adventure map, superseding `#$texture when `'$animation is set and animations are
       enabled in the UI; listed in `'$compact

    Format is the same as `#$texture's. Indexes: 0 = 'Hanim Hh3-anim_id_',
    1-4 = as in `#$texture.
  */
  public $animation;
  /**
    `> * int duration in ms of one iteration of `#$animation`, false if `#$animation is unused `- used to randomize
       start of animations for objects of the same kind; this is base duration, not adjusted by `'combatSpeed or other options
  */
  public $duration;

  /**
    `> * array of bool `[[x0y0, x1y0, ...]`]`,
       str of `'1s (true) and `'0s (false), accessed like an array`,
       false entirely passable `- listed in `'$compact

    In SoD, there are 240 impassable objects, 911 partly impassable, 117 impassable terrain tiles (Rock), 125 passable objects, 680 passable tiles (terrain, river, road). Using `'false allows to avoid about 800 unnecessary arrays.

    In code, such value may be tested as if it were an array no matter of its actual type as long as index is in bounds.
    `[
      $isPassable = $obj->passable[$n] ?? 1;
      var isPassable = +(obj.passable[n] || 1);

      //   passable | PHP variable | JavaScript variable
      // | false    | (int) 1      | (int) 1
      // | '0'      | (string) '0' | (int) 0
      // | [false]  | (bool) false | may not appear due to $compact
      // | null     | (int) 1      | may not appear in ObjectStore

      // Because:        PHP                    JavaScript
      false[0]      //=> null                   undefined
      null[0]       //=> null                   Cannot read properties of null
      [][0]         //=> Undefined offset: 1    undefined
    `]
  */
  public $passable;
  /**
    `> * array of bool`, str`, false entirely non-actionable `- see
       `#$passable; listed in `'$compact

    In SoD, there are 14 actionable objects, 636 partly actionable, 695 non-actionable, 728 non-actionable ground tiles.

    Actionable spot may or may not be passable (in SoD, only impassable can be actionable). Passable actionable spot is allowed to be part of the move route in any segment; action is triggered when hero steps on it. Impassable actionable spot can be only route's destination. Hidden objects are never triggered and don't affect pathfinding.

    `[
      $isActionable = !empty($obj->actionable[$n]);
      var isActionable = +obj.actionable[n];

      //   actionable | PHP variable | JavaScript variable
      // | false      | true         | NaN
      // | '0'        | true         | (int) 0
      // | [false]    | false        | may not appear due to $compact
      // | null       | false        | may not appear in ObjectStore
    `]

    XXX retrieving an object's actionable spot is a very common task currently done on run-time (Map.actionableSpot()); put it into a property?
  */
  public $actionable;
  /**
    `> * bool `- `'false prevents movement to this object's `#$actionable non-`#$passable spot if the actor is standing (Y) above that spot
  */
  public $actionableFromTop;
  /**
    `> * int Player->$id (0 = unowned/neutral)`, false cannot be owned `-
       also used by GenericEncounter
  */
  public $owner;
  /**
    `> * hash of int `#::initialized => bool `- list of
       initialized properties (e.g. randomly generated name, for `'hero);
       also used by GenericEncounter; listed in `'$compact
  */
  public $initialized;
  /**
    `> * array of mixed array`, false none pending `- asynchronous operations on this object; array must not be empty; current operation is the first member

    Members can be of three kinds: main standalone, main shared (depending on multiple `'AObject-s), secondary. All are arrays of this form:
    `[
      main = 'event' [, param...]
      shared = unique, $id, [$id...,] + main
      secondary = unique, $id
    `]

    When an operation is ready, `[pending_$event`] is fired on `[map.objects`] with the main and shared `'$id-s (which are `@AObject->$id`@) prepended to `'param-s. This happens when `'unique becomes the first member on this and all `'$id-s.

    `'unique is unique among existing `'$pending-s except for those that belong to the same operation.

    `'shared lists `'$id-s of `'secondary-s while `'secondary lists `'shared's `'unique and `'$id.

    End of operation is signaled by removing first member(s). Members may be either added to the end of `'$pending or removed from start (one by one or multiple at once) but not changed. Members representing one shared operation must be added/removed within one `'batch().

    If this object or any shared (`'$id) is removed from the world then the member is removed from still alive objects' `'$pending and `[unpending_$event`] occurs, once, with the same parameters (but some or all passed `'$id-s may not exist, including main's). This may happen even for currently running operation (first member in `'$pending) and before or after `'oremove. Operations with deleted `'$id-s may temporary remain in non-first `'$pending members, and will be silently removed in separate batches when they become first.

    Be cautious not to create deadlocks (when one object's `'$pending waits for another object to become free but that one waits for the first).
  */
  public $pending;
  /**
    `> * non-layered 1D sub-store

    Holds arbitrary data of non-core modules. Usually `'X is 0 but `#$extra may also grow (`'append()). Schema is determined on run-time, in Module's `'alterSchema during map loading.

    Do not use `#$extra if attaching properties to hundreds of objects (e.g. to all tiles) - it will defeat the purpose of `#ObjectStore (every object will receive an array to hold `#$extra values, to access an attached property first need to find its array in objects, normal store optimizations may be unsupported by `#$extra, etc.). Instead, create a specialized store just for that (like done with `#MiniMapTile) or alter existing store's schema (like `[map.objects`], this will slow down new map start but will link your data to the object it belongs to).
  */
  public $extra;

  // Hero properties.

  /**
    `> hero int experience points`, false not `#$initialized yet
  */
  public $experience;
  /**
    `> hero int 0-based
  */
  public $level;

  /**
    `> hero non-layered 1D sub-store `- `'X is ArtifactSlot->$id; when >= `'$id of `'backpack, means the artifact is not equipped; may have gaps
  */
  public $artifacts;

  /**
    `> hero bool
  */
  public $tactics;
  /**
    `> hero false wander normally`, array of int `[[x, y, z, distance]`] to never wander this far (0 to stand still) `- only if AI-controlled
  */
  public $patrol;     // XXX=I
  /**
    `> hero mixed `- provisional travel route on adventure map
  */
  public $route;
  /**
    `> hero int points`, false prior to game start `- assigned by `@H3.Rules`@
    This is a stored copy of the recurring value of `'hero_actionPoints/`'hero_spellPointsv target.
  */
  public $actionPoints;
  /** `#-$actionPoints */
  public $spellPoints;

  /**
    `> hero bool `- an UI flag exempting hero from "select next" button
  */
  public $resting;

  /**
    `> hero int `#::vehicle
  */
  public $vehicle;

  /**
    `> hero array of int `- used internally by `@H3.Rules`@ to store new-level skills pending user choice
    `[
      array of arrays of objects `[{skill: Skill->$id, mastery: ::mastery, affector: Effect n | null}`]
    `]
  */
  public $skillSelect;
  /**
    `> hero int remaining spell casts for current combat round `- SoD allows casting any times on adventure map so `#$combatCasts only affects combats (but there may be other restrictions like on minimal APs)
    This is a stored copy of the recurring value of `'combatCasts target.
  */
  public $combatCasts;
  /**
    `> hero int 1-8 (`#$subclass is unset), false (else) `- placeholder hero;
       see the SoD editor's help for details
  */
  public $powerRating;

  // Town properties.

  /**
    `> town non-layered 1D sub-store `- `'X is Building->$id, `'v is creature count available for hire; doesn't include creatures from external dwellings (by means such as Portal of Summoning)
    `> dwelling ditto `- `'X is Creature->$id
    `> hero ditto `- as `'dwelling; not implemented (XXX=I)
  */
  public $available;
  /**
    `> town int AObject->$id of a `'hero`, false nobody
    `> hero int AObject->$id of a `'town`, false if roaming `- cannot have both `'$garrisoned/`'$visiting set together; `'$garrisoned hero is typically hidden from adventure map
  */
  public $garrisoned;
  /** `#-$garrisoned */
  public $visiting;

  /**
    `> town int `- ascending position in various hero/town lists in the UI
    `> hero ditto
  */
  public $listOrder;

  // Quest guard/seer hut properties.

  /**
    `> quest array of str random groups`, str`, false show none `- converted to `'quest_message on run-time; all 3 of `'$message, `'$progress and `'$completion, whichever of them are arrays, must have the same length (since they are array of group => string)
  */
  public $progress;
  /**
    `> quest array of str random groups`, str`, false show none `- prompt message upon fulfilling the quest, to claim the reward
  */
  public $completion;

  // Various properties, assorted.

  /**
    `> * str`, false none `- message prior to encounter processing; used by GenericEncounter
    `> terrain
    `> river
    `> road
  */
  public $proposal;
  /**
    `> hero int `#::formation `- initial combat arrangement of garrison's creatures
    `> town ditto
    `> garrison ditto
  */
  public $formation;
  /**
    `> hero non-layered 1D sub-store`, false not `#$initialized or empty `- X may have gaps
    `> town ditto
    `> garrison ditto
    `> * ditto `- used by GenericEncounter
    `> terrain
    `> river
    `> road
  */
  public $garrison;
  /**
    `> town false if `#$owner is `'false then pick random town type, else pick `#$owner's (the player's) alignment`, int Player->$id whose alignment to pick `- random town
    `> dwelling false`, int AObject->$id of `'town whose alignment is an additional filter on `#$randomTypes `- random dwelling
  */
  public $randomTypeOf;
  /**
    `> dwelling array of int AClass->$id randomly choosen to replace this object `- random dwelling; may be also filtered by `#$randomTypeOf
  */
  public $randomTypes;
  /**
    `> quest array of str random groups`, str`, false show none `- first encounter message; shown in this order: `'$message (always, only once), `'quest_message (if unmet goal, not if `'$message was shown on this encounter, 0+ times), `'$completion (if met goal, 0+ times, possibly immediately after `'$message), `'bonus_message (only once, after `'$completion was accepted)
    `> treasure ditto `- pandora box: modal message before prompt to "open the box"
    `> event ditto `- modal message before processing the encounter
    `> monster ditto
    This is used by object classes whose prompts don't fit in the standard
    `#GenericEncounter's pipeline.
  */
  public $message;
  /**
    `> monster false pick from all creatures`, int pick from creatures of
       a certain level`, array of int levels
  */
  public $randomLevel;
  /**
    `> treasure false random ruleset-specific range`, int fixed quantity
       `- random resource; in case the determined type is `''gold, this is
       multiplied by 100 after rolling dice
  */
  public $randomQuantity;
  /**
    `> * array of int Effect n `- internally used by GenericEncounter to track
       added Effects; used by objects with `'quest_reset like Windmill and by
       `'town whose buildings are also a kind of encounter
    `> terrain
    `> river
    `> road
  */
  public $encounterEffects;
  /**
    `> teleport false = []`, int single AObject->$id`, array of int $id
       `- new position for objects (heroes) stepping on this object (without triggering destination's spot effects); may be or may list own `'$id; non-existing `'$id-s are ignored; if array, random `'$id is chosen every time; if target has multiple `#$actionable-s, random one is chosen every time; if it has none, its `#$x/`#$y/`#$z are used; if no destinations are possible, encounter does nothing (or shows a class-specific message); `'$id typically but not necessarily specifies another `'teleport-type `'AObject (but `'terrain is equally useful)
  */
  public $destination;

  // Creates indexes from the set of AObject-s that game client needs to load a map.
  //
  //> object array id => AObject `- AObject-s must have assigned $width/$height
  //> options
  //  `> players array of MapPlayer
  static function makeIndexes(array $objects, array $options) {
    extract($options, EXTR_SKIP);
    $byType = $byOwner = $miniMap = $byPassable = $bySpot = [];

    foreach ($objects as $obj) {
      $byType[$obj->type][] = new StoredNumber($obj->id);
      $obj->owner and $byOwner[$obj->owner][] = new StoredNumber($obj->id);

      foreach ($obj->passable() as $n => $isPassable) {
        $y = $obj->y + intdiv($n, $obj->width);
        $x = $obj->x + $n % $obj->width;

        $ref = &$byPassable[$obj->z][$y][$x];
        $ref or $ref = new Passable(['impassable' => 0]);
        if ($obj->displayOrder >= 0) {
          $isPassable or $ref->impassable++;
          if (!empty($obj->actionable[$n])) {
            $ref->actionable++;
            $obj->actionableFromTop or $ref->actionableNH++;
          }
        }
        if (provided($obj->passableType)) {
          $schema = array_flip($ref->schema()); // unions not supported (yet?)
          foreach ($obj->passableType as $prop => $value) {
            if (provided($value)) {
              // Assuming there can't be conflicts when two tiles of different types
              // are placed on one spot (e.g. dirt and water).
              $ref->{$schema[$prop]} = $value;
            }
          }
        }

        $bySpot[$obj->z][$y][$x][] = new SpotObject([
          'id' => $obj->id,
          'type' => $obj->type,
          'displayOrder' => $obj->displayOrder,
          'actionable' => (empty($obj->actionable[$n]) and $isPassable) ? null :
            array_search(!empty($obj->actionable[$n]) ? 'actionable' : 'impassable', SpotObject::actionable),
          'corner' => [
            $n === 0,
            $n === $obj->width - 1,
            $n === $obj->width * $obj->height - 1,
            $x === $obj->x and $y === $obj->y + $obj->height - 1,
          ],
        ]);
      }
    }

    foreach ($bySpot as $z => $ys) {
      foreach ($ys as $y => $xs) {
        foreach ($xs as $x => $layerObjects) {
          // XXX=RH consts
          $anchors = [3 => null, 2 => null, 1 => null, 0 => null];

          foreach ($layerObjects as $l => $spot) {
            $obj = $objects[$spot->id];

            // Map.js supports monster objects of arbitrary size but here for
            // simplicity (XXX) we assume they are point (1x1) because this is the
            // case in SoD.
            if ($spot->actionable === array_search('actionable', $spot::actionable)
                and $obj->type === array_search('monster', static::type)) {
              $type = $byPassable[$z][$y][$x]->type;
              foreach (range($x - 1, $x + 1) as $gx) {
                foreach (range($y - 1, $y + 1) as $gy) {
                  // Not out of map bounds and same ground type (water monsters guard only water tiles).
                  $guarded = ($byPassable[$z][$gy][$gx]->type ?? NAN) === $type;
                  //$guarded and $byPassable[$z][$gy][$gx]->guarded++;
                  foreach ($bySpot[$z][$gy][$gx] as $o) {
                    if ($o->id === $obj->id) {
                      $o->guarded = array_search($guarded ? 'guarded' : 'terrain', SpotObject::guarded);
                      $guarded = null;
                      break;
                    }
                  }
                  if ($guarded !== null) {
                    // In HeroWO, 'monster' should have at least 1 cell around its (only) actionable spot. See AClass->$adjusted.
                    throw new Exception("No \$bySpot entry found for #$guarded of $obj->id at ($gx;$gy;$z).");
                  }
                }
              }
            }

            if (provided($obj->miniMap) and ($obj->miniMap > 0 /* passable */ or
                  !$obj->passable()[($x - $obj->x) + ($y - $obj->y) * $obj->width])) {
              if (in_array($obj->miniMap, [0, -2])) {
                $anchors[2 + !!$obj->miniMap] = new MiniMapTile(['owner' => $obj->owner]);
              } elseif ($obj->miniMap === -1) {
                // If there's no passable terrain tile,
                // draw anyway with some kind of passable.
                $anchors[1] = new MiniMapTile(['terrain' => 1]);
                foreach ($bySpot[$z][$y][$x] ?? [] as $passable) {
                  $passable = $objects[$passable->id];
                  if ($passable->miniMap > 0) {
                    $anchors[1] = new MiniMapTile(['terrain' => $passable->miniMap]);
                    break;
                  }
                }
              } else {
                $anchors[0] = new MiniMapTile(['terrain' => $obj->miniMap]);
              }
            }
          }

          foreach ($anchors as $type => $tile) {
            if ($tile) {
              $miniMap[$z][$y][$x] = $tile;
              $tile->type = $type;
              break;
            }
          }
        }
      }
    }

    // See the comment in Effect::makeIndexes().
    $options3D = static::options3D($objects);

    // There should be at least one object in $objects so not giving 'class'
    // option for indexes where one object unconditionally creates one index entry.
    return [
      'type'      => ObjectStore::from1D($byType, [
        'strideX' => max(array_keys(static::type)) + 1,
      ]),
      'owner'     => ObjectStore::from1D($byOwner, [
        'class'   => StoredNumber::class,
        'strideX' => max(array_column($players, 'player')) + 1,
      ]),
      'passable'  => ObjectStore::from3D($byPassable, $options3D),
      'spot'      => ObjectStore::from3D($bySpot, $options3D),
      'mini'      => ObjectStore::from3D($miniMap, [
        'class'   => MiniMapTile::class,
      ] + $options3D),
    ];
  }

  // Returns an empty 3D array of empty arrays (layers) with strides matching size of the map.
  static function fill3D(array $objects) {
    extract(static::options3D($objects), EXTR_SKIP);
    return array_fill(0, $strideZ, array_fill(0, $strideY, array_fill(0, $strideX, [])));
  }

  // Returns options for from3D() that guarantee creating a store whose dimensions match size of the map.
  //
  // Assuming $objects consists of AObject instances where $x/$y/$z and
  // $width/$height are >= 0.
  //
  // If there are no $objects returns [0, 0, 0].
  //
  // Results should match Map->$width/$height, including $margin.
  static function options3D(array $objects) {
    $x = $y = $z = -1;
    foreach ($objects as $obj) {
      $x = max($x, $obj->x + $obj->width  - 1);
      $y = max($y, $obj->y + $obj->height - 1);
      $z < $obj->z and $z = $obj->z;
    }
    return ['strideX' => $x + 1, 'strideY' => $y + 1, 'strideZ' => $z + 1];
  }

  // Returns standardized array of bool indicating im/passable spots within this object's box, regardless of the used $passable format.
  function passable() {
    if (is_string($this->passable)) {
      return str_split($this->passable);
    } else {
      return $this->passable ?: array_fill(0, $this->width * $this->height, true);
    }
  }

  function normalize($compact = false) {
    if (static::$compact['extra'] === 'Extra' and $this->extra) {
      throw new Exception('AObject->$extra must be initially empty because of dynamic schema.');
    }
    return parent::normalize($compact);
  }

  function compact_texture(array $value) {
    return join(',', $value);
  }

  function compact_animation(array $value) {
    return $this->compact_texture($value);
  }

  function compact_passable(array $value) {
    return count(array_filter($value)) === count($value) ? false
      : join(array_map('intval', $value));
  }

  function compact_actionable(array $value) {
    return !array_filter($value) ? false : join(array_map('intval', $value));
  }

  function schema() {
    return static::$autoSchema;
  }
}