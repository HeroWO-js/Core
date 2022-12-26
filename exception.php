<?php
require __DIR__.'/api.php';

$databankPath = keyValue('databanks').'/'.keyValue('databank');

// ['map' => 'Tutorial/', ...]
$info = ['ua' => $_SERVER['HTTP_USER_AGENT'] ?? null] + $_REQUEST;

try {
  $info['revision'] = trim(file_get_contents("$databankPath/revision.txt"));
} catch (Throwable $e) {}

// ['message' => 'TypeError: foo is undefined', ...]
$exception = json_decode($_REQUEST['exception'], true);

$stack = $exception['error']['stack'] ?? null;
if ($stack) {
  $cmd = ['node', 'exception-map.js'];
  $cmd[] = "$databankPath/herowo.min.js.map";
  $descr = [['pipe', 'r'], ['pipe', 'w']];
  try {
    $proc = proc_open(join(' ', array_map('escapeshellarg', $cmd)), $descr, $pipes, __DIR__, null, ['bypass_shell' => true]);
    fwrite($pipes[0], $stack);
    fclose($pipes[0]);
    $exception = ['mapped' => "\n".stream_get_contents($pipes[1])] + $exception;
    fclose($pipes[1]);
    proc_close($proc);
  } catch (Throwable $e) {}
}

mailAdmin('exception',
          'Exception '.substr($info['revision'] ?? '', 0, 6).': '.($exception['message'] ?? ''),
          var_export(compact('exception') + $info, true));

http_response_code(204);