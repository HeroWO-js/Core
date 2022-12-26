<?php
// Provides insight into maps existing on the server and allows to upload new maps.
//
// Enabling ngx_http_uploadprogress_module for this script's directory + /PROGRESS will allow visitor uploading a map see the transfer progress. Check the comment later here for details.

require __DIR__.'/api.php';

// Returns one random space-separated substring in $urls.
function sample($urls) {
  $urls = explode(' ', $urls);
  return $urls[array_rand($urls)];
}

// Replaces symbols that cannot be safely used in a file name with a space.
function cleanFileName($str) {
  // Trimming is actually necessary because on Windows mkdir() enigmatically
  // fails if the cleaned path ends on space (like "Resource War (Allies)").
  return trim(preg_replace('/[^\\w\\-]+/u', ' ', $str));
}

// Recursively removes a directory, resolving symlinks and ignoring directories whose paths don't start with $root.
//
// $root must be canonicalized, with $ds in the end.
function removeDir($path, $root) {
  foreach (scandir($path, SCANDIR_SORT_NONE) as $file) {
    if ($file !== '.' and $file !== '..') {
      $real = realpath("$path/$file");
      if (!strncmp($real, $root, strlen($root))) {
        is_dir($real) ? removeDir($real, $real.DIRECTORY_SEPARATOR) : unlink($real);
      }
    }
  }

  rmdir($path);
}

$password = $_REQUEST['mapPassword'] ?? $_COOKIE['mapPassword'] ?? '';
if (!strlen($password)) {
  $password = hash_hmac('sha1', ip2long($_SERVER['REMOTE_ADDR']), __DIR__);
  $password = substr(base_convert($password, 16, 36), 0, 5);
  setcookie('mapPassword', $password, 2147483647);
}

$directory = $_REQUEST['mapDirectory'] ?? $_COOKIE['mapDirectory'] ?? '';
if (!strlen($directory)) {
  $directory = ['Claxton', 'Marishen', 'Facture', 'Hellwind', 'Ghostwind',
                'Darkhold', 'Morganheim', 'Deadfall', 'Magmetin'];
  $directory = $directory[abs(crc32($password)) % count($directory)];
  setcookie('mapDirectory', $directory, 2147483647);
}

header('Content-Type: text/html; charset=utf-8');
$ds = DIRECTORY_SEPARATOR;
$userRoot = 'User';   // configurable path with / separators, relative to 'mapPath'
$do = $_REQUEST['do'] ?? null;

if ($do === 'dl' or $do === 'delete') {
  $mapPath = realpathOrFail(keyValue('maps')).$ds;
  $path = realpath($mapPath.rawurldecode($_REQUEST['map']));

  if (strncmp($path, $mapPath, strlen($mapPath)) or
      !is_file("$path/map.json")) {
    throw new Exception('Invalid ?map value.');
  }

  if ($do === 'dl') {
    $map = json_decode(file_get_contents("$path/map.json"));
    $name = cleanFileName($map->title);
    $file = "$path/$name.zip";

    if (!is_file($file) or filemtime($file) < filemtime("$path/map.json")) {
      $zip = new ZipArchive;

      if ($zip->open("$file-", ZipArchive::CREATE | ZipArchive::OVERWRITE) === true and
          $zip->addFile("$path/combined.json", 'combined.json') === true) {
        // May be missing.
        $zip->addFile("$path/original.h3m", ($name ?: 'original').'.h3m');
        $comment = "[$map->origin] $map->title\n".
                   "$map->id R$map->revision (".join(' ', $map->modules).")\n".
                   "\n".
                   "$map->description\n";
        $zip->setArchiveComment($comment);
        $zip->close();
      } else {
        throw new Exception("Problem creating ZIP archive: $file-");
      }

      // ZipArchive saves the file if open() succeeded but even if an error
      // occurred later. This means it could be half-created. Avoid that by
      // using an intermediate file.
      rename("$file-", $file);
    }

    $url = sample(keyValue('mapsURL'));
    header("Location: $url$_REQUEST[map]/".rawurlencode($name).".zip");
  } elseif ($do === 'delete') {
    $expectedPassword = uploadInfo($path)['password'] ?? null;
    if ($expectedPassword === null) {
      // do=delete's responses are usually shown inside a hidden <iframe>
      // so output a text message for scripts and alert for humans.
      //
      // Strange enough, when this response appears in a top window (dedicated
      // tab), document.body.innerText returns only the p's text as expected.
      // But when loaded inside <iframe> it includes the <script> content too.
      echo '<p id="msg">The map was uploaded with no password and therefore cannot be edited.</p>';
      echo '<script>alert(msg.innerText)</script>';
    } elseif (hash_equals($expectedPassword, $password)) {
      removeDir($path, $path.$ds);
      echo 'The map was deleted.';
      // No need to alert, SSE will indicate the update.
    } else {
?>
  <p id="msg">Your password (<b><?=htmlspecialchars($password)?></b>) does not match the one this map was uploaded with. Want to try another password?</p>
  <script>
    var pw = prompt(msg.innerText, <?=escapeHtmlScriptJSON(encodeJsonLine($password))?>)
    if (pw) {
      location.href += '&mapPassword=' + encodeURIComponent(pw)
    }
  </script>
<?php
    }
  }

  exit;
}

require __DIR__.'/databank/h3m2herowo.php';

if (!class_exists('HeroWO\H3M\H3M')) {
  throw new Exception('h3m2json.php is required for this script to work.');
}

// To avoid confusion, subfolder's name must match databank's version.
$databankForNew = keyValue('databank');
$databanks = [];

foreach (scandir($path = keyValue('databanks'), SCANDIR_SORT_NONE) as $file) {
  if (is_file($consts = "$path/$file/constants.json")) {
    $consts = json_decode(file_get_contents($consts));
    $consts->path = "$path/$file";
    $databanks[$file] = $consts;
  }
}

uasort($databanks, function ($a, $b) {
  return -(strrchr($a->date, ' ') - strrchr($b->date, ' ')) ?:
         strcmp($a->path, $b->path);
});

if ($do === 'upload') {
  header('X-Accel-Buffering: no');

  // This output is not guaranteed to make it to the browser.
  register_shutdown_function(function () {
    echo '<script>';
    echo 'window.parent.uploadProgress("iframeLoaded");';
    if (error_get_last()) {
      echo 'document.body.className = "error";';
    }
    echo '</script>';
  });
?>
  <style>
    .error { background-color: #fcc; }
    .written { background-color: #cfc; }
    .skipped { background-color: #ddd; }
    .clean { background-color: #efe; }
    .unclean { background-color: lavenderblush; }
    th { text-align: left; }
    th, td { padding: .25em .5em; }
  </style>
  <body>
  <!-- Explicitly opening body immediately clears previous iframe's content and
       background. -->
<?php
  $clean = true;
  // Keys: error (final; will have no other keys), existing (subdir in maps/$directory; set regardless of ?existing), path (path of the new map relative to maps/; null means skipped due to ?existing or badPassword), badPassword (if ?existing is overwrite; bool of testing mapPassword; true means override happened; if false then path is null).
  $addedMaps = [];

  // realpath() to allow masking local file system paths in ConvertorFilter.
  $temp = realpathOrFail(tempnam(sys_get_temp_dir(), ''));
  unlink($temp);
  mkdir($temp);
  mkdir($tempOut = $temp.'O'.$ds);

  function uniquePath($base, $prefix = '') {
    $path = $base;

    for ($i = 2; file_exists($prefix.$path); ++$i) {
      $path = "$base ($i)";
    }

    return $path;
  }

  $addedMapKey = function ($base) use (&$addedMaps) {
    $key = $base;

    for ($i = 2; isset($addedMaps[$key]); ++$i) {
      $key = "($i) $base";
    }

    return $key;
  };

  $detectType = function ($header) {
    return ['PK' => 'zip', '{"' => 'json', "{\n" => 'json', "{\r" => 'json', '{ ' => 'json'][$header] ?? 'h3m';
  };

  $copyCombined = function
      ($isStream, $source, $sourceAmKey, $sourceHTML, $outDir)
      use (&$clean, $databanks, $tempOut, &$addedMaps) {
    $sourceData = call_user_func($isStream ? 'stream_get_contents' : 'file_get_contents', $source);
    $data = json_decode($sourceData);
    $map = $data->{'map.json'} ?? null;

    if (!is_object($data)) {
      echo '<p>', $sourceHTML, ' was skipped due to JSON error: ', htmlspecialchars(json_last_error_msg()), '</p>';
      $addedMaps[$sourceAmKey] = ['error' => 'JSON error'];
      return $clean = false;
    } elseif (($map->format ?? null) !== FORMAT_VERSION) {
      echo '<p>', $sourceHTML, ' was skipped due to unknown $format (', htmlspecialchars(var_export($map->format ?? null, true)), ')</p>';
      $addedMaps[$sourceAmKey] = ['error' => 'Unknown HeroWO format'];
      return $clean = false;
    } elseif (empty($databanks[$map->databank])) {
      echo '<p>', $sourceHTML, ' was skipped due to unknown databank version (', htmlspecialchars($map->databank), ')</p>';
      $addedMaps[$sourceAmKey] = ['error' => 'Unknown databank'];
      return $clean = false;
    }

    mkdir($outDir = $tempOut.$outDir);

    if ($isStream) {
      file_put_contents("$outDir/combined.json", $sourceData);
    } else {
      move_uploaded_file($source, "$outDir/combined.json");
    }

    file_put_contents("$outDir/txt", $sourceAmKey);

    foreach ($data as $mapFile => $mapData) {
      // combined.json always uses / for separators.
      $dir = dirname($mapFile);
      if ($dir !== '.' and
          !preg_match('~(^|[\\\\/])\.\.($|[\\\\/])~u', $mapFile)) {
        mkdir("$outDir/$dir");    // standard keys are one level deep folders
        if (strncmp(realpath("$outDir/$dir"), $tempOut, strlen($tempOut))) {
          rmdir("$outDir/$dir");
          echo '<p>', $sourceHTML, ' has invalid key (', htmlspecialchars($mapFile), ')</p>';
          $clean = false;
          continue;
        }
      }
      touch("$outDir/$mapFile");
      if (strncmp(realpath("$outDir/$mapFile"), $tempOut, strlen($tempOut))) {
        unlink("$outDir/$mapFile");
        echo '<p>', $sourceHTML, ' has invalid key (', htmlspecialchars($mapFile), ')</p>';
        $clean = false;
      } else {
        file_put_contents("$outDir/$mapFile", encodeJsonLine($mapData));
      }
    }
  };

  $zip = new ZipArchive;
  $totalH3M = $totalJSON = 0;

  foreach ($_FILES['maps']['name'] as $uploadIndex => $uploadName) {
    $path = $_FILES['maps']['tmp_name'][$uploadIndex];

    if (!is_uploaded_file($path)) {
      if ($_FILES['maps']['error'][$uploadIndex] !== UPLOAD_ERR_NO_FILE) {
        echo '<p><b>', htmlspecialchars($uploadName), '</b> was not uploaded due to PHP error #', (int) $_FILES['maps']['error'][$uploadIndex], '</p>';
        $clean = false;
        $addedMaps[$addedMapKey($uploadName)] = ['error' => 'Upload error'];
      }
      continue;
    }

    $type = $detectType(file_get_contents($path, false, null, 0, 2));

    if ($type === 'zip') {
      $open = $zip->open($path, ZipArchive::CHECKCONS);

      if ($open !== true) {
        echo '<p><b>', htmlspecialchars($uploadName), '</b> could not be opened due to PHP ZipArchive error #', (int) $open, '</p>';
        $clean = false;
        $addedMaps[$addedMapKey($uploadName)] = ['error' => 'Archive error'];
      } else {
        for ($i = 0; $i < count($zip); ++$i) {
          $name = $zip->getNameIndex($i);
          // Skip directory entries.
          if (strpbrk(substr($name, -1), '\\/')) { continue; }

          // No getStreamIndex() in PHP 7.
          $entry = $zip->getStream($name);

          if (!$entry) {
            echo '<p><b>', htmlspecialchars($name), '</b> inside <b>', htmlspecialchars($uploadName), '</b> could not be opened.</p>';
            $clean = false;
            $addedMaps[$addedMapKey("$uploadName / $name")] = ['error' => 'Stream error'];
          } else {
            $entryType = $detectType(fread($entry, 2));

            if ($entryType !== 'json' and $entryType !== 'h3m') {
              echo '<p><b>', htmlspecialchars($name), '</b> inside <b>', htmlspecialchars($uploadName), '</b> was ignored due to wrong type (<b>', htmlspecialchars($entryType), '</b>).</p>';
              $addedMaps[$addedMapKey("$uploadName / $name")] = ['error' => 'Unknown format'];
            } else {
              // ZipArchive streams don't support rewind($entry).
              fclose($entry);
              $entry = $zip->getStream($name);
              $file = "$uploadIndex-$i";

              $key = $addedMapKey("$uploadName / $name");
              $addedMaps[$key] = ['error' => 'Not processed (bug)'];

              if ($entryType === 'json') {
                $sourceHTML = '<b>'.htmlspecialchars($name).'</b> inside <b>'.htmlspecialchars($uploadName).'</b>';
                $copyCombined(true, $entry, $key, $sourceHTML, $file);
                ++$totalJSON;
              } else {
                $h = fopen("$temp/$file.h3m", 'wb');
                stream_copy_to_stream($entry, $h);
                fclose($h);
                file_put_contents("$temp/$file.h3m.txt", $key);
                ++$totalH3M;
              }
            }

            fclose($entry);
          }
        }

        $zip->close();
      }

      unlink($path);
    } else {
      $file = $uploadIndex;

      $key = $addedMapKey($uploadName);
      // Expected to be overwritten by the subsequent processing.
      $addedMaps[$key] = ['error' => 'Not processed (bug)'];

      if ($type === 'h3m') {
        move_uploaded_file($path, "$temp/$file.h3m");
        file_put_contents("$temp/$file.h3m.txt", $key);
        ++$totalH3M;
      } else {
        $sourceHTML = '<b>'.htmlspecialchars($uploadName).'</b>';
        $copyCombined(false, $path, $key, $sourceHTML, $file);
        ++$totalJSON;
      }
    }
  }

  ob_flush();
  flush();

  // Overwrite policy is in no way atomic. There may have been changes
  // in existing maps while the upload was being processed. But for our use case
  // this is acceptable.
  $existingMaps = [];   // relative to $directory
  $mapPath = realpathOrFail(keyValue('maps')).$ds;
  $directory = "$userRoot/$directory";
  is_dir($mapPath.$directory) or mkdir($mapPath.$directory, 0777 /*umask'd*/, true);
  $userRoot = realpathOrFail($mapPath.$userRoot).$ds;
  if (strncmp($ep = realpath($mapPath.$directory), $userRoot, strlen($userRoot))) {
    // Not removing above-created mkdir()-s because don't know which were
    // created and which existed.
    throw new Exception("\$directory points outside of \$userRoot: $ep");
  }
  foreach (scandir($mapPath.$directory) as $file) {
    if (is_file($path = "$mapPath$directory/$file/map.json")) {
      try {
        $map = json_decode(file_get_contents($path));
        $existingMaps[$map->id] = $file;
        $existingMaps[$map->title] = $file;
      } catch (Throwable $e) {}
    }
  }

  $cli = new class extends CLI {
    public $_total = 0;
    public $_processed = 0;
    public $_addedMaps;
    public $_checkSkipConverted;

    protected function processFile($inputPath, $outputPath, $autoOutputPath) {
      ++$this->_processed;
      try {
        $res = parent::processFile(...func_get_args());
      } catch (Throwable $e) {
        $this->_addedMaps[file_get_contents("$inputPath.txt")] = ['error' => get_class($e)];
      }
      isset($res) and copy("$inputPath.txt", $res['builder']->outputPath."/txt");
      echo '<script>';
      echo 'window.parent.uploadProgress({iframe: true, received: ', $this->_processed, ', size: ', $this->_total, '});';
      echo '</script>';
      ob_flush();
      flush();
      if (isset($e)) { throw $e; }
      return $res;
    }

    // $h3m is never null because we override checkSkipConverted().
    protected function herowoSubfolder($outputPath, HeroWO\H3M\H3M $h3m = null) {
      return uniquePath(parent::herowoSubfolder($outputPath, $h3m));
    }

    protected function checkSkipConverted($outputPath, $inputPath) {
      // Closure because it's too troublesome to pass all used variables into
      // this scope.
      if (call_user_func($this->_checkSkipConverted, $inputPath)) {
        return true;
      }
    }
  };

  $cli->_total = $totalH3M;
  $cli->_addedMaps = &$addedMaps;

  // Technically we don't have to check in advance if the map exists because
  // the policy will be again checked when moving content of $tempOut.
  // However, doing so prevents wasting resources and the user's time.
  $cli->_checkSkipConverted = function ($inputPath)
      use ($cli, $existingMaps, $directory, $mapPath, $password, &$addedMaps) {
    switch ($_REQUEST['existing']) {
      case 'skip':
      case 'overwrite':
        $cx = new HeroWO\H3M\Context;
        $cx->charset = $cli->charset;
        $cx->partial = $cx::HEADER;
        $h = fopen($inputPath, 'rb');
        if (HeroWO\H3M\isCompressed($h)) {
          fclose($h);
          $h = gzopen($inputPath, 'rb');
        } else {
          rewind($h);
        }
        try {
          $cx->readUncompressedH3M(new HeroWO\H3M\PhpStream($h));
        } catch (Throwable $e) {}
        fclose($h);
        if (isset($cx->h3m->name) and
            null !== $file = ($existingMaps[$cx->h3m->name] ?? null)) {
          if ($_REQUEST['existing'] === 'overwrite') {
            $expectedPassword = uploadInfo("$mapPath$directory/$file")['password'] ?? null;
            $badPassword = (!isset($expectedPassword) or !hash_equals($expectedPassword, $password));
            if (!$badPassword) {
              // Continue with parsing because the password matches and we will
              // replace the existing map with the parsed one.
              return;
            }
          }
          // Bypassing $outputStream HTML escape filter.
          echo '[skip, exists in <b>', htmlspecialchars("$directory/$file"), '</b>] ';
          $addedMaps[file_get_contents("$inputPath.txt")] = ['existing' => "$directory/$file"] + compact('badPassword');
          return true;
        }
    }
  };

  class ConvertorFilter extends php_user_filter {
    #[ReturnTypeWillChange]
    function filter($in, $out, &$consumed, $closing) {
      while ($bucket = stream_bucket_make_writeable($in)) {
        $bucket->data = $this->convert($bucket->data);
        $consumed += $bucket->datalen;
        stream_bucket_append($out, $bucket);
      }

      return PSFS_PASS_ON;
    }

    protected function convert($str) {
      // Path masking is optimistic because there is a chance that a path will
      // be split between several buckets.
      return htmlspecialchars(str_replace($this->params, '', $str));
    }
  }

  $args = [
    $cli->scriptFile,
    $temp,
    $tempOut,
    '-d',
    // All official SoD versions can be generated using the same databank.
    // When we support maps of modifications like HotA, we'll have to have
    // either several calls to h3m2herowo.php with different -d suitable for
    // each mod, or databank selection logic will have to be built into
    // h3m2herowo.php.
    $databanks[$databankForNew]->path,
    '-M',     // retain original.h3m
    '-ih',
    '-oj',
  ];

  if (!empty($_REQUEST['h3m']['charset'])) {
    $args[] = '-s';
    $args[] = $_REQUEST['h3m']['charset'];
  }

  empty($_REQUEST['h3m']['ignoreBadInputFiles']) or $args[] = '-ei';
  empty($_REQUEST['h3m']['failOnWarning']) or $args[] = '-ew';
  empty($_REQUEST['h3m']['dumpStructure']) or $args[] = '-i';
  empty($_REQUEST['h3m']['dumpStatistics']) or $args[] = '-is';

  echo '<pre>';

  $cli->outputStream = $cli->errorStream = fopen('php://output', 'a');
  $filter = ConvertorFilter::class;
  stream_filter_register($filter, $filter);
  stream_filter_append($cli->outputStream, $filter, STREAM_FILTER_WRITE, [$temp.$ds, $tempOut]);

  try {
    $cli->parseArgv($args);
    $code = $cli->run();
    // If no .h3m were processed (3), consider it a success if there was at
    // least one .json or .h3m file uploaded (even if all were skipped).
    $clean &= ($code === 0 or ($code === 3 and ($totalH3M or $totalJSON)));
  } catch (HeroWO\H3M\CliError $e) {
    // Masks maps path and escapes HTML.
    fprintf($cli->errorStream, "(!) %s\n", $e->getMessage());
  } catch (Throwable $e) {
    fprintf($cli->errorStream, "(!) Unexpected error of type %s\n", get_class($e));
  } finally {
    fclose($cli->outputStream);
    echo '</pre>';
  }

  // The longest step is map convertion, which is done. Now just quickly move
  // files into place even if the client has disconnected. This should
  // minimize the number of junk folders. Note that even if some junk folder
  // appears, it won't be seen as a proper map because map.json is written on
  // completion.
  ignore_user_abort(true);

  foreach (scandir($tempOut) as $file) {
    $path = "$tempOut/$file";

    if (is_file("$path/map.json")) {
      $map = json_decode(file_get_contents("$path/map.json"));
      $key = file_get_contents("$path/txt");
      unlink("$path/txt");

      $addedMaps[$key] = [
        'existing' => $existing = $existingMaps[$map->id] ?? $existingMaps[$map->title] ?? null,
      ];

      if ($existing !== null) {
        switch ($_REQUEST['existing']) {
          case 'skip':
            continue 2;
          case 'overwrite':
            $expectedPassword = uploadInfo("$mapPath$directory/$existing")['password'] ?? null;
            $bad = $addedMaps[$key]['badPassword'] = (!isset($expectedPassword) or !hash_equals($expectedPassword, $password));
            if ($bad) {
              $clean = false;
              continue 2;
            }
            $addedMaps[$key]['path'] = "$directory/$existing";
        }
      }

      $addedMaps[$key] += [
        'path' => uniquePath("$directory/".cleanFileName($map->title), $mapPath),
      ];

      $destPath = $mapPath.$addedMaps[$key]['path'];
      $overwriting = is_dir($destPath);

      $info = [
        'password' => $password,
        'changeTime' => time(),
        'changeIP' => $_SERVER['REMOTE_ADDR'],
        // + addTime/addIP, playTime/playCount (per 24h)
      ];

      if ($overwriting) {
        // Prevent the folder from being detected as containing a valid map while we're moving the new map over. Keeping old directory around (with the renamed map.json) until the new is in place to avoid losing the map if the move is incomplete (but somebody will have to rename map.json back, or set up a cron job to do that).
        rename("$destPath/map.json", "$destPath/map.json-");
        $info += (array) uploadInfo($destPath);
        rename($destPath, $oldDest = uniquePath($destPath));
      } else {
        $info += [
          'addTime' => time(),
          'addIP' => $_SERVER['REMOTE_ADDR'],
        ];
      }

      $move = function ($from, $to) use (&$move) {
        // Intermediate components in $directory which is the parent of
        // $destPath ("$destPath/..") were created earlier in the script.
        mkdir($to);

        foreach (scandir($from, SCANDIR_SORT_NONE) as $file) {
          if ($file !== '.' and $file !== '..') {
            $path = "$from/$file";

            is_dir($path) ? $move($path, "$to/$file")
              : rename($path, "$to/$file");
          }
        }
      };

      rename("$path/map.json", "$path/map.json-");
      // Can't just rename($from, $to) because it will fail if the two are
      // on different mount points.
      $move($path, $destPath);

      file_put_contents("$destPath/upload.php", "<?php\nreturn ".var_export($info, true).';');
      rename("$destPath/map.json-", "$destPath/map.json");    // all ready
      $overwriting and removeDir($oldDest, $mapPath);
    }
  }

  echo '<table>';

  foreach ($addedMaps as $original => $status) {
    $class = isset($status['error']) ? 'error' : (isset($status['path']) ? 'written' : 'skipped');
    echo '<tr class="', $class, '">';
    echo '<th>', htmlspecialchars($original), '</th>';
    if (isset($status['error'])) {
      echo '<td colspan="2">', htmlspecialchars($status['error']), '</td>';
    } else {
      echo '<td>', isset($status['existing']) ? 'Same as <b>'.htmlspecialchars($status['existing']).'</b>' : 'New map', '</td>';
      echo '<td>', isset($status['badPassword']) ? ($status['badPassword'] ? 'Skipped (bad password)' : 'Overwritten') : (isset($status['path']) ? 'Added <b>'.htmlspecialchars($status['path']).'</b>' : 'Skipped'), '</td>';
    }
    echo '</tr>';
  }

  echo '</table>';

  if (array_filter(array_column($addedMaps, 'path'))) {
    echo '<p>Use this password to update these maps in the future: <b>', htmlspecialchars($password), '</b></p>';
  }

  if (!$clean) {
    echo '<p>There were some problems. Check the log above for details.</p>';
  }

  echo '<script>';
  echo 'window.parent.uploadProgress("iframeLoaded");';
  echo 'document.body.scrollTop = 100000000;';
  // Since we want the user to immediately see the messages emitted while converting, we cannot set http_response_code() or <body> classes or prepend messages to <body>. JavaScript and CSS help, to some extend.
  echo 'document.body.classList.add("', $clean ? 'clean' : 'unclean', '");';
  echo '</script>';

  removeDir($temp,    realpathOrFail(sys_get_temp_dir()).$ds);
  removeDir($tempOut, realpathOrFail(sys_get_temp_dir()).$ds);

  exit;
}

$maxUploadText = $maxUpload = ini_get('upload_max_filesize');
if (is_int($maxUpload)) {
  $maxUploadText = floor($maxUpload / 1024 / 1024).'M';
} else {
  $maxUpload = ((int) $maxUpload) * 2 **
    (10 * strpos('BKMG', strtoupper(substr($maxUpload, -1))));
}
?>
<!DOCTYPE html>
<html>
  <head>
    <title>HeroWO Map Repository</title>

    <style>
      <?=apiStylesheet()?>

      .upload, .upload-log {
        position: relative;
        background: white;
        max-width: 800px;
        margin: 1em auto;
      }

      .upload, .upload-log, .upload-log iframe {
        border-radius: 1em;
      }

      .upload { border: .125em solid #ddd; padding: 0 1em; }
      .js .upload:not(.upload_h3m-o) .upload__h3m-o { display: none; }
      .upload.upload_progress button { opacity: .5; }
      input { font-family: monospace; }
      label { display: block; }
      button { font-size: 1em; }

      .js .upload-log,
      .upload-log:not(.upload_progress) progress,
      .upload-log:not(.upload_progress) button { display: none; }
      .upload-log progress,
      .upload-log button { position: absolute; margin-top: -1em; }
      .upload-log progress { width: 100%; }
      .upload-log button { left: 50%; transform: translate(-50%); }
      .upload-log iframe { width: 100%; height: 35em; border: 0; }

      .maps:not(.maps_loading) .maps__loading,
      .maps:not(.maps_loading-error) tfoot { display: none; }
      .maps a + a { margin-left: .5em; }
      .maps tfoot { background: orange; }

      .maps__row_updated td:first-child { border-left: 2px solid orange; }
      .maps__row_updated td:last-child { border-right: 2px solid orange; }
      .maps__row_updated_0 th { background: #fa0a; }
      .maps__row_updated_1 th { background: #fa09; }
      .maps__row_updated_2 th { background: #fa08; }
      .maps__row_updated_3 th { background: #fa07; }
      .maps__row_updated_4 th { background: #fa06; }
      .maps__row_updated_5 th { background: #fa05; }
      .maps__row_updated_6 th { background: #fa04; }
      .maps__row_updated_7 th { background: #fa03; }
      .maps__row_updated_8 th { background: #fa02; }
      .maps__row_updated_9 th { background: #fa01; }
    </style>
  </head>
  <body>
    <script>
      document.body.classList.add('js')
    </script>

    <form id="uploadForm" class="upload" target="upload" action=""
          method="post" enctype="multipart/form-data">
      <h2>Upload New Maps</h2>

      <p>
        Accepted:
        <b>.h3m</b> (HoMM 3 format),
        <b>combined.json</b> (HeroWO format V<?=FORMAT_VERSION?>),
        <b>.zip</b> (archive of these, folders made flat).
      </p>

      <p>
        Upload at most <?=ini_get('max_file_uploads')?> files,
        totalling at most <b><?=$maxUploadText?>B</b>.
      </p>

      <p>
        <b>Files</b> to upload (<a href="#" onclick="var el = this.parentNode.appendChild(this.nextElementSibling.cloneNode()); el.value = ''; el.removeAttribute('required'); return false">add</a>):

        <input type="file" name="maps[]" required multiple
               accept=".h3m,.json,application/json,.zip,application/zip">
      </p>

      <p>
        <label>
          <b>Password</b> to allow future changes to converted maps:
          <input name="mapPassword" value="<?=htmlspecialchars($password)?>" size="30">
        </label>
      </p>

      <p>
        <label>
          <b>Directory</b> for the converted maps:
          <kbd><?=htmlspecialchars($userRoot)?>/</kbd><input name="mapDirectory" value="<?=htmlspecialchars($directory)?>" size="60">
        </label>
      </p>

      <p>
        If this directory already has a map with the same title
        or ID (HeroWO format only):

        <label>
          <input type="radio" name="existing" value="duplicate" checked>
          Upload a new copy
        </label>

        <label>
          <input type="radio" name="existing" value="skip">
          Keep existing, do not upload
        </label>

        <label>
          <input type="radio" name="existing" value="overwrite">
          Replace existing with the upload if <b>Password</b> matches,
          else keep existing
        </label>
      </p>

      <p>
        <input type="hidden" name="do" value="upload">
        <button type="submit">Upload</button>

        <button type="button"
                onclick="uploadForm.classList.toggle('upload_h3m-o')">
          Toggle <b>.h3m</b> Options
        </button>
      </p>

      <section class="upload__h3m-o">
        <h3>.h3m Convertion Options</h3>

        <p>
          <b>.h3m</b> files are converted using
          <a target="_blank" href="https://github.com/HeroWO-js/h3m2json">h3m2herowo.php</a>
          V<?=htmlspecialchars(Convertor::VERSION)?> and
          databank <kbd><?=htmlspecialchars(substr($databankForNew, 0, 6))?></kbd>
          (<?=htmlspecialchars(gmdate('Y-m-d', strrchr($databanks[$databankForNew]->date, ' ')))?>).
          Known databanks (for <b>combined.json</b>) are:
          <?php $count = count($databanks)?>
          <?php foreach ($databanks as $key => $databank) {?>
            <kbd><?=htmlspecialchars(substr($key, 0, 6))?></kbd>
            (<?=htmlspecialchars(gmdate('Y-m-d', strrchr($databank->date, ' ')))?>)<?=--$count ? ',' : ''?>
          <?php }?>.
        </p>

        <p>
          Supported game versions:
          <?=htmlspecialchars(join(', ', HeroWO\H3M\H3M::$formats))?>.
        </p>

        <table>
          <tr>
            <th>-s</th>
            <td>Charset for texts</td>
            <td>
              <input name="h3m[charset]" value="EN">
              (<a target="_blank" href="https://www.gnu.org/software/libiconv/">iconv identifier</a> or
              <?=htmlspecialchars(strtoupper(join(', ', array_keys(HeroWO\H3M\CLI::$charsets))))?>)
            </td>
          </tr>
          <tr>
            <th>-ei</th>
            <td>Skip failed map, do next</td>
            <td>
              <label>
                <input type="checkbox" name="h3m[ignoreBadInputFiles]" checked>
                On
              </label>
            </td>
          </tr>
          <tr>
            <th>-ew</th>
            <td>Fail map on warning</td>
            <td>
              <label>
                <input type="checkbox" name="h3m[failOnWarning]">
                On
              </label>
            </td>
          </tr>
          <tr>
            <th>-i</th>
            <td>Dump map structure</td>
            <td>
              <label>
                <input type="checkbox" name="h3m[dumpStructure]">
                On (huge output)
              </label>
            </td>
          </tr>
          <tr>
            <th>-is</th>
            <td>Dump map statistics</td>
            <td>
              <label>
                <input type="checkbox" name="h3m[dumpStatistics]" disabled>
                On (not implemented) <!--XXX=I-->
              </label>
            </td>
          </tr>
        </table>
      </section>
    </form>

    <section class="upload-log">
      <progress></progress>
      <button type="button">Cancel</button>
      <iframe name="upload"></iframe>
    </section>

    <section class="maps maps_loading">
      <h2>Existing Maps</h2>

      <p>
        <span class="maps__loading">Fetching maps from the server…</span>
        <span class="maps__stats"></span>
      </p>

      <table class="maps__table">
        <thead>
          <tr>
            <th><abbr title="Format version (current is V<?=FORMAT_VERSION?>)">FV</abbr></th>
            <th>Map ID</th>
            <th><abbr title="Required modules">M</abbr></th>
            <th>Dbank</th>
            <th>Size</th>
            <th>Game</th>
            <th><abbr title="Difficulty">Diff</abbr></th>
            <th>Title</th>
            <th>Updated</th>
            <th colspan="2">Played</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="existing">
        </tbody>
        <tfoot>
          <tr>
            <td colspan="12">
              Lost connection with the server while fetching the listing
            </td>
          </tr>
        </tfoot>
      </table>

      <noscript>
        <p><b>JavaScript is disabled. The listing will not load.</b></p>
      </noscript>

      <template id="mapRow">
        <tr data-key="$key">
          <th colspan="12">$path</th>
        </tr>
        <tr data-key="$key">
          <td>$format</td>
          <td><kbd>$id5</kbd>&nbsp;R$revision</td>
          <td>$modules</td>
          <td>$databank6</td>
          <td>$widthM×$heightM×$levels</td>
          <td>$origin</td>
          <td>$difficulty</td>
          <td><b>$title</b></td>
          <td>$changeTime</td>
          <td colspan="$playH1">$playH2</td>
          <td>
            <!-- target=_blank on Download prevents browser from dropping SSE. -->
            <a target="_blank" href="?do=dl&map=$keyQ">Download</a>
            <a target="_blank" href=".#$playHash">Play</a>

            <a target="manage"
               onclick="return confirm('Delete this map?\n\n' + $titleJ + '\n\n' + $pathJ)"
               href="?do=delete&map=$keyQ&mapPassword=<?=htmlspecialchars(rawurlencode($password))?>">
              Delete</a>
          </td>
        </tr>
        <tr data-key="$key">
          <td colspan="3">$victoryH</td>
          <td colspan="3">$lossH</td>
          <td colspan="6">$playersH</td>
        </tr>
      </template>

      <iframe name="manage" style="display: none"></iframe>
    </section>

    <script>
      var databank = <?=escapeHtmlScriptJSON(encodeJsonLine($databankForNew))?>;

      var constants = {
        size: <?=escapeHtmlScriptJSON(encodeJsonLine(HeroWO\H3M\H3M::$sizeTexts))?>,

        <?php foreach ($databanks as $key => $databank) {?>
          <?=escapeHtmlScriptJSON(encodeJsonLine($key))?>: {
            victoryH: <?=escapeHtmlScriptJSON(encodeJsonLine($databank->mapVictory->type))?>,
            townHall: <?=escapeHtmlScriptJSON(encodeJsonLine($databank->mapVictory->townHall))?>,
            townCastle: <?=escapeHtmlScriptJSON(encodeJsonLine($databank->mapVictory->townCastle))?>,
            lossH: <?=escapeHtmlScriptJSON(encodeJsonLine($databank->mapLoss->type))?>,
            object: <?=escapeHtmlScriptJSON(encodeJsonLine($databank->object->type))?>,
            difficulty: <?=escapeHtmlScriptJSON(encodeJsonLine($databank->map->difficulty))?>,
          },
        <?php }?>
      }

      // Courtesy of NoDash | https://squizzle.me/js/nodash | Unlicense
      //
      // Apostrophe ' is not escaped because output of this function is never inserted in HTML attributes quoted using this symbol.
      function escape(value) {
        var to = {'&': 'amp', '<': 'lt', '"': 'quot'}
        return (value + '')
          .replace(/[&<"]/g, function (m) { return '&' + to[m] + ';' })
      }

      // Courtesy of Sqimitive | https://squizzle.me/js/sqimitive | Unlicense
      function indexFor(array, func) {
        for (var low = 0, high = array.length, rel = 1; low < high && rel; ) {
          var mid = low + high >>> 1
          rel = func(array[mid])
          rel > 0 ? high = mid : low = mid + 1
        }
        return low
      }

      ;(function () {
        function formatRow(map) {
          function resolve(key, value) {
            for (var ver in constants) {
              if (map.databank == ver) {
                for (var k in constants[ver][key]) {
                  if (constants[ver][key][k] == value) {
                    return k
                  }
                }
              }
            }

            return value
          }

          return mapRow.innerHTML
            .replace(/\$(\w+)/g, function ($, key) {
              var keyless = key.replace(/.$/, '')
              switch (key) {
                default:
                  return escape(map[key])
                case 'format':
                  var tag = map.format == <?=FORMAT_VERSION?> ? 'b' : 'span'
                  return '<' + tag + '>V' + escape(map[key]) + '</' + tag + '>'
                case 'id5':
                case 'databank6':
                  var tag = map.databank == databank ? 'b' : 'kbd'
                  return '<' + tag + '>' +
                         escape(map[keyless].substr(0, 6)) +
                         '</' + tag + '>'
                case 'modules':
                  return escape(map.modules.join(' '))
                case 'widthM':
                case 'heightM':
                  var i = key[0] == 'h'
                  return escape(map[keyless] - map.margin[+i] - map.margin[i + 2])
                case 'difficulty':
                  return escape(resolve(key, map[key]))
                case 'changeTime':
                  var date = new Date(map[key] * 1000)
                  return escape(date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate())
                case 'playH1':
                  return map.playCount ? 1 : 2
                case 'playH2':
                  if (map.playCount) {
                    var date = new Date(map.playTime * 1000)
                    return +map.playCount +
                           '</td><td>' +
                           escape(date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate())
                  } else {
                    return 'never'
                  }
                case 'playersH':
                  var res = []
                  map.players
                    .sort(function (a, b) {
                      return a.player - b.player
                    })
                    .forEach(function (p) {
                      var info = ['<b>P' + +p.player + '</b>', 'T' + +p.team]
                      p.maxLevel && info.push('<abbr title="Restricted maximum hero level">ML</abbr>' + +p.maxLevel)
                      info.push(p.controllers.map(function (c) { return escape(c.type) }).sort())
                      p.towns && info.push('<abbr title="Restricted town types">T</abbr>')
                      p.startingTown && info.push('<abbr title="Has starting town">ST</abbr>')
                      p.startingHero && info.push('<abbr title="Has starting hero">SH</abbr>')
                      res.push(info.join(' '))
                    })
                  return res.join(' &nbsp;&nbsp; ')
                case 'victoryH':
                case 'lossH':
                  var res = []
                  map[keyless].forEach(function (cond) {
                    var info = []
                    info.push('<b>' + escape(resolve(key, cond.type)) + '</b>')
                    if (typeof cond.objectType == 'number') {
                      info.push(escape(resolve('object', cond.objectType)))
                    }
                    cond.time && info.push(+cond.time + 'd')  // lossH only
                    // Following 3 are victoryH only.
                    cond.townHall && info.push(escape(resolve('townHall', cond.townHall) + 'H'))
                    cond.townCastle && info.push(escape(resolve('townCastle', cond.townCastle) + 'C'))
                    cond.townGrail && info.push('grail')
                    // victoryH only.
                    cond.allowAI && info.push('<abbr title="Condition allowed for AI">+AI</abbr>')
                    res.push(info.join(' '))
                  })
                  return res.join(' &nbsp;&nbsp; ')
                case 'keyQ':
                  return escape(encodeURIComponent(map.key))
                case 'playHash':
                  return escape(btoa(map.key).replace(/=/g, ''))
                case 'titleJ':
                  return escape(JSON.stringify(map.title))
                case 'path':
                case 'pathJ':
                  var path = decodeURI(map.key
                    //.replace(/\+/g, ' ')
                    .replace(/\//g, ' / '))
                  return escape(key == 'pathJ' ? JSON.stringify(path) : path)
              }
            })
        }

        function addRow(map, key, cls) {
          map.key = key
          updateStats(map, +1)

          var i = indexFor(existing.children, function (other) {
            other = maps[other.getAttribute('data-key')]
            return other.key.localeCompare(key)
          })

          var el = document.createElement('tbody')
          el.innerHTML = formatRow(map)

          while (el.childElementCount) {
            el.lastElementChild.className += cls
            existing.insertBefore(el.lastElementChild, existing.children[i])
          }
        }

        var maps
        var counts

        function updateStats(map, delta) {
          function inc(a, k, v) {
            var c = a[k] || (a[k] = {})
            c[v] ? c[v] += delta : c[v] = delta
          }

          function count(counts) {
            return Object.keys(counts || {})
              .sort()
              .map(function (value) {
                return value + ' (' + counts[value] + ')'
              })
              .join(', ')
          }

          if (arguments.length) {
            inc(counts, 'format', 'V' + map.format)
            inc(counts, 'origin', map.origin)

            var w = map.width  - map.margin[0] - map.margin[2]
            var h = map.height - map.margin[1] - map.margin[3]
            inc(counts, 'size', (w == h && constants.size[w]) || 'other')

            var now = Date.now() / 1000
            inc(counts, 'playTime', !map.playTime ? 'never' :
              map.playTime > now -           3600 ? '<1h' :
              map.playTime > now - 24 *      3600 ? '<1d' :
              map.playTime > now - 7 * 24  * 3600 ? '<1w' :
              map.playTime > now - 30 * 24 * 3600 ? '<1m' :
                                                    '>1m')

            inc(counts, 'playCount', !map.playCount ? 'never' :
              map.playCount == 1  ? 'once' :
              map.playCount == 2  ? 'twice' :
              map.playCount == 3  ? 'thrice' :
              map.playCount < 10  ? '<10' :
              map.playCount < 100 ? '<100' :
                                    '>100')
          } else {
            document.querySelector('.maps__stats').textContent =
              Object.keys(maps).length + ' maps. ' +
              'Formats: ' + count(counts.format) + '. ' +
              'Dimensions: ' + count(counts.size) + '. ' +
              'Games: ' + count(counts.origin) + '. ' +
              'Last played: ' + count(counts.playTime) + '. ' +
              'Times played: ' + count(counts.playCount) + '. '
          }
        }

        var ping = 0
        var es
        var lastUpdate

        setInterval(function () {
          if (ping + <?=WatchdogSSE::$pingInterval * 1000 + 3000?> < Date.now()) {
            es.onerror({type: 'error'})
            es.close()
            start()
          }
        }, 10000)

        function start() {
          es = new EventSource(<?=escapeHtmlScriptJSON(encodeJsonLine(sample(keyValue('sseURL'))))?>)

          'ping full add remove'.split(' ').forEach(function (event) {
            es.addEventListener(event, function (e) { ping = Date.now() })
          })

          es.onopen = es.onerror = function (e) {
            var classes = document.querySelector('.maps').classList
            if (e.type == 'error') { classes.remove('maps_loading') }
            classes.toggle('maps_loading-error', e.type == 'error')
          }

          es.addEventListener('full', function (e) {
            maps = JSON.parse(e.data).maps
            lastUpdate = Date.now()
            existing.innerHTML = ''
            counts = {}

            Object.keys(maps).forEach(function (key) {
              addRow(maps[key], key, '')
            })

            updateStats()
            document.querySelector('.maps').classList.remove('maps_loading')
          })

          function addOrRemove(e) {
            var data = JSON.parse(e.data)

            if (data[0] == 'maps') {
              var cur = maps[data[1]]

              if (cur) {
                updateStats(cur, -1)
                delete maps[cur.key]

                var old
                var el = existing.querySelector('[data-key="' + cur.key + '"]')
                while ((old = el) && el.getAttribute('data-key') == cur.key) {
                  el = el.nextElementSibling
                  old.parentNode.removeChild(old)
                }
              }

              if (data[2]) {  // add or change
                if (lastUpdate + 600 * 1000 < Date.now()) {
                  lastUpdate = Date.now()

                  for (var el = existing.firstElementChild; el; el = el.nextElementSibling) {
                    var match = el.className.match(/(maps__row_updated_)(\d+)/)
                    if (match && ++match[2] <= 9) {
                      // Keeping max class (9) on the oldest updated rows.
                      el.classList.replace(match[0], match[1] + match[2])
                    }
                  }
                }

                maps[data[1]] = data[2]
                addRow(data[2], data[1], ' maps__row_updated maps__row_updated_0')
              }

              updateStats()
            }
          }

          es.addEventListener('add', addOrRemove)
          es.addEventListener('remove', addOrRemove)
        }

        start()
      }())

      // Progress tracking depends on ngx_http_uploadprogress_module:
      // https://www.nginx.com/resources/wiki/modules/upload_progress/
      //
      // In Ubuntu, it is provided by libnginx-mod-http-uploadprogress and
      // nginx-extra packages.
      //
      // PHP's session upload progress would be more generic but it doesn't work
      // with one of the most common setups (namely nginx + php-fpm) and is
      // affected by request buffering.
      //
      // If the module is unavailable, user will see an indeterminate progress
      // bar as a fallback.
      ;(function () {
        var log = document.querySelector('.upload-log')
        var progress = log.querySelector('progress')
        var script
        var id
        var retryInterval = 7500
        var retryTimer
        var pollInterval = 250    // keep in sync with visibilitychange
        var pollTimer

        function transition(now) {
          // Ignore JSONP responses arriving after the upload has finished
          // (by iframeLoaded or cancel).
          delete window['uploadProgress' + id]
          window['uploadProgress' + now] = uploadProgress
          id = now
          uploadForm.classList.toggle('upload_progress', !!id)
          log.classList.toggle('upload_progress', !!id)
          log.style.display = 'block'
          progress.removeAttribute('value')
          clearTimeout(retryTimer)
          id ? pollTimer = setTimeout(poll, pollInterval) : clearTimeout(pollTimer)
        }

        function poll() {
          // It may happen that one of the poll requests fails and uploadProgress()
          // is never called, thus pollTimer is never set again. In this case
          // maintain a low-rate retryTimer that repeats the poll even if no
          // response was received to the previous poll.
          clearTimeout(retryTimer)
          retryTimer = setTimeout(poll, retryInterval)

          script && progress.removeChild(script)
          script = document.createElement('script')
          script.src = 'PROGRESS?X-Progress-ID=' + id +
                       '&callback=uploadProgress' + id +
                       '&' + Math.random()
          progress.appendChild(script)
        }

        function cancel(message) {
          transition()
          try {
            var html = upload.document.documentElement.innerHTML
          } catch (e) {}
          html = (html || '') + message
          // data: is probably the only way to cancel the request but retain
          // the content (i.e. log) loaded so far.
          //
          // Note that data: is regarded as cross-origin source so contentDocument
          // (contentWindow.document) becomes inaccessible once this is set.
          upload.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
        }

        window.uploadProgress = function (obj) {
          if (obj == 'iframeLoaded') {
            transition()
          } else if (obj && (obj.state == 'uploading' || obj.iframe)) {
            progress.max = obj.size
            progress.value = obj.received
            // Means ngx_http_uploadprogress_module is functional.
            clearTimeout(pollTimer)
            pollTimer = setTimeout(poll, pollInterval)
          } else if (obj && obj.state == 'error') {
            var text = {400: ' (lost connection)', 413: ' (too large file)'}
            var status = obj.status + (text[obj.status] || '')
            cancel('<p><b>The upload has failed due to error ' + status + '.</b></p>')
          } else {
            progress.removeAttribute('value')
          }
        }

        addEventListener('visibilitychange', function () {
          pollInterval = 250 * (document.visibilityState == 'hidden' ? 10 : 1)
        })

        log.querySelector('button').onclick = function () {
          cancel('<p><b>The upload was cancelled.</b></p>')
        }

        uploadForm.onsubmit = function () {
          if (id) {
            return false
          }

          var total = 0

          uploadForm.querySelectorAll('[type="file"]').forEach(function (node) {
            Array.prototype.forEach.call(node.files, function (file) {
              total += file.fileSize || file.size
            })
          })

          if (total > <?=$maxUpload?>) {
            alert('Size of the selected files (' + (total / 1024 / 1024 | 0) + 'MB) exceeds the maximum limit (<?=$maxUploadText?>B).')
            return false
          }

          transition('<?=bin2hex(random_bytes(2))?>' + Math.random().toString(36).substr(2, 4))
          uploadForm.action = '?X-Progress-ID=' + id
        }
      })()
    </script>
  </body>
</html>
