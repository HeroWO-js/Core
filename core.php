<?php
// Collection of utility functions used by user-facing web scripts.

empty($keepCWD) and chdir(__DIR__);
error_reporting(-1);
ignore_user_abort(false);
setlocale(LC_ALL, 'en_US.UTF-8');
mb_internal_encoding('UTF-8');
date_default_timezone_set('UTC');

set_error_handler(function ($severity, $msg, $file, $line) {
  throw new ErrorException($msg, 0, $severity, $file, $line);
}, -1);

// Specifically doesn't use JSON_PRETTY_PRINT to always return a single line as
// required by api.php (SSE data in chat and WatchdogSSE, possibly other cases).
function encodeJsonLine($data) {
  return json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

// Used in place of htmlspecialchars() strictly when inserting a
// JSON-conforming $str into a <script> or <template> block that is
// part of an HTML 5 document. Taken from NoDash's
// _.escape() documentation.
//
// Usually used to embed value of a variable: var x = <?=...
function escapeHtmlScriptJSON($str) {
  return preg_replace('~<(!--|/?script)~iu', '\\x3C$1', $str);
}

function mailAdmin($id, $title, $body) {
  $headers = 'Content-Type: text/plain; charset=utf-8';
  return mail("herowo+$id", "[HeroWO] $title", $body, $headers);
}
