<?php
// Listens to modification times of the given (local) files and emits empty SSE messages when a change occurs.
//
// Used in development to refresh CSS styles without reloading the page.

require __DIR__.'/core.php';

$files = explode(',', urldecode($_SERVER['QUERY_STRING']));
header("Content-Type: text/event-stream");
set_time_limit(0);
$last = 0;

while (true) {
  $times = array_map('filemtime', $files);
  if (max($times) > $last) {
    $last = max($times);
    echo "data\n\n";
    ob_flush();
    flush();
  }
  usleep(50000);
  clearstatcache();
}